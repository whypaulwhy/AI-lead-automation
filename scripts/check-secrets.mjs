// Fails (exit 1) if a secret-shaped string, or a real value from .env, appears in any file git
// would commit. Prints file names and the kind of hit only, never the matching text.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Shapes of real secrets. They need the characters that follow the prefix, so docs that only
// mention a prefix (like the spec does) don't count as a hit.
const PATTERNS = [
  { kind: 'Anthropic key or token', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { kind: 'Slack webhook URL', re: /hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]{8,}/ },
  { kind: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:\\n|\s)+[A-Za-z0-9+/=]{20,}/ },
  { kind: 'Slack token', re: /xox[abp]-[A-Za-z0-9-]{10,}/ },
  { kind: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
  { kind: 'JWT (for example an n8n API key)', re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];
const MIN_ENV_VALUE_LENGTH = 12;

function readEnv(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
}

// Values from .env that must never appear in the repo. A value equal to its .env.example default
// (like N8N_BASE_URL=http://localhost:5678) is public by definition and skipped.
const env = readEnv('.env');
const defaults = readEnv('.env.example');
const envSecrets = Object.entries(env)
  .filter(([key, value]) => value.length >= MIN_ENV_VALUE_LENGTH && value !== defaults[key])
  .map(([key, value]) => ({ key, value }));

let files;
try {
  // Tracked files plus new files git would pick up (ignored files excluded).
  files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
} catch {
  console.error('check:secrets needs a git repository. Run it from the repo root after git init.');
  process.exit(2);
}

const hits = [];
for (const file of [...new Set(files)]) {
  if (!existsSync(file)) continue;
  const buffer = readFileSync(file);
  if (buffer.subarray(0, 8000).includes(0)) continue; // binary file
  const text = buffer.toString('utf8');
  for (const { kind, re } of PATTERNS) {
    if (re.test(text)) hits.push({ file, kind });
  }
  for (const { key, value } of envSecrets) {
    if (text.includes(value)) hits.push({ file, kind: `value of ${key} from .env` });
  }
}

if (hits.length > 0) {
  console.error(`check:secrets FAILED: ${hits.length} possible secret(s) found.`);
  for (const { file, kind } of hits) console.error(`  ${file}  (${kind})`);
  console.error('Remove the secret from those files. If one was already committed, rotate it.');
  process.exit(1);
}
console.log(`check:secrets passed: ${files.length} files scanned, ${envSecrets.length} .env values checked.`);
