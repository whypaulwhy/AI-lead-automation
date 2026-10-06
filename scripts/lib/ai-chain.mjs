// AI provider chain used by the bridge and the eval. Takes the Messages-API-shaped request that
// buildAiRequest makes (spec 10.4), asks each provider in AI_PROVIDERS order, and returns the first
// answer that parses against the schema, shaped like a Messages API response. If a provider is down,
// slow, or answers in an unusable format, the next one is asked. The workflow never needs to know
// which AI answered, except that `model` in the response names it for the sheet.
//
// Providers:
//   claude-code  Claude Code headless on the local Claude login (Pro plan; this PC only)
//   ollama       a local open model through Ollama (free, private; needs this PC on)
//   openai       any OpenAI-compatible API (Groq, OpenRouter, Mistral, Gemini, OpenAI, LM Studio...)
//   anthropic    the Anthropic API with a client's own key (AI_ANTHROPIC_KEY)
import { parseAiResponse } from '../../src/logic/ai.js';
import { parseMessagesRequest, runClaude } from './claude-cli.mjs';

const PROVIDER_TIMEOUT_MS = { 'claude-code': 20000, ollama: 25000, openai: 15000, anthropic: 15000 };

// Measured on the RTX 2050 (4 GB): Ollama's default kept a third of qwen3:4b on the processor
// (10 tokens/s, 15 to 24 s per lead). num_gpu 99 puts every layer on the graphics card (26 tokens/s,
// about 5 s per lead). 3,072 tokens of context fits the longest allowed message plus the answer.
// The warm-up in the bridge must use the same options, or Ollama reloads the model.
export const OLLAMA_OPTIONS = { temperature: 0.3, num_ctx: 3072, num_gpu: 99 };
export const OLLAMA_KEEP_ALIVE = '60m';

const ollamaBase = (env) => (env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');

// Loads the model onto the graphics card ahead of the first lead (keep_alive '60m'), or frees it
// (keepAlive 0). Returns the seconds it took, or throws.
export async function ollamaPreload(env, keepAlive = OLLAMA_KEEP_ALIVE, timeoutMs = 180000) {
  const started = Date.now();
  const res = await fetch(`${ollamaBase(env)}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.OLLAMA_MODEL, prompt: '', keep_alive: keepAlive, options: OLLAMA_OPTIONS }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Ollama answered ${res.status}`);
  return (Date.now() - started) / 1000;
}

export const PROVIDER_NAMES = ['claude-code', 'ollama', 'openai', 'anthropic'];

export function providersFromEnv(env) {
  const list = String(env.AI_PROVIDERS || 'claude-code').split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = list.filter((name) => !PROVIDER_NAMES.includes(name));
  if (unknown.length) throw new Error(`Unknown AI provider(s) in AI_PROVIDERS: ${unknown.join(', ')}. Use ${PROVIDER_NAMES.join(', ')}.`);
  return list;
}

// Why a provider can't be used at all with the current .env, or '' if it is configured.
export function providerConfigProblem(name, env) {
  if (name === 'claude-code') return '';
  if (name === 'ollama') return env.OLLAMA_MODEL ? '' : 'OLLAMA_MODEL is not set';
  if (name === 'openai') return env.OPENAI_COMPAT_URL && env.OPENAI_COMPAT_MODEL ? '' : 'OPENAI_COMPAT_URL and OPENAI_COMPAT_MODEL are not set';
  if (name === 'anthropic') return env.AI_ANTHROPIC_KEY ? '' : 'AI_ANTHROPIC_KEY is not set';
  return 'unknown provider';
}

const message = (model, text, stopReason, usage) => ({
  id: `msg_chain_${Date.now().toString(36)}`,
  type: 'message',
  role: 'assistant',
  model,
  content: text === null ? [] : [{ type: 'text', text }],
  stop_reason: stopReason,
  stop_sequence: null,
  usage: { input_tokens: usage.input ?? 0, output_tokens: usage.output ?? 0 },
});

async function postJson(url, body, headers, signal) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  } catch (err) {
    const reason = err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timed out' : `connection failed (${err.cause?.code ?? err.message})`;
    return { ok: false, message: reason };
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, message: `HTTP ${res.status}${json?.error ? `: ${String(json.error.message ?? json.error).slice(0, 160)}` : ''}` };
  return { ok: true, json };
}

const CALLERS = {
  async 'claude-code'(req, env, signal, timeoutMs) {
    const result = await runClaude(req, { oauthToken: env.CLAUDE_CODE_OAUTH_TOKEN, timeoutMs, signal });
    return result.ok ? { ok: true, response: result.response } : { ok: false, message: result.message };
  },

  async ollama(req, env, signal) {
    const r = await postJson(`${ollamaBase(env)}/api/chat`, {
      model: env.OLLAMA_MODEL,
      messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.userText }],
      format: req.schema,
      stream: false,
      think: false,
      keep_alive: OLLAMA_KEEP_ALIVE,
      options: OLLAMA_OPTIONS,
    }, {}, signal);
    if (!r.ok) return r;
    const stop = r.json.done_reason === 'length' ? 'max_tokens' : 'end_turn';
    return { ok: true, response: message(env.OLLAMA_MODEL, r.json.message?.content ?? '', stop, { input: r.json.prompt_eval_count, output: r.json.eval_count }) };
  },

  async openai(req, env, signal) {
    const base = env.OPENAI_COMPAT_URL.replace(/\/+$/, '');
    const r = await postJson(`${base}/chat/completions`, {
      model: env.OPENAI_COMPAT_MODEL,
      messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.userText }],
      response_format: { type: 'json_schema', json_schema: { name: 'lead_reading', strict: true, schema: req.schema } },
      max_tokens: 800,
      temperature: 0.3,
    }, env.OPENAI_COMPAT_KEY ? { authorization: `Bearer ${env.OPENAI_COMPAT_KEY}` } : {}, signal);
    if (!r.ok) return r;
    const choice = r.json.choices?.[0];
    const stop = choice?.finish_reason === 'length' ? 'max_tokens' : choice?.finish_reason === 'content_filter' ? 'refusal' : 'end_turn';
    return { ok: true, response: message(env.OPENAI_COMPAT_MODEL, choice?.message?.content ?? '', stop, { input: r.json.usage?.prompt_tokens, output: r.json.usage?.completion_tokens }) };
  },

  async anthropic(req, env, signal, _timeout, original) {
    const r = await postJson('https://api.anthropic.com/v1/messages', original, { 'x-api-key': env.AI_ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' }, signal);
    return r.ok ? { ok: true, response: r.json } : r;
  },
};

// Returns { ok: true, response, provider, attempts } or { ok: false, status, errorType, message, attempts }.
export async function runChain(body, { env, providers = providersFromEnv(env), budgetMs = 40000, signal, onAttempt = () => {} } = {}) {
  const parsed = parseMessagesRequest(body);
  if (!parsed.ok) return { ok: false, status: 400, errorType: 'invalid_request_error', message: parsed.message, attempts: [] };
  const req = parsed.request;
  const schema = body.output_config?.format?.schema;
  const deadline = Date.now() + budgetMs;
  const attempts = [];
  let unusable = null;

  for (const name of providers) {
    const configProblem = providerConfigProblem(name, env);
    const remaining = deadline - Date.now() - 500;
    if (configProblem || remaining < 2000 || signal?.aborted) {
      const reason = configProblem || (signal?.aborted ? 'n8n stopped waiting' : 'no time left');
      attempts.push({ provider: name, ok: false, reason, ms: 0 });
      onAttempt(attempts.at(-1));
      continue;
    }
    const timeoutMs = Math.min(PROVIDER_TIMEOUT_MS[name], remaining);
    const providerSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    const started = Date.now();
    let result;
    try {
      result = await CALLERS[name](req, env, providerSignal, timeoutMs, body);
    } catch (err) {
      result = { ok: false, message: err.message };
    }
    const ms = Date.now() - started;
    if (result.ok) {
      // An answer only counts if it parses against the schema; otherwise ask the next provider.
      const check = schema ? parseAiResponse(result.response, schema) : { ok: true };
      if (check.ok) {
        attempts.push({ provider: name, ok: true, reason: 'answered', ms, usage: result.response.usage });
        onAttempt(attempts.at(-1));
        return { ok: true, response: result.response, provider: name, attempts };
      }
      unusable = result.response;
      attempts.push({ provider: name, ok: false, reason: `unusable answer (${check.status}: ${check.error})`, ms });
    } else {
      attempts.push({ provider: name, ok: false, reason: result.message, ms });
    }
    onAttempt(attempts.at(-1));
  }

  const summary = attempts.map((a) => `${a.provider}: ${a.reason}`).join('; ');
  // Every provider failed. Pass the last unusable answer through so the workflow records why
  // (failed_parse or failed_refusal); otherwise report the failures as one error.
  if (unusable) return { ok: true, response: unusable, provider: 'none', attempts };
  const timedOut = attempts.length > 0 && attempts.every((a) => /timed out|no time left/.test(a.reason));
  return {
    ok: false,
    status: timedOut ? 504 : 502,
    errorType: timedOut ? 'timeout_error' : 'api_error',
    message: `All AI providers failed. ${summary}`,
    attempts,
  };
}
