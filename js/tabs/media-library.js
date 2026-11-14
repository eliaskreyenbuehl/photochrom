// Media Library tab: toolbar (date, search, view), filter facets in a sidebar and the whole
// collection as masonry mosaic or list.
// Click a tile or row to select it (selected works are the main images, left side, for the
// Candidates tab); double-click (or Enter) opens the details dialog.
// Sub-modules live in js/tabs/media-library/.

import { escapeHtml, hasImage, loadCatalog } from '../lib/catalog.js';
import { loadPrintAreas } from '../lib/print-area.js';
import { imageFromRecord } from '../lib/sources/index.js';
import { openDetails } from '../lib/ui/details.js';
import { icon } from '../lib/ui/icons.js';
import { infoTip } from '../lib/ui/info.js';
import { createSelectionBar } from '../lib/ui/selection-bar.js';
import { showTab } from '../main.js';
import { addToSelection, getSelection, onSelectionChange, removeFromSelection } from '../state.js';
import { createDateFilter } from './media-library/date-filter.js';
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
// Groups whose values are machine-generated (labelled in the sidebar, explained in the info tip).
const GROUP_INFO = {
  genre: 'Genres were assigned by a model from title and image, not reviewed by a person. Expect some errors.',
  feature: 'Image content (people, boats, mountains …) was detected by a vision model, not reviewed by a person. Expect some errors.',
  source: '<b>With image (IIIF)</b>: recatalogued records with a zoomable e-rara image. <b>Reproduces a painting</b>: matched to a painting via Wikidata (machine-made, unreviewed).',
};
const MACHINE_GROUPS = new Set(['genre', 'feature']);
// Values shown per group before "Show all"; active values are always shown.
const GROUP_SHOWN = { genre: 6, country: 8, feature: 8, source: Infinity };
// Groups that start collapsed (they open by themselves when one of their values is active).
const GROUP_CLOSED = new Set(['feature']);

function render(container) {
  container.innerHTML = `
    <h2 class="visually-hidden">Media Library</h2>
    <div class="ml">
      <div class="ml-toolbar">
        <button type="button" class="btn ml-facets-btn" aria-controls="ml-facets" aria-expanded="true" title="Show or hide the filters">
          ${icon('filter')}<span class="btn-label">Filters</span><span class="count-pill" hidden></span>
        </button>
        <p class="ml-summary" aria-live="polite">Loading catalog…</p>
        <div class="ml-date-wrap">
          <span class="ml-date-label">Date ${infoTip('Works per year, 1889–1914. <b>Dark</b>: dated to a single year. <b>Light</b>: date ranges, spread evenly over their years (an estimate). A work matches if its date range overlaps the selected years. Suspect catalog dates are left out.', 'About the date filter')}</span>
          <div class="ml-date"></div>
        </div>
        <label class="search-field ml-search">
          ${icon('search')}
          <span class="visually-hidden">Search title, place, country or MMS ID</span>
          <input type="search" placeholder="Search title, place, country, MMS ID" disabled>
        </label>
        <div class="segmented ml-view-toggle" role="group" aria-label="View">
          <button type="button" data-view="mosaic" aria-pressed="true" aria-label="Mosaic" title="Mosaic">${icon('mosaic')}</button>
          <button type="button" data-view="list" aria-pressed="false" aria-label="List" title="List">${icon('list')}</button>
        </div>
        ${infoTip('Click an image or row to <b>select</b> it as a main image for the Candidates tab (Space with the keyboard). <b>Double-click</b> (or Enter) shows all details.', 'How to select and see details')}
      </div>

      <div class="ml-active" role="group" aria-label="Active filters" hidden></div>

      <div class="ml-body">
        <aside class="ml-facets" id="ml-facets" aria-label="Filters">
          ${GROUPS.map((g) => `
            <details class="ml-facet" data-group="${g}"${GROUP_CLOSED.has(g) ? '' : ' open'}>
              <summary>${GROUP_LABELS[g]}${MACHINE_GROUPS.has(g) ? ' <span class="badge badge-machine">machine-generated</span>' : ''}${GROUP_INFO[g] ? infoTip(GROUP_INFO[g], `About ${GROUP_LABELS[g]}`) : ''}</summary>
              <div class="ml-facet-list" role="group" aria-label="${GROUP_LABELS[g]}"></div>
            </details>`).join('')}
        </aside>

        <section class="ml-works" aria-label="Works">
          <div class="ml-mosaic" data-pane="mosaic"></div>
          <div class="ml-list" data-pane="list" hidden></div>
        </section>
      </div>
    </div>
  `;
  const bar = createSelectionBar({
    extra: [
      { act: 'select-shown', icon: 'check-all', label: 'Select all shown', title: 'Add all works that match the filters' },
      { act: 'deselect-shown', icon: 'check-none', label: 'Deselect shown', title: 'Remove all works that match the filters from the selection' },
    ],
    primary: { act: 'to-pairing', icon: 'arrow-right', trailing: true, label: 'Open in Candidates', title: 'Find pairs for the selected works' },
  });
  container.querySelector('.ml').append(bar.element);

  loadCatalog()
    .then((catalog) => init(container, catalog, bar))
    .catch((err) => {
      container.querySelector('.ml-summary').textContent = `Could not load the catalog (${err.message}). `
        + 'If you opened index.html as a file, serve the folder instead: python -m http.server';
    });
}

function init(container, catalog, bar) {
  const { records } = catalog;
  const f = emptyFilters();
  const $ = (sel) => container.querySelector(sel);

  const dateFilter = createDateFilter($('.ml-date'), {
    domain: catalog.years,
    onChange({ years, exactOnly }) { f.years = years; f.exactOnly = exactOnly; apply(); },
  });
  // Details of a work, with ← / → through the works in the order of the current view.
  const open = (items, index) => openDetails(imageFromRecord(items[index]), {
    browse: { index, count: items.length, at: (i) => imageFromRecord(items[i]) },
  });
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
    const n = $('.ml-facets-btn .count-pill');
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
  function updateSelbar(ids = getSelection()) {
    bar.update(ids);
    bar.setLabel('select-shown', `Select all shown (${fmt(shownRecords.length)})`);
    bar.button('to-pairing').disabled = ids.length === 0;
  }
  bar.element.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'select-shown') addToSelection(shownRecords.map((r) => r.id));
    else if (act === 'deselect-shown') removeFromSelection(shownRecords.map((r) => r.id));
    else if (act === 'to-pairing') showTab('pair-matching');
  });

  onSelectionChange((ids) => {
    list.refresh();
    mosaic.refresh();
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
