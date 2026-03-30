/**
 * owner-picker.js — reusable searchable quota-owner picker.
 *
 * Replaces a `<div id="...">` placeholder with:
 *   - a visible text input for search/display
 *   - a dropdown list that filters by name or surname as the user types
 *   - a hidden input that holds the selected quota_owner_id
 *
 * Usage:
 *   const picker = initOwnerPicker('myPickerDiv', owners, {
 *     hiddenId:   'myHiddenInput',   // id of the hidden <input> created inside
 *     selectedId: '3',               // pre-select this id (optional)
 *     onSelect:   (owner) => {},     // called with full owner object on selection (optional)
 *   });
 *
 *   picker.getValue()    // returns the currently selected id string
 *   picker.setValue(id)  // programmatically select an owner by id
 */

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * @param {string}  wrapperId   id of the mount-point div
 * @param {Array}   owners      [{ id, name, surname, ... }]
 * @param {object}  options
 * @param {string}  options.hiddenId    id to assign to the hidden value input
 * @param {string}  [options.selectedId] pre-selected owner id
 * @param {Function}[options.onSelect]  called with the selected owner object
 * @returns {{ getValue: () => string, setValue: (id: string|number) => void }}
 */
export function initOwnerPicker(wrapperId, owners, { hiddenId, selectedId = null, onSelect = null } = {}) {
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return { getValue: () => '', setValue: () => {} };

  const searchId = `${wrapperId}-search`;

  wrapper.innerHTML = `
    <div class="position-relative">
      <input type="text"
             id="${searchId}"
             class="form-control owner-picker-input"
             placeholder="Cerca nome o cognome…"
             autocomplete="off"
             spellcheck="false"
             aria-haspopup="listbox"
             aria-expanded="false"
             aria-autocomplete="list">
      <ul class="list-group owner-picker-list position-absolute w-100 d-none shadow-sm"
          role="listbox"
          style="z-index:1055;max-height:220px;overflow-y:auto;top:100%;left:0">
      </ul>
      <input type="hidden" id="${hiddenId}" name="${hiddenId}">
    </div>`;

  const textInput   = wrapper.querySelector('.owner-picker-input');
  const list        = wrapper.querySelector('.owner-picker-list');
  const hiddenInput = wrapper.querySelector(`#${hiddenId}`);

  // ── Render filtered list ──────────────────────────────────────────────────

  function renderList(filter = '') {
    const lc       = filter.trim().toLowerCase();
    const filtered = lc
      ? owners.filter((o) =>
          o.name.toLowerCase().includes(lc) || o.surname.toLowerCase().includes(lc))
      : owners;

    if (!filtered.length) {
      list.innerHTML = '<li class="list-group-item text-muted fst-italic">Nessun risultato</li>';
    } else {
      list.innerHTML = filtered.map((o) => {
        const label = `${escHtml(o.name)} ${escHtml(o.surname)}`;
        const isSelected = String(o.id) === hiddenInput.value;
        return `<li class="list-group-item list-group-item-action py-2${isSelected ? ' active' : ''}"
                    role="option"
                    aria-selected="${isSelected}"
                    data-id="${o.id}"
                    data-name="${escHtml(o.name)}"
                    data-surname="${escHtml(o.surname)}"
                    style="cursor:pointer">${label}</li>`;
      }).join('');
    }

    list.classList.remove('d-none');
    textInput.setAttribute('aria-expanded', 'true');
  }

  // ── Select an owner ───────────────────────────────────────────────────────

  function selectOwner(owner) {
    hiddenInput.value        = String(owner.id);
    textInput.value          = `${owner.name} ${owner.surname}`.trim();
    textInput.setAttribute('aria-expanded', 'false');
    list.classList.add('d-none');
    if (onSelect) onSelect(owner);
  }

  // ── Pre-select ────────────────────────────────────────────────────────────

  if (selectedId) {
    const found = owners.find((o) => String(o.id) === String(selectedId));
    if (found) selectOwner(found);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  textInput.addEventListener('input', () => renderList(textInput.value));

  textInput.addEventListener('focus', () => renderList(textInput.value));

  // Use mousedown (fires before blur) so the selection registers before the list hides
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    e.preventDefault();
    const owner = owners.find((o) => String(o.id) === li.dataset.id);
    if (owner) selectOwner(owner);
  });

  // Hide list when focus leaves the widget
  textInput.addEventListener('blur', () => {
    // Small delay so mousedown on a list item registers first
    setTimeout(() => list.classList.add('d-none'), 180);
  });

  // Keyboard navigation
  textInput.addEventListener('keydown', (e) => {
    const items = [...list.querySelectorAll('li[data-id]')];
    const active = list.querySelector('li.active');
    const idx    = items.indexOf(active);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (list.classList.contains('d-none')) { renderList(textInput.value); return; }
      active?.classList.remove('active');
      const next = items[Math.min(idx + 1, items.length - 1)];
      next?.classList.add('active');
      next?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active?.classList.remove('active');
      const prev = items[Math.max(idx - 1, 0)];
      prev?.classList.add('active');
      prev?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      const highlighted = list.querySelector('li.active');
      if (highlighted) {
        e.preventDefault();
        const owner = owners.find((o) => String(o.id) === highlighted.dataset.id);
        if (owner) selectOwner(owner);
      }
    } else if (e.key === 'Escape') {
      list.classList.add('d-none');
      textInput.setAttribute('aria-expanded', 'false');
    }
  });

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    getValue: () => hiddenInput.value,
    setValue: (id) => {
      if (!id) {
        hiddenInput.value = '';
        textInput.value   = '';
        return;
      }
      const found = owners.find((o) => String(o.id) === String(id));
      if (found) selectOwner(found);
    },
  };
}
