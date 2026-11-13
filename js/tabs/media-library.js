// Media Library tab: timeline, filter pills and the work list of the whole collection.
// Checked rows become main images (left side) for the Pair Matching tab.
// Sub-modules live in js/tabs/media-library/.

import { loadCatalog } from '../lib/catalog.js';
import { showTab } from '../main.js';
import {
  addToSelection, clearSelection, getSelection, onSelectionChange, removeFromSelection,
} from '../state.js';
import { createDetails } from './media-library/details.js';
import { exportCsv, exportJson, importFile } from './media-library/exchange.js';
import {
  GROUPS, SOURCES, emptyFilters, facetCounts, isEmpty, matches,
} from './media-library/filters.js';
import { createList } from './media-library/list.js';
import { createTimeline } from './media-library/timeline.js';

const COUNTRIES_SHOWN = 12;
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

      <section class="ml-card ml-timeline" aria-label="Timeline">
        <div class="ml-card-head">
          <h3>Timeline</h3>
          <div class="ml-year-inputs">
            <label>From <input type="number" name="from" inputmode="numeric"></label>
            <label>to <input type="number" name="to" inputmode="numeric"></label>
            <label class="ml-check"><input type="checkbox" name="exact"> Exact dates only</label>
            <button type="button" class="link-btn" data-clear-years hidden>Clear years</button>
          </div>
        </div>
        <div class="ml-timeline-chart"></div>
        <p class="hint">Drag across the chart to select years. Bars: records dated to a single year. Lane below: records dated only as a span. A record matches if its span overlaps the selected years.</p>
      </section>

      <section class="ml-card ml-filters" aria-label="Filters">
        ${GROUPS.map((g) => `
          <div class="ml-group" data-group="${g}">
            <span class="ml-group-label">${GROUP_LABELS[g]}${GROUP_NOTES[g] ? `<small>${GROUP_NOTES[g]}</small>` : ''}</span>
            <div class="ml-pills" role="group" aria-label="${GROUP_LABELS[g]}"></div>
          </div>`).join('')}
        <button type="button" class="link-btn" data-reset hidden>Reset all filters</button>
      </section>

      <section class="ml-card ml-list" aria-label="Works"></section>

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

  const timeline = createTimeline($('.ml-timeline-chart'), {
    domain: catalog.years,
    onBrush(range) { f.years = range; apply(); },
  });
  const details = createDetails(container.querySelector('.ml'), catalog);
  const list = createList($('.ml-list'), { genres: catalog.genres, onOpen: (r) => details.open(r) });

  // --- search ---
  const search = $('.ml-search input');
  search.disabled = false;
  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { f.query = search.value.trim(); apply(); }, 150);
  });

  // --- year inputs ---
  const from = $('[name=from]');
  const to = $('[name=to]');
  const [minYear, maxYear] = catalog.years;
  for (const input of [from, to]) {
    input.min = minYear;
    input.max = maxYear;
    input.placeholder = input === from ? minYear : maxYear;
    input.addEventListener('change', () => {
      const a = Number(from.value) || minYear;
      const b = Number(to.value) || maxYear;
      f.years = from.value || to.value ? [Math.min(a, b), Math.max(a, b)] : null;
      apply();
    });
  }
  $('[name=exact]').addEventListener('change', (e) => { f.exactOnly = e.target.checked; apply(); });
  $('[data-clear-years]').addEventListener('click', () => { f.years = null; apply(); });

  // --- pills ---
  let countriesExpanded = false;
  $('.ml-filters').addEventListener('click', (e) => {
    if (e.target.closest('[data-reset]')) {
      Object.assign(f, emptyFilters());
      search.value = '';
      $('[name=exact]').checked = false;
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
    timeline.update(records.filter((r) => matches(r, f, 'years')), f);

    const counts = facetCounts(records, f);
    for (const g of GROUPS) {
      container.querySelector(`[data-group="${g}"] .ml-pills`).innerHTML = pillsFor(g, counts[g]);
    }
    from.value = f.years ? f.years[0] : '';
    to.value = f.years ? f.years[1] : '';
    $('[data-clear-years]').hidden = !f.years;
    $('[data-reset]').hidden = isEmpty(f);

    list.update(shownRecords);
    const withImage = shownRecords.filter((r) => r.iiif).length;
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
    details.refresh();
    updateSelbar(ids);
  });

  apply();
}

export default {
  id: 'media-library',
  label: 'Media Library',
  render,
};
