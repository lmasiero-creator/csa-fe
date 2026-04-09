/**
 * account.js — logic for the /account page.
 *
 * Identity strategy (no authentication):
 *   The user selects their name from the quota owners list populated by the
 *   backend.  The chosen quota_owner_id is persisted in a long-lived cookie
 *   ("csa_account_id") on this device.  On every subsequent visit the cookie
 *   is read, the matching option is pre-selected, and the saved profile
 *   (description + photo data-URI) is loaded immediately.
 *
 * Photo storage:
 *   The backend stores uploaded photos as Base64 data-URIs directly in the
 *   `accounts.photo_data` TEXT column in Supabase PostgreSQL. The field value
 *   is a full data-URI (e.g. `data:image/jpeg;base64,...`) which the frontend
 *   uses directly as the `src` of an <img> element — no separate file server needed.
 */

import { API_BASE_URL, apiFetch } from './config.js';
import { showToast }       from './layout.js';
import { initOwnerPicker } from './owner-picker.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_FILE_SIZE      = 5 * 1024 * 1024;   // 5 MB
const MIN_WIDTH          = 150;
const MIN_HEIGHT         = 150;
const COOKIE_NAME        = 'csa_account_id';
const COOKIE_MAX_AGE     = 60 * 60 * 24 * 365 * 10; // 10 years in seconds

// ── DOM references ────────────────────────────────────────────────────────────
const form        = document.getElementById('accountForm');
const descInput   = document.getElementById('description');
const photoInput  = document.getElementById('photoInput');
const avatarEl    = document.getElementById('avatar');
const descCounter = document.getElementById('descCounter');

// ── State ─────────────────────────────────────────────────────────────────────
/** All quota owners loaded from the backend (used for avatar-label lookup). */
let allOwners        = [];
/** File chosen by the user but not yet saved. */
let pendingFile      = null;
/** Object URL for the current avatar preview (revoked when no longer needed). */
let previewObjectUrl = null;
/** Quota owner object currently shown: { id, name, surname, description, photo_url } */
let currentOwner     = null;

// ── Cookie helpers ────────────────────────────────────────────────────────────

/**
 * Read a cookie by name. Returns the value string or null.
 * @param {string} name
 * @returns {string|null}
 */
function getCookie(name) {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

/**
 * Write a cookie that survives browser restarts (SameSite=Lax, no Secure flag
 * so it also works over plain HTTP during local development).
 * @param {string} name
 * @param {string} value
 * @param {number} maxAge  Max-Age in seconds.
 */
function setCookie(name, value, maxAge) {
  document.cookie =
    `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

// ── Avatar helpers ────────────────────────────────────────────────────────────

/** Deterministic HSL colour derived from a string (for initials avatar background). */
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = str.charCodeAt(i) + ((h << 5) - h);
  }
  return `hsl(${Math.abs(h) % 360}, 55%, 40%)`;
}

/**
 * Render the avatar.
 * Priority: previewObjectUrl (module-scoped) > photoUrl from backend > initials > icon.
 *
 * @param {string|null} name
 * @param {string|null} surname
 * @param {string|null} photoUrl  Permanent URL from backend (null if none saved yet).
 */
function renderAvatar(name, surname, photoUrl) {
  const src = previewObjectUrl ?? photoUrl ?? null;

  if (src) {
    avatarEl.style.background = 'transparent';
    avatarEl.innerHTML = `<img src="${src}" alt="Foto profilo">`;
    return;
  }

  const initials = [name?.[0], surname?.[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase();

  if (initials) {
    avatarEl.style.background = hashColor((name ?? '') + (surname ?? ''));
    avatarEl.innerHTML = initials;
  } else {
    avatarEl.style.background = '#6c757d';
    avatarEl.innerHTML = '<i class="bi bi-person-fill" style="font-size:2.5rem"></i>';
  }
}

// ── Quota-owners select ───────────────────────────────────────────────────────

/**
 * Fetch quota owners from the backend and populate the <select>.
 * After populating, restore any previously saved selection from the cookie.
 */
async function loadQuotaOwners() {
  try {
    const res = await apiFetch('/api/quota-owners');
    if (!res.ok) throw new Error();

    /** @type {{ id: number, name: string, surname: string }[]} */
    allOwners = await res.json();

    const savedId = getCookie(COOKIE_NAME);
    initOwnerPicker('quotaOwnerPicker', allOwners, {
      hiddenId:   'quotaOwner',
      selectedId: savedId,
      onSelect:   async (owner) => { await loadAccountForOwner(owner.id, owner); },
    });

    if (savedId && allOwners.some((o) => String(o.id) === savedId)) {
      const found = allOwners.find((o) => String(o.id) === savedId);
      await loadAccountForOwner(savedId, found);
    }
  } catch {
    // Backend not available during pure front-end development — silently ignore.
  }
}

// ── Load account data for a specific owner ────────────────────────────────────

/**
 * Fetch and render the profile for the given quota owner id.
 * @param {string|number} ownerId
 */
async function loadAccountForOwner(ownerId, ownerObj = null) {
  // Reset any pending upload when switching owners
  if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; }
  pendingFile      = null;
  photoInput.value = '';

  try {
    const res = await apiFetch(`/api/account/${ownerId}`);

    if (res.status === 404) {
      // Owner exists in quota_owners but has no profile saved yet
      currentOwner    = { id: ownerId, name: '', surname: '', description: '', photo_url: null };
      descInput.value = '';
      const o = ownerObj ?? allOwners.find((x) => String(x.id) === String(ownerId));
      renderAvatar(o?.name ?? '', o?.surname ?? '', null);
    } else if (res.ok) {
      currentOwner    = await res.json();
      descInput.value = currentOwner.description ?? '';
      renderAvatar(currentOwner.name, currentOwner.surname, currentOwner.photo_data ?? null);
    }

    updateCounter(descInput, descCounter);
  } catch {
    // Backend not available — silently ignore.
  }
}

// ── Photo upload validation ───────────────────────────────────────────────────

/**
 * Validate a File object: extension, size and minimum pixel dimensions.
 * Returns a resolved Promise on success or a rejected Promise with a
 * user-facing Error message on failure.
 * @param {File} file
 * @returns {Promise<void>}
 */
function validateImageFile(file) {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      reject(new Error(
        `Formato non supportato. Usa: ${ALLOWED_EXTENSIONS.join(', ').toUpperCase()}.`
      ));
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      reject(new Error("L'immagine supera il limite di 5 MB."));
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width < MIN_WIDTH || img.height < MIN_HEIGHT) {
        reject(new Error(
          `Dimensioni minime: ${MIN_WIDTH}×${MIN_HEIGHT} px. ` +
          `Immagine caricata: ${img.width}×${img.height} px.`
        ));
        return;
      }
      resolve();
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossibile leggere l'immagine. Il file potrebbe essere corrotto."));
    };

    img.src = url;
  });
}

// ── Photo input handler ───────────────────────────────────────────────────────

photoInput.addEventListener('change', async (e) => {
  if (!document.getElementById('quotaOwner')?.value) {
    showToast('Seleziona prima il tuo nome.', 'warning');
    photoInput.value = '';
    return;
  }

  const file = e.target.files[0];
  if (!file) return;

  try {
    await validateImageFile(file);
    if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; }
    pendingFile      = file;
    previewObjectUrl = URL.createObjectURL(file);
    renderAvatar(null, null, null); // previewObjectUrl is picked up inside renderAvatar
  } catch (err) {
    showToast(err.message, 'danger');
    photoInput.value = '';
    pendingFile = null;
  }
});

// Clicking the avatar circle or the overlay (or pressing Enter/Space) triggers the file picker
avatarEl.addEventListener('click', () => photoInput.click());
avatarEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); photoInput.click(); }
});

// The overlay sits above the avatar when visible; make it interactive too.
const avatarOverlay = document.querySelector('.avatar-overlay');
if (avatarOverlay) {
  avatarOverlay.addEventListener('click', () => photoInput.click());
  avatarOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); photoInput.click(); }
  });
}

// ── Photo input tooltip (mouseover) ───────────────────────────────────────
// Show a parameterized tooltip describing constraints when hovering the file input.
let photoTooltip = null;
avatarOverlay.addEventListener('mouseover', () => {
  const mb = MAX_FILE_SIZE / 1024 / 1024;
  const mbStr = Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
  const formats = ALLOWED_EXTENSIONS.join(', ').toUpperCase();
  const content =
    `Minimo: ${MIN_HEIGHT}×${MIN_WIDTH} px<br>` +
    `Formati accettati: ${formats}<br>` +
    `Dimensione massima: ${mbStr}`;

  if (photoTooltip) { photoTooltip.dispose(); photoTooltip = null; }
  photoTooltip = new bootstrap.Tooltip(avatarOverlay, {
    title: content,
    html: true,
    trigger: 'manual',
    customClass: 'photo-tooltip'
  });
  photoTooltip.show();
});

avatarOverlay.addEventListener('mouseout', () => {
  if (photoTooltip) { photoTooltip.hide(); photoTooltip.dispose(); photoTooltip = null; }
});

// ── Character counter ─────────────────────────────────────────────────────────

function updateCounter(inputEl, counterEl) {
  counterEl.textContent = `${inputEl.value.length} / ${inputEl.maxLength}`;
}

descInput.addEventListener('input', () => updateCounter(descInput, descCounter));

// ── Save ──────────────────────────────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const ownerId = document.getElementById('quotaOwner')?.value ?? '';
  if (!ownerId) {
    showToast('Seleziona prima il tuo nome.', 'warning');
    document.getElementById('quotaOwnerPicker-search')?.focus();
    return;
  }

  const body = new FormData();
  body.append('description', descInput.value.trim());
  if (pendingFile) body.append('photo', pendingFile);

  try {
    const res = await apiFetch(`/api/account/${ownerId}`, {
      method: 'POST',
      body,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? 'Errore durante il salvataggio.');
    }

    const saved = await res.json();

    // Persist identity in the long-lived cookie
    setCookie(COOKIE_NAME, String(ownerId), COOKIE_MAX_AGE);

    // Replace the temporary object URL preview with the permanent backend URL
    if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; }
    pendingFile  = null;
    currentOwner = saved;
    renderAvatar(saved.name, saved.surname, saved.photo_data ?? null);

    showToast('Profilo salvato con successo!', 'success');
  } catch (err) {
    showToast(err.message, 'danger');
  }
});

// ── Initialise ────────────────────────────────────────────────────────────────

document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) =>
  bootstrap.Tooltip.getOrCreateInstance(el)
);

updateCounter(descInput, descCounter);
renderAvatar('', '', null);
await loadQuotaOwners();
