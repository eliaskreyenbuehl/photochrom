// Work list with a checkbox per row. Only the rows in view are in the DOM
// (virtual scrolling), so 9,610 records stay fast.

import { dateLabel, escapeHtml, imageUrl } from '../../lib/catalog.js';
import { isSelected, setSelected } from '../../state.js';

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
      <span class="col-check"><span class="visually-hidden">Main image</span></span>
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

  spacer.addEventListener('change', (e) => {
    const box = e.target.closest('input[type=checkbox][data-id]');
    if (box) setSelected(box.dataset.id, box.checked);
  });
  spacer.addEventListener('click', (e) => {
    if (e.target.closest('input, a, label')) return;
    const row = e.target.closest('[data-row]');
    if (row) onOpen(rows[Number(row.dataset.row)]);
  });
  spacer.addEventListener('keydown', (e) => {
    const row = e.target.closest('[data-row]');
    if (row && (e.key === 'Enter' || e.key === ' ') && e.target === row) {
      e.preventDefault();
      onOpen(rows[Number(row.dataset.row)]);
    }
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
    const checked = isSelected(r.id) ? 'checked' : '';
    const source = [
      r.iiif ? '<span class="badge iiif" title="Recatalogued, IIIF image">IIIF</span>' : '<span class="badge legacy" title="Legacy record, no IIIF">legacy</span>',
      r.art ? `<span class="badge art" title="Reproduces a painting (match: ${escapeHtml(r.art)})">painting</span>` : '',
    ].join('');
    return `
      <div class="ml-row${checked ? ' selected' : ''}" data-row="${i}" tabindex="0" style="top:${i * ROW_H}px">
        <label class="col-check"><input type="checkbox" data-id="${r.id}" ${checked}><span class="visually-hidden">Use as main image: ${escapeHtml(r.t)}</span></label>
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
      // Update in place so the focused checkbox keeps focus.
      for (const box of spacer.querySelectorAll('input[data-id]')) {
        box.checked = isSelected(box.dataset.id);
        box.closest('.ml-row').classList.toggle('selected', box.checked);
      }
    },
    get rows() { return rows; },
  };
}
