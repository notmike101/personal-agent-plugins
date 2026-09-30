# personal-omp-plugins

Personal plugins for [Oh My Pi](https://github.com/can1357/oh-my-pi).

The repository is `personal-omp-plugins`. Its OMP marketplace name is
`omp-plugin-marketplace`, which preserves the existing local installation.

## Install

Add the GitHub marketplace and install a plugin:

```powershell
omp plugin marketplace add notmike101/personal-omp-plugins
omp plugin install discord-cdp@omp-plugin-marketplace
```

This repository is private. Authenticate with GitHub before adding it.
If the marketplace is already registered from a local path, keep that
registration or remove it before switching to the GitHub source.

For a local checkout:

```powershell
omp plugin marketplace add D:\omp-plugin-marketplace
omp plugin install discord-cdp@omp-plugin-marketplace
```

Restart OMP after installation to load the skill into an existing session.

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

OMP stores user-scoped marketplace plugins under
`~/.omp/plugins/cache/plugins/`. The directory for this release is
`omp-plugin-marketplace___discord-cdp___1.0.0`.

Use UI mode by default. The API helper sends a `.` message before the requested
message to capture authentication headers. Use it only when the user has
authorized that additional send. CDP exposes the browser session; keep it
local and close the automation browser when finished. Never commit session
credentials, browser profiles, captured headers, or private messages.

## Add or update a plugin

1. Put the plugin in `plugins/<name>/`, with skills under `skills/<name>/`.
2. Add `.claude-plugin/plugin.json` with its name, version, and description.
3. Add an entry to `.omp-plugin/marketplace.json` using a relative source path.
4. Declare runtime dependencies in the plugin's `package.json` and commit its lockfile.
5. Validate the manifests, scripts, and OMP discovery before publishing.

For updates, bump the plugin version in its manifest, package files, and
marketplace entry together. Update the registered marketplace and upgrade the
installed plugin:

```powershell
omp plugin marketplace update omp-plugin-marketplace
omp plugin upgrade discord-cdp@omp-plugin-marketplace
```

The copy in this repository is the maintained plugin source. The original
Codex skill remains separate.
