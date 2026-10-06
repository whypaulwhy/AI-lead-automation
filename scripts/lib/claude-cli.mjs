// Runs one Claude request through Claude Code in headless mode (`claude -p`) on the local Claude
// login (Prit's plan, no API bill) and returns it shaped like an Anthropic Messages API response.
// Shared by scripts/ai-bridge.mjs (for n8n) and scripts/eval-prompt.mjs.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Empty folder to run in, so Claude Code never sees project files.
const WORK_DIR = join(tmpdir(), 'lead-responder-claude');
const MODEL_RE = /^[a-z0-9][a-z0-9.-]*$/i;

// Checks the Messages-API-shaped body built by buildAiRequest (spec 10.4) and pulls out what
// Claude Code needs. Returns { ok: true, request } or { ok: false, message }.
export function parseMessagesRequest(body) {
  if (!body || typeof body !== 'object') return { ok: false, message: 'Body must be a JSON object.' };
  const { model, system, messages, output_config: outputConfig } = body;
  if (typeof model !== 'string' || !MODEL_RE.test(model)) return { ok: false, message: 'model must be a model ID like claude-haiku-4-5-20251001.' };
  if (typeof system !== 'string' || system.trim() === '' || system.startsWith('-')) return { ok: false, message: 'system must be a non-empty string.' };
  if (!Array.isArray(messages) || messages.length !== 1) return { ok: false, message: 'messages must contain exactly one message.' };
  const [message] = messages;
  if (message?.role !== 'user' || typeof message.content !== 'string' || message.content.trim() === '') {
    return { ok: false, message: 'The message must be { role: "user", content: "<text>" }.' };
  }
  const format = outputConfig?.format;
  if (format !== undefined && (format.type !== 'json_schema' || !format.schema || typeof format.schema !== 'object')) {
    return { ok: false, message: 'output_config.format must be { type: "json_schema", schema: {...} }.' };
  }
  return { ok: true, request: { model, system, userText: message.content, schema: format?.schema } };
}

// Returns { ok: true, response, durationMs } or { ok: false, status, errorType, message, durationMs }.
export function runClaude({ model, system, userText, schema }, { oauthToken = '', timeoutMs = 60000, bin = 'claude' } = {}) {
  mkdirSync(WORK_DIR, { recursive: true });
  const args = [
    '-p',
    '--output-format', 'json',
    '--model', model,
    '--system-prompt', system,
    '--tools', '',
    '--safe-mode',
    '--no-session-persistence',
  ];
  if (schema) args.push('--json-schema', JSON.stringify(schema));

  // An API key in the environment would make Claude Code bill the API instead of the plan.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  if (oauthToken) env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;
  // Claude Code turns on extended thinking by default. The API request in spec 10.4 has none, and
  // with it a lead took 30 to 70 s and 5,000+ output tokens instead of about 9 s and 500.
  env.MAX_THINKING_TOKENS = '0';

  const started = Date.now();
  return new Promise((resolve) => {
    const finish = (result) => resolve({ ...result, durationMs: Date.now() - started });
    let stdout = '';
    let timedOut = false;
    // The customer's text goes in on stdin only, never on the command line.
    const child = spawn(bin, args, { cwd: WORK_DIR, env, windowsHide: true });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.resume();
    child.on('error', (err) => {
      clearTimeout(timer);
      finish({ ok: false, status: 502, errorType: 'bridge_error', message: `Could not start Claude Code (${err.code}).` });
    });
    child.on('close', () => {
      clearTimeout(timer);
      if (timedOut) return finish({ ok: false, status: 504, errorType: 'timeout_error', message: `Claude Code took longer than ${timeoutMs} ms.` });
      finish(toMessagesResponse(stdout, model));
    });
    child.stdin.on('error', () => {}); // child exited early; handled in 'close'
    child.stdin.end(userText);
  });
}

function toMessagesResponse(stdout, model) {
  let result;
  try {
    result = JSON.parse(stdout);
  } catch {
    return { ok: false, status: 502, errorType: 'bridge_error', message: 'Claude Code returned output that is not JSON.' };
  }
  if (result.is_error || result.subtype !== 'success') {
    const detail = typeof result.result === 'string' ? result.result.slice(0, 300) : result.subtype;
    const status = result.api_error_status === 401 ? 401 : 502;
    return { ok: false, status, errorType: status === 401 ? 'authentication_error' : 'api_error', message: `Claude Code: ${detail}` };
  }
  const text = result.structured_output !== undefined ? JSON.stringify(result.structured_output) : String(result.result ?? '');
  const usage = result.usage ?? {};
  return {
    ok: true,
    response: {
      id: `msg_bridge_${randomUUID()}`,
      type: 'message',
      role: 'assistant',
      model,
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      },
    },
  };
}
