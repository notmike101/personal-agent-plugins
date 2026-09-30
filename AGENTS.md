# Agent instructions

## Scope

This repository contains personal Codex and OMP plugins and the marketplace catalog.
Keep changes focused on the requested plugin or marketplace maintenance.
Read the relevant skill and bundled scripts before changing their behavior.
Reuse the existing plugin layout and avoid unnecessary dependencies or abstractions.

## Repository layout

- `.omp-plugin/marketplace.json`: OMP catalog.
- `.agents/plugins/marketplace.json`: Codex catalog.
- `plugins/<name>/.codex-plugin/plugin.json`: Codex plugin metadata.
- `plugins/<name>/.claude-plugin/plugin.json`: plugin metadata.
- `plugins/<name>/skills/<skill>/SKILL.md`: skill instructions.
- `plugins/<name>/skills/<skill>/scripts/`: bundled helpers.
- `plugins/<name>/package.json` and `package-lock.json`: runtime dependencies.

Keep the marketplace and repository name `personal-agent-plugins` stable.
Both clients use the same skill and script files. Keep their catalogs and
plugin manifests consistent; do not fork skill behavior by client.
Use relative paths in manifests and avoid machine-specific runtime paths.

## Changes and validation

When updating a plugin, keep its version consistent across the plugin
manifest, package files, and marketplace entry. Document prerequisites and
observable side effects in the README and skill instructions.

Validate JSON and referenced paths. Run syntax checks for changed scripts
and one focused runnable check for nontrivial logic. For dependency changes,
use the committed lockfile and run an audit. Verify Codex and OMP discover the plugin
when changing manifests or its directory layout.

Do not claim browser login, message delivery, or live account behavior was
tested unless it was actually exercised. Report validation limits plainly.

## Privacy and side effects

This repository is public. Never commit credentials, tokens, browser
profiles, captured authentication headers, screenshots of private content,
message exports, `.env` files, or `node_modules`.

Installing or validating a plugin does not authorize sending messages,
reading private accounts, extracting session tokens, or closing browser
processes. Obtain explicit user authorization for those actions. Prefer
checks that do not connect to a real account or send messages.

## Git workflow

Inspect the working tree before editing and preserve unrelated changes.
Use focused commits. Do not publish, push, merge, change repository
visibility, or alter unrelated user configuration unless the task authorizes it.
