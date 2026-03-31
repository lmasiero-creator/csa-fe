/**
 * layout.js — injects the shared navigation bar and toast container into every
 * page that imports this module.  Must be imported (directly or transitively)
 * by every page-level JS module.
 *
 * Exports:
 *   showToast(message, type?) — display a Bootstrap toast notification.
 */

import { BASE_PATH, API_BASE_URL, WAKEUP_MSG } from './config.js';

// ── Shared navigation bar ────────────────────────────────────────────────────
const headerRoot = document.getElementById('header-root');
if (headerRoot) {
  headerRoot.innerHTML = `
    <nav class="navbar navbar-dark bg-dark px-3 d-flex justify-content-between align-items-center">
      <a class="navbar-brand fw-semibold mb-0" href="${BASE_PATH}/">🌱 CSA</a>
      <a href="${BASE_PATH}/account/"
         title="Il mio account"
         class="text-decoration-none"
         aria-label="Il mio account">
        <span id="navAvatar" class="nav-avatar-circle">
          <i class="bi bi-person-fill" style="font-size:1.1rem"></i>
        </span>
      </a>
    </nav>`;
}

// ── Nav avatar: render initials (or photo) from cookie ───────────────────────────

function navHashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 55%, 40%)`;
}

(function initNavAvatar() {
  const match   = document.cookie.split('; ').find((r) => r.startsWith('csa_account_id='));
  const ownerId = match ? decodeURIComponent(match.split('=')[1]) : null;
  if (!ownerId) return;

  const el = document.getElementById('navAvatar');
  if (!el) return;

  function renderInitials(name, surname) {
    const initials = [(name?.[0] ?? ''), (surname?.[0] ?? '')].join('').toUpperCase();
    el.style.background = navHashColor((name ?? '') + (surname ?? ''));
    el.textContent       = initials || '?';
  }

  // Try profile first (may include a photo)
  import('./config.js').then(({ apiFetch }) => apiFetch(`/api/account/${ownerId}`))
    .then((r) => r.ok ? r.json() : Promise.reject(r.status))
    .then(({ name, surname, photo_data }) => {
      if (photo_data) {
        el.style.background = 'transparent';
        el.innerHTML = `<img src="${photo_data}" alt="Avatar">`;
      } else {
        renderInitials(name, surname);
      }
    })
    .catch(() => {
      // No profile saved yet — fall back to quota owner name
      import('./config.js').then(({ apiFetch }) => apiFetch(`/api/quota-owners/${ownerId}`))
        .then((r) => r.ok ? r.json() : Promise.reject())
        .then(({ name, surname }) => renderInitials(name, surname))
        .catch(() => { /* backend offline — keep default icon */ });
    });
}());

// ── Toast container (one per page, appended once) ──────────────────────────────
if (!document.getElementById('appToast')) {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="toast-container position-fixed top-0 end-0 p-3" style="z-index:1200">
      <div id="appToast"
           class="toast align-items-center border-0"
           role="alert"
           aria-live="assertive"
           aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body fw-semibold" id="toastMsg"></div>
          <button type="button"
                  class="btn-close btn-close-white me-2 m-auto"
                  data-bs-dismiss="toast"
                  aria-label="Chiudi"></button>
        </div>
      </div>
    </div>`);
}

// ── Wakeup banner (injected once, hidden by default) ───────────────────────────
if (!document.getElementById('wakeupBanner')) {
  document.body.insertAdjacentHTML('afterbegin', `
    <div id="wakeupBanner" class="d-none alert alert-warning alert-dismissible text-center small py-2 px-3 mb-0 rounded-0 border-0 border-bottom" role="alert" style="z-index:1100;position:relative">
      <i class="bi bi-hourglass-split me-1"></i>${WAKEUP_MSG}
    </div>`);
}

/**
 * Show a Bootstrap toast notification.
 *
 * @param {string} message            Text to display.
 * @param {'success'|'danger'|'warning'} [type='success']  Bootstrap colour context.
 */
export function showToast(message, type = 'success') {
  const toastEl = document.getElementById('appToast');
  const msgEl   = document.getElementById('toastMsg');
  if (!toastEl || !msgEl) return;
  msgEl.textContent = message;
  toastEl.className = `toast align-items-center text-bg-${type} border-0`;
  bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 4000 }).show();
}
