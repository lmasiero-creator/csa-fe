/**
 * admin.js — logic for the /admin page.
 * Manages three tabs: Membri (quota owners), Calendario (events), Destinatari (recipients).
 */

import { API_BASE_URL, apiFetch as apiFetchRaw } from './config.js';
import { showToast }       from './layout.js';
import { initOwnerPicker } from './owner-picker.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const QUOTA_LABELS     = { quota_intera: 'Quota intera', mezza_quota: 'Mezza quota' };
const DELIVERY_LABELS  = { prt: 'Picchetto (Portello)', arc: 'Pedro (Arcella)', mrn: 'Mirano' };
const EVENT_TYPE_COLORS = {
  inv: { bg: null, border: null }, // dynamic — set per event
  del: { bg: '#0d6efd', border: '#0a58ca' },
  evt: { bg: '#fd7e14', border: '#d96000' },
};

// ── State ─────────────────────────────────────────────────────────────────────
let calendarInstance  = null;
let calendarLoaded    = false;
let allEvents         = [];
let currentFilter     = 'all';
// Admin involvement modal state
let allOwnersAdm     = [];   // cached owners for the admin inv modal name lookup
let ownerPickerAdm   = null; // picker API reference
let selectedAdmEvent = null; // extendedProps of the clicked inv event

// ── Shared helpers ────────────────────────────────────────────────────────────

function savedOwnerId() {
  const m = document.cookie.split('; ').find((r) => r.startsWith('csa_account_id='));
  return m ? decodeURIComponent(m.split('=')[1]) : null;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const res = await apiFetchRaw(path, options);
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.message ?? `Errore ${res.status}`);
  }
  return options.method === 'DELETE' ? null : res.json();
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: SOCI (Quota owners)
// ══════════════════════════════════════════════════════════════════════════════

async function loadOwners() {
  const owners = await apiFetch('/api/quota-owners');
  renderOwnersTable(owners);
}

function renderOwnersTable(owners) {
  const tbody = document.getElementById('ownersTbody');
  if (!owners.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Nessun membro registrato.</td></tr>';
    return;
  }
  tbody.innerHTML = owners.map((o) => `
    <tr>
      <td>${escHtml(o.name)} ${escHtml(o.surname)}</td>
      <td>${QUOTA_LABELS[o.quota] ?? o.quota}</td>
      <td><a href="mailto:${escHtml(o.email)}">${escHtml(o.email)}</a></td>
      <td>${escHtml(o.phone_prefix)} ${escHtml(o.phone)}</td>
      <td>
        <button class="btn btn-sm btn-outline-secondary"
                data-action="edit-owner" data-id="${o.id}" title="Modifica">
          <i class="bi bi-pencil" aria-hidden="true"></i>
        </button>
      </td>
    </tr>`).join('');
}

function openOwnerModal(owner = null) {
  document.getElementById('ownerEditId').value   = owner?.id ?? '';
  document.getElementById('ownerName').value      = owner?.name ?? '';
  document.getElementById('ownerSurname').value   = owner?.surname ?? '';
  document.getElementById('ownerQuota').value     = owner?.quota ?? '';
  document.getElementById('ownerEmail').value     = owner?.email ?? '';
  document.getElementById('ownerPhonePrefix').value = owner?.phone_prefix ?? '+39';
  document.getElementById('ownerPhone').value     = owner?.phone ?? '';
  document.getElementById('ownerModalTitle').textContent = owner ? 'Modifica membro' : 'Aggiungi membro';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('ownerModal')).show();
}

function clearOwnerForm() {
  document.getElementById('ownerEditId').value = '';
  document.getElementById('ownerForm').reset();
  document.getElementById('ownerQuota').value = '';
  document.getElementById('ownerPhonePrefix').value = '+39';
}

async function saveOwner() {
  const name   = document.getElementById('ownerName').value.trim();
  const surname = document.getElementById('ownerSurname').value.trim();
  if (!name || !surname) {
    showToast('Nome e cognome sono obbligatori.', 'warning'); return;
  }
  const email = document.getElementById('ownerEmail').value.trim();
  const quota = document.getElementById('ownerQuota').value;
  if (!quota) { showToast('Seleziona la quota.', 'warning'); return; }
  if (!email) { showToast("L'email è obbligatoria.", 'warning'); return; }

  const body    = { name, surname, quota, email,
                    phone_prefix: document.getElementById('ownerPhonePrefix').value,
                    phone: document.getElementById('ownerPhone').value.trim() };
  const editId  = document.getElementById('ownerEditId').value;
  const isEdit  = !!editId;

  try {
    await apiFetch(isEdit ? `/api/quota-owners/${editId}` : '/api/quota-owners', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    bootstrap.Modal.getInstance(document.getElementById('ownerModal'))?.hide();
    showToast(isEdit ? 'Membro aggiornato.' : 'Membro aggiunto.');
    loadOwners();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Delegation for pencil buttons
document.getElementById('ownersTbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action="edit-owner"]');
  if (!btn) return;
  try {
    const owner = await apiFetch(`/api/quota-owners/${btn.dataset.id}`);
    openOwnerModal(owner);
  } catch (err) {
    showToast(err.message, 'danger');
  }
});

document.getElementById('addOwnerBtn').addEventListener('click',      () => openOwnerModal());
document.getElementById('clearOwnerFormBtn').addEventListener('click', clearOwnerForm);
document.getElementById('saveOwnerBtn').addEventListener('click',      saveOwner);

// ══════════════════════════════════════════════════════════════════════════════
// TAB: CALENDARIO (Events)
// ══════════════════════════════════════════════════════════════════════════════

function eventToFC(ev) {
  let bg, border;
  if (ev.type === 'inv') {
    bg     = ev.participant_count > 0 ? '#198754' : '#dc3545';
    border = ev.participant_count > 0 ? '#146c43' : '#b02a37';
  } else {
    bg     = EVENT_TYPE_COLORS[ev.type].bg;
    border = EVENT_TYPE_COLORS[ev.type].border;
  }
  return {
    id: String(ev.id),
    title: ev.description,
    start: ev.date,
    allDay: true,
    backgroundColor: bg,
    borderColor: border,
    extendedProps: { ...ev },
  };
}

function applyCalendarFilter() {
  if (!calendarInstance) return;
  calendarInstance.removeAllEvents();
  const visible = currentFilter === 'all' ? allEvents : allEvents.filter((e) => e.type === currentFilter);
  visible.forEach((ev) => calendarInstance.addEvent(eventToFC(ev)));
}

async function loadCalendarEvents() {
  try {
    allEvents = await apiFetch('/api/events');
    applyCalendarFilter();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

function initCalendar() {
  if (calendarLoaded) return;
  calendarLoaded = true;

  calendarInstance = new FullCalendar.Calendar(document.getElementById('adminCalendar'), {
    initialView: 'listMonth',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
    noEventsContent: 'Nessun evento',
    events: [],
    eventDidMount: (info) => {
      new bootstrap.Tooltip(info.el, {
        title: info.event.title, placement: 'top', trigger: 'hover', container: 'body',
      });
    },
    dateClick: (info) => openEventModal({ date: info.dateStr }),
    eventClick: (info) => {
      const ev = allEvents.find((e) => String(e.id) === info.event.id);
      if (!ev) return;
      if (ev.type === 'inv') { openAdminInvModal(ev); } else { openEventModal(ev); }
    },
  });
  calendarInstance.render();
  loadCalendarEvents();
}

function toDateStr(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  const d = new Date(v);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}

function openEventModal(ev = {}) {
  document.getElementById('eventEditId').value           = ev.id ?? '';
  document.getElementById('eventDate').value             = toDateStr(ev.date);
  document.getElementById('eventType').value             = ev.type ?? '';
  document.getElementById('eventDescription').value      = ev.description ?? '';
  document.getElementById('eventDeliveryPoint').value    = ev.delivery_point ?? '';
  document.getElementById('eventDeadline').value         = toDateStr(ev.deadline);
  document.getElementById('eventModalTitle').textContent = ev.id ? 'Modifica evento' : 'Aggiungi evento';
  toggleDeliveryFields(ev.type === 'del');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('eventModal')).show();
}

function clearEventForm() {
  document.getElementById('eventEditId').value = '';
  document.getElementById('eventForm').reset();
  toggleDeliveryFields(false);
}

function toggleDeliveryFields(show) {
  document.getElementById('deliveryFields').classList.toggle('d-none', !show);
}

document.getElementById('eventType').addEventListener('change', (e) => {
  toggleDeliveryFields(e.target.value === 'del');
  // Auto-fill default deadline (date − 2 days) when type is delivery
  if (e.target.value === 'del') {
    const dateVal = document.getElementById('eventDate').value;
    if (dateVal && !document.getElementById('eventDeadline').value) {
      const d = new Date(dateVal);
      d.setDate(d.getDate() - 2);
      document.getElementById('eventDeadline').value = d.toISOString().split('T')[0];
    }
  }
});

document.getElementById('eventDate').addEventListener('change', () => {
  if (document.getElementById('eventType').value === 'del') {
    const d = new Date(document.getElementById('eventDate').value);
    d.setDate(d.getDate() - 2);
    document.getElementById('eventDeadline').value = d.toISOString().split('T')[0];
  }
});

async function saveEvent() {
  const date        = document.getElementById('eventDate').value;
  const type        = document.getElementById('eventType').value;
  if (!date || !type) {
    showToast('Data e Tipo sono obbligatori.', 'warning'); return;
  }
  const body = {
    date, type, description: document.getElementById('eventDescription').value || null,
    delivery_point: type === 'del' ? document.getElementById('eventDeliveryPoint').value || null : null,
    deadline:       type === 'del' ? document.getElementById('eventDeadline').value || null : null,
  };
  const editId = document.getElementById('eventEditId').value;
  const isEdit = !!editId;
  try {
    await apiFetch(isEdit ? `/api/events/${editId}` : '/api/events', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    bootstrap.Modal.getInstance(document.getElementById('eventModal'))?.hide();
    showToast(isEdit ? 'Evento aggiornato.' : 'Evento aggiunto.');
    loadCalendarEvents();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

document.getElementById('addEventBtn').addEventListener('click',      () => openEventModal());
document.getElementById('clearEventFormBtn').addEventListener('click', clearEventForm);
document.getElementById('saveEventBtn').addEventListener('click',      saveEvent);
document.getElementById('eventTypeFilter').addEventListener('change',  (e) => {
  currentFilter = e.target.value;
  applyCalendarFilter();
});

// Lazy calendar init on tab activation
document.getElementById('tab-calendario').addEventListener('shown.bs.tab', initCalendar);

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN INVOLVEMENT PARTICIPANTS MODAL
// ══════════════════════════════════════════════════════════════════════════════

function showAdminInvListPanel() {
  document.getElementById('adminInvListPanel').classList.remove('d-none');
  document.getElementById('adminInvFormPanel').classList.add('d-none');
  document.getElementById('adminInvListFooter').classList.remove('d-none');
  document.getElementById('adminInvFormFooter').classList.add('d-none');
}

function showAdminInvFormPanel() {
  document.getElementById('adminInvListPanel').classList.add('d-none');
  document.getElementById('adminInvFormPanel').classList.remove('d-none');
  document.getElementById('adminInvListFooter').classList.add('d-none');
  document.getElementById('adminInvFormFooter').classList.remove('d-none');
  clearAdminInvForm();
  // (Re-)init owner picker every time the form opens so it targets the correct DOM
  ownerPickerAdm = initOwnerPicker('adminInvQuotaOwnerPicker', allOwnersAdm, {
    hiddenId: 'adminInvQuotaOwner',
  });
}

function clearAdminInvForm() {
  document.getElementById('adminInvQuotaOwner').value  = '';
  document.getElementById('adminInvDuration').value    = '';
  document.getElementById('adminInvPranzo').value      = '';
  const list = document.getElementById('adminParticipantsList');
  list.innerHTML = '';
  addAdminParticipantRow();
}

function addAdminParticipantRow() {
  document.getElementById('adminParticipantsList').insertAdjacentHTML('beforeend', `
    <div class="input-group mb-2 participant-row">
      <input type="text" class="form-control participant-name" maxlength="256"
             placeholder="Nome e cognome partecipante">
      <button type="button" class="btn btn-outline-danger remove-participant"
              title="Rimuovi" tabindex="-1" aria-label="Rimuovi partecipante">
        <i class="bi bi-dash"></i>
      </button>
    </div>`);
}

async function openAdminInvModal(ev) {
  selectedAdmEvent = ev;
  document.getElementById('adminInvEventId').value       = ev.id;
  document.getElementById('adminInvEventInfo').textContent = `${ev.date}  —  ${ev.description}`;
  document.getElementById('adminInvModalTitle').textContent = `Partecipanti — ${ev.description}`;
  showAdminInvListPanel();
  // Lazy-load owners once
  if (!allOwnersAdm.length) {
    try { allOwnersAdm = await apiFetch('/api/quota-owners'); } catch { /* ignore */ }
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('adminInvModal')).show();
  await refreshAdminParticipantsList(ev.id);
}

async function refreshAdminParticipantsList(eventId) {
  const container = document.getElementById('adminInvParticipantsList');
  container.innerHTML = `
    <div class="text-center text-muted py-3">
      <div class="spinner-border spinner-border-sm" role="status"></div>
      <span class="ms-2">Caricamento…</span>
    </div>`;
  try {
    const subs = await apiFetch(`/api/involvement?event_id=${eventId}`);
    renderAdminParticipantsList(subs, eventId);
  } catch {
    container.innerHTML = `<p class="text-danger small">Errore durante il caricamento.</p>`;
  }
}

function renderAdminParticipantsList(subs, eventId) {
  const container = document.getElementById('adminInvParticipantsList');

  if (!subs.length) {
    container.innerHTML = `<p class="text-muted fst-italic text-center py-2">Nessun iscritto.</p>`;
    return;
  }

  container.innerHTML = subs.map((sub) => {
    const owner = allOwnersAdm.find((o) => String(o.id) === String(sub.quota_owner_id));
    const name  = owner ? `${owner.name} ${owner.surname}` : `Socio #${sub.quota_owner_id}`;
    const extras = sub.participants.filter(Boolean);
    return `
      <div class="d-flex align-items-start justify-content-between border rounded p-2 mb-2">
        <div class="flex-grow-1 me-2">
          <strong>${escHtml(name)}</strong>
          ${extras.length ? `<span class="text-muted ms-2 small">${extras.map(p => escHtml(p)).join(', ')}</span>` : ''}
          ${sub.duration ? `<br><small class="text-muted"><i class="bi bi-clock me-1"></i>${escHtml(sub.duration)}</small>` : ''}
          ${sub.pranzo   ? `<br><small class="text-muted"><i class="bi bi-egg-fried me-1"></i>${escHtml(sub.pranzo)}</small>` : ''}
        </div>
        <button type="button" class="btn btn-outline-danger btn-sm flex-shrink-0"
            data-delete-adm-sub-id="${sub.id}" data-event-id="${eventId}" title="Elimina iscrizione">
          <i class="bi bi-trash" aria-hidden="true"></i>
        </button>
      </div>`;
  }).join('');
}

async function deleteAdminSubscription(subId, eventId) {
  try {
    await apiFetch(`/api/involvement/${subId}`, { method: 'DELETE' });
    showToast('Iscrizione eliminata.', 'success');
    await refreshAdminParticipantsList(eventId);
    loadCalendarEvents(); // refresh colours on admin calendar
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function saveAdminSubscription() {
  const ownerId = document.getElementById('adminInvQuotaOwner').value;
  if (!ownerId) { showToast('Seleziona il partecipante.', 'warning'); return; }

  const eventId = document.getElementById('adminInvEventId').value;
  const participants = [...document.querySelectorAll('#adminParticipantsList .participant-name')]
    .map((i) => i.value.trim()).filter(Boolean);

  const body = {
    event_id:       Number(eventId),
    quota_owner_id: Number(ownerId),
    participants,
    duration: document.getElementById('adminInvDuration').value.trim() || null,
    pranzo:   document.getElementById('adminInvPranzo').value.trim()   || null,
  };

  try {
    await apiFetch('/api/involvement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    showToast('Iscrizione salvata.', 'success');
    showAdminInvListPanel();
    await refreshAdminParticipantsList(Number(eventId));
    loadCalendarEvents();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// Admin inv modal event listeners
document.getElementById('adminPartecipaBtnInv').addEventListener('click', showAdminInvFormPanel);
document.getElementById('adminBackToInvListBtn').addEventListener('click', async () => {
  showAdminInvListPanel();
  if (selectedAdmEvent) await refreshAdminParticipantsList(selectedAdmEvent.id);
});
document.getElementById('adminInvParticipantsList').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-delete-adm-sub-id]');
  if (!btn) return;
  deleteAdminSubscription(btn.dataset.deleteAdmSubId, btn.dataset.eventId);
});
document.getElementById('adminAddParticipantBtn').addEventListener('click', addAdminParticipantRow);
document.getElementById('adminParticipantsList').addEventListener('click', (e) => {
  if (e.target.closest('.remove-participant')) e.target.closest('.participant-row')?.remove();
});
document.getElementById('adminClearInvFormBtn').addEventListener('click', clearAdminInvForm);
document.getElementById('adminSaveInvBtn').addEventListener('click',      saveAdminSubscription);

// ══════════════════════════════════════════════════════════════════════════════
// TAB: DESTINATARI (Recipients)
// ══════════════════════════════════════════════════════════════════════════════

let recipients = [];

async function loadRecipients() {
  recipients = await apiFetch('/api/recipients');
  renderRecipients();
}

function renderRecipients() {
  const list = document.getElementById('recipientsList');
  if (!recipients.length) {
    list.innerHTML = '<p class="text-muted">Nessun destinatario. Usa il pulsante per aggiungerne uno.</p>';
    return;
  }
  list.innerHTML = recipients.map((r) => recipientRowHtml(r)).join('');
}

function recipientRowHtml(r = {}) {
  return `
    <div class="input-group mb-2 recipient-row" data-id="${r.id ?? ''}">
      <button type="button" class="btn btn-outline-danger" data-action="del-recipient" title="Elimina">
        <i class="bi bi-trash" aria-hidden="true"></i>
      </button>
      <select class="form-select rec-prefix" style="max-width:110px">
        ${['+39','+1','+44','+33','+49','+34','+41','+43']
          .map((p) => `<option${p === (r.phone_prefix ?? '+39') ? ' selected' : ''}>${p}</option>`)
          .join('')}
      </select>
      <input type="tel" class="form-control rec-phone" value="${escHtml(r.phone ?? '')}" placeholder="Cellulare">
      <input type="email" class="form-control rec-email" value="${escHtml(r.email ?? '')}" placeholder="Email">
    </div>`;
}

function addRecipientRow() {
  document.getElementById('recipientsList').insertAdjacentHTML('beforeend', recipientRowHtml());
}

document.getElementById('recipientsList').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action="del-recipient"]');
  if (!btn) return;
  const row  = btn.closest('.recipient-row');
  const id   = row?.dataset.id;
  if (id) {
    try { await apiFetch(`/api/recipients/${id}`, { method: 'DELETE' }); }
    catch (err) { showToast(err.message, 'danger'); return; }
  }
  row?.remove();
});

async function saveRecipients() {
  const rows = document.querySelectorAll('.recipient-row');
  const saves = [];
  for (const row of rows) {
    const email        = row.querySelector('.rec-email')?.value.trim();
    const phone_prefix = row.querySelector('.rec-prefix')?.value;
    const phone        = row.querySelector('.rec-phone')?.value.trim();
    if (!email) continue;
    const id = row.dataset.id || undefined;
    saves.push(apiFetch('/api/recipients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, email, phone_prefix, phone }),
    }));
  }
  try {
    await Promise.all(saves);
    showToast('Destinatari salvati.');
    loadRecipients();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

document.getElementById('addRecipientBtn').addEventListener('click',    addRecipientRow);
document.getElementById('saveRecipientsBtn').addEventListener('click',  saveRecipients);
document.getElementById('tab-destinatari').addEventListener('shown.bs.tab', () => {
  if (!recipients.length) loadRecipients();
});

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Initialise ────────────────────────────────────────────────────────────────

document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) =>
  bootstrap.Tooltip.getOrCreateInstance(el)
);

// Load Membri tab data immediately (it's the default active tab)
loadOwners().catch((err) => showToast(err.message, 'danger'));
