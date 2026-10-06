import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanAndValidate, FIELD_ERRORS } from '../src/logic/validate.js';
import { config, NOW } from './helpers.js';

const valid = {
  full_name: 'Maria Delgado',
  email: 'Test+Maria@Example.com ',
  phone: '(512) 555-0182',
  zip: '78704',
  service: 'leak',
  message: 'Water started dripping through the ceiling in our upstairs bedroom.',
  contact_ok: true,
  company_website: '',
  page: '/',
};
const run = (changes) => cleanAndValidate({ ...valid, ...changes }, config, NOW);
const errorFields = (result) => result.errors.map((e) => e.field);

test('a valid request builds the lead object', () => {
  const { route, errors, lead } = run({});
  assert.equal(route, 'ok');
  assert.deepEqual(errors, []);
  assert.deepEqual(lead, {
    lead_id: lead.lead_id,
    received_at_iso: '2026-10-04T19:14:03.512Z',
    received_at_local: '2026-10-04 14:14',
    full_name: 'Maria Delgado',
    first_name: 'Maria',
    email: 'test+maria@example.com',
    phone_e164: '+15125550182',
    phone_display: '(512) 555-0182',
    zip: '78704',
    in_service_area: true,
    service_selected: 'leak',
    service_selected_label: 'Leak or water coming in',
    message: valid.message,
    source_page: '/',
  });
  assert.match(lead.lead_id, /^L-20261004-[0-9A-Z]{4}$/);
});

test('lead_id uses the random value it is given', () => {
  const a = cleanAndValidate(valid, config, { ...NOW, random: 0.1 }).lead.lead_id;
  const b = cleanAndValidate(valid, config, { ...NOW, random: 0.9 }).lead.lead_id;
  assert.notEqual(a, b);
  assert.equal(cleanAndValidate(valid, config, { ...NOW, random: 0 }).lead.lead_id, 'L-20261004-0000');
});

test('required fields: every empty field gets its error, in form order', () => {
  const result = cleanAndValidate({ company_website: '' }, config, NOW);
  assert.equal(result.route, 'invalid');
  assert.deepEqual(errorFields(result), ['full_name', 'email', 'zip', 'service', 'message', 'contact_ok']);
  assert.equal(result.lead, null);
});

test('error messages match spec 11.1 exactly', () => {
  assert.deepEqual(FIELD_ERRORS, {
    full_name: 'Please add your name.',
    email: "That email address doesn't look right.",
    phone: 'Please use a 10-digit US phone number, or leave it blank.',
    zip: 'Please enter a 5-digit ZIP code.',
    service: 'Pick the option closest to what you need.',
    message: "Tell us a little about what's going on (at least 10 characters).",
    contact_ok: 'Please check the box so we can reply.',
  });
  const result = run({ email: 'maria@', zip: '7870' });
  assert.deepEqual(result.errors, [
    { field: 'email', message: "That email address doesn't look right." },
    { field: 'zip', message: 'Please enter a 5-digit ZIP code.' },
  ]);
});

test('email format', () => {
  for (const bad of ['maria@', 'maria@example', 'maria example@x.com', '@example.com', `${'a'.repeat(250)}@example.com`]) {
    assert.deepEqual(errorFields(run({ email: bad })), ['email'], bad);
  }
  assert.equal(run({ email: 'a.b+c@sub.example.co' }).route, 'ok');
});

test('phone numbers normalize to E.164', () => {
  for (const [input, e164, display] of [
    ['512.555.0139', '+15125550139', '(512) 555-0139'],
    ['1 (512) 555 0182', '+15125550182', '(512) 555-0182'],
    ['512-555-0193', '+15125550193', '(512) 555-0193'],
  ]) {
    const { lead } = run({ phone: input });
    assert.equal(lead.phone_e164, e164, input);
    assert.equal(lead.phone_display, display, input);
  }
  const blank = run({ phone: '' }).lead;
  assert.equal(blank.phone_e164, '');
  assert.equal(blank.phone_display, '');
});

test('a 7-digit phone number is an error', () => {
  assert.deepEqual(errorFields(run({ phone: '555-0182' })), ['phone']);
});

test('ZIP+4 keeps the first 5 digits; area is checked against the config', () => {
  assert.equal(run({ zip: '78704-1234' }).lead.zip, '78704');
  assert.equal(run({ zip: '77005' }).lead.in_service_area, false);
  assert.deepEqual(errorFields(run({ zip: '7870' })), ['zip']);
  assert.deepEqual(errorFields(run({ zip: '78704-12' })), ['zip']);
});

test('names: spaces collapse, a lowercase first name gets a capital', () => {
  const { lead } = run({ full_name: '  maria   delgado ' });
  assert.equal(lead.full_name, 'maria delgado');
  assert.equal(lead.first_name, 'Maria');
  assert.equal(run({ full_name: 'DeShawn Miller' }).lead.first_name, 'DeShawn');
  assert.deepEqual(errorFields(run({ full_name: 'A' })), ['full_name']);
  assert.deepEqual(errorFields(run({ full_name: '1234' })), ['full_name']);
  assert.deepEqual(errorFields(run({ full_name: 'x'.repeat(81) })), ['full_name']);
});

test('service must be a form option; message length 10 to 2000', () => {
  assert.deepEqual(errorFields(run({ service: 'gutters' })), ['service']);
  assert.deepEqual(errorFields(run({ message: 'too short' })), ['message']);
  assert.deepEqual(errorFields(run({ message: 'x'.repeat(2001) })), ['message']);
  assert.equal(run({ message: '   ten chars!   '.replace('!', '.') }).route, 'ok');
});

test('consent: true, "true" and "on" pass; anything else is an error', () => {
  for (const ok of [true, 'true', 'on']) assert.equal(run({ contact_ok: ok }).route, 'ok', String(ok));
  for (const bad of [false, 'false', '', undefined, 1]) assert.deepEqual(errorFields(run({ contact_ok: bad })), ['contact_ok'], String(bad));
});

test('a filled honeypot routes to bot before any other check', () => {
  assert.deepEqual(cleanAndValidate({ company_website: 'http://x.example' }, config, NOW), { route: 'bot', errors: [], lead: null });
  assert.equal(run({ company_website: '  ' }).route, 'ok');
});

test('non-string input does not throw', () => {
  const result = cleanAndValidate({ full_name: 42, email: null, zip: 78704, message: ['x'], contact_ok: 'on' }, config, NOW);
  assert.equal(result.route, 'invalid');
  assert.equal(cleanAndValidate(null, config, NOW).route, 'invalid');
});
