# Progress

| Phase | Status | Finished |
|---|---|---|
| 0. Preflight and repo skeleton | done | 2026-10-05 |
| 1. n8n running locally | next | |
| 2. Accounts and credentials | not started | |
| 3. Landing page | not started | |
| 4. Claude contract, logic and tests | not started | |
| 5. Workflows | not started | |
| 6. Error handling and failure drills | not started | |
| 7. Full end-to-end run | not started | |
| 8. Docs and demo prep | not started | |

## Approvals

- 2026-10-05: Prit approved the plan, including the AI bridge on the Pro plan instead of paid API credits (see DECISIONS.md).

## Environment (checked 2026-10-05)

- Git 2.55.0, Node 25.9.0, npm 11.20.0.
- Docker 29.8.1 and Docker Compose v5.5.1, engine running (WSL 2 backend). Installed per user under
  `%LOCALAPPDATA%\Programs\DockerDesktop`; terminals opened before the install need reopening to find `docker`.
- Claude Code 2.1.177, logged in with claude.ai (Pro). A headless test call on 2026-10-05 returned
  "OAuth access token has expired"; fix in Phase 1 with `claude setup-token`.
- n8n-mcp: not registered (optional).

## Phase 0 log

- Saved `CLAUDE.md` and `docs/BUILD_SPEC.md`, created the Section 5 layout with placeholder files,
  `package.json`, `.gitignore`, `.gitattributes`, `.env.example`, `scripts/check-secrets.mjs`.
- Exit checks: `npm test` runs, `npm run check:secrets` passes, `git status` clean after the first commit.

## Open items

- Phase 1: pin n8n 2.x, create `.env`, start n8n, build and test the AI bridge.
