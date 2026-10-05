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
