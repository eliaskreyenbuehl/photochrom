// Work list with a checkbox per row. Only the rows in view are in the DOM
// (virtual scrolling), so 9,610 records stay fast.

import { dateLabel, escapeHtml, imageUrl } from '../../lib/catalog.js';
import { isSelected, setSelected } from '../../state.js';
import { bindSelectAndOpen } from '../../lib/ui/select-open.js';

const ROW_H = 64;
const OVERSCAN = 6;

const COLUMNS = [
  { key: 'title', label: 'Title', sort: (r) => r.t.toLowerCase() },
  { key: 'date', label: 'Date', sort: (r) => (r.y0 == null || r.df === 'suspect' ? 99999 : r.y0 * 10 + Math.min(9, r.y1 - r.y0)) },
  { key: 'place', label: 'Place', sort: (r) => (r.p || '￿').toLowerCase() },
  { key: 'genre', label: 'Genre', sort: (r) => r.g || '￿' },
];

export function createList(container, { genres, onOpen }) {
  container.innerHTML = `
    <div class="ml-list-head" role="row">
      <span class="col-check"><span class="visually-hidden">Selected</span></span>
      <span class="col-img"></span>
      ${COLUMNS.map((c) => `<button type="button" class="col-${c.key} sort" data-sort="${c.key}">${c.label}<span class="sort-mark" aria-hidden="true"></span></button>`).join('')}
      <span class="col-source">Source</span>
    </div>
    <div class="ml-list-scroll" tabindex="-1">
      <div class="ml-list-spacer"></div>
    </div>
    <p class="ml-empty" hidden>No records match these filters.</p>
  `;
  const scroll = container.querySelector('.ml-list-scroll');
  const spacer = container.querySelector('.ml-list-spacer');
  const empty = container.querySelector('.ml-empty');

  let rows = [];
  let sortKey = 'date';
  let sortDir = 1;
  let rendered = '';

  container.querySelector('.ml-list-head').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    if (sortKey === btn.dataset.sort) sortDir = -sortDir;
    else { sortKey = btn.dataset.sort; sortDir = 1; }
    applySort();
    scroll.scrollTop = 0;
    render(true);
  });

  // Click: select; double-click or Enter: details.
  bindSelectAndOpen(spacer, {
    item: (el) => el.closest('[data-row]'),
    toggle: (row) => {
      const r = rows[Number(row.dataset.row)];
      setSelected(r.id, !isSelected(r.id));
    },
    open: (row) => onOpen(rows, Number(row.dataset.row)),
  });
  scroll.addEventListener('scroll', () => render(), { passive: true });
  new ResizeObserver(() => render(true)).observe(scroll);

  function applySort() {
    const col = COLUMNS.find((c) => c.key === sortKey);
    const keyed = rows.map((r) => [col.sort(r), r]);
    keyed.sort((a, b) => (a[0] < b[0] ? -sortDir : a[0] > b[0] ? sortDir : 0));
    rows = keyed.map((k) => k[1]);
    for (const btn of container.querySelectorAll('[data-sort]')) {
      const active = btn.dataset.sort === sortKey;
      btn.setAttribute('aria-sort', active ? (sortDir > 0 ? 'ascending' : 'descending') : 'none');
      btn.querySelector('.sort-mark').textContent = active ? (sortDir > 0 ? ' ▲' : ' ▼') : '';
    }
  }

  function rowHtml(r, i) {
    const img = imageUrl(r, 120);
    const sel = isSelected(r.id);
    const source = [
      r.iiif ? '<span class="badge badge-accent" title="Recatalogued, IIIF image">IIIF</span>' : '<span class="badge" title="Legacy record, 2K scan, no IIIF">legacy</span>',
      r.art ? `<span class="badge badge-art" title="Reproduces a painting (match: ${escapeHtml(r.art)}, machine-made)">painting</span>` : '',
    ].join('');
    return `
      <div class="ml-row${sel ? ' selected' : ''}" data-row="${i}" tabindex="0" role="checkbox" aria-checked="${sel}" aria-label="${escapeHtml(r.t)}" style="top:${i * ROW_H}px">
        <span class="col-check"><span class="check-box" aria-hidden="true"></span></span>
        <span class="col-img">${img ? `<img src="${img}" alt="" loading="lazy" decoding="async">` : '<span class="no-img" title="No online image yet">–</span>'}</span>
        <span class="col-title" title="${escapeHtml(r.t)}">${escapeHtml(r.t)}</span>
        <span class="col-date">${escapeHtml(dateLabel(r))}</span>
        <span class="col-place" title="${escapeHtml(r.p)}">${escapeHtml(r.p || '–')}</span>
        <span class="col-genre">${escapeHtml(genres[r.g] || '–')}</span>
        <span class="col-source">${source}</span>
      </div>`;
  }

  function render(force = false) {
    spacer.style.height = `${rows.length * ROW_H}px`;
    empty.hidden = rows.length > 0;
    const first = Math.max(0, Math.floor(scroll.scrollTop / ROW_H) - OVERSCAN);
    const last = Math.min(rows.length, Math.ceil((scroll.scrollTop + scroll.clientHeight) / ROW_H) + OVERSCAN);
    const key = `${first}-${last}`;
    if (!force && key === rendered) return;
    rendered = key;
    let html = '';
    for (let i = first; i < last; i++) html += rowHtml(rows[i], i);
    spacer.innerHTML = html;
  }

  return {
    update(records) {
      rows = records.slice();
      applySort();
      render(true);
    },
    /** Re-renders checkboxes after the selection changed elsewhere. */
    refresh() {
      // Update in place so the focused row keeps focus.
      for (const row of spacer.querySelectorAll('[data-row]')) {
        const sel = isSelected(rows[Number(row.dataset.row)].id);
        row.classList.toggle('selected', sel);
        row.setAttribute('aria-checked', String(sel));
      }
    },
    /** Called when the view becomes visible (sizes were 0 while hidden). */
    show() { render(true); },
    get rows() { return rows; },
  };
}
