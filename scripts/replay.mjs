// Resends a lead that went wrong, once things work again. Nothing a visitor submits is lost: every
// run keeps the original submission, and this posts it to the webhook again.
//
//   npm run replay                     list runs from the last 3 days that failed or fell back
//   npm run replay -- 412              resend the submission from run #412
//   npm run replay -- 412 --allow-real resend even if the address is not a TEST_INBOX plus-address
import { parseArgs } from 'node:util';
import { readEnv } from './lib/env.mjs';

const WORKFLOW_NAME = 'Lead Responder: Cedar & Slate (demo)';
const env = readEnv();
const BASE = (env.N8N_BASE_URL ?? '').replace(/\/+$/, '');
const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { 'allow-real': { type: 'boolean', default: false } } });
const stop = (message) => { console.error(message); process.exit(1); };

async function api(path) {
  let res;
  try {
    res = await fetch(`${BASE}/api/v1${path}`, { headers: { 'X-N8N-API-KEY': env.N8N_API_KEY } });
  } catch {
    stop('n8n is not running. Start everything with: npm run demo');
  }
  if (!res.ok) stop(`n8n answered ${res.status} to GET ${path}`);
  return res.json();
}

const nodeJson = (execution, name) => execution.data?.resultData?.runData?.[name]?.[0]?.data?.main?.flat().filter(Boolean)[0]?.json;
const submissionOf = (execution) => nodeJson(execution, 'Website form')?.body;

// What went wrong in a run, in a few words; '' if nothing did.
function problemsOf(execution) {
  const problems = [];
  if (execution.status !== 'success') problems.push(`run ${execution.status}`);
  const row = nodeJson(execution, 'Build sheet row');
  if (row) {
    if (row.ai_status && row.ai_status !== 'ok') problems.push(`AI ${row.ai_status}`);
    if (row.email_status === 'failed') problems.push('reply email failed');
    if (String(row.slack_status).startsWith('failed')) problems.push(`Slack ${row.slack_status}`);
  }
  return problems.join(', ');
}

// Whether resending helps. Resending a lead that already got a reply would email the customer twice.
function adviceFor(execution) {
  const row = nodeJson(execution, 'Build sheet row');
  if (!row || row.email_status === 'failed') return 'The customer got no reply. Resend it.';
  if (execution.status !== 'success') return 'The reply went out; only the sheet row is missing. Copy it from the run instead of resending.';
  if (row.ai_status !== 'ok') return 'An acknowledgement went out and a person was alerted. No resend needed.';
  return 'The reply went out and the office was told another way. No resend needed.';
}

const { data: workflows = [] } = await api('/workflows?limit=250');
const workflow = workflows.find((w) => w.name === WORKFLOW_NAME && !w.isArchived);
if (!workflow) stop('The lead workflow is not in n8n. Run: npm run deploy');

if (positionals.length === 0) {
  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const { data = [] } = await api(`/executions?workflowId=${workflow.id}&includeData=true&limit=100`);
  const rows = data
    .filter((e) => e.startedAt >= since)
    .map((e) => ({ e, body: submissionOf(e), problems: problemsOf(e) }))
    .filter((r) => r.body && r.problems);
  if (rows.length === 0) {
    console.log('No runs in the last 3 days had a problem. Nothing to resend.');
    process.exit(0);
  }
  console.log('Runs with a problem (newest first):\n');
  for (const { e, body, problems } of rows) {
    console.log(`  #${e.id}  ${e.startedAt.slice(0, 16).replace('T', ' ')} UTC  ${body.full_name ?? '?'} <${body.email ?? '?'}>  ${problems}`);
    console.log(`         ${adviceFor(e)}`);
  }
  console.log('\nResend one with: npm run replay -- <run number>');
  process.exit(0);
}

const id = positionals[0].replace(/^#/, '');
const execution = await api(`/executions/${encodeURIComponent(id)}?includeData=true`);
if (execution.workflowId !== workflow.id) stop(`Run #${id} is not from the lead workflow.`);
const body = submissionOf(execution);
if (!body) stop(`Run #${id} has no stored submission.`);

const email = String(body.email ?? '').trim().toLowerCase();
const [inboxLocal, inboxDomain] = String(env.TEST_INBOX ?? '').trim().toLowerCase().split('@');
const isTest = Boolean(inboxLocal && inboxDomain && email.startsWith(`${inboxLocal}+`) && email.endsWith(`@${inboxDomain}`));
if (!isTest && !args['allow-real']) {
  stop(`Run #${id} was sent by ${email}, which is not a test address. If you really mean to email this person, add --allow-real.`);
}

const res = await fetch(`${BASE}/webhook/lead-intake`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: env.SITE_ORIGIN || 'http://localhost:8080' },
  body: JSON.stringify(body),
}).catch(() => stop('The webhook did not answer. Is the workflow published? Run: npm run doctor'));
const answer = await res.json().catch(() => ({}));
if (res.ok && answer.ok) {
  console.log(`Resent run #${id} (${body.full_name} <${email}>). New lead ID: ${answer.lead_id ?? 'none (bot or invalid)'}.`);
  console.log('Check the new run with: npm run replay   (it will not be listed if everything worked)');
} else {
  stop(`The webhook answered ${res.status}: ${JSON.stringify(answer).slice(0, 200)}`);
}
