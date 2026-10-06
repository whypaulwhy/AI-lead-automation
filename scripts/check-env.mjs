// Prints set / missing for every .env value, plus a format hint when a value looks wrong.
// Never prints a value. Exits 1 if anything required is missing or malformed.
import { readEnv } from './lib/env.mjs';

const env = readEnv();
const isEmail = (v) => /^[^\s@+]+@[^\s@]+\.[a-z]{2,}$/i.test(v);
const isUrl = (v) => /^https?:\/\/\S+$/.test(v);
const bridge = env.AI_MODE !== 'api';
const PROVIDER_NAMES = ['claude-code', 'ollama', 'openai', 'anthropic'];
const providers = String(env.AI_PROVIDERS || '').split(',').map((s) => s.trim()).filter(Boolean);
const uses = (name) => bridge && providers.includes(name);

// [key, check, hint, when this key is needed]
const CHECKS = [
  ['N8N_VERSION', (v) => /^2\.\d+\.\d+$/.test(v), 'should be an exact version like 2.41.6'],
  ['N8N_ENCRYPTION_KEY', (v) => /^[0-9a-f]{64}$/.test(v), 'should be 64 hex characters'],
  ['N8N_BASE_URL', isUrl, 'should be a URL like http://localhost:5678'],
  ['N8N_API_KEY', (v) => v.length > 20, 'looks too short'],
  ['AI_MODE', (v) => ['bridge', 'api'].includes(v), 'should be bridge or api'],
  ['AI_BRIDGE_HOST', (v) => v.length > 0, '', bridge],
  ['AI_BRIDGE_PORT', (v) => /^\d{2,5}$/.test(v), 'should be a port number', bridge],
  ['AI_BRIDGE_TOKEN', (v) => v.length >= 32, 'looks too short', bridge],
  ['AI_PROVIDERS', (v) => v.split(',').every((p) => PROVIDER_NAMES.includes(p.trim())), `should list some of: ${PROVIDER_NAMES.join(', ')}`, bridge],
  ['CLAUDE_CODE_OAUTH_TOKEN', (v) => v.startsWith('sk-ant-oat'), 'should be the token from claude setup-token', uses('claude-code')],
  ['OLLAMA_URL', (v) => /^https?:\/\/\S+$/.test(v), 'should be a URL like http://127.0.0.1:11434', uses('ollama')],
  ['OLLAMA_MODEL', (v) => /^[a-z0-9._\-/]+(:[a-z0-9._\-]+)?$/i.test(v), 'should be a model name like qwen3:4b', uses('ollama')],
  ['OPENAI_COMPAT_URL', (v) => /^https?:\/\/\S+$/.test(v), 'should be the API base URL', uses('openai')],
  ['OPENAI_COMPAT_KEY', (v) => v.length > 10, 'looks too short', uses('openai')],
  ['OPENAI_COMPAT_MODEL', (v) => v.length > 0, '', uses('openai')],
  ['AI_ANTHROPIC_KEY', (v) => v.startsWith('sk-ant-'), 'should be an Anthropic API key', uses('anthropic')],
  ['N8N_CRED_AI_BRIDGE_ID', (v) => v.length > 0, '', bridge],
  ['N8N_CRED_ANTHROPIC_ID', (v) => v.length > 0, '', !bridge],
  ['N8N_CRED_SMTP_ID', (v) => v.length > 0, ''],
  ['N8N_CRED_GOOGLE_SHEETS_ID', (v) => v.length > 0, ''],
  ['SLACK_WEBHOOK_URL', (v) => /^https:\/\/hooks\.slack\.com\/services\/\S+$/.test(v), 'should start with https://hooks.slack.com/services/'],
  ['GOOGLE_SHEET_ID', (v) => /^[A-Za-z0-9_-]{25,}$/.test(v), 'should be only the ID between /d/ and /edit, not the whole address'],
  ['GOOGLE_SHEET_TAB', (v) => v.length > 0, ''],
  ['BOOKING_URL', (v) => /^https:\/\/\S+$/.test(v), 'should be a full https:// link'],
  ['SENDER_EMAIL', (v) => isEmail(v) && /@gmail\.com$/i.test(v), 'should be the sender Gmail address'],
  ['TEST_INBOX', (v) => isEmail(v) && /@gmail\.com$/i.test(v) && v.toLowerCase() !== (env.SENDER_EMAIL ?? '').toLowerCase(), 'should be the second Gmail address (not the sender, no +)'],
  ['SITE_ORIGIN', isUrl, 'should be a URL like http://localhost:8080'],
];

let problems = 0;
const width = Math.max(...CHECKS.map(([key]) => key.length));
for (const [key, check, hint, needed = true] of CHECKS) {
  const value = (env[key] ?? '').trim();
  let status;
  if (!needed) status = value ? 'set (not needed with these settings)' : 'not needed with these settings';
  else if (!value) { status = 'missing'; problems += 1; }
  else if (!check(value)) { status = `set, but ${hint}`; problems += 1; }
  else status = 'set';
  console.log(`${key.padEnd(width)}  ${status}`);
}
if (env.ANTHROPIC_API_KEY) {
  console.log('\nANTHROPIC_API_KEY is set in .env. Remove it: in bridge mode it is never used, and it must not leak into Claude Code.');
  problems += 1;
}
console.log(problems ? `\n${problems} item(s) to fix.` : '\nAll good.');
process.exitCode = problems ? 1 : 0;
