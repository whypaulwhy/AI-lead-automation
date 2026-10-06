// Runs the fixtures marked run_ai through Claude with the same request the workflow sends, then the
// same parsing, scoring, tier and copy guard. Prints a table plus every customer-facing line.
// Exits 1 if any tier is outside its allowed list or any reply fails to parse.
//
//   npm run eval:prompt
//   npm run eval:prompt -- --only austin_active_leak,seo_spam
//
// AI_MODE=bridge (default): calls Claude Code headless on the Pro login, like scripts/ai-bridge.mjs.
// AI_MODE=api: calls https://api.anthropic.com/v1/messages with ANTHROPIC_API_KEY (a client's key).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildAiRequest, parseAiResponse } from '../src/logic/ai.js';
import { composeReply } from '../src/logic/compose.js';
import { computeScore, decideTier } from '../src/logic/score.js';
import { cleanAndValidate } from '../src/logic/validate.js';
import { parseMessagesRequest, runClaude } from './lib/claude-cli.mjs';
import { loadConfig, loadFixtures, loadPrompts, makeNow } from './lib/config.mjs';
import { readEnv } from './lib/env.mjs';

const PARALLEL = 2;
const TIMEOUT_MS = 60000;

const { values: args } = parseArgs({ options: { only: { type: 'string' } } });
const env = readEnv();
const mode = env.AI_MODE === 'api' ? 'api' : 'bridge';
const config = loadConfig({ bookingUrl: env.BOOKING_URL || 'https://cal.com/example', sheetId: env.GOOGLE_SHEET_ID || 'SHEET' });
const prompts = loadPrompts();

let fixtures = loadFixtures().filter((f) => f.run_ai);
if (args.only) {
  const wanted = args.only.split(',').map((s) => s.trim());
  const unknown = wanted.filter((id) => !fixtures.some((f) => f.id === id));
  if (unknown.length) {
    console.error(`Unknown or non-AI fixture: ${unknown.join(', ')}`);
    process.exit(1);
  }
  fixtures = fixtures.filter((f) => wanted.includes(f.id));
}
if (mode === 'bridge' && !env.CLAUDE_CODE_OAUTH_TOKEN) {
  console.error('CLAUDE_CODE_OAUTH_TOKEN is missing in .env. Run claude setup-token (Phase 1).');
  process.exit(1);
}
if (mode === 'api' && !env.ANTHROPIC_API_KEY) {
  console.error('AI_MODE=api needs ANTHROPIC_API_KEY in .env.');
  process.exit(1);
}

async function callClaude(request) {
  if (mode === 'bridge') {
    const parsed = parseMessagesRequest(request);
    if (!parsed.ok) return { ok: false, message: parsed.message };
    const result = await runClaude(parsed.request, { oauthToken: env.CLAUDE_CODE_OAUTH_TOKEN, timeoutMs: TIMEOUT_MS });
    return result.ok ? { ok: true, response: result.response } : { ok: false, message: result.message };
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, response: body } : { ok: false, message: `HTTP ${res.status} ${body.error?.type ?? ''}`.trim() };
  } catch (err) {
    return { ok: false, message: err.name === 'TimeoutError' ? 'timed out' : err.message };
  }
}

async function evaluate(fixture) {
  const payload = { email: `test+${fixture.email_alias}@example.com`, ...fixture.payload };
  const { route, lead } = cleanAndValidate(payload, config, makeNow());
  if (route !== 'ok') return { fixture, error: `validation route ${route}` };

  const started = Date.now();
  const call = await callClaude(buildAiRequest(lead, config, prompts));
  const seconds = (Date.now() - started) / 1000;
  if (!call.ok) return { fixture, seconds, error: `call failed: ${call.message}` };

  const parsed = parseAiResponse(call.response, prompts.schema);
  const usage = call.response.usage ?? {};
  if (!parsed.ok) return { fixture, seconds, usage, error: `${parsed.status}: ${parsed.error}` };

  const { ai } = parsed;
  const score = computeScore(ai, lead, config.scoring);
  const tierInfo = decideTier({ ai, lead, score, config });
  const reply = composeReply({ lead, ai, tierInfo, config });
  const leaked = (fixture.expect.email_must_not_contain ?? []).filter((s) => `${reply.email?.subject ?? ''}\n${reply.email?.text ?? ''}`.includes(s));
  return { fixture, seconds, usage, ai, score, tierInfo, reply, leaked };
}

async function runAll(items) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      process.stdout.write(`  ${items[index].id} ...\n`);
      results[index] = await evaluate(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
  return results;
}

function table(rows) {
  const widths = rows[0].map((_, col) => Math.max(...rows.map((row) => String(row[col]).length)));
  return rows.map((row) => row.map((cell, col) => String(cell).padEnd(widths[col])).join('  ').trimEnd()).join('\n');
}

console.log(`Eval: ${fixtures.length} fixture(s), model ${config.ai.model}, AI_MODE=${mode}`);
const results = await runAll(fixtures);

const rows = [['id', 'allowed', 'tier', 'score', 'urgency', 'service_category', 'guard', 'fallback', 'in', 'out', 'sec']];
for (const r of results) {
  if (r.error) {
    rows.push([r.fixture.id, r.fixture.expect.allowed_tiers.join('|'), 'ERROR', '', '', '', '', '', r.usage?.input_tokens ?? '', r.usage?.output_tokens ?? '', r.seconds?.toFixed(1) ?? '']);
    continue;
  }
  const ok = r.fixture.expect.allowed_tiers.includes(r.tierInfo.tier);
  rows.push([
    r.fixture.id,
    r.fixture.expect.allowed_tiers.join('|'),
    ok ? r.tierInfo.tier : `${r.tierInfo.tier} (NOT ALLOWED)`,
    r.score,
    r.ai.urgency,
    r.ai.service_category,
    r.reply.email === null ? 'n/a' : r.reply.used_fallback ? 'FAIL' : 'ok',
    r.reply.used_fallback ? 'yes' : 'no',
    r.usage.input_tokens ?? '',
    r.usage.output_tokens ?? '',
    r.seconds.toFixed(1),
  ]);
}
console.log(`\n${table(rows)}\n`);

console.log('What a customer would read (subject_topic / opening_line):');
for (const r of results) {
  if (r.error) {
    console.log(`\n${r.fixture.id}: ${r.error}`);
    continue;
  }
  console.log(`\n${r.fixture.id}  [${r.tierInfo.tier}${r.reply.email ? '' : ', no email sent'}]`);
  console.log(`  subject:  ${r.ai.subject_topic}`);
  console.log(`  opening:  ${r.ai.opening_line}`);
  console.log(`  summary:  ${r.ai.issue_summary}`);
  for (const [slot, reasons] of Object.entries(r.reply.guard)) console.log(`  guard replaced ${slot}: ${reasons.join('; ')}`);
  if (r.leaked.length) console.log(`  EMAIL CONTAINS: ${r.leaked.join(', ')}`);
}

const errors = results.filter((r) => r.error);
const wrongTier = results.filter((r) => !r.error && !r.fixture.expect.allowed_tiers.includes(r.tierInfo.tier));
const leaks = results.filter((r) => !r.error && r.leaked.length);
const guardClean = results.filter((r) => !r.error && !r.reply.used_fallback).length;
console.log(`\nTiers inside the allowed list: ${results.length - errors.length - wrongTier.length} of ${results.length}`);
console.log(`Replies that failed (call or parse): ${errors.length}`);
console.log(`Passed the copy guard without fallback: ${guardClean} of ${results.length} (Phase 4 needs at least 8 of 9)`);
console.log(`Emails containing forbidden text: ${leaks.length}`);

const outDir = fileURLToPath(new URL('../build/eval/', import.meta.url));
mkdirSync(outDir, { recursive: true });
const outFile = `${outDir}eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(outFile, JSON.stringify(results.map(({ fixture, ...rest }) => ({ id: fixture.id, ...rest })), null, 2));
console.log(`Full results: ${outFile}`);

process.exitCode = errors.length || wrongTier.length || leaks.length ? 1 : 0;
