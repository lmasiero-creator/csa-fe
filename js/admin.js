/**
 * admin.js — logic for the /admin page.
 * Manages three tabs: Soci (quota owners), Calendario (events), Destinatari (recipients).
 */

import { API_BASE_URL } from './config.js';
import { showToast }    from './layout.js';

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

// ── Shared helpers ────────────────────────────────────────────────────────────

function savedOwnerId() {
  const m = document.cookie.split('; ').find((r) => r.startsWith('csa_account_id='));
  return m ? decodeURIComponent(m.split('=')[1]) : null;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, options);
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
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Nessun socio registrato.</td></tr>';
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
  document.getElementById('ownerModalTitle').textContent = owner ? 'Modifica socio' : 'Aggiungi socio';
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
    showToast(isEdit ? 'Socio aggiornato.' : 'Socio aggiunto.');
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
    dateClick: (info) => openEventModal({ date: info.dateStr }),
    eventClick: (info) => openEventModal(info.event.extendedProps),
  });
  calendarInstance.render();
  loadCalendarEvents();
}

function openEventModal(ev = {}) {
  document.getElementById('eventEditId').value           = ev.id ?? '';
  document.getElementById('eventDate').value             = ev.date ?? '';
  document.getElementById('eventType').value             = ev.type ?? '';
  document.getElementById('eventDescription').value      = ev.description ?? '';
  document.getElementById('eventDeliveryPoint').value    = ev.delivery_point ?? '';
  document.getElementById('eventDeadline').value         = ev.deadline ?? '';
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
  const description = document.getElementById('eventDescription').value.trim();
  if (!date || !type || !description) {
    showToast('Data, tipo e descrizione sono obbligatori.', 'warning'); return;
  }
  const body = {
    date, type, description,
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

// Load Soci tab data immediately (it's the default active tab)
loadOwners().catch((err) => showToast(err.message, 'danger'));
