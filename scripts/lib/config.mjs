// Loads config/business.json, the email templates and the prompts, the same way for the build,
// the eval and the tests.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8').replace(/\r\n/g, '\n');

// bookingUrl and sheetId come from .env in real runs and are placeholders in tests.
export function loadConfig({ bookingUrl, sheetId }) {
  const config = JSON.parse(read('config/business.json'));
  const templateDir = fileURLToPath(new URL('config/templates/', ROOT));
  config.templates = Object.fromEntries(
    readdirSync(templateDir)
      .filter((name) => name.endsWith('.txt'))
      .map((name) => [name.replace(/\.txt$/, ''), read(`config/templates/${name}`)]),
  );
  config.booking_url = bookingUrl;
  config.sheet_url = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
  return config;
}

export function loadPrompts() {
  return {
    system: read('prompts/lead-reader.system.md'),
    userTemplate: read('prompts/lead-reader.user.md'),
    schema: JSON.parse(read('prompts/lead-reader.schema.json')),
  };
}

export function loadFixtures() {
  return JSON.parse(read('fixtures/leads.json'));
}

// The `now` argument for cleanAndValidate: ISO time, Austin wall-clock time "yyyy-MM-dd HH:mm",
// and a random number. In n8n the entry file builds the same thing with Luxon's DateTime.
export function makeNow(date = new Date(), random = Math.random(), timeZone = 'America/Chicago') {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return { iso: date.toISOString(), local: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`, random };
}
