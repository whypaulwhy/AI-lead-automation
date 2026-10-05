// Google Sheet columns, in order (spec Section 11.7). buildSheetRow arrives in Phase 4.
export const SHEET_COLUMNS = [
  'received_at', 'tier', 'score', 'full_name', 'phone', 'email', 'zip', 'issue_summary', 'urgency',
  'ai_service_category', 'service_selected', 'in_service_area', 'property_type', 'decision_maker',
  'money_signal', 'spam_likelihood', 'ai_explanation', 'reply_subject', 'email_status', 'slack_status',
  'ai_status', 'model', 'lead_id', 'message',
];
