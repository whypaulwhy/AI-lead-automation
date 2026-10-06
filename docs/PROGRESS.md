# Progress

| Phase | Status | Finished |
|---|---|---|
| 0. Preflight and repo skeleton | done | 2026-10-05 |
| 1. n8n running locally | done | 2026-10-05 |
| 2. Accounts and credentials | done | 2026-10-06 |
| 3. Landing page | reworked 2026-10-06 after Prit's review; waiting for his approval | |
| 4. Claude contract, logic and tests | done | 2026-10-06 |
| 5. Workflows | in progress | |
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

## Phase 1 checklist (done)

- [x] T1 latest stable is 2.41.7 (registry digest and GitHub release); pinned 2.41.6 in `.env` and README instead (see DECISIONS)
- [x] T2 `.env` created from `.env.example`; `N8N_ENCRYPTION_KEY` and `AI_BRIDGE_TOKEN` generated without display
- [x] T3 `docker-compose.yml` following n8n's current Docker docs
- [x] T4 `npm run n8n:up`; `/healthz` returns 200; container runs n8n 2.41.6
- [x] Added: AI bridge built. Health 200, wrong token 401, request reaches Claude Code (fails only on the expired CLI login), n8n container reaches the bridge (200)
- [x] Prit 1: n8n owner account created
- [x] Prit 2: n8n API key in `.env` (set)
- [x] Prit (added): `claude setup-token` done; `CLAUDE_CODE_OAUTH_TOKEN` set
- [-] Prit 3 (optional): n8n-mcp skipped; rule 0.7 falls back to docs.n8n.io and the instance's own API
- [x] Exit: `GET /api/v1/workflows` returned 200
- [x] Exit (added): bridge returned schema-valid JSON from claude-haiku-4-5 on the Pro login in 10.9 s (2,518 in / 575 out tokens)
- [x] Exit: Docker, container and volume explained in 3 sentences
- [x] 0.2 routine

## Phase 2 checklist (done)

- [x] T1 `docs/CREDENTIALS_SETUP.md` written from Section 14, adapted (no Anthropic account; credentials by script)
- [x] Added: `npm run setup:credentials` (n8n API) and `npm run check:env`
- [x] "AI bridge token" credential created through the API; `N8N_CRED_AI_BRIDGE_ID` set
- [x] Prit: guide steps A to H done (Slack step rewritten for the new "Blank app" dialog)
- [x] T2 every `.env` value set; `npm run check:env` says "All good."; n8n credential tests: Gmail OK, Google Sheets OK (bridge has no test function; proven in Phase 1)
- [x] T2 Prit approved; Slack answered 200 ok
- [x] Exit: sheet tab "Leads" has the 24 headers in A1:X1; the robot account wrote them, so it has Editor access
- [x] 0.2 routine

## Phase 3 checklist (in progress, parallel with Phase 2)

- [x] T1 design plan in DECISIONS.md (8.4), checked against 8.5
- [x] T2 `site/` built per Section 8; `site/config.js` from `npm run build -- --site-only`
- [x] T3 served with `npm run site`; checked in the browser pane at 360, 375, 768, 1280 px. Self-critique fixes: headline no longer splits "storm-damaged", balanced headline lines, larger gable, "How it works" changed from four equal columns (a stock template pattern) to job-sheet rows
- [x] T4 `tests/copy.test.js` passes: page text, 6 templates, customer config strings, form options match config, fiction disclaimer and 555-01xx numbers
- [x] Form behavior checked: empty submit shows the 6 exact spec messages, focus to first invalid, `aria-describedby` linked, live region announces; errors clear while fixing; server 400 errors shown under the field; success panel replaces the form and takes focus; network failure keeps all typed values
- [x] Prit reviewed v1 (2026-10-06): read as AI-generated. Reworked per his list (DECISIONS, Phase 3 rework): paper background, square corners, cedar accent, sample inspection notes, privacy policy and terms, local detail. Rechecked at 360 and 1280 px, form validation, no console errors
- [x] Exit 8.6: visible labels, required stated in words, one polite live region, visible focus (slate ring, yellow on slate bands), DOM-order keyboard flow (honeypot skipped), 44px targets (inline text links exempt), no horizontal scroll at 360
- [ ] Exit 8.6 "no console errors": the only errors are the CORS failure because the webhook does not exist yet; recheck in Phase 5 after the webhook with Allowed Origins is deployed
- [x] Exit: copy test passes
- [ ] Exit: Prit approves the look
- [ ] 0.2 routine

## Phase 4 checklist (done)

- [x] T1 `config/business.json` and templates (written in Phase 3); `prompts/*` and `fixtures/leads.json` copied from the spec by script
- [x] T2 `src/logic/*` (validate, ai, score, compose, row) and `tests/*.test.js`: 58 tests pass; the five logic files combine into one Code node and pass `node --check`
- [x] T3 `scripts/eval-prompt.mjs` (bridge mode calls Claude Code like the bridge; api mode uses fetch per spec)
- [x] T4 eval run 1: wording passed but 4 of 9 calls timed out; fixed by turning off Claude Code's default thinking
- [x] T4 prompt round 1 (stop parroting the message back) and round 2 (homeowner rule, one detail, no "thanks for reaching out")
- [x] Exit: eval passes: 9 of 9 tiers allowed, 0 parse failures, 9 of 9 lines pass the guard without fallback, 6 to 11 s per lead
- [x] Exit: tone approved by Prit on 2026-10-06 ("yes fix the gutter line, continue to phase 5"). Fix applied: the not_fit_service closing line is now "Hope you find someone good for it." and, for the same double-"Sorry" reason, the not_fit_area closing line is "Good luck getting it fixed."
- [x] 0.2 routine

## Definition of Done tracker (BUILD_SPEC 13.5)

| ID | Criterion (short) | Status |
|---|---|---|
| AC-01 | `npm test` passes | passing (58 tests) |
| AC-02 | Eval passes, at least 8 of 9 without fallback, tone approved | passing (9 of 9; tone approved 2026-10-06) |
| AC-03 | Both workflows validate, main workflow published | pending (Phase 5) |
| AC-04 | Real form: "Request sent" under 2 s, reply under 60 s, Slack, 24-column row | pending (Phase 7) |
| AC-05 | `send:test` matches 13.1 for all 11 fixtures | pending (Phase 7) |
| AC-06 | Three failure drills pass, environment restored | pending (Phase 6) |
| AC-07 | No banned phrases or characters in customer text | site, templates and config passing (copy test); AI slots in Phase 4 |
| AC-08 | Site meets 8.6 at 375, 768, 1280 px | pending (Phase 3) |
| AC-09 | `check:secrets` passes, `.env` never committed | passing so far |
| AC-10 | README lets someone run it from zero | pending (Phase 8) |
| AC-11 | ARCHITECTURE, HANDOVER, DEMO_SCRIPT, CREDENTIALS_SETUP match the build | pending (Phases 2 and 8) |
| AC-12 | Footer disclaimer, every phone number 555-01xx | site passing (copy test); fixtures in Phase 4 |

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

- Phase 2: Prit creates the accounts in docs/CREDENTIALS_SETUP.md.
- Phase 3: landing page build and review.
