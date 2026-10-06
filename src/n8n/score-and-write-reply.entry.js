// Node "Score and write reply" (spec 10.5 and 11): parse Claude's answer, score, tier, compose.
const config = $('Business config').first().json.config;
const { lead, processing_started_at: processingStartedAt } = $('Build AI request').first().json;
const parsed = parseAiResponse($input.first().json, %%SCHEMA_JSON%%);
const ai = parsed.ok ? parsed.ai : null;
const score = ai ? computeScore(ai, lead, config.scoring) : null;
const tierInfo = decideTier({ ai, lead, score, config });
const reply = composeReply({ lead, ai, tierInfo, config });
const result = buildLeadResult({ lead, ai, aiStatus: parsed.status, model: config.ai.model, score, tierInfo, reply, processingStartedAt });
if (!parsed.ok) result.ai_error = parsed.error;
return [{ json: result }];
