/**
 * involvement.js — logic for the /involvement page.
 * Shows involvement events; clicking opens a subscription form.
 */

import { API_BASE_URL, apiFetch } from './config.js';
import { showToast }       from './layout.js';
import { initOwnerPicker } from './owner-picker.js';

// ── State ─────────────────────────────────────────────────────────────────────
let selectedEvent  = null; // extendedProps of the clicked FullCalendar event
let ownerPickerInv = null; // reference to the picker API
let allOwnersInv   = [];   // quota owners list for name lookup in participants view
let invCalendar    = null; // FullCalendar instance (stored to refresh colors)
// ── Date helper ────────────────────────────────────────────────────────────────
function formatDateIT(isoStr) {
  if (!isoStr) return '';
  const [datePart, timePart] = String(isoStr).split('T');
  if (!datePart) return isoStr;
  const [y, mo, d] = datePart.split('-');
  const hhmm = timePart ? timePart.slice(0, 5) : '';
  return hhmm ? `${d}/${mo}/${y} ${hhmm}` : `${d}/${mo}/${y}`;
}
// ── Cookie helper ─────────────────────────────────────────────────────────────
function savedOwnerId() {
  const m = document.cookie.split('; ').find((r) => r.startsWith('csa_account_id='));
  return m ? decodeURIComponent(m.split('=')[1]) : null;
}

// ── Load quota owners into subscription modal select ─────────────────────────
async function loadOwners() {
  try {
    const res = await apiFetch('/api/quota-owners');
    if (!res.ok) return;
    allOwnersInv = await res.json();
    ownerPickerInv = initOwnerPicker('subQuotaOwnerPicker', allOwnersInv, {
      hiddenId:   'subQuotaOwner',
      selectedId: savedOwnerId(),
    });
  } catch { /* backend not available */ }
}

// ── FullCalendar ──────────────────────────────────────────────────────────────

function eventToFC(ev) {
  const bg     = ev.participant_count > 0 ? '#198754' : '#dc3545';
  const border = ev.participant_count > 0 ? '#146c43' : '#b02a37';
  return { id: String(ev.id), title: ev.description, start: ev.date,
           backgroundColor: bg, borderColor: border, extendedProps: { ...ev } };
}

async function loadAndRenderCalendar() {
  try {
    const res = await apiFetch('/api/events?type=inv');
    if (!res.ok) throw new Error();
    const events = await res.json();
    invCalendar = new FullCalendar.Calendar(document.getElementById('involvementCalendar'), {
      locale:      'it',
      firstDay:    1,
      timeZone:    'Europe/Rome',
      initialView: 'listMonth',
      headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
      noEventsContent: 'Nessuna attività programmata',
      events: events.map(eventToFC),
      eventDidMount: (info) => {
        new bootstrap.Tooltip(info.el, {
          title: info.event.title, placement: 'top', trigger: 'hover', container: 'body',
        });
      },
      eventClick: (info) => openSubscriptionModal(info.event.extendedProps),
    });
    invCalendar.render();
  } catch {
    showToast('Impossibile caricare gli eventi. Il backend è in esecuzione?', 'warning');
  }
}

// ── Subscription modal ────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showInvListPanel() {
  document.getElementById('invParticipantsPanel').classList.remove('d-none');
  document.getElementById('invFormPanel').classList.add('d-none');
  document.getElementById('invListFooter').classList.remove('d-none');
  document.getElementById('invFormFooter').classList.add('d-none');
}

function showInvFormPanel() {
  document.getElementById('invParticipantsPanel').classList.add('d-none');
  document.getElementById('invFormPanel').classList.remove('d-none');
  document.getElementById('invListFooter').classList.add('d-none');
  document.getElementById('invFormFooter').classList.remove('d-none');
  clearSubForm();
}

async function refreshInvParticipantsList(eventId) {
  const container = document.getElementById('invParticipantsList');
  container.innerHTML = `
    <div class="text-center text-muted py-3">
      <div class="spinner-border spinner-border-sm" role="status"></div>
      <span class="ms-2">Caricamento…</span>
    </div>`;
  try {
    const res = await apiFetch(`/api/involvement?event_id=${eventId}`);
    if (!res.ok) throw new Error();
    renderInvParticipantsList(await res.json(), eventId);
  } catch {
    container.innerHTML = `<p class="text-danger small">Errore durante il caricamento.</p>`;
  }
}

function renderInvParticipantsList(subs, eventId) {
  const container = document.getElementById('invParticipantsList');
  const myId      = savedOwnerId();

  if (!subs.length) {
    container.innerHTML = `<p class="text-muted fst-italic text-center py-2">Nessun iscritto. Sii il primo!</p>`;
    return;
  }

  container.innerHTML = subs.map((sub) => {
    const owner = allOwnersInv.find((o) => String(o.id) === String(sub.quota_owner_id));
    const name  = owner ? `${owner.name} ${owner.surname}` : `Socio #${sub.quota_owner_id}`;
    const canDelete = String(sub.quota_owner_id) === String(myId);
    const extras = sub.participants.filter(Boolean);
    return `
      <div class="d-flex align-items-start justify-content-between border rounded p-2 mb-2">
        <div class="flex-grow-1 me-2">
          <strong>${escHtml(name)}</strong>
          ${extras.length ? `<span class="text-muted ms-2 small">${extras.map(p => escHtml(p)).join(', ')}</span>` : ''}
          ${sub.duration ? `<br><small class="text-muted"><i class="bi bi-clock me-1"></i>${escHtml(sub.duration)}</small>` : ''}
          ${sub.pranzo   ? `<br><small class="text-muted"><i class="bi bi-egg-fried me-1"></i>${escHtml(sub.pranzo)}</small>` : ''}
        </div>
        ${canDelete ? `<button type="button" class="btn btn-outline-danger btn-sm flex-shrink-0"
            data-delete-sub-id="${sub.id}" data-event-id="${eventId}" title="Elimina iscrizione">
          <i class="bi bi-trash" aria-hidden="true"></i>
        </button>` : ''}
      </div>`;
  }).join('');
}

async function deleteInvSubscription(subId, eventId) {
  try {
    const res = await apiFetch(`/api/involvement/${subId}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error();
    showToast('Iscrizione eliminata.', 'success');
    await refreshInvParticipantsList(eventId);
    await refreshInvCalendar();
  } catch {
    showToast("Errore durante l'eliminazione.", 'danger');
  }
}

async function refreshInvCalendar() {
  try {
    const res = await apiFetch('/api/events?type=inv');
    if (!res.ok) return;
    const events = await res.json();
    invCalendar?.removeAllEvents();
    events.forEach((ev) => invCalendar?.addEvent(eventToFC(ev)));
  } catch { /* ignore */ }
}

async function openSubscriptionModal(ev) {
  selectedEvent = ev;
  document.getElementById('subEventId').value       = ev.id;
  document.getElementById('subEventInfo').textContent = `${formatDateIT(ev.date)}  —  ${ev.description}`;
  showInvListPanel();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('subscriptionModal')).show();
  await refreshInvParticipantsList(ev.id);
}

function clearSubForm() {
  document.getElementById('subscriptionForm').reset();
  // Restore owner selection from cookie
  ownerPickerInv?.setValue(savedOwnerId());
  // Reset participants list to one empty row
  const list = document.getElementById('participantsList');
  list.innerHTML = '';
  addParticipantRow();
  document.getElementById('subDuration').value = '';
  document.getElementById('subPranzo').value   = '';
}

function addParticipantRow() {
  document.getElementById('participantsList').insertAdjacentHTML('beforeend', `
    <div class="input-group mb-2 participant-row">
      <input type="text" class="form-control participant-name" maxlength="256"
             placeholder="Nome e cognome partecipante" required>
      <button type="button" class="btn btn-outline-danger remove-participant"
              title="Rimuovi" aria-label="Rimuovi partecipante">
        <i class="bi bi-dash" aria-hidden="true"></i>
      </button>
    </div>`);
}

async function saveSubscription() {
  const ownerId = document.getElementById('subQuotaOwner').value;
  if (!ownerId) { showToast('Seleziona prima il tuo nome.', 'warning'); return; }

  const participantInputs = document.querySelectorAll('.participant-name');
  const participants = [...participantInputs].map((i) => i.value.trim()).filter(Boolean);

  const body = {
    event_id:       Number(document.getElementById('subEventId').value),
    quota_owner_id: Number(ownerId),
    participants,
    duration: document.getElementById('subDuration').value.trim() || null,
    pranzo:   document.getElementById('subPranzo').value.trim()   || null,
  };

  try {
    const res = await apiFetch('/api/involvement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? 'Errore durante il salvataggio.');
    }
    showToast('Iscrizione salvata con successo!', 'success');
    showInvListPanel();
    if (selectedEvent) {
      await refreshInvParticipantsList(selectedEvent.id);
      await refreshInvCalendar();
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

// Participants list: show form panel
document.getElementById('partecipaBtnInv').addEventListener('click', showInvFormPanel);

// Form panel: back to list
document.getElementById('backToInvListBtn').addEventListener('click', async () => {
  showInvListPanel();
  if (selectedEvent) await refreshInvParticipantsList(selectedEvent.id);
});

// Participants list: delete subscription (own only — button only rendered for own rows)
document.getElementById('invParticipantsList').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-delete-sub-id]');
  if (!btn) return;
  deleteInvSubscription(btn.dataset.deleteSubId, btn.dataset.eventId);
});

// Form: add / remove extra participant rows
document.getElementById('addParticipantBtn').addEventListener('click', addParticipantRow);
document.getElementById('participantsList').addEventListener('click', (e) => {
  if (e.target.closest('.remove-participant')) e.target.closest('.participant-row')?.remove();
});

document.getElementById('clearSubFormBtn').addEventListener('click',  clearSubForm);
document.getElementById('saveSubBtn').addEventListener('click',        saveSubscription);

// ── Initialise ────────────────────────────────────────────────────────────────

document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) =>
  bootstrap.Tooltip.getOrCreateInstance(el)
);

await loadOwners();
await loadAndRenderCalendar();
