// The AI provider chain, against fake local servers (no real AI is called).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { providerConfigProblem, providersFromEnv, runChain } from '../scripts/lib/ai-chain.mjs';
import { buildAiRequest } from '../src/logic/ai.js';
import { cleanAndValidate } from '../src/logic/validate.js';
import { config, fixturePayload, fixtures, NOW, prompts } from './helpers.js';

const fixture = fixtures.find((f) => f.id === 'austin_active_leak');
const { lead } = cleanAndValidate(fixturePayload(fixture), config, NOW);
const request = buildAiRequest(lead, config, prompts);
const GOOD = JSON.stringify(fixture.mock_ai);

// A fake server that answers like Ollama (/api/chat) or an OpenAI-compatible API (/chat/completions).
async function fakeServer(reply, { delayMs = 0 } = {}) {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url === '/api/chat') res.end(JSON.stringify({ message: { content: reply }, done_reason: 'stop', prompt_eval_count: 10, eval_count: 5 }));
      else res.end(JSON.stringify({ choices: [{ message: { content: reply }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    }, delayMs));
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}

const envFor = (ollamaUrl, openaiUrl) => ({
  OLLAMA_URL: ollamaUrl, OLLAMA_MODEL: 'test-local:1b',
  OPENAI_COMPAT_URL: openaiUrl, OPENAI_COMPAT_MODEL: 'test-online', OPENAI_COMPAT_KEY: 'test-key-not-real',
});
const CLOSED = 'http://127.0.0.1:9';

test('the first provider that gives a usable answer wins, and names itself as the model', async () => {
  const ollama = await fakeServer(GOOD);
  try {
    const result = await runChain(request, { env: envFor(ollama.url, CLOSED), providers: ['ollama', 'openai'] });
    assert.equal(result.ok, true);
    assert.equal(result.provider, 'ollama');
    assert.equal(result.response.model, 'test-local:1b');
    assert.equal(result.response.stop_reason, 'end_turn');
    assert.equal(result.attempts.length, 1);
  } finally { await ollama.close(); }
});

test('an unusable answer hands over to the next provider', async () => {
  const ollama = await fakeServer('this is not JSON');
  const online = await fakeServer(GOOD);
  try {
    const result = await runChain(request, { env: envFor(ollama.url, online.url), providers: ['ollama', 'openai'] });
    assert.equal(result.provider, 'openai');
    assert.match(result.attempts[0].reason, /unusable answer/);
  } finally { await ollama.close(); await online.close(); }
});

test('an unreachable provider hands over to the next', async () => {
  const online = await fakeServer(GOOD);
  try {
    const result = await runChain(request, { env: envFor(CLOSED, online.url), providers: ['ollama', 'openai'] });
    assert.equal(result.provider, 'openai');
    assert.match(result.attempts[0].reason, /connection failed/);
  } finally { await online.close(); }
});

test('when every provider fails, the error names each one', async () => {
  const result = await runChain(request, { env: envFor(CLOSED, CLOSED), providers: ['ollama', 'openai'] });
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.match(result.message, /^All AI providers failed\. ollama: connection failed.*; openai: connection failed/);
});

test('when every answer is unusable, the last one is passed through so the workflow records why', async () => {
  const ollama = await fakeServer('{"urgency": "whenever"}');
  try {
    const result = await runChain(request, { env: envFor(ollama.url, CLOSED), providers: ['ollama'] });
    assert.equal(result.ok, true);
    assert.equal(result.provider, 'none');
  } finally { await ollama.close(); }
});

test('a slow provider is cut off by the time budget', async () => {
  const slow = await fakeServer(GOOD, { delayMs: 4000 });
  try {
    const started = Date.now();
    const result = await runChain(request, { env: envFor(slow.url, CLOSED), providers: ['ollama'], budgetMs: 2600 });
    assert.equal(result.ok, false);
    assert.equal(result.status, 504);
    assert.ok(Date.now() - started < 3500, 'gave up within the budget');
  } finally { await slow.close(); }
});

test('providers that are not configured are skipped with a reason', async () => {
  const online = await fakeServer(GOOD);
  try {
    const env = { ...envFor(CLOSED, online.url), OLLAMA_MODEL: '' };
    assert.equal(providerConfigProblem('ollama', env), 'OLLAMA_MODEL is not set');
    const result = await runChain(request, { env, providers: ['ollama', 'openai'] });
    assert.equal(result.provider, 'openai');
    assert.equal(result.attempts[0].reason, 'OLLAMA_MODEL is not set');
  } finally { await online.close(); }
});

test('AI_PROVIDERS is read in order and rejects unknown names', () => {
  assert.deepEqual(providersFromEnv({ AI_PROVIDERS: ' ollama , claude-code ' }), ['ollama', 'claude-code']);
  assert.deepEqual(providersFromEnv({}), ['claude-code']);
  assert.throws(() => providersFromEnv({ AI_PROVIDERS: 'ollama,chatgpt' }), /Unknown AI provider/);
});
