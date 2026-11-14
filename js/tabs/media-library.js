// Media Library tab: toolbar (date, search, view), filter facets in a sidebar and the whole
// collection as masonry mosaic or list.
// Checked rows become main images (left side) for the Candidates tab.
// Sub-modules live in js/tabs/media-library/.

import { escapeHtml, hasImage, loadCatalog } from '../lib/catalog.js';
import { loadPrintAreas } from '../lib/print-area.js';
import { showTab } from '../main.js';
import {
  addToSelection, clearSelection, getSelection, onSelectionChange, removeFromSelection,
} from '../state.js';
import { createDateFilter } from './media-library/date-filter.js';
import { createDetails } from './media-library/details.js';
import { exportCsv, exportJson, importFile } from './media-library/exchange.js';
import {
  GROUPS, SOURCES, emptyFilters, facetCounts, matches,
} from './media-library/filters.js';
import { createList } from './media-library/list.js';
import { createMosaic } from './media-library/mosaic.js';

const VIEW_KEY = 'photochrom.libraryView';
const FACETS_OPEN_KEY = 'photochrom.libraryFacetsOpen';
const fmt = (n) => n.toLocaleString('en-US');

const GROUP_LABELS = {
  genre: 'Genre', country: 'Country', feature: 'Image content', source: 'Source',
};
const GROUP_NOTES = {
  genre: 'machine-generated', feature: 'machine-generated, unreviewed',
};
// Values shown per group before "Show all"; active values are always shown.
const GROUP_SHOWN = { genre: 6, country: 8, feature: 8, source: Infinity };
// Groups that start collapsed (they open by themselves when one of their values is active).
const GROUP_CLOSED = new Set(['feature']);

function render(container) {
  container.innerHTML = `
    <div class="ml">
      <div class="ml-toolbar">
        <button type="button" class="ml-facets-btn" aria-controls="ml-facets" aria-expanded="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
          Filters <span class="ml-facets-n" hidden></span>
        </button>
        <p class="ml-summary" aria-live="polite">Loading catalog…</p>
        <div class="ml-date-wrap">
          <span class="ml-date-label">Date</span>
          <div class="ml-date"></div>
        </div>
        <label class="ml-search">
          <span class="visually-hidden">Search title, place, country or MMS ID</span>
          <input type="search" placeholder="Search title, place, country, MMS ID" disabled>
        </label>
        <div class="ml-view-toggle" role="group" aria-label="View">
          <button type="button" data-view="mosaic" aria-pressed="true">Mosaic</button>
          <button type="button" data-view="list" aria-pressed="false">List</button>
        </div>
      </div>

      <div class="ml-active" role="group" aria-label="Active filters" hidden></div>

      <div class="ml-body">
        <aside class="ml-facets" id="ml-facets" aria-label="Filters">
          ${GROUPS.map((g) => `
            <details class="ml-facet" data-group="${g}"${GROUP_CLOSED.has(g) ? '' : ' open'}>
              <summary>${GROUP_LABELS[g]}${GROUP_NOTES[g] ? ` <small>${GROUP_NOTES[g]}</small>` : ''}</summary>
              <div class="ml-facet-list" role="group" aria-label="${GROUP_LABELS[g]}"></div>
            </details>`).join('')}
        </aside>

        <section class="ml-works" aria-label="Works">
          <div class="ml-mosaic" data-pane="mosaic"></div>
          <div class="ml-list" data-pane="list" hidden></div>
        </section>
      </div>

      <div class="ml-selbar" role="region" aria-label="Selection">
        <span class="ml-selcount"></span>
        <button type="button" data-act="select-shown">Select all shown</button>
        <button type="button" data-act="deselect-shown">Deselect shown</button>
        <span class="sep" aria-hidden="true"></span>
        <button type="button" data-act="export-csv">Export CSV</button>
        <button type="button" data-act="export-json">Export JSON</button>
        <button type="button" data-act="import">Import…</button>
        <input type="file" accept=".json,.csv,.txt" hidden>
        <button type="button" data-act="clear">Clear</button>
        <span class="ml-selmsg" aria-live="polite"></span>
        <button type="button" class="primary" data-act="to-pairing">Open in Candidates →</button>
      </div>
    </div>
  `;

  loadCatalog()
    .then((catalog) => init(container, catalog))
    .catch((err) => {
      container.querySelector('.ml-summary').textContent = `Could not load the catalog (${err.message}). `
        + 'If you opened index.html as a file, serve the folder instead: python -m http.server';
    });
}

function init(container, catalog) {
  const { records } = catalog;
  const f = emptyFilters();
  const $ = (sel) => container.querySelector(sel);

  const dateFilter = createDateFilter($('.ml-date'), {
    domain: catalog.years,
    onChange({ years, exactOnly }) { f.years = years; f.exactOnly = exactOnly; apply(); },
  });
  const details = createDetails(container.querySelector('.ml'), catalog);
  const open = (r) => details.open(r);
  const list = createList($('.ml-list'), { genres: catalog.genres, onOpen: open });
  const mosaic = createMosaic($('.ml-mosaic'), { onOpen: open });
  loadPrintAreas()
    .then((areas) => mosaic.setPrintAreas(areas))
    .catch((err) => console.warn('No print areas, mosaic shows whole scans:', err));

  // --- view toggle (remembered per browser) ---
  let view = 'mosaic';
  try { if (localStorage.getItem(VIEW_KEY) === 'list') view = 'list'; } catch { /* no storage */ }
  function setView(v) {
    view = v;
    for (const btn of container.querySelectorAll('[data-view]')) btn.setAttribute('aria-pressed', String(btn.dataset.view === v));
    for (const pane of container.querySelectorAll('[data-pane]')) pane.hidden = pane.dataset.pane !== v;
    (v === 'mosaic' ? mosaic : list).show();
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* no storage */ }
  }
  $('.ml-view-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (btn) setView(btn.dataset.view);
  });

  // --- sidebar shown or hidden (remembered per browser) ---
  const facets = $('.ml-facets');
  const facetsBtn = $('.ml-facets-btn');
  function setFacetsOpen(isOpen) {
    facets.hidden = !isOpen;
    facetsBtn.setAttribute('aria-expanded', String(isOpen));
    try { localStorage.setItem(FACETS_OPEN_KEY, isOpen ? '1' : '0'); } catch { /* no storage */ }
  }
  facetsBtn.addEventListener('click', () => setFacetsOpen(facets.hidden));
  try { if (localStorage.getItem(FACETS_OPEN_KEY) === '0') setFacetsOpen(false); } catch { /* no storage */ }

  // --- search ---
  const search = $('.ml-search input');
  search.disabled = false;
  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { f.query = search.value.trim(); apply(); }, 150);
  });

  // --- facets (checkbox lists in the sidebar) ---
  const expanded = new Set(); // groups that show all values
  const valueOf = (group, raw) => (group === 'feature' ? Number(raw) : raw);

  facets.addEventListener('change', (e) => {
    const box = e.target.closest('input[data-value]');
    if (!box) return;
    const group = box.closest('[data-group]').dataset.group;
    const value = valueOf(group, box.dataset.value);
    if (box.checked) f[group].add(value); else f[group].delete(value);
    apply();
  });
  facets.addEventListener('click', (e) => {
    const more = e.target.closest('[data-more]');
    if (!more) return;
    const group = more.closest('[data-group]').dataset.group;
    if (expanded.has(group)) expanded.delete(group); else expanded.add(group);
    apply();
  });

  const countries = [...new Set(records.flatMap((r) => r.c))].map((c) => [c, c]);
  const featureItems = catalog.features.map(([, label], i) => [i, label]);
  function itemsOf(group) {
    if (group === 'genre') return Object.entries(catalog.genres);
    if (group === 'feature') return featureItems;
    if (group === 'source') return SOURCES;
    return countries;
  }
  const labelOf = (group, value) => itemsOf(group).find(([v]) => v === value)?.[1] ?? String(value);

  function facetHtml(group, counts) {
    const active = f[group];
    let items = itemsOf(group);
    // Most frequent first. A group's counts do not depend on its own values, so the
    // order stays put while you tick boxes within the group.
    if (group !== 'source') {
      items = [...items].sort((a, b) => (counts.get(b[0]) || 0) - (counts.get(a[0]) || 0)
        || String(a[1]).localeCompare(String(b[1])));
    }
    const limit = GROUP_SHOWN[group];
    const shown = expanded.has(group) ? items : items.filter(([v], i) => i < limit || active.has(v));
    const html = shown.map(([value, label]) => {
      const n = counts.get(value) || 0;
      const on = active.has(value);
      const off = !n && !on;
      return `<label class="facet${off ? ' empty' : ''}"><input type="checkbox" data-value="${value}"${on ? ' checked' : ''}${off ? ' disabled' : ''}>`
        + `<span class="facet-label">${label}</span><span class="n">${fmt(n)}</span></label>`;
    });
    if (items.length > limit) {
      const noun = group === 'country' ? 'countries' : 'values';
      html.push(`<button type="button" class="link-btn" data-more>${expanded.has(group) ? 'Show fewer' : `Show all ${items.length} ${noun}`}</button>`);
    }
    return html.join('');
  }

  // --- active filters as removable chips ---
  function activeChips() {
    const chips = [];
    if (f.years) chips.push(['years', '', `Date: ${f.years[0]}–${f.years[1]}`]);
    if (f.exactOnly) chips.push(['exact', '', 'Exact dates only']);
    for (const g of GROUPS) for (const v of f[g]) chips.push([g, v, `${GROUP_LABELS[g]}: ${labelOf(g, v)}`]);
    if (f.query) chips.push(['query', '', `Search: “${f.query}”`]);
    return chips;
  }

  $('.ml-active').addEventListener('click', (e) => {
    if (e.target.closest('[data-reset]')) {
      Object.assign(f, emptyFilters());
      search.value = '';
      apply();
      return;
    }
    const chip = e.target.closest('[data-chip]');
    if (!chip) return;
    const kind = chip.dataset.chip;
    if (kind === 'years') f.years = null;
    else if (kind === 'exact') f.exactOnly = false;
    else if (kind === 'query') { f.query = ''; search.value = ''; }
    else f[kind].delete(valueOf(kind, chip.dataset.value));
    apply();
  });

  // --- main update ---
  let shownRecords = records;
  function apply() {
    shownRecords = records.filter((r) => matches(r, f));
    dateFilter.update(records.filter((r) => matches(r, f, 'years')), f);

    const counts = facetCounts(records, f);
    for (const g of GROUPS) {
      const facet = container.querySelector(`.ml-facet[data-group="${g}"]`);
      facet.querySelector('.ml-facet-list').innerHTML = facetHtml(g, counts[g]);
      if (f[g].size) facet.open = true;
    }

    const chips = activeChips();
    const bar = $('.ml-active');
    bar.hidden = chips.length === 0;
    bar.innerHTML = chips.map(([kind, value, label]) => `<button type="button" class="ml-chip" data-chip="${kind}" data-value="${escapeHtml(String(value))}" aria-label="Remove filter ${escapeHtml(label)}">${escapeHtml(label)} <span aria-hidden="true">×</span></button>`).join('')
      + '<button type="button" class="link-btn" data-reset>Reset all</button>';
    const n = $('.ml-facets-n');
    n.hidden = chips.length === 0;
    n.textContent = chips.length;

    list.update(shownRecords);
    mosaic.update(shownRecords);
    const withImage = shownRecords.filter(hasImage).length;
    $('.ml-summary').innerHTML = `<strong>${fmt(shownRecords.length)}</strong> of ${fmt(records.length)} works`
      + ` · ${fmt(withImage)} with online image`;
    updateSelbar();
  }

  // --- selection bar ---
  const fileInput = $('.ml-selbar input[type=file]');
  const msg = $('.ml-selmsg');
  let clearArmed = null;

  function updateSelbar(ids = getSelection()) {
    $('.ml-selcount').innerHTML = `<strong>${fmt(ids.length)}</strong> main image${ids.length === 1 ? '' : 's'} selected`;
    $('[data-act="select-shown"]').textContent = `Select all shown (${fmt(shownRecords.length)})`;
    for (const act of ['export-csv', 'export-json', 'clear', 'to-pairing']) {
      $(`[data-act="${act}"]`).disabled = ids.length === 0;
    }
  }

  $('.ml-selbar').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    msg.textContent = '';
    const ids = getSelection();
    if (act === 'select-shown') addToSelection(shownRecords.map((r) => r.id));
    else if (act === 'deselect-shown') removeFromSelection(shownRecords.map((r) => r.id));
    else if (act === 'export-csv') exportCsv(ids, catalog);
    else if (act === 'export-json') exportJson(ids);
    else if (act === 'import') fileInput.click();
    else if (act === 'to-pairing') showTab('pair-matching');
    else if (act === 'clear') {
      // Two clicks instead of a confirm dialog.
      const btn = e.target.closest('button');
      if (clearArmed) {
        clearTimeout(clearArmed);
        clearArmed = null;
        btn.textContent = 'Clear';
        clearSelection();
      } else {
        btn.textContent = 'Click again to clear';
        clearArmed = setTimeout(() => { clearArmed = null; btn.textContent = 'Clear'; }, 3000);
      }
    }
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const { known, unknown } = await importFile(file, catalog);
    addToSelection(known);
    msg.textContent = `Imported ${fmt(known.length)} record${known.length === 1 ? '' : 's'}`
      + (unknown.length ? `, ${fmt(unknown.length)} unknown ID${unknown.length === 1 ? '' : 's'} skipped` : '');
  });

  onSelectionChange((ids) => {
    list.refresh();
    mosaic.refresh();
    details.refresh();
    updateSelbar(ids);
  });

  apply();
  setView(view);
}

export default {
  id: 'media-library',
  label: 'Media Library',
  render,
};
