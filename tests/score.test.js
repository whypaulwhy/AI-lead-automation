import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScore, decideTier } from '../src/logic/score.js';
import { config, fixtures } from './helpers.js';

const inArea = { in_service_area: true, phone_e164: '+15125550182' };
const baseAi = {
  service_category: 'leak_repair', urgency: 'emergency', property_type: 'single_family',
  decision_maker: 'yes', money_signal: 'none', spam_likelihood: 'low',
};

test('every mock_ai fixture gets its expected tier and score', () => {
  for (const fixture of fixtures.filter((f) => f.mock_ai)) {
    const lead = { in_service_area: config.service_area_zips.includes(fixture.payload.zip), phone_e164: fixture.payload.phone ? '+1' : '' };
    const score = computeScore(fixture.mock_ai, lead, config.scoring);
    const { tier } = decideTier({ ai: fixture.mock_ai, lead, score, config });
    assert.equal(tier, fixture.mock_expect.tier, fixture.id);
    if ('score' in fixture.mock_expect) assert.equal(score, fixture.mock_expect.score, fixture.id);
  }
});

test('the score is clamped to 0 and 100', () => {
  const high = { ...config.scoring, base: 90 };
  assert.equal(computeScore(baseAi, inArea, high), 100);
  const low = { ...config.scoring, base: -50 };
  assert.equal(computeScore({ ...baseAi, urgency: 'exploring', decision_maker: 'no' }, { phone_e164: '' }, low), 0);
});

test('a missing weight key counts as 0', () => {
  const scoring = { ...config.scoring, service_category: {}, property_type: { single_family: 10 } };
  // gutters and commercial have no service_category or property_type weight
  const ai = { ...baseAi, service_category: 'gutters', property_type: 'commercial' };
  assert.equal(computeScore(ai, inArea, scoring), 20 + 35 + 0 + 0 + 8 + 0 + 5);
});

test('tier order: spam before area, area before needs_review', () => {
  const outOfArea = { in_service_area: false, phone_e164: '' };
  assert.equal(decideTier({ ai: { ...baseAi, spam_likelihood: 'high' }, lead: outOfArea, score: 93, config }).tier, 'spam');
  const area = decideTier({ ai: null, lead: outOfArea, score: null, config });
  assert.deepEqual([area.tier, area.reason], ['not_fit', 'area']);
  const review = decideTier({ ai: null, lead: inArea, score: null, config });
  assert.deepEqual([review.tier, review.reason, review.alert], ['needs_review', 'ai_failed', true]);
});

test('commercial and not-offered services are declined with the right key', () => {
  const byProperty = decideTier({ ai: { ...baseAi, property_type: 'commercial' }, lead: inArea, score: 93, config });
  assert.deepEqual([byProperty.tier, byProperty.reason, byProperty.decline_key], ['not_fit', 'service', 'commercial']);
  for (const category of ['gutters', 'solar', 'not_roofing', 'commercial']) {
    const result = decideTier({ ai: { ...baseAi, service_category: category }, lead: inArea, score: 93, config });
    assert.deepEqual([result.tier, result.decline_key, result.alert], ['not_fit', category, false], category);
  }
});

test('thresholds: hot at 80, warm at 62, otherwise nurture; Slack only for hot and warm', () => {
  const tierAt = (score) => decideTier({ ai: baseAi, lead: inArea, score, config });
  assert.deepEqual([tierAt(80).tier, tierAt(80).alert], ['hot', true]);
  assert.deepEqual([tierAt(79).tier, tierAt(79).alert], ['warm', true]);
  assert.equal(tierAt(62).tier, 'warm');
  assert.deepEqual([tierAt(61).tier, tierAt(61).alert], ['nurture', false]);
});
