import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSheetRow, SHEET_COLUMNS } from '../src/logic/row.js';
import { fixtures } from './helpers.js';

const HEADER = 'received_at,tier,score,full_name,phone,email,zip,issue_summary,urgency,ai_service_category,service_selected,in_service_area,property_type,decision_maker,money_signal,spam_likelihood,ai_explanation,reply_subject,email_status,slack_status,ai_status,model,lead_id,message';

const lead = {
  lead_id: 'L-20261004-7K2Q', received_at_local: '2026-10-04 14:14', full_name: 'Maria Delgado',
  email: 'test+maria@example.com', phone_display: '(512) 555-0182', zip: '78704', in_service_area: true,
  service_selected_label: 'Leak or water coming in', message: 'Water started dripping.',
};
const ai = fixtures[0].mock_ai;
const result = {
  lead, ai, ai_status: 'ok', model: 'claude-haiku-4-5-20251001', score: 93, tier: 'hot',
  email: { to: lead.email, subject: 'About your upstairs bedroom ceiling leak', text: '...' },
};

test('the row has exactly the 24 header keys in order', () => {
  assert.equal(SHEET_COLUMNS.join(','), HEADER);
  assert.deepEqual(Object.keys(buildSheetRow(result, { email_status: 'sent', slack_status: 'sent' })), SHEET_COLUMNS);
});

test('values and statuses are mapped', () => {
  const row = buildSheetRow(result, { email_status: 'sent', slack_status: 'failed' });
  assert.equal(row.received_at, '2026-10-04 14:14');
  assert.equal(row.score, 93);
  assert.equal(row.phone, '(512) 555-0182');
  assert.equal(row.in_service_area, 'yes');
  assert.equal(row.service_selected, 'Leak or water coming in');
  assert.equal(row.ai_service_category, 'leak_repair');
  assert.equal(row.ai_explanation, ai.explanation);
  assert.equal(row.reply_subject, 'About your upstairs bedroom ceiling leak');
  assert.equal(row.email_status, 'sent');
  assert.equal(row.slack_status, 'failed');
  assert.equal(row.lead_id, 'L-20261004-7K2Q');
});

test('reply_subject is empty when no email was sent', () => {
  assert.equal(buildSheetRow(result, { email_status: 'failed', slack_status: 'sent' }).reply_subject, '');
  assert.equal(buildSheetRow({ ...result, email: null }, { email_status: 'skipped', slack_status: 'skipped' }).reply_subject, '');
});

test('AI columns are empty and score is blank when ai is null', () => {
  const row = buildSheetRow({ ...result, ai: null, score: null, ai_status: 'failed_http', tier: 'needs_review' }, { email_status: 'sent', slack_status: 'sent' });
  for (const column of ['issue_summary', 'urgency', 'ai_service_category', 'property_type', 'decision_maker', 'money_signal', 'spam_likelihood', 'ai_explanation']) {
    assert.equal(row[column], '', column);
  }
  assert.equal(row.score, '');
  assert.equal(row.ai_status, 'failed_http');
  assert.equal(row.in_service_area, 'yes');
});
