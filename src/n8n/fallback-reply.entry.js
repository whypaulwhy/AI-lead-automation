// Node "Fallback reply (AI failed)": the Claude request itself failed, so a person replies (decision D7).
const config = $('Business config').first().json.config;
const { lead, processing_started_at: processingStartedAt } = $('Build AI request').first().json;
const tierInfo = decideTier({ ai: null, lead, score: null, config });
const reply = composeReply({ lead, ai: null, tierInfo, config });
const result = buildLeadResult({ lead, ai: null, aiStatus: 'failed_http', model: config.ai.model, score: null, tierInfo, reply, processingStartedAt });
const error = $input.first().json.error;
result.ai_error = typeof error === 'string' ? error : (error && error.message) || 'The request to Claude failed.';
return [{ json: result }];
