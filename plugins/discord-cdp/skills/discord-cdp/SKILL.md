---
name: discord-cdp
description: Send Discord DMs and control the user's running Edge/Chrome browser via CDP (remote debugging port). Use whenever the user asks to message someone on Discord, read Discord messages, automate their browser, or interact with any website through their already-logged-in browser session — even if they don't mention "CDP" or "puppeteer".
---

# Discord CDM via CDP

Control the user's **running** Edge/Chrome (with their real logins) by launching it with a remote debugging port, then driving it over the Chrome DevTools Protocol. Two sending modes:

1. **UI mode** — synthetic clicks + keystrokes through the page. Robust, self-verifying (screenshot), works even when you can't extract auth.
2. **API mode** — bypass the UI entirely with a direct `fetch()` POST to Discord's REST API using a session token captured from the page. Faster, but the token expires and high volume risks account flags.

Default to UI mode. Use API mode only when the user asks for speed/bulk or UI automation is failing.

## Prerequisites

- Node.js with `puppeteer-core` installed in the working directory (`npm install puppeteer-core`). It's a CDP-only client — no browser download.
- The target browser must be **Edge or Chrome** (Chromium-based). Firefox/Safari won't work.
- Discord web must be open and **logged in** in that browser instance.

## Step 0 — Launch the browser with a debug port

```bash
# Windows Edge
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --remote-debugging-port=9222 --user-data-dir="C:\\Users\\<USER>\\.edge-debug-profile" "about:blank" &

# macOS Chrome
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-debug-profile" "about:blank" &
```

**Critical gotchas (learned the hard way):**

- **`--user-data-dir` is mandatory.** Chromium refuses `--remote-debugging-port` on the default profile for security. The fresh profile means no saved logins — the user must sign into Discord in this window first (QR or password). Tell them this upfront.
- **If a browser instance is already running**, a new launch just attaches to it and the port never opens (`curl localhost:9222` fails with exit 7). You must kill all existing browser processes first (`taskkill //F //IM msedge.exe` on Windows, `pkill Chrome` on mac) — confirm with the user since it closes their tabs.
- Verify the port is live: `curl -s http://localhost:9222/json/version` should return JSON with a `webSocketDebuggerUrl`.

## Step 1 — Find the Discord tab

```bash
curl -s http://localhost:9222/json/list | grep -i discord
```

Each tab has a `webSocketDebuggerUrl`. Puppeteer finds it by URL match:

```js
const puppeteer = require('puppeteer-core');
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const discord = (await browser.pages()).find(p => p.url().includes('discord.com'));
```

**Always screenshot first** and look at the image before acting — you need to see login state, which DM is open, where the input box is. `await discord.screenshot({ path: 'state.png' })` then Read the PNG.

## Step 2 — Navigate to a person's DM

Discord's DOM uses hashed class names (`slateTextArea_ec4baf`) that change every build. **Never rely on selectors** — locate elements by text content and geometry:

```js
// Find a DM row in the sidebar by exact name, walk up to the clickable row
const box = await discord.evaluate(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while (node = walker.nextNode()) {
    if (node.textContent.trim() === '<recipient display name>') { // replace with the target name
      let row = node.parentElement;
      for (let i = 0; i < 8 && row.parentElement; i++) {
        const r = row.getBoundingClientRect();
        if (r.height > 35 && r.height < 90 && r.width > 120) break;
        row = row.parentElement;
      }
      const r = row.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
  }
  return null;
});
await discord.mouse.click(box.x, box.y);
```

After clicking, the URL changes to `discord.com/channels/@me/<channelId>` — **capture that channel ID**, it's needed for API mode.

## Step 3a — UI mode: type and send

The message input is a `contenteditable` div in the lower half of the viewport. Find it by position, not class:

```js
const inputBox = await discord.evaluate(() => {
  const els = document.querySelectorAll('[contenteditable="true"], [role="textbox"]');
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.y > 400 && r.width > 150) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }
  return null;
});
await discord.mouse.click(inputBox.x, inputBox.y);
await new Promise(r => setTimeout(r, 400));
await discord.keyboard.type('your message here');
await new Promise(r => setTimeout(r, 300));
await discord.keyboard.press('Enter');
```

Then screenshot and verify the message appears in the chat. Multi-line messages: `keyboard.type()` handles `\n` fine (Discord renders them). For long messages, type first, screenshot to confirm composition, then press Enter.

**To read incoming replies**, poll the chat area text:

```js
const last = await discord.evaluate(() => {
  const chat = document.querySelector('[class*="messagesWrapper"], [class*="channelMessages"]');
  if (!chat) return null;
  const rows = [...chat.querySelectorAll('div[class*="wrapper"]')].map(r => r.textContent.trim()).filter(t => t && t.length < 500);
  return rows.slice(-4);
});
```

## Step 3b — API mode: direct REST send (no UI)

Discord web authenticates with a **session token in the `Authorization` header** — not cookies. A bare `fetch()` gets HTTP 401. Also note: Discord uses **XHR, not fetch**, for its API calls, so hook XHR to capture the token.

Run the bundled script (it hooks XHR, triggers one UI send to capture headers, then replays via direct API):

```bash
node scripts/discord-api-send.js "<message>" [channelId]
```

Or inline, the mechanism is:

1. **Hook XHR** to record headers on `POST .../channels/<id>/messages`:

```js
await discord.evaluate(() => {
  window.__hdrCapture = [];
  const OrigXHR = window.XMLHttpRequest;
  const origOpen = OrigXHR.prototype.open;
  const origSetHeader = OrigXHR.prototype.setRequestHeader;
  const origSend = OrigXHR.prototype.send;
  OrigXHR.prototype.open = function (m, u) { this.__m = m; this.__u = u; this.__h = {}; return origOpen.call(this, m, u); };
  OrigXHR.prototype.setRequestHeader = function (k, v) { this.__h[k] = v; return origSetHeader.call(this, k, v); };
  OrigXHR.prototype.send = function (body) {
    if (/\/channels\/\d+\/messages/.test(this.__u || '') && this.__m === 'POST') {
      window.__hdrCapture.push({ headers: this.__h, body });
    }
    return origSend.call(this, body);
  };
});
```

2. **Send one throwaway message via UI** (Step 3a) so the hook fires, then read `window.__hdrCapture[0].headers` — you need `Authorization`, `X-Super-Properties`, and `X-Installation-ID`.

3. **Replay directly**:

```js
const result = await discord.evaluate(async ({ token, superProps, installId }, channelId) => {
  const resp = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
      'X-Super-Properties': superProps,
      'X-Installation-ID': installId,
    },
    body: JSON.stringify({ content: 'direct api message', nonce: String(Date.now()), tts: false, flags: 0 }),
  });
  return { status: resp.status, data: await resp.json() };
}, { token, superProps, installId }, channelId);
// status 200 = delivered; check result.data.id for the message ID
```

**API mode caveats:**
- The token is short-lived and rotates — re-capture if you get 401.
- No optimistic UI: the message appears when Discord's gateway pushes it back (~1s).
- This is the user's real account. Bulk sending risks rate limits (429) or flags. Confirm with the user before bulk use.
- **Never print or persist any part of the token** in output — treat it as a secret, use it in-memory only.

## Security notes to tell the user

- Anything with CDP access to the tab can extract their session token and impersonate their account. The debug port should be closed (kill Edge) when done.
- The separate `--user-data-dir` profile is a feature: it isolates the automation session from their main browser profile.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `curl localhost:9222` exit 7 | Browser already running without port — kill all instances, relaunch |
| "DevTools remote debugging requires a non-default data directory" | Missing `--user-data-dir` flag |
| "Opening in existing browser session." | Same as above — old instance grabbed the launch |
| Input box not found (`null`) | Page layout shifted — screenshot and re-measure; try `r.y > 300` instead of `> 400` |
| Click doesn't navigate | Walked up too few/too many parents — adjust the row-height heuristic (35–90px) |
| API send returns 401 | Token expired or missing headers — re-run capture step |
| `localStorage is not defined` in evaluate | Harmless quirk of Discord's sandbox; use CDP `Network.getCookies` instead if needed |
