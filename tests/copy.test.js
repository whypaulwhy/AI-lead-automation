// Customer-facing wording follows the copy rules (spec 13.2, 15). Slack text is internal and not checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const config = JSON.parse(read('config/business.json'));
const html = read('site/index.html');
const { banned_phrases: bannedPhrases, banned_characters: bannedCharacters } = config.copy_rules;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘' };
function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

// Text a visitor can see: element text plus attributes that show up on screen or in search results.
function visibleText(source) {
  const attributes = [...source.matchAll(/\s(?:placeholder|aria-label|alt|title|content|data-[a-z-]+)="([^"]*)"/g)].map((m) => m[1]);
  const text = source
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities([text, ...attributes].join('\n'));
}

function problems(text) {
  const lower = text.toLowerCase();
  return [
    ...bannedPhrases.filter((phrase) => lower.includes(phrase)).map((phrase) => `phrase "${phrase}"`),
    ...bannedCharacters.filter((char) => text.includes(char)).map((char) => `character U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`),
    ...(/\p{Extended_Pictographic}/u.test(text) ? ['emoji or pictograph'] : []),
  ];
}

test('landing page visible text follows the copy rules', () => {
  assert.deepEqual(problems(visibleText(html)), []);
});

test('every email template follows the copy rules', () => {
  const files = readdirSync(new URL('config/templates/', root)).filter((name) => name.endsWith('.txt'));
  assert.deepEqual(files.sort(), ['hot.txt', 'needs_review.txt', 'not_fit_area.txt', 'not_fit_service.txt', 'nurture.txt', 'warm.txt']);
  for (const file of files) {
    const text = read(`config/templates/${file}`);
    assert.ok(text.trim().length > 0, `${file} is empty`);
    assert.deepEqual(problems(text), [], file);
  }
});

test('config strings a customer can read follow the copy rules', () => {
  const strings = {
    ...Object.fromEntries(Object.entries(config.email.subjects).map(([k, v]) => [`email.subjects.${k}`, v])),
    'email.emergency_line': config.email.emergency_line,
    ...Object.fromEntries(Object.entries(config.email.fallback_opening_lines).map(([k, v]) => [`email.fallback_opening_lines.${k}`, v])),
    ...Object.fromEntries(Object.entries(config.services.not_offered).map(([k, v]) => [`services.not_offered.${k}`, v])),
  };
  for (const [key, value] of Object.entries(strings)) assert.deepEqual(problems(value), [], key);
});

test('form service options match config.form_services', () => {
  const select = html.match(/<select[^>]*name="service"[^>]*>([\s\S]*?)<\/select>/)[1];
  const options = [...select.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => [m[1], decodeEntities(m[2])]);
  assert.deepEqual(Object.fromEntries(options), config.form_services);
});

test('the page says the company is fictional and uses only 555-01xx phone numbers', () => {
  const text = visibleText(html);
  assert.match(text, /fictional company created for a portfolio demo/);
  const shown = [...text.matchAll(/\(\d{3}\) \d{3}-\d{4}/g)].map((m) => m[0]);
  const dialed = [...html.matchAll(/href="tel:([^"]+)"/g)].map((m) => m[1]);
  assert.ok(shown.length > 0 && dialed.length > 0);
  for (const number of shown) assert.match(number, /^\(\d{3}\) 555-01\d{2}$/);
  for (const number of dialed) assert.match(number, /^\+1\d{3}55501\d{2}$/);
});
