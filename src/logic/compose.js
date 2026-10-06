// Copy guard, reply email, Slack text and the lead result (spec 6.4, 11.4, 11.5, 11.6).
// Inlined into n8n Code nodes, so helper names carry a `compose` prefix to stay unique.

const COMPOSE_EMOJI_RE = /\p{Extended_Pictographic}/u;
const COMPOSE_URL_RE = /https?:\/\/|www\./i;
const COMPOSE_EMAIL_RE = /\S+@\S+/;
const COMPOSE_PHONE_RE = /\d{3}[\s.-]?\d{4}/;
const COMPOSE_GREETING_RE = /^(hi|hello|hey|dear)\b/i;
const COMPOSE_SUBJECT_CHARS_RE = /^[\p{L}\p{N} '’-]+$/u;

// One pass over the template, so inserted text is never scanned for placeholders.
function composeFill(template, values) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match));
}

// Checks one of Claude's customer-facing slots. kind is "opening_line" or "subject_topic".
export function checkCustomerText(text, kind, leadMessage, rules) {
  const value = typeof text === 'string' ? text.trim() : '';
  const reasons = [];
  if (value === '') return { ok: false, reasons: ['empty'] };

  const lower = value.toLowerCase();
  for (const phrase of rules.banned_phrases) if (lower.includes(phrase.toLowerCase())) reasons.push(`banned phrase "${phrase}"`);
  for (const char of rules.banned_characters) if (value.includes(char)) reasons.push(`banned character U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
  if (COMPOSE_EMOJI_RE.test(value)) reasons.push('emoji');
  if (COMPOSE_URL_RE.test(value)) reasons.push('url');
  if (COMPOSE_EMAIL_RE.test(value)) reasons.push('email address');
  if (COMPOSE_PHONE_RE.test(value)) reasons.push('phone number');
  const messageNumbers = new Set(String(leadMessage || '').match(/\d+/g) || []);
  for (const number of value.match(/\d+/g) || []) if (!messageNumbers.has(number)) reasons.push(`number ${number} is not in the message`);

  if (kind === 'opening_line') {
    if (value.length < 30) reasons.push('shorter than 30 characters');
    if (value.length > 200) reasons.push('longer than 200 characters');
    if (!/[.?]$/.test(value)) reasons.push('does not end with . or ?');
    if (/[.?]\s+[A-Z]/.test(value) || value.includes(';')) reasons.push('more than one sentence');
    // Promises and next steps belong to the template, never to Claude's line (Phase 6 eval finding).
    if (/\bwe(?:'ll|’ll|\s+will|\s+can|\s+could)\b/i.test(value)) reasons.push('says what we will do');
    if (COMPOSE_GREETING_RE.test(value)) reasons.push('starts with a greeting');
  } else if (kind === 'subject_topic') {
    const words = value.split(/\s+/).length;
    if (words < 2 || words > 6) reasons.push('not 2 to 6 words');
    if (!COMPOSE_SUBJECT_CHARS_RE.test(value)) reasons.push('characters other than letters, digits, spaces, apostrophes and hyphens');
  }
  return { ok: reasons.length === 0, reasons };
}

export function buildSignature(config) {
  return `${config.sender.name}\n${config.sender.title}, ${config.company.name}\n${config.company.phone_display}`;
}

function composeTemplateName(tierInfo) {
  if (tierInfo.tier === 'not_fit') return tierInfo.reason === 'area' ? 'not_fit_area' : 'not_fit_service';
  return tierInfo.tier;
}

// Builds the reply email. Returns { email: { to, subject, text } | null, used_fallback, guard }.
// `guard` lists why a Claude slot was replaced, for the eval and the logs.
export function composeReply({ lead, ai, tierInfo, config }) {
  if (tierInfo.tier === 'spam') return { email: null, used_fallback: false, guard: {} };

  const rules = config.copy_rules;
  const fallbackLines = config.email.fallback_opening_lines;
  const guard = {};
  let usedFallback = false;

  let openingLine = '';
  let subjectTopic = '';
  if (tierInfo.tier !== 'needs_review') {
    const opening = ai ? checkCustomerText(ai.opening_line, 'opening_line', lead.message, rules) : { ok: false, reasons: ['no AI result'] };
    const subject = ai ? checkCustomerText(ai.subject_topic, 'subject_topic', lead.message, rules) : { ok: false, reasons: ['no AI result'] };
    if (opening.ok) {
      openingLine = ai.opening_line.trim();
    } else {
      const category = ai ? ai.service_category : '';
      openingLine = Object.prototype.hasOwnProperty.call(fallbackLines, category) ? fallbackLines[category] : fallbackLines.default;
      guard.opening_line = opening.reasons;
      usedFallback = true;
    }
    if (subject.ok) {
      subjectTopic = ai.subject_topic.trim();
    } else {
      subjectTopic = config.email.fallback_subject_topic;
      guard.subject_topic = subject.reasons;
      usedFallback = true;
    }
  }

  const companyPhone = config.company.phone_display;
  const emergencyLine = tierInfo.tier === 'hot' && ai && ai.urgency === 'emergency'
    ? composeFill(config.email.emergency_line, { company_phone: companyPhone })
    : '';
  const template = config.templates[composeTemplateName(tierInfo)];
  const text = composeFill(template, {
    first_name: lead.first_name,
    opening_line: openingLine,
    emergency_line: emergencyLine,
    booking_url: config.booking_url,
    zip: lead.zip,
    decline_line: tierInfo.decline_key ? config.services.not_offered[tierInfo.decline_key] : '',
    company_phone: companyPhone,
    signature: buildSignature(config),
  })
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const subjectLine = tierInfo.tier === 'needs_review'
    ? config.email.subjects.needs_review
    : composeFill(config.email.subjects.default, { subject_topic: subjectTopic });

  return { email: { to: lead.email, subject: subjectLine, text }, used_fallback: usedFallback, guard };
}

function composeEscapeSlack(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function composePreview(message, limit) {
  const text = message.replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:]+$/, '')}...`;
}

// Plain-words reason for a failed AI step, from the status and the error text n8n or the parser gave.
export function describeAiFailure(aiStatus, aiError, config) {
  const reasons = config.slack.ai_failure_reasons;
  const error = String(aiError || '');
  if (aiStatus === 'failed_refusal') return reasons.refusal;
  if (aiStatus === 'failed_parse' || aiStatus === 'failed_max_tokens') return reasons.parse;
  // The bridge's provider chain names each provider and why it failed.
  const chain = error.match(/All AI providers failed\.\s*([^"\\]+)/);
  if (chain) return composeFill(reasons.all_providers, { detail: chain[1].trim().replace(/[.;]+$/, '') });
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|connect/i.test(error)) return reasons.bridge_down;
  if (/\b401\b|authentication|unauthori[sz]ed|forbidden|\b403\b/i.test(error)) return reasons.auth;
  if (/timeout|timed out|ETIMEDOUT|ECONNABORTED|\b504\b/i.test(error)) return reasons.timeout;
  if (/\b529\b|\b503\b|overloaded|busy/i.test(error)) return reasons.overloaded;
  return reasons.other;
}

// Slack alert text, or '' when no alert is needed. Hot, warm and needs_review always alert; any
// other non-spam lead alerts only when its reply email failed, so a person can answer by hand.
// `emailStatus` is "sent", "failed" or "skipped"; `sentTime` is the local time like "2:14 PM".
export function buildSlackText({ result, emailStatus, sentTime, config }) {
  const slack = config.slack;
  const emailFailed = emailStatus === 'failed';
  const alertTier = slack.alert_tiers.includes(result.tier);
  if (!alertTier && !(emailFailed && result.tier !== 'spam')) return '';
  const { lead, ai } = result;
  const replyStatusLine = emailStatus === 'sent' ? composeFill(slack.reply_sent_line, { sent_time: sentTime }) : slack.reply_failed_line;
  const template = alertTier ? slack[result.tier] : slack.email_failed;
  let text = composeFill(template, {
    tier: result.tier.replace('_', ' '),
    score: result.score === null ? '' : result.score,
    full_name: composeEscapeSlack(lead.full_name),
    zip: composeEscapeSlack(lead.zip),
    phone_display: composeEscapeSlack(lead.phone_display || slack.no_phone_text),
    issue_summary: composeEscapeSlack(ai ? ai.issue_summary : ''),
    reply_status_line: replyStatusLine,
    message_preview: composeEscapeSlack(composePreview(lead.message, 140)),
    sheet_link: composeFill(slack.sheet_link, { sheet_url: config.sheet_url }),
  });
  // Extra lines go above the sheet link, which stays last.
  const extras = [];
  if (result.tier === 'needs_review') {
    extras.push(composeFill(slack.ai_reason_line, { reason: describeAiFailure(result.ai_status, result.ai_error, config) }));
    if (emailFailed) extras.push(slack.reply_failed_line);
  }
  if (ai && ai.spam_likelihood === 'medium') extras.push(slack.spam_medium_line);
  if (extras.length === 0) return text;
  const lines = text.split('\n');
  const link = composeFill(slack.sheet_link, { sheet_url: config.sheet_url });
  const at = lines[lines.length - 1] === link ? lines.length - 1 : lines.length;
  lines.splice(at, 0, ...extras);
  return lines.join('\n');
}

// The same alert as a plain email for the office, used when Slack itself is down.
export function slackToEmail(slackText, config) {
  const plain = slackText
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2: $1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const headline = plain.split('\n')[0];
  return { subject: composeFill(config.slack.office_subject, { headline }), text: plain };
}

// The lead result object (spec 11.6) that the email, Slack and sheet steps read.
export function buildLeadResult({ lead, ai, aiStatus, model, score, tierInfo, reply, processingStartedAt }) {
  return {
    lead,
    ai: ai || null,
    ai_status: aiStatus,
    model,
    score: ai ? score : null,
    tier: tierInfo.tier,
    tier_reason: tierInfo.reason,
    decline_key: tierInfo.decline_key,
    slack_alert: tierInfo.alert,
    used_fallback: reply.used_fallback,
    guard: reply.guard,
    email: reply.email,
    processing_started_at: processingStartedAt,
  };
}
