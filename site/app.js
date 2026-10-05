// Lead form: the same checks and messages as the server, a JSON POST to window.LEAD_ENDPOINT,
// then the result. Every word a visitor sees lives in index.html; this file holds none.
(() => {
  'use strict';

  const form = document.getElementById('lead-form');
  if (!form) return;

  const formArea = document.getElementById('form-area');
  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById('form-status');
  const formError = document.getElementById('form-error');
  const success = document.getElementById('success');
  const idleLabel = button.textContent;
  const TIMEOUT_MS = 10000;

  // Mirrors cleanAndValidate (spec 11.1).
  const digitsOnly = (value) => {
    const digits = value.replace(/\D/g, '');
    return digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  };
  const RULES = {
    full_name: (value) => {
      const name = value.trim().replace(/\s+/g, ' ');
      return name.length >= 2 && name.length <= 80 && /\p{L}/u.test(name);
    },
    email: (value) => {
      const email = value.trim();
      return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    },
    phone: (value) => {
      const digits = digitsOnly(value);
      return digits === '' || digits.length === 10;
    },
    zip: (value) => /^\d{5}(-\d{4})?$/.test(value.trim()),
    service: (value) => value !== '',
    message: (value) => value.trim().length >= 10 && value.trim().length <= 2000,
    contact_ok: (_value, field) => field.checked,
  };

  let attempted = false;
  let sending = false;

  const field = (name) => form.elements.namedItem(name);

  function announce(text) {
    status.textContent = '';
    window.setTimeout(() => { status.textContent = text; }, 50);
  }

  function setError(name, message) {
    const input = field(name);
    const errorEl = document.getElementById(`${name}-error`);
    if (!input || !errorEl) return false;
    errorEl.textContent = message || '';
    errorEl.hidden = !message;
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', errorEl.id);
    } else {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
    return true;
  }

  function checkField(name) {
    const input = field(name);
    const ok = RULES[name](input.value, input);
    setError(name, ok ? '' : input.dataset.error);
    return ok;
  }

  function setSending(on) {
    sending = on;
    button.setAttribute('aria-disabled', String(on));
    button.textContent = on ? button.dataset.busyLabel : idleLabel;
    form.setAttribute('aria-busy', String(on));
  }

  function showSuccess(email) {
    success.querySelector('[data-slot="email"]').textContent = email;
    formArea.hidden = true;
    success.hidden = false;
    success.classList.add('is-shown');
    success.focus();
    announce(status.dataset.sent);
  }

  function showServerErrors(errors) {
    const shown = errors.filter(({ field: name, message }) => setError(name, message)).map(({ field: name }) => name);
    if (shown.length === 0) return showNetworkError();
    announce(status.dataset.invalid);
    field(shown[0]).focus();
  }

  function showNetworkError() {
    formError.hidden = false;
    announce(formError.textContent);
  }

  // After the first submit, fix-as-you-type: errors clear as soon as a field becomes valid.
  const recheck = (event) => {
    const { name } = event.target;
    if (attempted && RULES[name]) checkField(name);
  };
  form.addEventListener('input', recheck);
  form.addEventListener('change', recheck);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    attempted = true;
    formError.hidden = true;

    const invalid = Object.keys(RULES).filter((name) => !checkField(name));
    if (invalid.length > 0) {
      announce(status.dataset.invalid);
      field(invalid[0]).focus();
      return;
    }

    const payload = {
      full_name: field('full_name').value.trim(),
      email: field('email').value.trim(),
      phone: field('phone').value.trim(),
      zip: field('zip').value.trim(),
      service: field('service').value,
      message: field('message').value.trim(),
      contact_ok: field('contact_ok').checked,
      company_website: field('company_website').value,
      page: window.location.pathname,
    };

    setSending(true);
    announce(status.dataset.sending);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      if (!window.LEAD_ENDPOINT) throw new Error('LEAD_ENDPOINT is not set; run npm run build -- --site-only');
      const res = await fetch(window.LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        showSuccess(payload.email);
      } else if (res.status === 400 && Array.isArray(body.errors) && body.errors.length > 0) {
        showServerErrors(body.errors);
      } else {
        showNetworkError();
      }
    } catch {
      showNetworkError();
    } finally {
      window.clearTimeout(timer);
      setSending(false);
    }
  });
})();
