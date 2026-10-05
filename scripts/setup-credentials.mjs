// Creates the n8n credentials the workflow uses, through the n8n API, and writes their IDs into .env.
// The Gmail app password is typed in and the Google key is read from its file; both go straight to
// n8n. Nothing secret is printed or saved in the repo. Safe to run again: a credential that already
// exists under the same name is kept.
//
//   npm run setup:credentials                    bridge, gmail and google
//   npm run setup:credentials -- --only gmail    any of: bridge, gmail, google
//   npm run setup:credentials -- --key "<file>"  the Google key file, if it isn't found automatically
import { createSign } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { SHEET_COLUMNS } from '../src/logic/row.js';
import { readEnv, setEnvValue } from './lib/env.mjs';

const NAMES = {
  bridge: 'AI bridge token',
  gmail: 'Gmail SMTP (demo sender)',
  google: 'Google Sheets (service account)',
};
const KEY_FOLDERS = [join(homedir(), 'Documents', 'secrets'), join(homedir(), 'Downloads'), join(homedir(), 'Documents')];

const { values: args } = parseArgs({ options: { only: { type: 'string' }, key: { type: 'string' } } });
const env = readEnv();
const say = (step, text) => console.log(`${NAMES[step]}: ${text}`);

// ---------- n8n API ----------
async function n8n(method, path, body) {
  let res;
  try {
    res = await fetch(`${env.N8N_BASE_URL}/api/v1${path}`, {
      method,
      headers: { 'X-N8N-API-KEY': env.N8N_API_KEY, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('n8n is not running. Start it with: npm run n8n:up');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`n8n answered ${res.status}${json.message ? `: ${json.message}` : ''}`);
  return json;
}

async function findCredential(name) {
  const { data = [] } = await n8n('GET', '/credentials?limit=250');
  return data.find((credential) => credential.name === name);
}

function keepExisting(step, credential, envKey) {
  setEnvValue(envKey, credential.id);
  say(step, 'already exists, kept it (ID is in .env)');
}

// ---------- prompts ----------
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
    if (hidden) rl._writeToOutput = () => {}; // don't echo what is typed or pasted
  });
}

// ---------- steps ----------
async function setupBridge() {
  if (env.AI_MODE !== 'bridge') return say('bridge', 'skipped (AI_MODE is not bridge)');
  if ((env.AI_BRIDGE_TOKEN ?? '').length < 32) throw new Error('AI_BRIDGE_TOKEN is missing in .env.');
  const existing = await findCredential(NAMES.bridge);
  if (existing) return keepExisting('bridge', existing, 'N8N_CRED_AI_BRIDGE_ID');
  const created = await n8n('POST', '/credentials', {
    name: NAMES.bridge,
    type: 'httpHeaderAuth',
    // Only ever sent to the bridge on this PC.
    data: { name: 'x-bridge-token', value: env.AI_BRIDGE_TOKEN, allowedHttpRequestDomains: 'domains', allowedDomains: 'host.docker.internal' },
  });
  setEnvValue('N8N_CRED_AI_BRIDGE_ID', created.id);
  say('bridge', 'created (ID saved in .env)');
}

async function setupGmail() {
  if (!/^[^\s@]+@gmail\.com$/i.test(env.SENDER_EMAIL ?? '')) return say('gmail', 'skipped: put the sender Gmail address in SENDER_EMAIL in .env first (guide step F)');
  const existing = await findCredential(NAMES.gmail);
  if (existing) return keepExisting('gmail', existing, 'N8N_CRED_SMTP_ID');
  if (!process.stdin.isTTY) return say('gmail', 'skipped: run this in your own terminal so it can ask for the app password');

  let password = '';
  for (let attempt = 1; attempt <= 3 && !/^[a-z]{16}$/.test(password); attempt += 1) {
    if (attempt > 1) console.log('That should be 16 letters. Try again.');
    const typed = await ask(`Paste the Gmail app password for ${env.SENDER_EMAIL} and press Enter (it stays hidden): `, { hidden: true });
    password = typed.replace(/\s+/g, '').toLowerCase();
  }
  if (!/^[a-z]{16}$/.test(password)) throw new Error('No valid app password was entered.');

  const created = await n8n('POST', '/credentials', {
    name: NAMES.gmail,
    type: 'smtp',
    data: { user: env.SENDER_EMAIL, password, host: 'smtp.gmail.com', port: 465, secure: true },
  });
  const test = await n8n('POST', `/credentials/${created.id}/test`).catch(() => null);
  if (test?.status === 'Error') {
    await n8n('DELETE', `/credentials/${created.id}`);
    throw new Error('Gmail refused the login. Make a new app password (guide step G1) and run this again.');
  }
  setEnvValue('N8N_CRED_SMTP_ID', created.id);
  say('gmail', test?.status === 'OK' ? 'created and tested: Gmail accepted the login (ID saved in .env)' : 'created (ID saved in .env); n8n could not test it here, Phase 5 will');
}

async function setupGoogle() {
  if (!env.GOOGLE_SHEET_ID) return say('google', 'skipped: put the sheet ID in GOOGLE_SHEET_ID in .env first (guide step F)');
  const keyFile = args.key ?? findServiceAccountKey();
  if (!keyFile) return say('google', 'skipped: no Google key file found. Move the downloaded .json key into Documents\\secrets (guide step C7), or run with --key "<path to file>"');
  let key;
  try {
    key = JSON.parse(readFileSync(keyFile, 'utf8'));
  } catch {
    throw new Error(`Could not read ${keyFile} as JSON.`);
  }
  if (key.type !== 'service_account' || !key.client_email || !key.private_key) throw new Error(`${keyFile} is not a Google service account key.`);
  console.log(`Using key file ${keyFile} for ${key.client_email}`);

  await prepareSheet(key);
  const existing = await findCredential(NAMES.google);
  if (existing) return keepExisting('google', existing, 'N8N_CRED_GOOGLE_SHEETS_ID');
  const created = await n8n('POST', '/credentials', {
    name: NAMES.google,
    type: 'googleApi',
    data: { email: key.client_email, privateKey: key.private_key, inpersonate: false, httpNode: false },
  });
  setEnvValue('N8N_CRED_GOOGLE_SHEETS_ID', created.id);
  say('google', 'created (ID saved in .env)');
}

// Newest service account key in the usual folders.
function findServiceAccountKey() {
  const candidates = [];
  for (const folder of KEY_FOLDERS) {
    if (!existsSync(folder)) continue;
    for (const name of readdirSync(folder)) {
      if (!name.toLowerCase().endsWith('.json')) continue;
      const path = join(folder, name);
      try {
        const stats = statSync(path);
        if (stats.size > 20000) continue;
        if (JSON.parse(readFileSync(path, 'utf8')).type === 'service_account') candidates.push({ path, time: stats.mtimeMs });
      } catch { /* not a readable JSON file */ }
    }
  }
  return candidates.sort((a, b) => b.time - a.time)[0]?.path;
}

// ---------- Google Sheets ----------
async function googleAccessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error('Google rejected the key file. Download a fresh JSON key (guide step C6) and run this again.');
  return json.access_token;
}

// Makes sure the tab exists and row 1 holds the 24 headers (bold, frozen). Never touches other rows.
async function prepareSheet(key) {
  const token = await googleAccessToken(key);
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_SHEET_ID)}`;
  const tab = env.GOOGLE_SHEET_TAB || 'Leads';

  async function google(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json;
    const detail = JSON.stringify(json.error ?? {});
    if (res.status === 403 && /SERVICE_DISABLED|has not been used|is disabled/i.test(detail)) {
      throw new Error('The Google Sheets API is off in your Google Cloud project. Enable it (guide step C3) and run this again.');
    }
    if (res.status === 403) throw new Error(`The sheet isn't shared with ${key.client_email} yet. Share it as Editor (guide step C8) and run this again.`);
    if (res.status === 404) throw new Error('No sheet matches GOOGLE_SHEET_ID. Copy the ID from the sheet address again (guide step B3).');
    throw new Error(`Google Sheets answered ${res.status}.`);
  }

  const meta = await google('GET', `${base}?fields=sheets.properties(sheetId,title)`);
  const sheets = meta.sheets.map((sheet) => sheet.properties);
  let sheet = sheets.find((s) => s.title === tab);
  if (!sheet && sheets.length === 1) {
    // A brand-new spreadsheet: rename its only tab.
    await google('POST', `${base}:batchUpdate`, { requests: [{ updateSheetProperties: { properties: { sheetId: sheets[0].sheetId, title: tab }, fields: 'title' } }] });
    sheet = { ...sheets[0], title: tab };
    console.log(`Renamed the first tab to "${tab}".`);
  } else if (!sheet) {
    const added = await google('POST', `${base}:batchUpdate`, { requests: [{ addSheet: { properties: { title: tab } } }] });
    sheet = added.replies[0].addSheet.properties;
    console.log(`Added a tab named "${tab}".`);
  }

  const range = encodeURIComponent(`'${tab}'!A1:X1`);
  const current = (await google('GET', `${base}/values/${range}`)).values?.[0] ?? [];
  if (current.join(',') === SHEET_COLUMNS.join(',')) {
    console.log('Row 1 already has the 24 headers.');
    return;
  }
  if (current.some((cell) => String(cell).trim() !== '')) {
    throw new Error(`Row 1 of the "${tab}" tab already has other text in it. Clear row 1 and run this again.`);
  }
  await google('PUT', `${base}/values/${range}?valueInputOption=RAW`, { values: [SHEET_COLUMNS] });
  await google('POST', `${base}:batchUpdate`, {
    requests: [
      { updateSheetProperties: { properties: { sheetId: sheet.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
      { repeatCell: { range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
    ],
  });
  console.log('Wrote the 24 column headers into row 1 (bold, frozen).');
}

// ---------- main ----------
const STEPS = { bridge: setupBridge, gmail: setupGmail, google: setupGoogle };
const selected = args.only ? args.only.split(',').map((s) => s.trim()) : Object.keys(STEPS);
const unknown = selected.filter((step) => !STEPS[step]);
if (unknown.length) {
  console.error(`Unknown step: ${unknown.join(', ')}. Use bridge, gmail or google.`);
  process.exit(1);
}
if (!env.N8N_API_KEY) {
  console.error('N8N_API_KEY is missing in .env. Create it in n8n under Settings > n8n API.');
  process.exit(1);
}

let failed = false;
for (const step of selected) {
  try {
    await STEPS[step]();
  } catch (err) {
    failed = true;
    say(step, `FAILED. ${err.message}`);
  }
}
process.exitCode = failed ? 1 : 0;
