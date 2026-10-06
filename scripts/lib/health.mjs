// Health checks shared by `npm run doctor` and `npm run demo`. Every check returns
// { name, ok, warn?, detail, fix } and never prints or changes anything.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { freemem } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnv } from './env.mjs';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const WORKFLOW_NAME = 'Lead Responder: Cedar & Slate (demo)';
const LOCAL = process.env.LOCALAPPDATA ?? '';

// Docker Desktop installed per user is not always on PATH in terminals opened before the install.
export function dockerBin() {
  const candidates = [join(LOCAL, 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'), 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'];
  return candidates.find((p) => existsSync(p)) ?? 'docker';
}
export function dockerDesktopExe() {
  const candidates = [join(LOCAL, 'Programs', 'DockerDesktop', 'Docker Desktop.exe'), 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'];
  return candidates.find((p) => existsSync(p)) ?? null;
}

export function run(bin, args, timeoutMs = 20000) {
  return new Promise((resolve) => {
    execFile(bin, args, { cwd: ROOT, timeout: timeoutMs, windowsHide: true }, (err, stdout) => resolve({ ok: !err, stdout: String(stdout ?? '').trim() }));
  });
}

async function get(url, options = {}) {
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeoutMs ?? 5000) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  } catch {
    return { status: 0, json: null, text: '' };
  }
}

export async function dockerRunning() {
  const result = await run(dockerBin(), ['version', '--format', '{{.Server.Version}}'], 15000);
  return result.ok && result.stdout !== '';
}

export async function n8nApiReady(env = readEnv()) {
  const res = await get(`${env.N8N_BASE_URL}/api/v1/workflows?limit=1`, { headers: { 'X-N8N-API-KEY': env.N8N_API_KEY } });
  return res.status === 200 && res.json !== null;
}

export async function bridgeHealth(env = readEnv()) {
  const res = await get(`http://127.0.0.1:${env.AI_BRIDGE_PORT || 8787}/health`, { timeoutMs: 3000 });
  return res.status === 200 ? res.json : null;
}

export async function findLeadWorkflow(env = readEnv()) {
  const res = await get(`${env.N8N_BASE_URL}/api/v1/workflows?limit=250`, { headers: { 'X-N8N-API-KEY': env.N8N_API_KEY } });
  const summary = (res.json?.data ?? []).find((w) => w.name === WORKFLOW_NAME && !w.isArchived);
  if (!summary) return null;
  const full = await get(`${env.N8N_BASE_URL}/api/v1/workflows/${summary.id}`, { headers: { 'X-N8N-API-KEY': env.N8N_API_KEY } });
  return full.json;
}

// A workflow deployed with --drill still contains the deliberately broken settings.
export const isDrillWorkflow = (workflow) => /drill|\.invalid|host\.docker\.internal:9\//i.test(JSON.stringify(workflow?.nodes ?? []));

export async function runChecks({ needSite = false } = {}) {
  const env = readEnv();
  const checks = [];
  const add = (name, ok, detail, fix = '', warn = false) => checks.push({ name, ok, warn, detail, fix });

  const envResult = await run(process.execPath, ['scripts/check-env.mjs']);
  add('Settings in .env', envResult.ok, envResult.ok ? 'all set' : 'something is missing or malformed', 'Run npm run check:env to see which line.');

  const docker = await dockerRunning();
  add('Docker', docker, docker ? 'running' : 'not running', 'Open Docker Desktop from the Start menu, or run npm run demo.');

  const health = await get(`${env.N8N_BASE_URL}/healthz`);
  const api = health.status === 200 && (await n8nApiReady(env));
  add('n8n', api, api ? 'running, API key accepted' : health.status === 200 ? 'running, but the API key was refused or the API is still starting' : 'not reachable', 'Run npm run demo (or npm run n8n:up and wait a minute).');

  if (api) {
    const workflow = await findLeadWorkflow(env);
    if (!workflow) add('Lead workflow', false, 'not in n8n', 'Run npm run deploy.');
    else if (isDrillWorkflow(workflow)) add('Lead workflow', false, 'still in DRILL mode (deliberately broken)', 'Run npm run deploy to restore it.');
    else if (!workflow.active) add('Lead workflow', false, 'not published, so the website form gets no answer', 'Run npm run deploy.');
    else {
      // n8n 2.41.6 only runs an error workflow that is published.
      const errorId = workflow.settings?.errorWorkflow;
      const errorWf = errorId ? (await get(`${env.N8N_BASE_URL}/api/v1/workflows/${errorId}`, { headers: { 'X-N8N-API-KEY': env.N8N_API_KEY } })).json : null;
      const alertsOk = Boolean(errorWf?.active) && !isDrillWorkflow(errorWf);
      add('Lead workflow', alertsOk, alertsOk ? 'published, error alerts linked and published' : `published, but error alerts are ${errorId ? 'not published or in drill mode' : 'not linked'}`, 'Run npm run deploy.');
    }

    for (const [label, id] of [['Gmail connection', env.N8N_CRED_SMTP_ID], ['Google Sheets connection', env.N8N_CRED_GOOGLE_SHEETS_ID]]) {
      const test = await get(`${env.N8N_BASE_URL}/api/v1/credentials/${id}/test`, { method: 'POST', headers: { 'X-N8N-API-KEY': env.N8N_API_KEY }, timeoutMs: 20000 });
      const ok = test.json?.status === 'OK';
      add(label, ok, ok ? 'login accepted' : `failed${test.json?.message ? `: ${test.json.message}` : ''}`, label.startsWith('Gmail') ? 'Make a new app password and run npm run setup:credentials (guide step G).' : 'Check the sheet is shared with the robot account as Editor (guide step C8).');
    }
  }

  if (env.AI_MODE !== 'api') {
    const bridge = await bridgeHealth(env);
    if (!bridge) add('AI bridge', false, 'not running, so every lead gets the fallback reply', 'Run npm run demo, or npm run ai:bridge in its own terminal.');
    else if (bridge.drill) add('AI bridge', false, `running in DRILL mode (${bridge.drill})`, 'Stop it with Ctrl+C and start it normally: npm run ai:bridge.');
    else {
      // An empty body with the right token gets 400; a wrong token gets 401. No Claude call is made.
      const probe = await get(`http://127.0.0.1:${env.AI_BRIDGE_PORT || 8787}/v1/messages`, { method: 'POST', headers: { 'x-bridge-token': env.AI_BRIDGE_TOKEN, 'content-type': 'application/json' }, body: '{}' });
      add('AI bridge', probe.status === 400, probe.status === 400 ? 'running, token accepted' : `answered ${probe.status}`, 'Restart it: Ctrl+C in its terminal, then npm run ai:bridge.');
    }
  }

  const site = await get(env.SITE_ORIGIN || 'http://localhost:8080', { timeoutMs: 3000 });
  add('Website', site.status === 200, site.status === 200 ? `serving ${env.SITE_ORIGIN}` : 'not running', 'Run npm run demo, or npm run site in its own terminal.', !needSite);

  const freeGb = freemem() / 1024 ** 3;
  add('Free memory', freeGb >= 1, `${freeGb.toFixed(1)} GB free`, 'Close some browser tabs or apps; under 1 GB free, Claude calls slow down or fail.', true);

  checks.push({ name: 'Slack', ok: true, warn: true, detail: 'not checked here (checking would post a message)', fix: '' });
  return checks;
}

export function printChecks(checks) {
  const width = Math.max(...checks.map((c) => c.name.length));
  for (const c of checks) {
    const mark = c.ok ? 'OK     ' : c.warn ? 'NOTE   ' : 'PROBLEM';
    console.log(`  ${mark}  ${c.name.padEnd(width)}  ${c.detail}${!c.ok && c.fix ? `\n           ${' '.repeat(width)}  Fix: ${c.fix}` : ''}`);
  }
  const problems = checks.filter((c) => !c.ok && !c.warn).length;
  console.log(problems ? `\n${problems} problem(s). Fix them in the order shown.` : '\nEverything needed for a lead to be answered is working.');
  return problems;
}
