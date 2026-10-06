// Posts fixture leads to the live webhook and reports what n8n did with each (spec 13.3).
//
//   npm run send:test                          all fixtures
//   npm run send:test -- --only austin_active_leak,seo_spam
//
// Emails go only to plus-addresses of TEST_INBOX (rule 0.6); anything else is refused.
import { parseArgs } from 'node:util';
import { loadFixtures } from './lib/config.mjs';
import { readEnv } from './lib/env.mjs';

const GAP_MS = 3000;
const POLL_LIMIT_MS = 90000;
const WORKFLOW_NAME = 'Lead Responder: Cedar & Slate (demo)';

const { values: args } = parseArgs({ options: { only: { type: 'string' } } });
const env = readEnv();
const BASE = (env.N8N_BASE_URL ?? '').replace(/\/+$/, '');
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const stop = (message) => { console.error(message); process.exit(1); };

// ---------- safety checks ----------
const inbox = (env.TEST_INBOX ?? '').trim().toLowerCase();
const inboxMatch = /^([^\s@+]+)@([^\s@]+\.[a-z]{2,})$/.exec(inbox);
if (!inboxMatch) stop('TEST_INBOX is missing or not a plain address (no +) in .env.');
const [, inboxLocal, inboxDomain] = inboxMatch;
const isTestAddress = (email) => new RegExp(`^${inboxLocal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\+[a-z0-9-]+@${inboxDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).test(email);

let fixtures = loadFixtures();
if (args.only) {
  const wanted = args.only.split(',').map((s) => s.trim());
  const unknown = wanted.filter((id) => !fixtures.some((f) => f.id === id));
  if (unknown.length) stop(`Unknown fixture: ${unknown.join(', ')}`);
  fixtures = fixtures.filter((f) => wanted.includes(f.id));
}
for (const f of fixtures) {
  if ('email' in f.payload && f.expect.http_status !== 400) stop(`Fixture ${f.id} sets its own email; only 400 fixtures may do that.`);
}
const payloadFor = (f) => ('email' in f.payload ? { ...f.payload } : { ...f.payload, email: `${inboxLocal}+${f.email_alias}@${inboxDomain}` });
for (const f of fixtures) {
  const { email } = payloadFor(f);
  if (f.expect.http_status !== 400 && !isTestAddress(email)) stop(`Refusing to send to ${email}: not a plus-address of TEST_INBOX.`);
}

// ---------- n8n and bridge ----------
async function api(path) {
  const res = await fetch(`${BASE}/api/v1${path}`, { headers: { 'X-N8N-API-KEY': env.N8N_API_KEY } });
  if (!res.ok) throw new Error(`n8n API answered ${res.status} to GET ${path}`);
  return res.json();
}

let workflowId;
try {
  const { data = [] } = await api('/workflows?limit=250');
  const workflow = data.find((wf) => wf.name === WORKFLOW_NAME && !wf.isArchived);
  if (!workflow) stop('The lead workflow is not in n8n yet. Run: npm run deploy');
  if (!workflow.active) stop('The lead workflow is not published. Run: npm run deploy');
  workflowId = workflow.id;
} catch {
  stop('n8n is not running. Open Docker Desktop, wait about a minute, then run: npm run n8n:up');
}

if (env.AI_MODE !== 'api' && fixtures.some((f) => f.run_ai)) {
  const port = env.AI_BRIDGE_PORT || '8787';
  const up = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false);
  if (!up) stop('The AI bridge is not running. Open a second terminal in D:\\p1, run "npm run ai:bridge", leave it open, and try again.');
}

// ---------- send ----------
const startedAt = new Date(Date.now() - 2000).toISOString();
const sent = [];
console.log(`Sending ${fixtures.length} lead(s) to ${BASE}/webhook/lead-intake, ${GAP_MS / 1000} s apart.\n`);
for (const [index, fixture] of fixtures.entries()) {
  if (index > 0) await sleep(GAP_MS);
  const t0 = Date.now();
  let status = 0;
  let body = {};
  try {
    const res = await fetch(`${BASE}/webhook/lead-intake`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: env.SITE_ORIGIN || 'http://localhost:8080' },
      body: JSON.stringify(payloadFor(fixture)),
      signal: AbortSignal.timeout(10000),
    });
    status = res.status;
    body = await res.json().catch(() => ({}));
  } catch (err) {
    body = { error: err.message };
  }
  const ms = Date.now() - t0;
  const problems = [];
  if (status !== fixture.expect.http_status) problems.push(`status ${status}, expected ${fixture.expect.http_status}`);
  if (status === 400) {
    const fields = (body.errors ?? []).map((e) => e.field).sort();
    if (JSON.stringify(fields) !== JSON.stringify([...(fixture.expect.error_fields ?? [])].sort())) problems.push(`error fields ${fields.join(',') || 'none'}`);
  } else if (status === 200 && body.ok !== true) {
    problems.push('body.ok is not true');
  }
  sent.push({ fixture, status, ms, leadId: body.lead_id ?? '', problems });
  console.log(`  ${fixture.id.padEnd(24)} HTTP ${status} in ${ms} ms ${problems.length ? `MISMATCH: ${problems.join('; ')}` : 'ok'}`);
}

// ---------- executions ----------
const nodeJson = (execution, name) => execution.data?.resultData?.runData?.[name]?.[0]?.data?.main?.[0]?.[0]?.json;
const withLead = sent.filter((s) => s.leadId);
let executions = [];
const deadline = Date.now() + POLL_LIMIT_MS;
console.log(`\nWaiting for n8n to finish ${withLead.length} run(s) (up to ${POLL_LIMIT_MS / 1000} s)...`);
while (Date.now() < deadline) {
  const page = await api(`/executions?workflowId=${workflowId}&includeData=true&limit=50`);
  executions = (page.data ?? []).filter((e) => e.startedAt >= startedAt);
  const done = withLead.every((s) => executions.some((e) => JSON.stringify(e.data ?? {}).includes(s.leadId) && !['running', 'waiting', 'new'].includes(e.status)));
  if (done) break;
  await sleep(3000);
}

const rows = [['fixture', 'http', 'ms', 'execution', 'tier', 'ai', 'email', 'slack']];
let failed = sent.some((s) => s.problems.length);
for (const s of sent) {
  const execution = s.leadId ? executions.find((e) => JSON.stringify(e.data ?? {}).includes(s.leadId)) : null;
  const row = execution ? nodeJson(execution, 'Build sheet row') : null;
  if (s.leadId && (!execution || execution.status !== 'success')) failed = true;
  rows.push([
    s.fixture.id,
    `${s.status}${s.problems.length ? ' MISMATCH' : ''}`,
    s.ms,
    s.leadId ? (execution ? `${execution.status} (#${execution.id})` : 'not found') : 'no run expected',
    row?.tier ?? '',
    row?.ai_status ?? '',
    row?.email_status ?? '',
    row?.slack_status ?? '',
  ]);
}
const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
console.log(`\n${rows.map((r) => r.map((c, i) => String(c).padEnd(widths[i])).join('  ').trimEnd()).join('\n')}`);

console.log('\nWhat to check:');
for (const s of sent) {
  const e = s.fixture.expect;
  const say = (v) => (v === true ? 'yes' : v === false ? 'no' : 'depends on the tier');
  console.log(`  ${s.fixture.id}: email to ${s.fixture.email_alias} ${say(e.email)}; Slack ${say(e.slack)}; sheet row ${say(e.sheet)}${e.allowed_tiers?.length ? `; tier ${e.allowed_tiers.join(' or ')}` : ''}`);
}
console.log(`\nInbox: ${inbox} (plus-addresses land there). Sheet: https://docs.google.com/spreadsheets/d/${env.GOOGLE_SHEET_ID}/edit`);
process.exitCode = failed ? 1 : 0;
