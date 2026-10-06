// Node "Business config": attaches the business config (injected at build time) to the submission.
const config = %%CONFIG_JSON%%;
return [{ json: { body: $input.first().json.body, config } }];
