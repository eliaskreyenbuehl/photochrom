// Media Library tab: filters (date, pills, search) and the whole collection as mosaic or list.
// Checked rows become main images (left side) for the Pair Matching tab.
// Sub-modules live in js/tabs/media-library/.

import { hasImage, loadCatalog } from '../lib/catalog.js';
import { showTab } from '../main.js';
import {
  addToSelection, clearSelection, getSelection, onSelectionChange, removeFromSelection,
} from '../state.js';
import { createDateFilter } from './media-library/date-filter.js';
import { createDetails } from './media-library/details.js';
import { exportCsv, exportJson, importFile } from './media-library/exchange.js';
import {
  GROUPS, SOURCES, emptyFilters, facetCounts, isEmpty, matches,
} from './media-library/filters.js';
import { createList } from './media-library/list.js';
import { createMosaic } from './media-library/mosaic.js';

const COUNTRIES_SHOWN = 12;
const VIEW_KEY = 'photochrom.libraryView';
const fmt = (n) => n.toLocaleString('en-US');

const GROUP_LABELS = {
  genre: 'Genre', country: 'Country', feature: 'Image content', source: 'Source',
};
const GROUP_NOTES = {
  genre: 'machine-generated', feature: 'machine-generated, unreviewed',
};

function render(container) {
  container.innerHTML = `
    <div class="ml">
      <div class="ml-top">
        <p class="ml-summary" aria-live="polite">Loading catalog…</p>
        <label class="ml-search">
          <span class="visually-hidden">Search title, place, country or MMS ID</span>
          <input type="search" placeholder="Search title, place, country, MMS ID" disabled>
        </label>
      </div>

      <section class="ml-card ml-filters" aria-label="Filters">
        <div class="ml-group ml-group-date">
          <span class="ml-group-label">Date<small>1889–1914</small></span>
          <div class="ml-date"></div>
        </div>
        ${GROUPS.map((g) => `
          <div class="ml-group" data-group="${g}">
            <span class="ml-group-label">${GROUP_LABELS[g]}${GROUP_NOTES[g] ? `<small>${GROUP_NOTES[g]}</small>` : ''}</span>
            <div class="ml-pills" role="group" aria-label="${GROUP_LABELS[g]}"></div>
          </div>`).join('')}
        <button type="button" class="link-btn" data-reset hidden>Reset all filters</button>
      </section>

      <section class="ml-card ml-works" aria-label="Works">
        <div class="ml-works-head">
          <div class="ml-view-toggle" role="group" aria-label="View">
            <button type="button" data-view="mosaic" aria-pressed="true">Mosaic</button>
            <button type="button" data-view="list" aria-pressed="false">List</button>
          </div>
        </div>
        <div class="ml-mosaic" data-pane="mosaic"></div>
        <div class="ml-list" data-pane="list" hidden></div>
      </section>

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
        <button type="button" class="primary" data-act="to-pairing">Open in Pair Matching →</button>
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

  // --- search ---
  const search = $('.ml-search input');
  search.disabled = false;
  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { f.query = search.value.trim(); apply(); }, 150);
  });

  // --- pills ---
  let countriesExpanded = false;
  $('.ml-filters').addEventListener('click', (e) => {
    if (e.target.closest('[data-reset]')) {
      Object.assign(f, emptyFilters());
      search.value = '';
      apply();
      return;
    }
    if (e.target.closest('[data-more]')) {
      countriesExpanded = !countriesExpanded;
      apply();
      return;
    }
    const pill = e.target.closest('.pill');
    if (!pill) return;
    const set = f[pill.closest('[data-group]').dataset.group];
    const value = pill.dataset.group === 'feature' ? Number(pill.dataset.value) : pill.dataset.value;
    if (set.has(value)) set.delete(value); else set.add(value);
    apply();
  });

  function pillsFor(group, counts) {
    let items;
    if (group === 'genre') items = Object.entries(catalog.genres);
    else if (group === 'feature') items = catalog.features.map(([, label], i) => [i, label]);
    else if (group === 'source') items = SOURCES;
    else {
      items = [...new Set(records.flatMap((r) => r.c))]
        .sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b))
        .map((c) => [c, c]);
    }
    const active = f[group];
    let shown = items;
    if (group === 'country' && !countriesExpanded) {
      shown = items.filter(([v], i) => i < COUNTRIES_SHOWN || active.has(v));
    }
    const html = shown.map(([value, label]) => {
      const n = counts.get(value) || 0;
      const on = active.has(value);
      return `<button type="button" class="pill" data-group="${group}" data-value="${value}" aria-pressed="${on}" ${!n && !on ? 'disabled' : ''}>${label} <span class="n">${fmt(n)}</span></button>`;
    });
    if (group === 'country' && items.length > COUNTRIES_SHOWN) {
      html.push(`<button type="button" class="link-btn" data-more>${countriesExpanded ? 'Fewer' : `All ${items.length} countries`}</button>`);
    }
    return html.join('');
  }

  // --- main update ---
  let shownRecords = records;
  function apply() {
    shownRecords = records.filter((r) => matches(r, f));
    dateFilter.update(records.filter((r) => matches(r, f, 'years')), f);

    const counts = facetCounts(records, f);
    for (const g of GROUPS) {
      container.querySelector(`[data-group="${g}"] .ml-pills`).innerHTML = pillsFor(g, counts[g]);
    }
    $('[data-reset]').hidden = isEmpty(f);

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
