# Handoff for the next Claude Code session

Written 2026-10-06 at the end of a long session. Read this first, then follow the "First steps" list.

## Project in one paragraph

Portfolio demo for Prit's Upwork offer "AI lead responder" (repo `D:\p1`, GitHub `whypaulwhy/AI-lead-automation`,
public). A fictional Austin roofer's website form (`site/`) posts to an n8n workflow (Docker, n8n 2.41.6) that
validates the lead, asks an AI to classify it and write one opening line, scores it in JavaScript, emails a
human-sounding reply (Gmail SMTP), alerts Slack for leads worth a call, and logs every lead to Google Sheets.
The AI is called through a local "bridge" (`scripts/ai-bridge.mjs`) that runs a provider chain: local Ollama
(qwen3:4b) first, Claude Code on Prit's Pro plan second, then a human-written fallback reply.

## First steps in the new session

1. Read `CLAUDE.md`, then `docs/PROGRESS.md`, then `docs/DECISIONS.md` (long; the AI chain and Phase 6
   sections matter most), then the spec sections the task needs (`docs/BUILD_SPEC.md`).
2. Run `npm run demo` in its own terminal (or ask Prit to). It starts Docker, n8n, Ollama, the bridge and
   the site, then runs `npm run doctor`. Everything should say OK.
3. Ask Prit which task to start with if he hasn't said. His stated top priority is task A below.

## Where things stand

| Phase | State |
|---|---|
| 0 to 6 | done (Phase 6 = 12 failure drills, 6 fixes) |
| 7 | fixtures done (all 11 match spec 13.1); **waiting for Prit's own form submission in Chrome** |
| AI provider chain | done (local qwen3:4b + Claude backup + human fallback; tested and drilled) |
| 8 docs and demo prep | not started |

Tests: 72 passing (`npm test`). Eval: Claude 9/9 tiers, 8/9 lines pass the guard; qwen3:4b 9/9 and 9/9.

## Open tasks, in Prit's priority order

### A. Make it work with the PC off (Prit's top priority)
Today everything runs on Prit's laptop, so a closed laptop means no replies. Plan agreed in principle; Prit
must choose before building (no money is spent without his OK, see the no-extra-spend memory):
- **Hosting for n8n:** free tier that needs a card for verification (Oracle Cloud Always Free), a small VPS
  (about $4 to $6 a month), or n8n Cloud (about $24 a month, no maintenance). For clients, the client pays.
- **Website:** free static hosting (GitHub Pages, Netlify or Cloudflare Pages), pointed at the server webhook.
- **AI in the cloud** (the laptop's Ollama and Claude Code can't run there): two online providers through
  the existing chain, e.g. a free tier (Google Gemini API, Groq; no card needed at the time of writing; check
  current terms; free tiers may use data for training, so fine for the demo, not for client leads) and
  Claude Haiku through a client's API key (about $3 per 1,000 leads).
- **Build ("cloud deploy kit"):** a server docker-compose with HTTPS (e.g. Caddy), the bridge as a container
  using only online providers, support for more than one OpenAI-compatible provider in `ai-chain.mjs`
  (today there is one `openai` slot), `.env` for the server, deploy steps, site `config.js` pointing at the
  server URL, and an updated doctor. Keep the Gmail/Slack/Sheets credentials flow (`setup:credentials`).

### B. Local AI quality
qwen3:4b passed the eval but rated an active leak "this_week" instead of "emergency" and once invented a
small detail. Ideas, cheapest first: a deterministic safety net in the logic that upgrades urgency to
emergency when the message clearly says water is coming in now (model-agnostic, unit-testable); a
local-model-specific prompt tweak; trying `gemma3:4b` (3.3 GB) or `ministral-3:3b` (3.0 GB) with
`npm run eval:prompt -- --provider ollama` (ask Prit before any download). Claude Haiku/Sonnet/Opus cannot
run offline; bigger local models need more graphics memory than the RTX 2050's 4 GB.

### C. Phase 7 close-out
Prit submits the real form (steps were given to him). Record the result in `PROGRESS.md` (AC-04): time to
"Request sent", seconds until the email, Slack, sheet row, which model answered.

### D. Phase 8 (spec Section 12): README (15-step setup), ARCHITECTURE, HANDOVER, DEMO_SCRIPT, check
CREDENTIALS_SETUP, demo video prep. Include the chain, drills, `npm run demo/doctor/replay`.

### E. Later: phone voicemail-to-lead project (separate portfolio piece; agreed "phone later").

### F. Small items
- Doctor: detect leftover `llama-server` processes whose Ollama parent is gone (one held 2.5 GB today).
- Consider running n8n without Docker (npm) on the laptop to save memory; check Node version support first.
- `workflows/*.template.json` are the source of truth. The generator script used today lived in a temporary
  folder and is gone: edit the template JSON directly, then `npm run validate` and `npm run deploy`.

## Environment facts (Windows 11 laptop)

- Ryzen 5 8645HS, 16 GB RAM (often under 3 GB free), RTX 2050 4 GB + AMD iGPU. C: is nearly full
  (about 10 GB free); D: has room.
- Docker Desktop installed per user: `%LOCALAPPDATA%\Programs\DockerDesktop` (terminals opened before the
  install don't have `docker` on PATH). It does not start after a reboot; `npm run demo` starts it.
- `C:\Users\user\.wslconfig` caps Docker's VM at 2 GB (n8n uses about 400 MB). Changes need `wsl --shutdown`.
- n8n pinned to 2.41.6 (`.env` `N8N_VERSION`); 2.41.7 is avoided (see DECISIONS). Webhook
  `http://localhost:5678/webhook/lead-intake`; site `http://localhost:8080`; bridge `127.0.0.1:8787`.
- Ollama 0.35.1. Its app's own **Model location setting is `D:\`** (Prit set it; it overrides the
  `OLLAMA_MODELS` user variable, which is also `D:\`). Model: qwen3:4b, whole model on the graphics card
  (`num_gpu` 99, context 3,072). Force-killing Ollama can leave an orphan `llama-server`; prefer quitting it
  from the tray.
- Old container `n8n` (separate from this project) is stopped, not deleted.

## Working rules that bit us today

- Never put code containing backticks inside `node -e "..."` in Bash: bash runs them as commands. Use the
  Write/Edit tools for code, or a script file.
- A fake Slack URL that looks real trips `check:secrets`; drills use `host.docker.internal:9` instead.
- Docs must not contain `.env` values (sheet ID, inbox address): `check:secrets` flags them.
- Explain manual steps to Prit one action at a time, plainly; ask before downloads, paid services or system
  setting changes; keep customer-facing text human (see the humanized-not-slop memory).

## Copy-paste prompt for Prit

> Continue my Lead Responder project in D:\p1. Read docs/NEXT_SESSION.md first, then CLAUDE.md,
> docs/PROGRESS.md and docs/DECISIONS.md. Start everything with npm run demo and check npm run doctor.
> Then start with task A (make it work when my PC is off): show me the hosting and AI options with costs
> and your recommendation, wait for my choice, then build it. Explain anything I must do step by step.
