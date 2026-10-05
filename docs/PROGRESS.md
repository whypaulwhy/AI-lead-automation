# Progress

| Phase | Status | Finished |
|---|---|---|
| 0. Preflight and repo skeleton | done | 2026-10-05 |
| 1. n8n running locally | in progress: waiting on Prit's steps | |
| 2. Accounts and credentials | not started | |
| 3. Landing page | not started | |
| 4. Claude contract, logic and tests | not started | |
| 5. Workflows | not started | |
| 6. Error handling and failure drills | not started | |
| 7. Full end-to-end run | not started | |
| 8. Docs and demo prep | not started | |

How this file prevents misses: each phase gets a checklist copied item by item from BUILD_SPEC
Section 12 (tasks, Prit's steps, exit checks) plus the end-of-phase routine from rule 0.2, ticked
only with evidence. The checklist for a phase is added when that phase starts.

## Standing rules (BUILD_SPEC Section 0)

| Rule | What it requires | How it is applied |
|---|---|---|
| 0.1 Kickoff | Plan first, no files before approval | Plan given and approved 2026-10-05 |
| 0.2 Phase end | Summary (max 8 bullets), Prit's next steps, PROGRESS update, `check:secrets`, commit, wait for "go" | Last block of every phase checklist. Also push to GitHub (repo added by Prit 2026-10-05) |
| 0.3 Reality beats spec | Follow the software, log each deviation | `docs/DECISIONS.md`, one entry per deviation |
| 0.4 Teaching mode | New concepts in 3 sentences or fewer; numbered manual steps with what success looks like | Every phase summary |
| 0.5 Secrets | Never shown, logged or committed; report `set` or `missing` | Generated values go straight into `.env`; `check:secrets` before every commit and push |
| 0.6 Email safety | Test mail only to plus-addresses of `TEST_INBOX` | Enforced in `send-test-leads.mjs` (Phase 5) |
| 0.7 n8n accuracy | No guessed node types, versions or parameters | n8n-mcp if registered, else docs.n8n.io for 2.41.6, else node JSON exported from the editor. n8n-mcp: not registered yet |
| 0.8 New sessions | Read CLAUDE.md, PROGRESS, needed spec sections | CLAUDE.md lists them, plus DECISIONS.md |

## Phase 0 checklist (done)

- [x] T1 versions checked and reported (see Environment)
- [x] T2 Section 5 layout, `package.json`, `.gitignore`, `.gitattributes`, `.env.example`, PROGRESS, DECISIONS
- [x] T3 `scripts/check-secrets.mjs`; self-test caught 3 planted fakes, file names only
- [x] T4 `git init`, first commit `5ed7aeb`, pushed to github.com/whypaulwhy/AI-lead-automation
- [x] Exit: `npm test` runs; `check:secrets` passes; `git status` clean
- [x] 0.2 routine

## Phase 1 checklist (in progress)

- [x] T1 latest stable is 2.41.7 (registry digest and GitHub release); pinned 2.41.6 in `.env` and README instead (see DECISIONS)
- [x] T2 `.env` created from `.env.example`; `N8N_ENCRYPTION_KEY` and `AI_BRIDGE_TOKEN` generated without display
- [x] T3 `docker-compose.yml` following n8n's current Docker docs
- [x] T4 `npm run n8n:up`; `/healthz` returns 200; container runs n8n 2.41.6
- [x] Added: AI bridge built. Health 200, wrong token 401, request reaches Claude Code (fails only on the expired CLI login), n8n container reaches the bridge (200)
- [ ] Prit 1: create the n8n owner account
- [ ] Prit 2: create an n8n API key and paste it into `.env` as `N8N_API_KEY`
- [ ] Prit (added): run `claude setup-token` and paste the token into `.env` as `CLAUDE_CODE_OAUTH_TOKEN`
- [ ] Prit 3 (optional): register n8n-mcp
- [ ] Exit: `GET /api/v1/workflows` with the API key returns 200 (status code only)
- [ ] Exit (added): bridge returns schema-valid JSON from Claude on the Pro login
- [x] Exit: Docker, container and volume explained in 3 sentences
- [ ] 0.2 routine

## Definition of Done tracker (BUILD_SPEC 13.5)

| ID | Criterion (short) | Status |
|---|---|---|
| AC-01 | `npm test` passes | pending (Phase 4) |
| AC-02 | Eval passes, at least 8 of 9 without fallback, tone approved | pending (Phase 4) |
| AC-03 | Both workflows validate, main workflow published | pending (Phase 5) |
| AC-04 | Real form: "Request sent" under 2 s, reply under 60 s, Slack, 24-column row | pending (Phase 7) |
| AC-05 | `send:test` matches 13.1 for all 11 fixtures | pending (Phase 7) |
| AC-06 | Three failure drills pass, environment restored | pending (Phase 6) |
| AC-07 | No banned phrases or characters in customer text | pending (Phases 3 and 4) |
| AC-08 | Site meets 8.6 at 375, 768, 1280 px | pending (Phase 3) |
| AC-09 | `check:secrets` passes, `.env` never committed | passing so far |
| AC-10 | README lets someone run it from zero | pending (Phase 8) |
| AC-11 | ARCHITECTURE, HANDOVER, DEMO_SCRIPT, CREDENTIALS_SETUP match the build | pending (Phases 2 and 8) |
| AC-12 | Footer disclaimer, every phone number 555-01xx | pending (Phases 3 and 4) |

## Approvals

- 2026-10-05: Prit approved the plan, including the AI bridge on the Pro plan instead of paid API credits.
- 2026-10-05: Prit chose to stop (not delete) the old `n8n` container and start fresh, and approved restarting Docker Desktop.

## Environment (2026-10-05)

- Git 2.55.0, Node 25.9.0, npm 11.20.0, Claude Code 2.1.177 (claude.ai login, Pro).
- Docker 29.8.1, Compose v5.5.1, containerd image store. Installed per user under
  `%LOCALAPPDATA%\Programs\DockerDesktop`; terminals opened before the install need reopening to find `docker`.
- Docker Desktop hung on 2026-10-05 (containers would not start). Fixed by stopping Docker Desktop,
  `wsl --shutdown`, and starting it again.
- Old container `n8n` (n8n 2.41.6, volume `n8n_data`) is stopped, not deleted. It also uses port 5678,
  so start it only after `npm run n8n:down`.
- Remote: `origin` = https://github.com/whypaulwhy/AI-lead-automation (public).

## Open items

- Phase 1: Prit's steps above, then the two remaining exit checks.
