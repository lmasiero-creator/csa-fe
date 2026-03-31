/**
 * config.js — environment-specific constants shared across all JS modules.
 *
 * No manual edits are needed when switching between local dev and production.
 * Hostname detection is used to select the right values automatically.
 *
 * Local dev  : open via http://localhost or http://127.0.0.1 (e.g. npx serve)
 * Production : served from GitHub Pages at https://lmasiero-creator.github.io/csa-fe/
 */

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

/** Base path for all internal navigation links. */
export const BASE_PATH = isLocal ? '' : '/csa-fe';

/** URL of the Express backend. */
export const API_BASE_URL = isLocal
  ? 'http://localhost:3000'
  : 'https://csa-be-ug3p.onrender.com';

// ── Wakeup banner ─────────────────────────────────────────────────────────────

const SLOW_THRESHOLD_MS = 3000;
export const WAKEUP_MSG =
  'Quest\'app usa piattaforme gratuite che sospendono i servizi dopo un periodo di inattività. Attendi ancora qualche secondo per il ripristino...';

let _bannerEl = null;
let _activeTimer = null;
let _pendingCount = 0;

function getBanner() {
  if (!_bannerEl) {
    _bannerEl = document.getElementById('wakeupBanner');
  }
  return _bannerEl;
}

function showWakeupBanner() {
  const b = getBanner();
  if (b) b.classList.remove('d-none');
}

function hideWakeupBanner() {
  const b = getBanner();
  if (b) b.classList.add('d-none');
}

/**
 * Shared fetch wrapper used by all pages.
 * Shows the wakeup banner if the request takes more than 3 seconds.
 *
 * @param {string} path     Path starting with /api/...
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function apiFetch(path, options = {}) {
  _pendingCount++;
  if (_pendingCount === 1) {
    _activeTimer = setTimeout(showWakeupBanner, SLOW_THRESHOLD_MS);
  }
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, options);
    return res;
  } finally {
    _pendingCount--;
    if (_pendingCount === 0) {
      clearTimeout(_activeTimer);
      _activeTimer = null;
      hideWakeupBanner();
    }
  }
}
