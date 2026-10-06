// computeScore and decideTier (spec 11.2, 11.3).
// Inlined into n8n Code nodes, so helper names carry a `score` prefix to stay unique.

// A missing weight key counts as 0.
function scoreWeight(table, key) {
  return table && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : 0;
}

export function computeScore(ai, lead, scoring) {
  const score = scoring.base
    + scoreWeight(scoring.urgency, ai.urgency)
    + scoreWeight(scoring.service_category, ai.service_category)
    + scoreWeight(scoring.property_type, ai.property_type)
    + scoreWeight(scoring.decision_maker, ai.decision_maker)
    + scoreWeight(scoring.money_signal, ai.money_signal)
    + (lead.phone_e164 ? scoring.phone_provided : 0);
  return Math.min(100, Math.max(0, score));
}

// First matching rule wins. Returns { tier, reason, decline_key, alert }.
// `ai` is null when the AI step failed; `score` is null then too.
export function decideTier({ ai, lead, score, config }) {
  const result = (tier, reason, declineKey = null) => ({
    tier,
    reason,
    decline_key: declineKey,
    alert: config.slack.alert_tiers.includes(tier),
  });
  const notOffered = config.services.not_offered;
  const thresholds = config.scoring.thresholds;

  if (ai && ai.spam_likelihood === 'high') return result('spam', 'spam');
  if (!lead.in_service_area) return result('not_fit', 'area');
  if (!ai) return result('needs_review', 'ai_failed');
  if (ai.property_type === 'commercial' || ai.service_category === 'commercial') return result('not_fit', 'service', 'commercial');
  if (Object.prototype.hasOwnProperty.call(notOffered, ai.service_category)) return result('not_fit', 'service', ai.service_category);
  if (score >= thresholds.hot) return result('hot', 'score');
  if (score >= thresholds.warm) return result('warm', 'score');
  return result('nurture', 'score');
}
