// Local AI bridge: n8n posts the same Messages API request it would send to Anthropic, and this
// server answers it with Claude Code headless on Prit's Claude plan (see docs/DECISIONS.md).
// Run it with `npm run ai:bridge` and keep the terminal open. Logs never include lead text or secrets.
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { parseMessagesRequest, runClaude } from './lib/claude-cli.mjs';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const env = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};

const PORT = Number(env.AI_BRIDGE_PORT || 8787);
const HOST = env.AI_BRIDGE_HOST || '127.0.0.1';
const TOKEN = env.AI_BRIDGE_TOKEN || '';
const OAUTH_TOKEN = env.CLAUDE_CODE_OAUTH_TOKEN || '';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_CONCURRENT = 2;
const MAX_QUEUED = 20;
const TIMEOUT_MS = 60000;

if (TOKEN.length < 32) {
  console.error('AI_BRIDGE_TOKEN is missing or too short in .env. Phase 1 generates it.');
  process.exit(1);
}
if (env.ANTHROPIC_API_KEY) {
  console.warn('Note: ANTHROPIC_API_KEY is set in .env. The bridge ignores it so Claude Code uses your plan.');
}

const hash = (value) => createHash('sha256').update(String(value)).digest();
const tokenOk = (value) => timingSafeEqual(hash(value), hash(TOKEN));

// At most MAX_CONCURRENT Claude Code processes at once; the rest wait their turn.
let running = 0;
const waiting = [];
async function withSlot(task) {
  if (running >= MAX_CONCURRENT) {
    if (waiting.length >= MAX_QUEUED) return null;
    await new Promise((resolve) => waiting.push(resolve));
  }
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
const sendError = (res, status, type, message) => send(res, status, { type: 'error', error: { type, message } });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function log(status, started, extra = '') {
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${new Date().toISOString()} POST /v1/messages ${status} ${seconds}s ${extra}`.trim());
}

const server = createServer(async (req, res) => {
  const path = (req.url || '').split('?')[0];
  if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true });
  if (req.method !== 'POST' || path !== '/v1/messages') return sendError(res, 404, 'not_found_error', 'Use POST /v1/messages.');

  const started = Date.now();
  if (!tokenOk(req.headers['x-bridge-token'] || '')) {
    log(401, started, 'bad bridge token');
    return sendError(res, 401, 'authentication_error', 'Missing or wrong x-bridge-token header.');
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    const tooLarge = err.message === 'too_large';
    log(tooLarge ? 413 : 400, started);
    return sendError(res, tooLarge ? 413 : 400, 'invalid_request_error', tooLarge ? 'Body is too large.' : 'Body is not valid JSON.');
  }
  const parsed = parseMessagesRequest(body);
  if (!parsed.ok) {
    log(400, started, parsed.message);
    return sendError(res, 400, 'invalid_request_error', parsed.message);
  }

  const result = await withSlot(() => runClaude(parsed.request, { oauthToken: OAUTH_TOKEN, timeoutMs: TIMEOUT_MS }));
  if (result === null) {
    log(503, started, 'queue full');
    return sendError(res, 503, 'overloaded_error', 'Too many requests are waiting. Try again shortly.');
  }
  if (!result.ok) {
    log(result.status, started, result.errorType);
    return sendError(res, result.status, result.errorType, result.message);
  }
  const { usage } = result.response;
  log(200, started, `in=${usage.input_tokens} out=${usage.output_tokens}`);
  send(res, 200, result.response);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Is the bridge already running in another terminal?`);
  } else {
    console.error(`AI bridge could not start: ${err.message}`);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`AI bridge listening on http://${HOST}:${PORT} (Claude Code headless on your Claude plan).`);
  console.log(`Login: ${OAUTH_TOKEN ? 'CLAUDE_CODE_OAUTH_TOKEN from .env' : 'your normal Claude Code login'}. Press Ctrl+C to stop.`);
});
