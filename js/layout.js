/**
 * layout.js — injects the shared navigation bar and toast container into every
 * page that imports this module.  Must be imported (directly or transitively)
 * by every page-level JS module.
 *
 * Exports:
 *   showToast(message, type?) — display a Bootstrap toast notification.
 */

import { BASE_PATH } from './config.js';

// ── Shared navigation bar ──────────────────────────────────────────────────────
const headerRoot = document.getElementById('header-root');
if (headerRoot) {
  headerRoot.innerHTML = `
    <nav class="navbar navbar-dark bg-dark px-3 d-flex justify-content-between align-items-center">
      <a class="navbar-brand fw-semibold mb-0" href="${BASE_PATH}/">🌱 CSA</a>
      <a href="${BASE_PATH}/account/"
         title="Il mio account"
         class="text-white text-decoration-none"
         aria-label="Il mio account">
        <i class="bi bi-person-circle fs-3"></i>
      </a>
    </nav>`;
}

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
