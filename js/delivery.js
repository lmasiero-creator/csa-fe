/**
 * delivery.js — logic for the /delivery page.
 * Shows delivery events; clicking opens a change-request form
 * (disabled if the deadline for that delivery has passed).
 */

import { API_BASE_URL }    from './config.js';
import { showToast }       from './layout.js';
import { initOwnerPicker } from './owner-picker.js';

// ── Cookie helper ─────────────────────────────────────────────────────────────
function savedOwnerId() {
  const m = document.cookie.split('; ').find((r) => r.startsWith('csa_account_id='));
  return m ? decodeURIComponent(m.split('=')[1]) : null;
}
// ── State ─────────────────────────────────────────────────────────────────────
let ownerPickerDel = null; // reference to the picker API
// ── Deadline helper ───────────────────────────────────────────────────────────
/**
 * Returns true when the deadline date is strictly before today (midnight local time).
 * @param {string|null} deadline  ISO date string e.g. "2026-04-05"
 */
function isDeadlinePassed(deadline) {
  if (!deadline) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(deadline) < today;
}

// ── Load quota owners ─────────────────────────────────────────────────────────
async function loadOwners() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/quota-owners`);
    if (!res.ok) return;
    const owners = await res.json();
    ownerPickerDel = initOwnerPicker('deliveryQuotaOwnerPicker', owners, {
      hiddenId:   'deliveryQuotaOwner',
      selectedId: savedOwnerId(),
    });
  } catch { /* backend not available */ }
}

// ── FullCalendar ──────────────────────────────────────────────────────────────

const DELIVERY_LABELS = { prt: 'Portello', arc: 'Arcella', mrn: 'Mirano' };

function eventToFC(ev) {
  const expired = isDeadlinePassed(ev.deadline);
  const label   = DELIVERY_LABELS[ev.delivery_point] ?? '';
  return {
    id:              String(ev.id),
    title:           label ? `${ev.description} (${label})` : ev.description,
    start:           ev.date,
    backgroundColor: expired ? '#6c757d' : '#0d6efd',
    borderColor:     expired ? '#565e64' : '#0a58ca',
    classNames:      expired ? ['fc-event-expired'] : [],
    extendedProps:   { ...ev, expired },
  };
}

async function loadAndRenderCalendar() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/events?type=del`);
    if (!res.ok) throw new Error();
    const events = await res.json();

    const calendar = new FullCalendar.Calendar(document.getElementById('deliveryCalendar'), {
      initialView: 'listMonth',
      headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
      noEventsContent: 'Nessuna distribuzione programmata',
      events: events.map(eventToFC),
      eventClick: (info) => {
        const ev = info.event.extendedProps;
        if (ev.expired) {
          showToast('Il termine per le modifiche è scaduto per questa distribuzione.', 'warning');
          return;
        }
        openDeliveryModal(ev);
      },
    });
    calendar.render();
  } catch {
    showToast('Impossibile caricare le distribuzioni. Il backend è in esecuzione?', 'warning');
  }
}

// ── Delivery change modal ─────────────────────────────────────────────────────

function openDeliveryModal(ev) {
  document.getElementById('deliveryEventId').value  = ev.id;
  document.getElementById('deliveryDate').value     = ev.date;
  document.getElementById('deliveryPoint').value    = ''; // reset
  document.getElementById('deliveryDescription').value = '';
  // Pre-select saved owner
  ownerPickerDel?.setValue(savedOwnerId());
  bootstrap.Modal.getOrCreateInstance(document.getElementById('deliveryModal')).show();
}

function clearDeliveryForm() {
  document.getElementById('deliveryForm').reset();
  document.getElementById('deliveryDate').value = '';
  document.getElementById('deliveryEventId').value = '';
  ownerPickerDel?.setValue(savedOwnerId());
}

async function saveDeliveryChange() {
  const ownerId      = document.getElementById('deliveryQuotaOwner').value;
  const eventId      = document.getElementById('deliveryEventId').value;

  if (!ownerId)    { showToast('Seleziona il tuo nome.',             'warning'); return; }

  const body = {
    event_id:          Number(eventId),
    quota_owner_id:    Number(ownerId),
    new_delivery_point: delivPoint,
    description:       document.getElementById('deliveryDescription').value.trim() || null,
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/delivery-changes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? 'Errore durante il salvataggio.');
    }
    bootstrap.Modal.getInstance(document.getElementById('deliveryModal'))?.hide();
    showToast('Variazione comunicata con successo!');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.getElementById('clearDeliveryFormBtn').addEventListener('click', clearDeliveryForm);
document.getElementById('saveDeliveryBtn').addEventListener('click',      saveDeliveryChange);

// ── Initialise ────────────────────────────────────────────────────────────────

document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) =>
  bootstrap.Tooltip.getOrCreateInstance(el)
);

await loadOwners();
await loadAndRenderCalendar();
