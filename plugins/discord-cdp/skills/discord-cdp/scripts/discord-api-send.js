#!/usr/bin/env node
/**
 * discord-api-send.js — send a Discord DM directly via the REST API, bypassing the UI.
 *
 * Usage:
 *   node discord-api-send.js "<message>" [channelId] [browserURL]
 *
 *   message    — text to send (required)
 *   channelId  — DM channel ID (optional; auto-detected from the open Discord tab URL)
 *   browserURL — CDP endpoint (default http://localhost:9222)
 *
 * How it works:
 *   1. Connects to the running browser via puppeteer-core + CDP.
 *   2. Hooks XMLHttpRequest in the Discord page (Discord uses XHR, not fetch).
 *   3. Sends one throwaway UI message ("." ) to trigger a real API call and
 *      capture the Authorization / X-Super-Properties / X-Installation-ID headers.
 *   4. Replays the request directly with fetch() using the target message.
 *
 * Requires: npm install puppeteer-core (in this directory or resolvable from cwd)
 */

const path = require('path');

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) {}
  // Fall back to the skill's own node_modules if installed alongside the script
  try { return require(path.join(__dirname, 'node_modules', 'puppeteer-core')); } catch (e) {}
  console.error('puppeteer-core not found. Run: npm install puppeteer-core');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const [,, message, channelIdArg, browserURL = 'http://localhost:9222'] = process.argv;
  if (!message) {
    console.error('Usage: node discord-api-send.js "<message>" [channelId] [browserURL]');
    process.exit(1);
  }

  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.connect({ browserURL });
  const pages = await browser.pages();
  const discord = pages.find((p) => p.url().includes('discord.com'));
  if (!discord) {
    console.error('No Discord tab found. Open discord.com and log in first.');
    browser.disconnect();
    process.exit(1);
  }

  // Auto-detect channel ID from the current URL if not provided
  let channelId = channelIdArg;
  if (!channelId) {
    const m = discord.url().match(/discord\.com\/channels\/(?:@me|me)\/(\d+)/);
    if (!m) {
      console.error('Could not detect channel ID from URL (' + discord.url() + '). Pass it as the 2nd argument.');
      browser.disconnect();
      process.exit(1);
    }
    channelId = m[1];
  }
  console.log('Channel:', channelId);

  // --- Step 1: hook XHR to capture auth headers ---
  await discord.evaluate(() => {
    window.__hdrCapture = [];
    if (window.__hdrHooked) return;
    const OrigXHR = window.XMLHttpRequest;
    const origOpen = OrigXHR.prototype.open;
    const origSetHeader = OrigXHR.prototype.setRequestHeader;
    const origSend = OrigXHR.prototype.send;
    OrigXHR.prototype.open = function (m, u) {
      this.__m = m; this.__u = u; this.__h = {};
      return origOpen.call(this, m, u);
    };
    OrigXHR.prototype.setRequestHeader = function (k, v) {
      this.__h[k] = v;
      return origSetHeader.call(this, k, v);
    };
    OrigXHR.prototype.send = function (body) {
      try {
        if (/\/channels\/\d+\/messages/.test(this.__u || '') && this.__m === 'POST') {
          window.__hdrCapture.push({ headers: this.__h });
        }
      } catch (e) {}
      return origSend.call(this, body);
    };
    window.__hdrHooked = true;
  });

  // --- Step 2: trigger one UI send to capture headers ---
  const inputBox = await discord.evaluate(() => {
    const els = document.querySelectorAll('[contenteditable="true"], [role="textbox"]');
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.y > 300 && r.width > 150) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  });
  if (!inputBox) {
    console.error('Message input not found. Is the DM chat actually open?');
    browser.disconnect();
    process.exit(1);
  }

  await discord.mouse.click(inputBox.x, inputBox.y);
  await sleep(400);
  await discord.keyboard.type('.'); // throwaway capture trigger
  await sleep(300);
  await discord.keyboard.press('Enter');
  await sleep(2500);

  const captured = await discord.evaluate(() => window.__hdrCapture);
  if (!captured || captured.length === 0) {
    console.error('Failed to capture API headers. The throwaway send may not have gone through.');
    browser.disconnect();
    process.exit(1);
  }

  const h = captured[captured.length - 1].headers;
  const token = h['Authorization'];
  const superProps = h['X-Super-Properties'];
  const installId = h['X-Installation-ID'];
  if (!token) {
    console.error('No Authorization header captured. Headers seen:', Object.keys(h).join(', '));
    browser.disconnect();
    process.exit(1);
  }
  console.log('Token captured');

  // --- Step 3: send the real message directly via the API ---
  const result = await discord.evaluate(async ({ token, superProps, installId }, channelId, content) => {
    const resp = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
        'X-Super-Properties': superProps || '',
        'X-Installation-ID': installId || '',
      },
      body: JSON.stringify({ content, nonce: String(Date.now()), tts: false, flags: 0 }),
    });
    let data = null;
    try { data = await resp.json(); } catch (e) {}
    return { status: resp.status, messageId: data && data.id, author: data && data.author && data.author.username };
  }, { token, superProps, installId }, channelId, message);

  if (result.status === 200) {
    console.log(`SENT as ${result.author} — message ID ${result.messageId}`);
  } else {
    console.error(`FAILED with status ${result.status}`);
    if (result.status === 401) console.error('Token expired or invalid. Re-run to re-capture.');
    if (result.status === 429) console.error('Rate limited. Wait and retry.');
    process.exit(2);
  }

  browser.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
