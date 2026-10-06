// Local AI bridge: n8n posts the same Messages API request it would send to Anthropic, and this
// server answers it through the AI provider chain in AI_PROVIDERS (local Ollama, Claude Code on the
// Pro plan, or API providers; see scripts/lib/ai-chain.mjs and docs/DECISIONS.md).
// Run it with `npm run ai:bridge` and keep the terminal open. Logs never include lead text or secrets.
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { ollamaPreload, providerConfigProblem, providersFromEnv, runChain } from './lib/ai-chain.mjs';
import { parseMessagesRequest } from './lib/claude-cli.mjs';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const env = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};

const PORT = Number(env.AI_BRIDGE_PORT || 8787);
const HOST = env.AI_BRIDGE_HOST || '127.0.0.1';
const TOKEN = env.AI_BRIDGE_TOKEN || '';
const OAUTH_TOKEN = env.CLAUDE_CODE_OAUTH_TOKEN || '';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_CONCURRENT = 2;
const MAX_QUEUED = 20;
// The whole chain must answer before n8n's HTTP Request timeout (45 s, one try), so the workflow
// gets a clean error instead of timing out while a provider is still working.
const BUDGET_MS = 40000;
// `--providers ollama,claude-code` overrides AI_PROVIDERS for this run (handy for drills).
const { values: cliProviders } = parseArgs({ strict: false, options: { providers: { type: 'string' } } });
let PROVIDERS;
try {
  PROVIDERS = providersFromEnv(cliProviders.providers ? { AI_PROVIDERS: cliProviders.providers } : env);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Failure drills (Phase 6): npm run ai:bridge -- --drill slow|error|garbage|refusal
// slow: never answers (Claude stuck); error: 529 overloaded; garbage: 200 with text that is not JSON;
// refusal: 200 with stop_reason "refusal". No Claude call is made in drill mode.
const { values: cli } = parseArgs({ options: { drill: { type: 'string', default: '' }, providers: { type: 'string' } } });
const DRILL = cli.drill;
if (DRILL && !['slow', 'error', 'garbage', 'refusal'].includes(DRILL)) {
  console.error('Unknown drill. Use slow, error, garbage or refusal.');
  process.exit(1);
}

function drillResponse(model) {
  const message = (content, stop) => ({ id: 'msg_drill', type: 'message', role: 'assistant', model, content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } });
  if (DRILL === 'error') return { ok: false, status: 529, errorType: 'overloaded_error', message: 'Drill: overloaded.' };
  if (DRILL === 'garbage') return { ok: true, response: message([{ type: 'text', text: 'Sorry, I can only answer in prose today.' }], 'end_turn') };
  if (DRILL === 'refusal') return { ok: true, response: message([], 'refusal') };
  return null;
}

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
  if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true, drill: DRILL || null, providers: PROVIDERS });
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

  // If n8n gives up (timeout) while this request waits or runs, drop it: no point spending plan usage.
  const abort = new AbortController();
  res.on('close', () => { if (!res.writableFinished) abort.abort(); });
  const result = await withSlot(() => (abort.signal.aborted
    ? { ok: false, status: 499, errorType: 'client_closed', message: 'n8n stopped waiting.' }
    : DRILL === 'slow'
      ? new Promise((resolve) => { abort.signal.addEventListener('abort', () => resolve(null), { once: true }); })
      : DRILL
        ? drillResponse(parsed.request.model)
        : runChain(body, {
          env,
          providers: PROVIDERS,
          budgetMs: BUDGET_MS,
          signal: abort.signal,
          onAttempt: (a) => { if (!a.ok) console.log(`  ${a.provider} skipped after ${(a.ms / 1000).toFixed(1)}s: ${a.reason}`); },
        })));
  if (abort.signal.aborted) {
    log(499, started, 'n8n stopped waiting; request dropped');
    return undefined;
  }
  if (result === null) {
    log(503, started, 'queue full');
    return sendError(res, 503, 'overloaded_error', 'Too many requests are waiting. Try again shortly.');
  }
  if (!result.ok) {
    log(result.status, started, result.errorType);
    return sendError(res, result.status, result.errorType, result.message);
  }
  const { usage } = result.response;
  log(200, started, `${result.provider ?? 'drill'} (${result.response.model}) in=${usage.input_tokens} out=${usage.output_tokens}`);
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
  console.log(`AI bridge listening on http://${HOST}:${PORT}`);
  const describe = (name) => (name === 'ollama' ? `ollama (${env.OLLAMA_MODEL})` : name === 'openai' ? `openai-compatible (${env.OPENAI_COMPAT_MODEL})` : name);
  console.log(`AI chain, tried in order: ${PROVIDERS.map(describe).join(' -> ')} -> human fallback`);
  for (const name of PROVIDERS) {
    const problem = providerConfigProblem(name, env);
    if (problem) console.log(`  Note: ${name} will be skipped: ${problem}`);
  }
  if (DRILL) console.log(`DRILL MODE: ${DRILL}. No real AI calls. Stop with Ctrl+C and start normally afterwards.`);
  if (PROVIDERS.includes('claude-code')) console.log(`Claude login: ${OAUTH_TOKEN ? 'CLAUDE_CODE_OAUTH_TOKEN from .env' : 'your normal Claude Code login'}.`);
  console.log('Press Ctrl+C to stop.');
  if (USE_OLLAMA && !DRILL) warmOllama();
});

// The local model takes 7 to 50 s to load onto the graphics card, which would make the first lead
// fall through to the next AI. Load it now, keep it loaded while the bridge runs, and free the
// graphics memory again when the bridge stops.
const USE_OLLAMA = PROVIDERS.includes('ollama') && !providerConfigProblem('ollama', env);
async function warmOllama() {
  try {
    const seconds = await ollamaPreload(env);
    console.log(`Local AI ready: ${env.OLLAMA_MODEL} loaded on the graphics card in ${seconds.toFixed(1)}s.`);
  } catch (err) {
    console.log(`Local AI not ready (${err.message}). Leads will use the next AI in the chain until Ollama is running.`);
  }
}
if (USE_OLLAMA && !DRILL) setInterval(warmOllama, 50 * 60 * 1000).unref();

async function shutdown() {
  if (USE_OLLAMA) await ollamaPreload(env, 0, 5000).catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
