# Lead Responder demo (Cedar & Slate Roofing)

This repo builds a portfolio demo for Prit's Upwork offer "AI lead responder":
a fictional Austin roofing company's website form posts to an n8n workflow, Claude reads and
classifies the lead, JavaScript scores it, and the workflow sends a human-sounding reply email,
alerts Slack for leads worth calling, and logs every lead to Google Sheets.

The full specification is `docs/BUILD_SPEC.md`. In every new session:
1. Read this file.
2. Read `docs/PROGRESS.md` to see the current phase.
3. Read `docs/DECISIONS.md`: it records where the build deliberately differs from the spec.
4. Read the sections of `docs/BUILD_SPEC.md` that the current phase needs.

## Who you are working with

Prit is a first-year CS student on Windows. Comfortable with HTML/CSS, basic Python and calling
REST APIs. New to n8n, Docker, Node tooling, Google Cloud and Slack apps.

- Explain each new concept the first time it appears, in 3 plain sentences or fewer.
- For anything Prit must do by hand, give numbered steps and say what he should see when it worked.
- At the end of every phase: run the phase's exit checks, summarize what changed and why
  (max 8 bullets), update `docs/PROGRESS.md`, run `npm run check:secrets`, commit, and wait for
  Prit to say "go".

## Hard rules (MUST)

1. Never print, log, echo, commit, or ask Prit to paste a secret into the chat. Secrets live only in
   `.env` (gitignored) and inside n8n credentials. To confirm a secret exists, print `set` or `missing`.
2. Test emails go only to plus-addresses of `TEST_INBOX`. Scripts refuse anything else.
3. Never guess n8n node types, typeVersions or parameters. Use the n8n-mcp tools if connected,
   otherwise docs.n8n.io for the pinned version, otherwise ask Prit to build the node in the UI and
   export its JSON.
4. Pin versions. No `latest` tags.
5. Scripts are Node.js ESM and must work on Windows. No bash-only scripts.
6. Customer-facing text follows Section 15 of the spec. No em dashes, en dashes, exclamation marks
   or emojis in anything a customer reads.
7. The repo is the source of truth for workflows. If Prit edits a workflow in the n8n UI, bring the
   change back into `workflows/*.template.json` before continuing.
8. Ask before installing anything globally or changing system settings.
9. When the installed software disagrees with the spec, follow the software and official docs, keep
   the spec's intent, and log the deviation in `docs/DECISIONS.md`.
10. No extra spend beyond Prit's Claude Pro plan. The demo calls Claude through the local AI bridge
    (`AI_MODE=bridge`), never through paid API credits. Never add `ANTHROPIC_API_KEY` to `.env` or the
    environment in bridge mode: Claude Code would bill the API instead of the plan.

## AI path (differs from the spec, see DECISIONS.md)

- `AI_MODE=bridge` (demo default): n8n posts the Messages-API-shaped request to
  `scripts/ai-bridge.mjs` on Prit's PC, which runs `claude -p` headless on his Pro login with all tools
  disabled, `--safe-mode`, and the customer text on stdin only. It returns a Messages-API-shaped response,
  so the workflow and `parseAiResponse` stay the same.
- `AI_MODE=api` (for a paying client): the same request goes to `https://api.anthropic.com/v1/messages`
  with the client's own key in an n8n credential. The client pays for their own usage.

## Commands (after Phase 0)

| Command | What it does |
|---|---|
| `npm run n8n:up` / `npm run n8n:down` / `npm run n8n:logs` | Start, stop, follow logs of local n8n (Docker) |
| `npm run ai:bridge` | Run the local AI bridge (keep it open in its own terminal during tests and demos) |
| `npm run site` | Serve the landing page at http://localhost:8080 |
| `npm run build` | Inject config, prompts, code and secrets into `build/*.json` and `site/config.js` |
| `npm run deploy` | Build, then create or update and publish both workflows through the n8n API |
| `npm test` | Unit tests (node:test) |
| `npm run eval:prompt` | Call Claude directly on the fixtures and check tiers and copy rules |
| `npm run send:test` | Post fixture leads to the live webhook (`-- --only id1,id2` to filter) |
| `npm run check:secrets` | Fail if any secret pattern or `.env` value appears in tracked files |

## Map

- `config/` business facts, scoring weights, email templates (client-editable)
- `prompts/` Claude system prompt, user template, JSON schema
- `src/logic/` pure JS (unit-tested), inlined into n8n Code nodes at build time
- `src/n8n/` thin Code-node entry files that call the logic with n8n globals
- `workflows/` n8n workflow templates with `%%PLACEHOLDERS%%`
- `scripts/` build, deploy, AI bridge, eval, test-lead sender, secret check
- `site/` landing page
- `fixtures/` test leads
- `docs/` spec, progress, decisions, architecture, setup, handover, demo script
