# personal-agent-plugins

Personal plugins for Codex and [Oh My Pi](https://github.com/can1357/oh-my-pi).

The repository and marketplace name is `personal-agent-plugins` in both clients.
Both use the same skill instructions, scripts, and dependencies.

## Install

Add the GitHub marketplace and install a plugin:

```powershell
omp plugin marketplace add notmike101/personal-agent-plugins
omp plugin install discord-cdp@personal-agent-plugins
```

This repository is public; cloning it does not require GitHub authentication.
If the marketplace is already registered from a local path, keep that
registration or remove it before switching to the GitHub source.

For a local checkout:

```powershell
omp plugin marketplace add C:\path\to\personal-agent-plugins
omp plugin install discord-cdp@personal-agent-plugins
```

For Codex:

```powershell
codex plugin marketplace add notmike101/personal-agent-plugins
codex plugin add discord-cdp@personal-agent-plugins
```

Replace the GitHub source with the absolute checkout path for local installation.
Restart either client or start a new session after installing.

To migrate the old OMP installation, uninstall `discord-cdp@omp-plugin-marketplace`
and remove the `omp-plugin-marketplace` marketplace before adding the new one.

## Plugins

| Plugin | Purpose |
| --- | --- |
| `discord-cdp` | Read Discord messages and automate Discord or other websites through a running Edge or Chrome CDP session. |

### Discord CDP

The plugin includes the original skill instructions and API helper. Using it
requires Node.js, a browser with a CDP endpoint, and a logged-in Discord tab.
Follow `plugins/discord-cdp/skills/discord-cdp/SKILL.md` for browser setup.

The bundled helper requires `puppeteer-core`. If dependencies are missing,
run this inside the installed plugin directory:

```powershell
npm ci --omit=dev --ignore-scripts
```

Install dependencies separately in each client's installed plugin directory:

- OMP: `~/.omp/plugins/cache/plugins/personal-agent-plugins___discord-cdp___1.0.3`
- Codex: `~/.codex/plugins/cache/personal-agent-plugins/discord-cdp/1.0.3`

Use headless mode by default. The API helper sends a `.` message before the requested
message to capture authentication headers. Use it only when the user has
authorized that additional send. CDP exposes the browser session; keep it
local and close the automation browser when finished. Never commit session
credentials, browser profiles, captured headers, or private messages.

From the installed skill directory (`skills/discord-cdp`), authenticate once,
then send in the background:

```powershell
node scripts/discord-api-send.js --authenticate
node scripts/discord-api-send.js "<message>" <channelId> --allow-capture-message
```

Only `--authenticate` opens a window. Authentication mode sends nothing.
Normal sends reuse `~/.config/personal-agent-plugins/discord-cdp/browser-profile`
and close the headless browser afterward. Both agents use the same profile.
Use `--profile <path>` to reuse another dedicated automation profile and
`--executable <path>` for Edge or a custom Chrome installation; use the same
options for authentication and sending. Do not run two processes against one
profile simultaneously. Expired login causes a clear error, not a visible window.

The requested message is sent through REST; the capture dot uses the background
UI. The helper validates the target and API response, then checks the returned
message in Discord. It never automatically retries a send.

Run `node scripts/check-discord-send.cjs` for the headless/authentication and
input-validation regression check. Live headless API sending was verified;
visible authentication mode still requires a separate end-to-end test.

## Add or update a plugin

1. Put the plugin in `plugins/<name>/`, with skills under `skills/<name>/`.
2. Add `.claude-plugin/plugin.json` with its name, version, and description.
3. Add entries to `.omp-plugin/marketplace.json` (OMP) and `.agents/plugins/marketplace.json` (Codex), both pointing at the same plugin directory. Add `.codex-plugin/plugin.json` with the same name, version, and skills path as the OMP-compatible manifest.
4. Declare runtime dependencies in the plugin's `package.json` and commit its lockfile.
5. Validate both catalogs and manifests, scripts, and discovery in both clients before publishing. Run `node scripts/check-marketplace.cjs` to check metadata consistency.

For updates, bump the plugin version in its manifest, package files, and
marketplace entry together. Update the registered marketplace and upgrade the
installed plugin:

```powershell
omp plugin marketplace update personal-agent-plugins
omp plugin upgrade discord-cdp@personal-agent-plugins
codex plugin marketplace upgrade personal-agent-plugins
codex plugin add discord-cdp@personal-agent-plugins
```

The copy in this repository is the maintained plugin source. The original
Codex skill remains separate.

Catalog formats follow the [Codex plugin documentation](https://developers.openai.com/plugins/build/plugins)
and [OMP marketplace documentation](https://github.com/can1357/oh-my-pi/blob/main/docs/skills/authoring-marketplaces.md).
