#!/usr/bin/env node
const path = require('node:path');
const os = require('node:os');
const { parseArgs } = require('node:util');

function parseOptions(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    authenticate: { type: 'boolean' },
    'allow-capture-message': { type: 'boolean' },
    profile: { type: 'string' },
    executable: { type: 'string' },
    'expected-title': { type: 'string' },
  }});
  const [message, channelId, browserURL] = positionals;
  if (positionals.length > 3) throw Error('Too many positional arguments');
  if (values.authenticate) {
    if (positionals.length) throw Error('--authenticate cannot send messages or connect to an external browser');
  } else {
    if (!message || message.length > 2000) throw Error('Message must contain 1–2000 characters');
    if (!/^\d{17,20}$/.test(channelId || '')) throw Error('A numeric Discord channel ID is required');
    if (!values['allow-capture-message']) throw Error('The helper sends an extra dot message. Explicitly authorize it with --allow-capture-message');
  }
  if (browserURL) {
    const url = new URL(browserURL);
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password) {
      throw Error('CDP endpoint must be an HTTP loopback URL');
    }
  }
  return { ...values, message, channelId, browserURL };
}

function launchOptions(options) {
  return {
    headless: !options.authenticate,
    userDataDir: path.resolve(options.profile || path.join(os.homedir(), '.config', 'personal-agent-plugins', 'discord-cdp', 'browser-profile')),
    ...(options.executable ? { executablePath: options.executable } : { channel: 'chrome' }),
    defaultViewport: { width: 1365, height: 768 },
  };
}

async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  const puppeteer = require('puppeteer-core');
  const owned = !options.browserURL;
  let browser;
  let discord;
  try {
    browser = owned
      ? await puppeteer.launch(launchOptions(options))
      : await puppeteer.connect({ browserURL: options.browserURL });
    if (!owned) {
      const session = await browser.target().createCDPSession();
      const { userAgent } = await session.send('Browser.getVersion');
      await session.detach();
      if (!userAgent.includes('HeadlessChrome')) throw Error('External browser must be headless. Restart that automation browser headless before connecting.');
    }
    // A fresh tab avoids overwriting a user's draft in an existing conversation.
    discord = await browser.newPage();
    if (options.authenticate) {
      console.log('Sign into Discord in this authentication window. It closes after successful login.');
      await discord.goto('https://discord.com/login', { waitUntil: 'domcontentloaded' });
      await discord.waitForFunction(() => location.hostname === 'discord.com' && location.pathname.startsWith('/channels/'), { timeout: 300000 });
      console.log('Authentication complete. Future sends use this profile headless.');
      return;
    }
    console.log('Browser mode: headless');
    const channelURL = `https://discord.com/channels/@me/${options.channelId}`;
    await discord.goto(channelURL, { waitUntil: 'domcontentloaded' });
    try {
      await discord.waitForSelector('[contenteditable="true"][role="textbox"]', { timeout: 20000 });
    } catch {
      throw Error('Discord login or channel access required. Run --authenticate with the same --profile and --executable options, then retry. Nothing was sent.');
    }
    if (discord.url() !== channelURL) throw Error('Discord channel URL mismatch. Nothing was sent.');
    if (options['expected-title'] && !(await discord.title()).endsWith(` | ${options['expected-title']}`)) {
      throw Error('Discord title mismatch. Nothing was sent.');
    }
    const input = await discord.$('[contenteditable="true"][role="textbox"]');
    const draft = await input.evaluate(el => el.textContent.replace(/[\uFEFF\s]/g, ''));
    if (draft) throw Error('Composer contains a draft. Nothing was sent.');

    // Capture only this channel's outgoing message headers, and restore XHR afterward.
    await discord.evaluate(channelId => {
      const proto = XMLHttpRequest.prototype;
      const open = proto.open, setHeader = proto.setRequestHeader, send = proto.send;
      window.__discordCapture = null;
      proto.open = function(method, url, ...rest) {
        this.__captureMessage = method.toUpperCase() === 'POST' && String(url).endsWith(`/channels/${channelId}/messages`);
        this.__captureHeaders = {};
        return open.call(this, method, url, ...rest);
      };
      proto.setRequestHeader = function(key, value) {
        if (this.__captureMessage) this.__captureHeaders[key.toLowerCase()] = value;
        return setHeader.call(this, key, value);
      };
      proto.send = function(body) {
        if (this.__captureMessage) window.__discordCapture = this.__captureHeaders;
        return send.call(this, body);
      };
      window.__discordRestore = () => {
        proto.open = open; proto.setRequestHeader = setHeader; proto.send = send;
        delete window.__discordCapture; delete window.__discordRestore;
      };
    }, options.channelId);
    await input.click();
    await discord.keyboard.type('.');
    await discord.keyboard.press('Enter');
    console.log('Capture dot submitted through UI');
    await discord.waitForFunction(() => !!window.__discordCapture?.authorization, { timeout: 15000 });
    const headers = await discord.evaluate(() => {
      const captured = window.__discordCapture;
      window.__discordRestore();
      return captured;
    });
    console.log('Authentication headers captured (not logged)');
    const result = await discord.evaluate(async ({ headers, channelId, content }) => {
      const resp = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
        method: 'POST', headers: {
          'Content-Type': 'application/json',
          Authorization: headers.authorization,
          ...(headers['x-super-properties'] ? { 'X-Super-Properties': headers['x-super-properties'] } : {}),
          ...(headers['x-installation-id'] ? { 'X-Installation-ID': headers['x-installation-id'] } : {}),
        },
        body: JSON.stringify({ content, nonce: String(Date.now()), tts: false, flags: 0 }),
      });
      const data = await resp.json();
      return { status: resp.status, messageId: data.id, channelId: data.channel_id, content: data.content };
    }, { headers, channelId: options.channelId, content: options.message });
    if (result.status !== 200 || result.channelId !== options.channelId || result.content !== options.message || !result.messageId) {
      throw Error(`API response did not confirm delivery (HTTP ${result.status}). Do not retry blindly; the dot or requested message may have been sent.`);
    }
    console.log(`SENT via API — HTTP ${result.status}, channel ${result.channelId}, message ID ${result.messageId}`);
    await discord.waitForFunction(({ id, content }) => document.getElementById(`message-content-${id}`)?.textContent === content,
      { timeout: 15000 }, { id: result.messageId, content: options.message });
    console.log('Verified the API message in Discord');
  } finally {
    if (browser) {
      if (owned) await browser.close();
      else {
        if (discord) await discord.close();
        await browser.disconnect();
      }
    }
  }
}

module.exports = { parseOptions, launchOptions };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
