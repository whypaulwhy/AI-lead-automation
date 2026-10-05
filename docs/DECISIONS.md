# Decisions

One line per deviation from `docs/BUILD_SPEC.md`: what changed, and why.

## Phase 0 (2026-10-05)

- **AI runs through a local bridge to Claude Code on Prit's Pro plan, not the paid Anthropic API.** Why: Prit's hard constraint is no spend beyond the Pro subscription, and API usage is billed separately. `AI_MODE=bridge|api` keeps the spec's API path available for paying clients, who use their own key.
- **Removed `ANTHROPIC_API_KEY` from `.env.example`; added `AI_MODE`, `AI_BRIDGE_PORT`, `AI_BRIDGE_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `N8N_CRED_AI_BRIDGE_ID`.** Why: if `ANTHROPIC_API_KEY` is set where `claude` runs, Claude Code bills the API instead of the plan; the bridge needs its own shared secret and login.
- **`.env.example` comments moved to their own lines.** Why: Node's and Docker Compose's .env parsers can read a trailing `# comment` on an empty variable as its value, which would make a missing value look `set`.
- **`check-secrets.mjs` matches real secret shapes (prefix plus the characters after it) instead of bare prefixes, and skips `.env` values equal to their `.env.example` default.** Why: the spec, CLAUDE.md and `.env.example` mention the bare prefixes, and public defaults like `http://localhost:5678` appear in docs; both would be false alarms. It also scans new untracked files, so a secret is caught before `git add`.
- **Repo root is `D:\p1`, not a `lead-responder-demo/` subfolder.** Why: that is the folder Prit opened; the layout inside it follows Section 5.
- **`serve` pinned to 14.2.6 in the `site` script.** Why: CLAUDE.md rule 4 (no unpinned versions).
- **Node 25.9.0 instead of the current LTS.** Why: it is what is installed and it supports everything used here (`process.loadEnvFile`, `util.parseEnv`, `node:test`); it is past end-of-life, so moving to LTS later is recommended but not blocking.
- **Added `scripts/ai-bridge.mjs` and the `ai:bridge` npm script.** Why: needed by the bridge decision above.

## Phase 1 (2026-10-05)

- **Docker image `n8nio/n8n` instead of `docker.n8n.io/n8nio/n8n`.** Why: n8n's current Docker docs use the Docker Hub name; same images.
- **Pinned n8n 2.41.6, not the newest stable 2.41.7.** Why: the first 2.41.7 download happened while Docker Desktop was hung and left a 0-byte `/docker-entrypoint.sh` in the local image (container crash-looped with "Exec format error"). The published 2.41.7 is fine (checked the layer in the registry), but Docker's containerd store kept reusing the damaged unpacked layer, and clearing it would mean purging all Docker data. 2.41.6 was the stable release until 2026-10-05 and runs cleanly here. To move to 2.41.7 later, purge Docker's data first.
- **`docker-compose.yml` adds `name: lead-responder`, `N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true`, `extra_hosts: host.docker.internal:host-gateway`, and `:?` guards on the two required variables.** Why: a fixed project and volume name; the first setting is in n8n's current Docker docs; the host entry lets n8n reach the AI bridge; the guards stop Compose from starting n8n with an empty version or encryption key.
- **The AI bridge listens on `127.0.0.1` and requires an `x-bridge-token` header.** Why: Docker Desktop forwards `host.docker.internal` to the PC's loopback (tested from inside the n8n container), so the bridge never needs to be reachable from the network; the token stops other local programs from spending the plan's usage.
- **The bridge ignores `max_tokens` and `temperature`; it caps work at 2 parallel Claude Code processes and 60 s per request.** Why: Claude Code's CLI has no max-tokens flag; the caps protect the Pro plan's usage limits during bursts like `send:test`.
- **`scripts/lib/claude-cli.mjs` holds the Claude Code call for both the bridge and (Phase 4) `eval-prompt.mjs`.** Why: one implementation, so the eval tests exactly what n8n uses.
