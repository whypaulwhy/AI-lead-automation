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

## Phase 2 (2026-10-05)

- **n8n credentials are created by `npm run setup:credentials` through the n8n API, not by hand in the n8n UI, and their IDs are written into `.env` automatically.** Why: fewer manual steps and no copying IDs out of URLs (Prit asked for simpler steps). The Gmail app password is typed into a hidden prompt and the Google key is read from its file outside the repo; both go only to n8n, as in spec 6.2.
- **The setup script writes the sheet's header row (and renames the first tab to `Leads`, bolds and freezes row 1) instead of Prit pasting it.** Why: removes the paste and "Split text to columns" step and makes the Phase 2 exit check (24 headers, shared as Editor) an automatic check. It refuses to overwrite a row 1 that has other text.
- **The "AI bridge token" credential may only be sent to `host.docker.internal`.** Why: n8n's allowed-domains setting stops the token from being sent anywhere else by mistake.
- **Added `npm run check:env`.** Why: Phase 2 task 2 ("every .env variable prints set") as a command Prit can run himself; it also flags malformed values without printing them.
- **Section 14 B (Anthropic API key) and the "Anthropic API key" credential are dropped in bridge mode.** Why: see Phase 0 bridge decision.
- **`SHEET_COLUMNS` lives in `src/logic/row.js` now.** Why: the setup script and Phase 4's `buildSheetRow` must use the same 24 columns.
- **Slack app: "Blank app" instead of "From scratch" (2026-10-06).** Why: see below.

## Phase 3 rework (2026-10-06)

Prit reviewed the first version and said it read as AI-generated. His list of tells to avoid: harsh gradients, Lucide icons, pure white background, rainbow coloring, drop shadows, 3 feature cards in a row, emojis, liquid glass, em dashes, Inter/Geist/Space Grotesk, colored left stripe, fake testimonials, bento grids, terminal windows, "It's not X, it's Y", checkmark bullets, 3 pricing tiers, no real product demo, soft corner radius, purple and black, no skeleton loaders, radial orbs, dot grids, sparkle icons, animated arrows, no terms of use, no privacy policy, hover animations, neon colors, basic pastel colors. This overrides spec 8.2 and 8.4 where they conflict.

New design plan. Guiding principle: a printed estimate from a local trade business. Specific facts, ruled lines, nothing decorative.
- Palette from the company name: slate `#25313A` (text, rules, footer), slate-soft `#55626C` (secondary, 5.5:1 on paper), paper `#F1F1EE` page (not white, not cream), panel `#FAFAF8` for the form and sample sheet, white only inside inputs, cedar `#7A3E1F` as the one accent (button 8:1 with white text, brand mark, finding labels), error `#B42318`, success `#1F7A4D`.
- Type: Barlow Condensed 600 for headings (truck-lettering feel), Barlow 400/600/700 for text.
- Square corners everywhere. No shadows, transitions or animations; hover only darkens the button or thickens an underline.
- Layout: header on paper with a rule and a small roof mark (replaces the page-wide yellow roofline). Hero: headline, one paragraph, an emergency call line, and "What happens after you send the form" in the left column; form on the right. Below: brochure-style sections on one background, each with a full rule, heading left (4/12) and content right (8/12).

```
Desktop                                          Mobile (360)
 [mark] Cedar & Slate Roofing   (512) 555-0147    Cedar & Slate Roofing  (512)...
 ______________________________ Mon to Fri ____   __________________________
 H1                              +-----------+    H1
 paragraph                       | form      |    paragraph
 Water coming in? Call ...       |           |    Water coming in? Call ...
 What happens after you send     |           |    +----------------------+
 1 ... 2 ... 3 ... 4 ...         +-----------+    | form                 |
 ______________________________________________   +----------------------+
 What we work on       | rows                      What happens 1..4
 What you get from     | paragraph + sample sheet  sections stack, rules between
 an inspection         |                           footer
 Where we work | Questions (6) | footer with Privacy and Terms
```

Changes to the spec copy and structure, each to remove a tell or add something real:
- The hero's three bullets are gone (rule-of-three pattern); their facts moved into the sections. Added "Water coming in right now? Call (512) 555-0147."
- "How it works" became "What happens after you send the form", moved into the hero's left column. Step 1 ("Send the form.") dropped since the heading says it; the estimator is named (Marco).
- Added "What you get from an inspection" with a sample of the inspection notes the homeowner receives. This is the real product demo: the deliverable, labeled "(sample)", with no prices, ratings or claims.
- "Where we work" lists 13 real Austin neighborhoods whose ZIPs are in `service_area_zips`.
- FAQ grew from 3 to 6 items (new roof duration, cleanup, gutters and commercial); the free-inspection answer now says there's nothing owed.
- Added `privacy.html` and `terms.html`, linked from every footer and from a line under the submit button. The privacy policy describes the actual demo data flow (n8n, Claude, Gmail, Sheets, Slack, Cal.com, Google Fonts) and offers deletion by replying to any email. The footer adds the location (East Austin, no street address) and office hours.
- The success panel no longer fades in.
- Skeleton loaders: not applicable. Nothing on the page loads after it opens; the only wait is the form submit, which shows "Sending..." and an announced busy state.
- `tests/copy.test.js` now checks all three pages, and that each links both legal pages. Why: Slack's "Create new app" dialog now offers AI agent, Starter app, From a manifest and Blank app; Blank app is the old "From scratch". Button names follow Slack's current incoming-webhooks docs ("Activate Incoming Webhooks", "Authorize").

## Phase 3 design plan (2026-10-05)

Guiding principle: it should read like the lettering on a well-kept work truck. Plain words, one color doing the shouting, nothing a stressed homeowner has to decode.

- Palette: slate `#26323B` (text, header, footer), slate-mid `#51626F` (secondary text and input borders; 6.3:1 on white, 5.4:1 on mist), mist `#E9EEF1` (alternate bands), white surfaces, signal yellow `#F2B705` only on the primary button and the roofline (slate on yellow 7.2:1), error `#B42318` (6.6:1), success `#1F7A4D` (5.3:1).
- Type: Barlow 400/600/700 with a `system-ui` fallback; body 18px / 1.55, headings 1.15, paragraphs capped at 65ch.
- Layout: slate header band, yellow gable roofline, hero (copy 7/12, form 5/12 on white with a 1px slate border and 4px radius), then full-width bands alternating mist and white, slate footer. Two columns start at 900px; below that, one column.
- One bold element: the roofline, a flat 3px yellow line with one low gable rising over the start of the content column.
- Motion: none except the button's busy state and a 150 ms fade on the success panel, off under `prefers-reduced-motion`.

```
Desktop (1280)                                   Mobile (375)
+----------------------------------------------+ +---------------------------+
| Cedar & Slate Roofing          (512) 555-0147| | Cedar & Slate  (512)...   |
+----------------------------------------------+ +---------------------------+
 ____/\________________________________________   __/\______________________
| H1 two lines                 | +-----------+ | | H1                        |
| lead paragraph               | | form card | | | lead paragraph            |
| - three plain points         | | ...       | | | +-----------------------+ |
|                              | +-----------+ | | | form card             | |
+----------------------------------------------+ | +-----------------------+ |
| What we work on: term | description rows     | | - three plain points      |
| How it works: 1  2  3  4                     | | sections stack, one col   |
| Where we work / Questions / footer           | | footer                    |
+----------------------------------------------+ +---------------------------+
```

Checked against 8.5: no gradients, blur, illustrations, emoji, icons in inputs, eyebrow labels, restyled headline words, numbers outside How it works, scroll fades, arrows, middle-dot strings, card grids, pills, cream and terracotta, dark-with-neon, fake proof, banned phrases, dashes or exclamation marks.

## Phase 3 (2026-10-05)

- **Footer is a slate band, in addition to the white and mist bands.** Why: it closes the page the way the header opens it, and keeps the fiction disclaimer visually separate from the business content.
- **The form has a short heading ("Request a free inspection") and the line "All fields are required unless marked optional."** Why: 8.6 requires the required state in words; the heading gives the form a name for screen readers and on mobile, where it sits below the intro.
- **All visible wording, including validation messages and live announcements, lives in `index.html` (`data-*` attributes); `app.js` holds none.** Why: the copy test (13.2) can then check every word a visitor can see.
- **The busy button uses `aria-disabled` plus a JS guard instead of the `disabled` attribute.** Why: disabling a focused button drops keyboard focus to the page in some browsers; the button still reads as disabled and ignores clicks while sending.
- **`config/business.json` and `config/templates/*.txt` are written in Phase 3, not Phase 4.** Why: the Phase 3 copy test checks their wording, so they must exist first. Content is exactly spec 6.3 and 6.4.
- **Scripts read `.env` with `util.parseEnv` (the same parser `process.loadEnvFile` uses) instead of loading it into `process.env`.** Why: values in `process.env` are inherited by child processes such as Claude Code; keeping them in a plain object avoids that.
- **`serve` runs with `--no-clipboard`.** Why: by default it copies the URL to the clipboard on every start, overwriting whatever Prit had copied.

## Phase 4 (2026-10-06)

- **Prompts, schema and fixtures were copied from the spec's code blocks by script, not retyped.** Why: no transcription errors; `prompts/` and `fixtures/leads.json` start identical to spec 10.1 to 10.3 and 13.1.
- **Claude Code runs with extended thinking off (`MAX_THINKING_TOKENS=0` in `scripts/lib/claude-cli.mjs`).** Why: Claude Code turns thinking on by default for Haiku 4.5. The first eval took 30 to 70 s and 2,400 to 7,000 output tokens per lead, and 4 of 9 calls hit the 60 s timeout. With thinking off: 6 to 11 s and about 300 to 500 output tokens. The spec's API request (10.4) has no thinking either, so both AI modes now behave the same.
- **Bridge mode uses about 5,200 input tokens per lead, not the spec's 1,500 estimate.** Why: Claude Code returns structured output through a tool call, so each lead is two model turns. That usage counts against the Pro plan, not a bill. API mode keeps the spec's single-turn estimate.
- **System prompt, round 1 (after the first passing eval).** Opening lines mostly repeated the customer's message back to them ("Your gutters are packed with oak leaves...", "You're looking at replacing...") and one said what we'd do ("We can take a look..."). Added: react like a person ("Sorry about..." / "Thanks for..."), don't repeat their message or describe their situation to them, don't say what we will do, 8 to 20 words preferred (28 max), subject_topic must read naturally after "About your", one new good example and three bad examples. New examples are deliberately not taken from the fixtures, so the eval stays a fair test.
- **System prompt, round 2.** Round 1 marked "our single-story house" as decision_maker unknown (score 60, nurture) and wrote "Thanks for reaching out" (caught by the guard). Added: "my house"/"our house" without renting counts as the owner; "thanks for reaching out" in the stock phrase list; one detail, not a list of everything they said. Result: 9 of 9 tiers allowed, 9 of 9 lines pass the guard, 0 forbidden text.
- **`decideTier` returns `{ tier, reason, decline_key, alert }`; reasons are `spam`, `area`, `ai_failed`, `service`, `score`. The lead result (11.6) also carries `decline_key`, `slack_alert` and `guard` (why a Claude slot was replaced).** Why: the Slack, email and logging steps need them, and `guard` makes fallbacks explainable in the eval and in n8n's execution log.
- **`scripts/lib/config.mjs` loads config, templates, prompts and fixtures, and builds `now` for Austin time.** Why: tests, eval and (Phase 5) the build must read them the same way.
- **Logic helpers carry a file prefix (`validateText`, `composeFill`, `scoreWeight`, ...).** Why: the build pastes several logic files into one Code node, where duplicate names would break; `build/check/all-logic.mjs` confirms all five combine and pass `node --check`.
- **Open for Phase 5:** write sheet rows with value input option RAW so a message starting with `=` can't become a formula.
