import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLeadResult, buildSlackText, checkCustomerText, composeReply, describeAiFailure, slackToEmail } from '../src/logic/compose.js';
import { BOOKING_URL, config, fixtures } from './helpers.js';

const rules = config.copy_rules;
const lead = {
  first_name: 'Maria', full_name: 'Maria Delgado', email: 'test+maria@example.com', zip: '78704',
  phone_display: '(512) 555-0182', message: 'Water started dripping through the ceiling in our upstairs bedroom during last night\'s storm.',
};
const ai = {
  service_category: 'leak_repair', urgency: 'emergency', property_type: 'single_family', decision_maker: 'yes',
  money_signal: 'none', spam_likelihood: 'low', issue_summary: 'Water dripping into upstairs bedroom after storm.',
  explanation: 'Dripping during the storm.', subject_topic: 'upstairs bedroom ceiling leak',
  opening_line: "Sorry about the water coming through the upstairs bedroom ceiling after last night's storm.",
};
const TIERS = {
  hot: { tier: 'hot', reason: 'score', decline_key: null },
  warm: { tier: 'warm', reason: 'score', decline_key: null },
  nurture: { tier: 'nurture', reason: 'score', decline_key: null },
  not_fit_area: { tier: 'not_fit', reason: 'area', decline_key: null },
  not_fit_service: { tier: 'not_fit', reason: 'service', decline_key: 'gutters' },
  needs_review: { tier: 'needs_review', reason: 'ai_failed', decline_key: null },
};
const compose = (name, aiFields = ai) => composeReply({ lead, ai: name === 'needs_review' ? null : aiFields, tierInfo: TIERS[name], config });

test('every template renders with no placeholder left and no run of 3 or more newlines', () => {
  for (const name of Object.keys(TIERS)) {
    const { email } = compose(name);
    assert.doesNotMatch(email.text, /[{}]/, name);
    assert.doesNotMatch(email.text, /\n{3,}/, name);
    assert.ok(email.text.startsWith('Hi Maria,\n\n'), name);
    assert.equal(email.to, 'test+maria@example.com');
  }
});

test('the signature is built from config and ends every email', () => {
  for (const name of Object.keys(TIERS)) {
    assert.ok(compose(name).email.text.endsWith('Dana Ortiz\nOffice Manager, Cedar & Slate Roofing\n(512) 555-0147'), name);
  }
});

test('the emergency line appears only for hot plus emergency, with the phone filled', () => {
  const line = 'If water is coming in right now, call us at (512) 555-0147. We can usually get a tarp on it the same day.';
  assert.ok(compose('hot').email.text.includes(line));
  assert.ok(!compose('hot', { ...ai, urgency: 'this_week' }).email.text.includes('tarp'));
  for (const name of ['warm', 'nurture', 'not_fit_area', 'not_fit_service']) assert.ok(!compose(name).email.text.includes('tarp'), name);
});

test('the booking link appears for hot, warm and nurture and nowhere else', () => {
  for (const name of Object.keys(TIERS)) {
    assert.equal(compose(name).email.text.includes(BOOKING_URL), ['hot', 'warm', 'nurture'].includes(name), name);
  }
});

test('not_fit emails use the ZIP or the decline line', () => {
  assert.ok(compose('not_fit_area').email.text.includes('78704 is outside the area'));
  assert.ok(compose('not_fit_service').email.text.includes(config.services.not_offered.gutters));
});

test('subjects match config 6.3', () => {
  assert.equal(compose('hot').email.subject, 'About your upstairs bedroom ceiling leak');
  assert.equal(compose('needs_review').email.subject, 'We got your roofing request');
  assert.equal(compose('hot', { ...ai, subject_topic: 'Leak!!' }).email.subject, 'About your roofing request');
});

test('spam gets no email', () => {
  assert.deepEqual(composeReply({ lead, ai, tierInfo: { tier: 'spam', reason: 'spam', decline_key: null }, config }).email, null);
});

test('a failing slot is replaced by its fallback and recorded', () => {
  const reply = compose('warm', { ...ai, opening_line: 'Hi Maria, sorry about the leak.' });
  assert.equal(reply.used_fallback, true);
  assert.ok(reply.email.text.includes(config.email.fallback_opening_lines.leak_repair));
  assert.deepEqual(reply.guard.opening_line, ['starts with a greeting']);
  assert.equal(compose('warm', { ...ai, service_category: 'unclear', opening_line: '' }).email.text.includes(config.email.fallback_opening_lines.default), true);
  assert.equal(compose('warm').used_fallback, false);
  assert.equal(compose('needs_review').used_fallback, false);
});

test('the guard rejects each bad line from spec 13.2', () => {
  for (const line of [
    'Thank you for reaching out! We understand how stressful this is.',
    "We'll have someone there today at no cost.",
    'Sorry about the leak — we can help.',
    'Sorry about the leak \u{1F3E0}',
    'Call us at 512-555-0147 for help.',
    'Sorry about the leak. We can come Tuesday.',
    'Hi Maria, sorry about the leak.',
    'We can offer a 50% discount on your inspection.',
  ]) {
    assert.equal(checkCustomerText(line, 'opening_line', lead.message, rules).ok, false, line);
  }
});

test('the guard accepts every fixture line and every fallback line', () => {
  for (const fixture of fixtures.filter((f) => f.mock_ai)) {
    for (const kind of ['opening_line', 'subject_topic']) {
      const check = checkCustomerText(fixture.mock_ai[kind], kind, fixture.payload.message, rules);
      assert.ok(check.ok, `${fixture.id} ${kind}: ${check.reasons.join(', ')}`);
    }
  }
  for (const [key, line] of Object.entries(config.email.fallback_opening_lines)) {
    assert.ok(checkCustomerText(line, 'opening_line', '', rules).ok, key);
  }
  assert.ok(checkCustomerText(config.email.fallback_subject_topic, 'subject_topic', '', rules).ok);
});

test('numbers must come from the message; subject rules', () => {
  assert.equal(checkCustomerText('Thanks for the details about the 2,100 square foot house.', 'opening_line', 'a 2,100 sq ft house', rules).ok, true);
  assert.equal(checkCustomerText('Thanks for the details about the 2,400 square foot house.', 'opening_line', 'a 2,100 sq ft house', rules).ok, false);
  assert.equal(checkCustomerText('leak', 'subject_topic', '', rules).ok, false);
  assert.equal(checkCustomerText('one two three four five six seven', 'subject_topic', '', rules).ok, false);
  assert.equal(checkCustomerText('leak: bedroom ceiling', 'subject_topic', '', rules).ok, false);
  assert.equal(checkCustomerText("owner's two-story house", 'subject_topic', '', rules).ok, true);
});

function resultFor(tier, extra = {}) {
  const reply = { email: { to: lead.email, subject: 's', text: 't' }, used_fallback: false, guard: {} };
  return buildLeadResult({
    lead: { ...lead, ...extra.lead }, ai: extra.ai === undefined ? ai : extra.ai, aiStatus: 'ok', model: 'm', score: 93,
    tierInfo: { tier, reason: 'score', decline_key: null, alert: true }, reply, processingStartedAt: 'now',
  });
}

test('Slack text for a hot lead', () => {
  const text = buildSlackText({ result: resultFor('hot'), emailStatus: 'sent', sentTime: '2:14 PM', config });
  assert.equal(text, [
    '*Hot lead* (score 93)',
    'Maria Delgado, 78704, (512) 555-0182',
    'Water dripping into upstairs bedroom after storm.',
    'Booking link sent at 2:14 PM. Worth a call right away.',
    '<https://docs.google.com/spreadsheets/d/TEST_SHEET_ID/edit|Open the lead log>',
  ].join('\n'));
});

test('Slack text escapes customer text, falls back for phone, and flags medium spam', () => {
  const result = resultFor('warm', { lead: { full_name: 'Bo <b>&</b>', phone_display: '' }, ai: { ...ai, spam_likelihood: 'medium', issue_summary: 'a < b > c & d' } });
  const text = buildSlackText({ result, emailStatus: 'failed', sentTime: '', config });
  assert.ok(text.includes('Bo &lt;b&gt;&amp;&lt;/b&gt;, 78704, no phone given'));
  assert.ok(text.includes('a &lt; b &gt; c &amp; d'));
  assert.ok(text.includes('The reply email failed to send.'));
  const lines = text.split('\n');
  assert.equal(lines[lines.length - 2], 'Could be spam. Check before calling.');
  assert.match(lines[lines.length - 1], /^<https:.*\|Open the lead log>$/);
  assert.ok(text.includes('<https://docs.google.com/spreadsheets/d/TEST_SHEET_ID/edit|Open the lead log>'));
});

test('Slack text for needs_review previews the message; no alert for other tiers', () => {
  const long = `${'word '.repeat(40)}end`;
  const result = { ...resultFor('needs_review', { ai: null, lead: { message: long } }), score: null };
  const text = buildSlackText({ result, emailStatus: 'sent', sentTime: '2:14 PM', config });
  const preview = text.match(/Their message: "(.*)"/)[1];
  assert.ok(preview.endsWith('...') && preview.length <= 143, preview);
  assert.equal(buildSlackText({ result: resultFor('nurture'), emailStatus: 'sent', sentTime: '', config }), '');
});

test('needs_review alerts say why the AI step failed, in plain words', () => {
  const base = { ...resultFor('needs_review', { ai: null }), score: null, ai_status: 'failed_http', ai_error: 'connect ECONNREFUSED 192.168.65.254:8787' };
  const text = buildSlackText({ result: base, emailStatus: 'sent', sentTime: '2:14 PM', config });
  assert.ok(text.includes('Why: the AI bridge is not running on the demo PC.'), text);
  assert.ok(!text.includes('failed to send'));
  const bothFailed = buildSlackText({ result: base, emailStatus: 'failed', sentTime: '', config });
  assert.ok(bothFailed.includes('The reply email failed to send. Please reply by hand.'));
});

test('describeAiFailure maps errors to plain reasons', () => {
  const reasons = config.slack.ai_failure_reasons;
  assert.equal(describeAiFailure('failed_http', 'connect ECONNREFUSED 127.0.0.1:8787', config), reasons.bridge_down);
  assert.equal(describeAiFailure('failed_http', 'Request failed with status code 401', config), reasons.auth);
  assert.equal(describeAiFailure('failed_http', 'timeout of 30000ms exceeded', config), reasons.timeout);
  assert.equal(describeAiFailure('failed_http', 'The service is receiving too many requests (529)', config), reasons.overloaded);
  assert.equal(describeAiFailure('failed_refusal', '', config), reasons.refusal);
  assert.equal(describeAiFailure('failed_parse', 'The reply is not valid JSON.', config), reasons.parse);
  assert.equal(describeAiFailure('failed_http', 'something odd', config), reasons.other);
  const chainError = '502 - "{\\"type\\":\\"error\\",\\"error\\":{\\"type\\":\\"api_error\\",\\"message\\":\\"All AI providers failed. ollama: connection failed (ECONNREFUSED); claude-code: timed out\\"}}"';
  assert.equal(describeAiFailure('failed_http', chainError, config), 'every AI in the chain failed (ollama: connection failed (ECONNREFUSED); claude-code: timed out).');
});

test('a failed email alerts Slack for any non-spam tier', () => {
  const nurture = buildSlackText({ result: resultFor('nurture'), emailStatus: 'failed', sentTime: '', config });
  assert.ok(nurture.startsWith('*Reply failed to send* (nurture lead)'), nurture);
  assert.ok(nurture.includes('Please reply by hand.'));
  const notFit = buildSlackText({ result: resultFor('not_fit'), emailStatus: 'failed', sentTime: '', config });
  assert.ok(notFit.startsWith('*Reply failed to send* (not fit lead)'), notFit);
  assert.equal(buildSlackText({ result: resultFor('nurture'), emailStatus: 'skipped', sentTime: '', config }), '');
  assert.equal(buildSlackText({ result: resultFor('spam'), emailStatus: 'failed', sentTime: '', config }), '');
});

test('slackToEmail turns an alert into a plain office email', () => {
  const text = buildSlackText({ result: resultFor('hot', { lead: { full_name: 'Bo & Co' } }), emailStatus: 'sent', sentTime: '2:14 PM', config });
  const email = slackToEmail(text, config);
  assert.equal(email.subject, 'Lead alert (Slack is down): Hot lead (score 93)');
  assert.ok(email.text.includes('Bo & Co, 78704'));
  assert.ok(email.text.includes('Open the lead log: https://docs.google.com/spreadsheets/d/TEST_SHEET_ID/edit'));
  assert.doesNotMatch(email.text, /[*<>]|&amp;/);
});

test('the sheet link stays the last line of every alert', () => {
  const review = { ...resultFor('needs_review', { ai: null }), score: null, ai_status: 'failed_http', ai_error: 'timeout of 25000ms exceeded' };
  const text = buildSlackText({ result: review, emailStatus: 'failed', sentTime: '', config });
  const lines = text.split('\n');
  assert.deepEqual(lines.slice(-3, -1), ['Why: Claude took too long to answer.', 'The reply email failed to send. Please reply by hand.']);
  assert.match(lines[lines.length - 1], /\|Open the lead log>$/);
});

test('the guard rejects joined sentences and lines that say what we will do', () => {
  const message = 'Hail on Tuesday cracked a skylight. The adjuster is coming Friday.';
  for (const line of [
    'Sorry about the hail damage on Tuesday and the cracked skylight; we can help before Friday.',
    'Sorry about the cracked skylight, and we will get someone out before the adjuster.',
    "Sorry about the skylight, we'll take care of it.",
    'Sorry about the skylight and we could look at it soon.',
  ]) {
    assert.equal(checkCustomerText(line, 'opening_line', message, rules).ok, false, line);
  }
  assert.ok(checkCustomerText('Sorry to hear the hail cracked your skylight on Tuesday.', 'opening_line', message, rules).ok);
});
