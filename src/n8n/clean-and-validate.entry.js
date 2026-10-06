// Node "Clean and validate" (spec 11.1). Time and randomness come from here, never from the logic.
const { body, config } = $input.first().json;
const now = DateTime.now().setZone(config.company.timezone);
const result = cleanAndValidate(body, config, { iso: now.toUTC().toISO(), local: now.toFormat('yyyy-MM-dd HH:mm'), random: Math.random() });
return [{ json: result }];
