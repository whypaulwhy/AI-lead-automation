// buildAiRequest and parseAiResponse (spec 10.2, 10.4, 10.5).
// Inlined into n8n Code nodes, so helper names carry an `ai` prefix to stay unique.

// One pass over the template, so text inserted from the customer is never scanned for placeholders.
function aiFill(template, values) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match));
}

// Only the service picked, ZIP, whether a phone was given, and the message go to Claude (decision D6).
// `prompts` is { system, userTemplate, schema }.
export function buildAiRequest(lead, config, prompts) {
  const message = lead.message.replace(/<\/\s*lead_message\s*>/gi, '[/lead_message]');
  const userText = aiFill(prompts.userTemplate, {
    received_at_local: lead.received_at_local,
    service_label: lead.service_selected_label,
    zip: lead.zip,
    area_note: lead.in_service_area ? 'inside our service area' : 'outside our service area',
    phone_given: lead.phone_e164 ? 'yes' : 'no',
    message,
  });
  return {
    model: config.ai.model,
    max_tokens: config.ai.max_tokens,
    system: prompts.system.trim(),
    messages: [{ role: 'user', content: userText.trim() }],
    output_config: { format: { type: 'json_schema', schema: prompts.schema } },
  };
}

// Returns { ok, ai, status, error }. Statuses: ok, failed_refusal, failed_max_tokens, failed_parse.
// (failed_http is set by the workflow when the HTTP request itself fails.)
export function parseAiResponse(response, schema) {
  const fail = (status, error) => ({ ok: false, ai: null, status, error });
  const stopReason = response && response.stop_reason;
  if (stopReason === 'refusal') return fail('failed_refusal', 'Claude declined the request.');
  if (stopReason === 'max_tokens') return fail('failed_max_tokens', 'The reply was cut off at max_tokens.');
  if (stopReason !== 'end_turn') return fail('failed_parse', `Unexpected stop_reason: ${String(stopReason)}.`);

  const block = Array.isArray(response.content) ? response.content.find((b) => b && b.type === 'text') : null;
  if (!block) return fail('failed_parse', 'The reply has no text block.');
  let raw;
  try {
    raw = JSON.parse(block.text);
  } catch {
    return fail('failed_parse', 'The reply is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('failed_parse', 'The reply is not a JSON object.');

  const ai = {};
  for (const [key, definition] of Object.entries(schema.properties)) {
    const value = raw[key];
    if (typeof value !== 'string' || value.trim() === '') return fail('failed_parse', `Field ${key} is missing or empty.`);
    if (Array.isArray(definition.enum)) {
      // Enum casing is not guaranteed, so compare case-insensitively.
      const normalized = value.trim().toLowerCase();
      if (!definition.enum.includes(normalized)) return fail('failed_parse', `Field ${key} has an unknown value.`);
      ai[key] = normalized;
    } else {
      ai[key] = value.trim();
    }
  }
  return { ok: true, ai, status: 'ok', error: '' };
}
