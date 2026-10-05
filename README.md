# Lead Responder demo (Cedar & Slate Roofing)

A portfolio demo: a fictional Austin roofing company's website form posts to n8n, Claude reads and
classifies the lead, and the workflow replies by email, alerts Slack and logs every lead to Google Sheets.

The full README (setup in 15 steps, demo, troubleshooting) is written in Phase 8. Until then, see
`CLAUDE.md`, `docs/BUILD_SPEC.md`, `docs/PROGRESS.md` and `docs/DECISIONS.md`.

## Pinned versions

| Component | Version |
|---|---|
| n8n (Docker image `n8nio/n8n`) | 2.41.6 |
| Node.js | 20.12 or newer (built with 25.9.0) |
| `serve` (landing page) | 14.2.6 |
