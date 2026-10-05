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
