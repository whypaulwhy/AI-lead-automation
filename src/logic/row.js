// Google Sheet row (spec 11.7). The header row of the "Leads" tab has exactly these columns.
export const SHEET_COLUMNS = [
  'received_at', 'tier', 'score', 'full_name', 'phone', 'email', 'zip', 'issue_summary', 'urgency',
  'ai_service_category', 'service_selected', 'in_service_area', 'property_type', 'decision_maker',
  'money_signal', 'spam_likelihood', 'ai_explanation', 'reply_subject', 'email_status', 'slack_status',
  'ai_status', 'model', 'lead_id', 'message',
];

// `statuses` is { email_status, slack_status }, each "sent", "failed" or "skipped" (spec 9.4).
export function buildSheetRow(result, statuses) {
  const { lead } = result;
  const ai = result.ai || {};
  const aiValue = (key) => (result.ai ? ai[key] : '');
  const row = {
    received_at: lead.received_at_local,
    tier: result.tier,
    score: result.score === null || result.score === undefined ? '' : result.score,
    full_name: lead.full_name,
    phone: lead.phone_display,
    email: lead.email,
    zip: lead.zip,
    issue_summary: aiValue('issue_summary'),
    urgency: aiValue('urgency'),
    ai_service_category: aiValue('service_category'),
    service_selected: lead.service_selected_label,
    in_service_area: lead.in_service_area ? 'yes' : 'no',
    property_type: aiValue('property_type'),
    decision_maker: aiValue('decision_maker'),
    money_signal: aiValue('money_signal'),
    spam_likelihood: aiValue('spam_likelihood'),
    ai_explanation: aiValue('explanation'),
    reply_subject: statuses.email_status === 'sent' && result.email ? result.email.subject : '',
    email_status: statuses.email_status,
    slack_status: statuses.slack_status,
    ai_status: result.ai_status,
    model: result.model,
    lead_id: lead.lead_id,
    message: lead.message,
  };
  return Object.fromEntries(SHEET_COLUMNS.map((column) => [column, row[column]]));
}
