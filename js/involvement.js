/**
 * involvement.js — logic for the /involvement page.
 * Shows involvement events; clicking opens a subscription form.
 */

import { API_BASE_URL } from './config.js';
import { showToast }    from './layout.js';

// ── State ─────────────────────────────────────────────────────────────────────
let selectedEvent = null; // extendedProps of the clicked FullCalendar event

// ── Cookie helper ─────────────────────────────────────────────────────────────
function savedOwnerId() {
  const m = document.cookie.split('; ').find((r) => r.startsWith('csa_account_id='));
  return m ? decodeURIComponent(m.split('=')[1]) : null;
}

// ── Load quota owners into subscription modal select ─────────────────────────
async function loadOwners() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/quota-owners`);
    if (!res.ok) return;
    const owners = await res.json();
    const sel    = document.getElementById('subQuotaOwner');
    owners.forEach((o) => {
      const opt = document.createElement('option');
      opt.value       = o.id;
      opt.textContent = `${o.name} ${o.surname}`;
      sel.appendChild(opt);
    });
    const saved = savedOwnerId();
    if (saved && owners.some((o) => String(o.id) === saved)) {
      sel.value = saved;
    }
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
    const res = await fetch(`${API_BASE_URL}/api/events?type=inv`);
    if (!res.ok) throw new Error();
    const events = await res.json();
    const calendar = new FullCalendar.Calendar(document.getElementById('involvementCalendar'), {
      initialView: 'listMonth',
      headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
      noEventsContent: 'Nessuna attività programmata',
      events: events.map(eventToFC),
      eventClick: (info) => openSubscriptionModal(info.event.extendedProps),
    });
    calendar.render();
  } catch {
    showToast('Impossibile caricare gli eventi. Il backend è in esecuzione?', 'warning');
  }
}

// ── Subscription modal ────────────────────────────────────────────────────────

function openSubscriptionModal(ev) {
  selectedEvent = ev;
  document.getElementById('subEventId').value   = ev.id;
  document.getElementById('subEventInfo').textContent =
    `${ev.date}  —  ${ev.description}`;
  clearSubForm();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('subscriptionModal')).show();
}

function clearSubForm() {
  document.getElementById('subscriptionForm').reset();
  // Restore owner selection from cookie
  const saved = savedOwnerId();
  if (saved) document.getElementById('subQuotaOwner').value = saved;
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

// Event delegation for remove-participant buttons
document.getElementById('participantsList').addEventListener('click', (e) => {
  const btn = e.target.closest('.remove-participant');
  if (!btn) return;
  const rows = document.querySelectorAll('.participant-row');
  if (rows.length === 1) { showToast('Almeno un partecipante è obbligatorio.', 'warning'); return; }
  btn.closest('.participant-row')?.remove();
});

async function saveSubscription() {
  const ownerId = document.getElementById('subQuotaOwner').value;
  if (!ownerId) { showToast('Seleziona prima il tuo nome.', 'warning'); return; }

  const participantInputs = document.querySelectorAll('.participant-name');
  const participants = [...participantInputs].map((i) => i.value.trim()).filter(Boolean);
  if (!participants.length) { showToast('Inserisci almeno un partecipante.', 'warning'); return; }

  const body = {
    event_id:       Number(document.getElementById('subEventId').value),
    quota_owner_id: Number(ownerId),
    participants,
    duration: document.getElementById('subDuration').value.trim() || null,
    pranzo:   document.getElementById('subPranzo').value.trim()   || null,
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/involvement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? 'Errore durante il salvataggio.');
    }
    bootstrap.Modal.getInstance(document.getElementById('subscriptionModal'))?.hide();
    showToast('Iscrizione salvata con successo!');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.getElementById('addParticipantBtn').addEventListener('click',  addParticipantRow);
document.getElementById('clearSubFormBtn').addEventListener('click',    clearSubForm);
document.getElementById('saveSubBtn').addEventListener('click',         saveSubscription);

// ── Initialise ────────────────────────────────────────────────────────────────

document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) =>
  bootstrap.Tooltip.getOrCreateInstance(el)
);

await loadOwners();
await loadAndRenderCalendar();
