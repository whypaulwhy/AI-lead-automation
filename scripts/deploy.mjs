// Deploy (spec 9.7): build, then create or update both workflows through the n8n API, link the error
// workflow, and publish the main workflow. Safe to run again: workflows are matched by exact name.
//
//   npm run deploy                              normal deploy (also restores after a drill)
//   npm run deploy -- --drill slack-down        deploy a deliberately broken copy for a failure drill
//   npm run deploy -- --drill ai-down,email-down,slack-down,sheet-down
import { parseArgs } from 'node:util';
import { build, DRILLS } from './build.mjs';
import { readEnv } from './lib/env.mjs';
import { validateWorkflows } from './validate-workflows.mjs';

const env = readEnv();
const BASE = env.N8N_BASE_URL.replace(/\/+$/, '');
const { values: args } = parseArgs({ options: { drill: { type: 'string', default: '' } } });
const drills = args.drill ? args.drill.split(',').map((s) => s.trim()).filter(Boolean) : [];
const DRILL_SMTP_NAME = 'Gmail SMTP (drill: unreachable server)';

// A harmless SMTP credential that can never connect (.invalid never resolves), so the email-down drill
// fails the way a Gmail outage would without touching the real login.
async function drillSmtpCredential() {
  const { data = [] } = await n8n('GET', '/credentials?limit=250');
  const existing = data.find((c) => c.name === DRILL_SMTP_NAME);
  if (existing) return existing.id;
  const created = await n8n('POST', '/credentials', {
    name: DRILL_SMTP_NAME,
    type: 'smtp',
    data: { user: 'drill@example.com', password: 'not-a-real-password', host: 'smtp.unreachable.invalid', port: 465, secure: true },
  });
  return created.id;
}

async function n8n(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers: { 'X-N8N-API-KEY': env.N8N_API_KEY, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('n8n is not running. Open Docker Desktop, wait about a minute, then run: npm run n8n:up');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`n8n answered ${res.status} to ${method} ${path}${json.message ? `: ${json.message}` : ''}`);
  return json;
}

async function findWorkflow(name) {
  let cursor = '';
  do {
    const page = await n8n('GET', `/workflows?limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    const found = (page.data ?? []).find((wf) => wf.name === name && !wf.isArchived);
    if (found) return found;
    cursor = page.nextCursor ?? '';
  } while (cursor);
  return null;
}

// Only the writable fields go to the API (read-only fields are rejected on update).
async function upsert(workflow) {
  const body = { name: workflow.name, nodes: workflow.nodes, connections: workflow.connections, settings: workflow.settings };
  const existing = await findWorkflow(workflow.name);
  if (existing) {
    const updated = await n8n('PUT', `/workflows/${existing.id}`, body);
    return { id: updated.id, created: false };
  }
  const created = await n8n('POST', '/workflows', body);
  return { id: created.id, created: true };
}

try {
  if (!env.N8N_API_KEY) throw new Error('N8N_API_KEY is missing in .env.');
  for (const drill of drills) if (!DRILLS[drill]) throw new Error(`Unknown drill "${drill}". Use: ${Object.keys(DRILLS).join(', ')}.`);
  const drillSmtpId = drills.includes('email-down') ? await drillSmtpCredential() : '';
  const { workflows } = build({ drills, drillSmtpId });
  const problems = validateWorkflows();
  if (problems.length) throw new Error(`Validation found ${problems.length} problem(s), nothing deployed:\n- ${problems.join('\n- ')}`);
  console.log('Validation: no problems.');

  const errors = await upsert(workflows['error-alerts']);
  console.log(`${errors.created ? 'Created' : 'Updated'} "${workflows['error-alerts'].name}"`);

  const main = workflows['lead-responder'];
  main.settings = { ...main.settings, errorWorkflow: errors.id };
  const lead = await upsert(main);
  console.log(`${lead.created ? 'Created' : 'Updated'} "${main.name}" (error alerts linked)`);

  // n8n 2.41.6 only runs an error workflow that is published ("is not active and cannot be executed").
  await n8n('POST', `/workflows/${errors.id}/publish`, {});
  await n8n('POST', `/workflows/${lead.id}/publish`, {});
  console.log('Published both workflows: the production webhook is live and error alerts can run.');

  console.log(`\nLead workflow:   ${BASE}/workflow/${lead.id}`);
  console.log(`Error workflow:  ${BASE}/workflow/${errors.id}`);
  console.log(`Production URL:  ${BASE}/webhook/lead-intake`);
  if (drills.length) {
    console.log(`
DRILL MODE: ${drills.join(', ')} deliberately broken. Restore with: npm run deploy`);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
