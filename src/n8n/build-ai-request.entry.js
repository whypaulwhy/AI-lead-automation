// Node "Build AI request" (spec 10.4). Only service, ZIP, phone yes/no and the message go to Claude.
const config = $('Business config').first().json.config;
const { lead } = $('Clean and validate').first().json;
const prompts = { system: %%SYSTEM_PROMPT_JSON%%, userTemplate: %%USER_TEMPLATE_JSON%%, schema: %%SCHEMA_JSON%% };
return [{ json: { lead, ai_request: buildAiRequest(lead, config, prompts), processing_started_at: DateTime.now().toUTC().toISO() } }];
