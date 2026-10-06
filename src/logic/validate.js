// cleanAndValidate (spec 11.1). Pure: the caller passes the time and a random number in `now`.
// Inlined into n8n Code nodes, so helper names carry a `validate` prefix to stay unique.

export const FIELD_ERRORS = {
  full_name: 'Please add your name.',
  email: "That email address doesn't look right.",
  phone: 'Please use a 10-digit US phone number, or leave it blank.',
  zip: 'Please enter a 5-digit ZIP code.',
  service: 'Pick the option closest to what you need.',
  message: "Tell us a little about what's going on (at least 10 characters).",
  contact_ok: 'Please check the box so we can reply.',
};

const VALIDATE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const VALIDATE_ZIP_RE = /^\d{5}(-\d{4})?$/;

function validateText(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

// Returns { e164, display } for a valid US number, null for a malformed one, or empty strings when blank.
export function normalizePhone(raw) {
  let digits = validateText(raw).replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
  if (digits === '') return { e164: '', display: '' };
  if (digits.length !== 10) return null;
  return {
    e164: `+1${digits}`,
    display: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
  };
}

function validateFirstName(fullName) {
  const first = fullName.split(' ')[0];
  return first === first.toLowerCase() ? first.charAt(0).toUpperCase() + first.slice(1) : first;
}

// `now` is { iso, local, random }: ISO time, Austin time as "yyyy-MM-dd HH:mm", and a number in [0, 1).
function validateLeadId(now) {
  const date = now.local.slice(0, 10).replace(/-/g, '');
  const suffix = Math.floor(now.random * 36 ** 4).toString(36).toUpperCase().padStart(4, '0').slice(-4);
  return `L-${date}-${suffix}`;
}

export function cleanAndValidate(body, config, now) {
  const input = body && typeof body === 'object' ? body : {};
  if (validateText(input.company_website).trim() !== '') return { route: 'bot', errors: [], lead: null };

  const errors = [];
  const fail = (field) => errors.push({ field, message: FIELD_ERRORS[field] });

  const fullName = validateText(input.full_name).trim().replace(/\s+/g, ' ');
  if (fullName.length < 2 || fullName.length > 80 || !/\p{L}/u.test(fullName)) fail('full_name');

  const email = validateText(input.email).trim().toLowerCase();
  if (email.length > 254 || !VALIDATE_EMAIL_RE.test(email)) fail('email');

  const phone = normalizePhone(input.phone);
  if (phone === null) fail('phone');

  const zipRaw = validateText(input.zip).trim();
  if (!VALIDATE_ZIP_RE.test(zipRaw)) fail('zip');
  const zip = zipRaw.slice(0, 5);

  const service = validateText(input.service).trim();
  const services = config.form_services;
  if (!Object.prototype.hasOwnProperty.call(services, service)) fail('service');

  const message = validateText(input.message).trim();
  if (message.length < 10 || message.length > 2000) fail('message');

  if (![true, 'true', 'on'].includes(input.contact_ok)) fail('contact_ok');

  if (errors.length > 0) return { route: 'invalid', errors, lead: null };

  const page = validateText(input.page).trim().slice(0, 200);
  return {
    route: 'ok',
    errors: [],
    lead: {
      lead_id: validateLeadId(now),
      received_at_iso: now.iso,
      received_at_local: now.local,
      full_name: fullName,
      first_name: validateFirstName(fullName),
      email,
      phone_e164: phone.e164,
      phone_display: phone.display,
      zip,
      in_service_area: config.service_area_zips.includes(zip),
      service_selected: service,
      service_selected_label: services[service],
      message,
      source_page: page || '/',
    },
  };
}
