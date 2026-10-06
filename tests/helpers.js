// Shared test setup: real config with placeholder booking and sheet values, fixed time.
import { loadConfig, loadFixtures, loadPrompts } from '../scripts/lib/config.mjs';

export const BOOKING_URL = 'https://cal.com/cedar-slate-demo/free-roof-inspection';
export const config = loadConfig({ bookingUrl: BOOKING_URL, sheetId: 'TEST_SHEET_ID' });
export const prompts = loadPrompts();
export const fixtures = loadFixtures();

// 2026-10-04 19:14 UTC is 14:14 in Austin (CDT).
export const NOW = { iso: '2026-10-04T19:14:03.512Z', local: '2026-10-04 14:14', random: 0.5 };

// Fixture emails are never stored; unit tests use test+<alias>@example.com (spec 13.1).
export function fixturePayload(fixture) {
  return { email: `test+${fixture.email_alias}@example.com`, ...fixture.payload };
}

// Wraps AI fields the way the Messages API returns them.
export function aiResponse(fields, stopReason = 'end_turn') {
  return { stop_reason: stopReason, content: [{ type: 'text', text: JSON.stringify(fields) }] };
}
