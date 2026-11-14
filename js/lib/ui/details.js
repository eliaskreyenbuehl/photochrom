// Details dialog: one image with everything known about it, the same in every tab.
// Opened by double-clicking an image (or Enter on a focused image / tile / row).
//
//   openDetails(image)                                   // one image
//   openDetails(image, { browse: { index, count, at } }) // with ← / → through a list
//   openDetails(image, { compareWith: other })           // comparison tab: the other image
//
// `image` has the shape of js/lib/sources/image.js (key, role, label, title, year, url,
// fallbackUrl, credit, creditUrl, fields, recordId) and optionally:
//   img       an already loaded <img> (comparison tab: shows exactly what is compared)
//   position  'Left' | 'Right' (comparison tab)
// Images of catalog records (recordId) also get the catalog block: date notes, genre,
// description, image content, links, print area and the selection checkbox.
// Every image gets the user's annotations (js/lib/ui/annotations.js): list, form, and
// regions drawn on the zoomable image (js/lib/ui/region-layer.js).
//
// Layout: zoomable image | draggable divider | information. A native modal <dialog>
// handles focus, Escape and the backdrop. The dialog lives in <body>, so it works
// from any tab.

import { dateLabel, doiUrl, escapeHtml, fullImageUrl, loadCatalog, recordUrl } from '../catalog.js';
import { isCropping, printAreaFor } from '../print-area.js';
import { isSelected, onSelectionChange, setSelected } from '../../state.js';
import { annotationSection } from './annotations.js';
import { icon } from './icons.js';
import { infoTip } from './info.js';
import { isUrl, metadataSection } from './metadata.js';
import { createRegionLayer } from './region-layer.js';
import { createZoom } from './zoom.js';

const SPLIT_STEP = 32; // px per arrow key press on the divider (Shift: ×3)
const MIN_META = 260; // px
const MIN_IMAGE = 240; // px
const DETAIL_SIZE = 2000; // px, longest side of catalog images loaded for the dialog

const MACHINE = '<span class="badge badge-machine" title="Machine-generated, not reviewed">machine-generated</span>';

const DATE_NOTES = {
  open: 'Open-ended date in the catalog (“after”). Photochroms were produced until 1914, so the range ends there.',
  capped: 'The catalog date ends after 1914. Photochroms were produced until 1914, so the range is cut at 1914 (*).',
  suspect: 'This date looks like a typo in the catalog record. Shown as catalogued and excluded by the date filter.',
};

// Key fields that the catalog block already shows (skipped in the role's key fields).
const COVERED_BY_CATALOG = new Set(['Photochrom number', 'Title', 'Date', 'Depicted place', 'DOI', 'IIIF manifest', 'Catalog record']);

let metaWidth = 420; // px, kept between openings
let dialog = null;
let parts = null;
let current = null; // { image, rec, browse, compareWith }
let annotations = null; // annotation section of the current image ({ element, destroy })
let loadToken = 0;

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'details-dialog';
  dialog.setAttribute('aria-labelledby', 'details-title');
  dialog.innerHTML = `
    <header class="details-head">
      <div class="details-heading">
        <p class="details-kicker"></p>
        <h2 id="details-title"></h2>
        <p class="details-sub"></p>
      </div>
      <div class="details-actions">
        <button type="button" class="btn" data-annotate title="Go to the annotations of this image (comments, tags, regions, microscope images)">${icon('note')}<span class="btn-label">Annotations</span></button>
        <label class="btn details-select" hidden><input type="checkbox"> <span>Selected</span></label>
        <div class="details-nav" role="group" aria-label="Browse" hidden>
          <button type="button" class="btn btn-icon" data-nav="-1" aria-label="Previous image" title="Previous image (←)">${icon('chevron-left')}</button>
          <span class="details-pos"></span>
          <button type="button" class="btn btn-icon" data-nav="1" aria-label="Next image" title="Next image (→)">${icon('chevron-right')}</button>
        </div>
        <button type="button" class="btn btn-icon" data-close aria-label="Close" title="Close (Esc)">${icon('close')}</button>
      </div>
    </header>
    <div class="details-body">
      <figure class="details-figure">
        <div class="details-viewport" tabindex="0" aria-label="Image, zoomable"><div class="zoom-content"></div></div>
        <figcaption>
          <span class="details-img-status" role="status"></span>
          ${infoTip('Scroll or pinch to zoom, drag to pan, double-click to zoom in (Shift: out), 0 to fit. Arrow keys pan when the image has focus.', 'How to zoom')}
        </figcaption>
      </figure>
      <div class="details-split" role="separator" aria-orientation="vertical" aria-label="Resize image and information" aria-valuemin="0" aria-valuemax="100" tabindex="0"></div>
      <div class="details-info"></div>
    </div>
  `;
  document.body.append(dialog);

  const $ = (sel) => dialog.querySelector(sel);
  parts = {
    kicker: $('.details-kicker'),
    title: $('#details-title'),
    sub: $('.details-sub'),
    select: $('.details-select'),
    nav: $('.details-nav'),
    pos: $('.details-pos'),
    body: $('.details-body'),
    split: $('.details-split'),
    viewport: $('.details-viewport'),
    content: $('.details-viewport .zoom-content'),
    imgStatus: $('.details-img-status'),
    info: $('.details-info'),
  };
  // No page to scroll behind a modal: plain scrolling zooms the image.
  parts.zoom = createZoom(parts.content, {
    wheelZoom: true,
    // Region boxes keep their screen line width (calc(… * var(--inv-zoom))).
    onChange: ({ scale }) => parts.content.style.setProperty('--inv-zoom', String(1 / scale)),
    allowDblClick: (e) => !e.target.closest('.panzoom-exclude'), // not while drawing a region
  });
  parts.regions = createRegionLayer(parts.content);

  wireSplit();
  dialog.addEventListener('click', (e) => {
    // A click on the backdrop targets the dialog element itself.
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
    const nav = e.target.closest('[data-nav]');
    if (nav) browseBy(Number(nav.dataset.nav));
    if (e.target.closest('[data-annotate]')) showAnnotations();
  });
  dialog.addEventListener('keydown', (e) => {
    const inViewer = e.target === parts.viewport || e.target === parts.split || e.target.matches('input, select, textarea');
    if (!inViewer && current?.browse && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      browseBy(e.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  parts.viewport.addEventListener('keydown', (e) => parts.zoom.handleKey(e) && e.preventDefault());
  parts.select.querySelector('input').addEventListener('change', (e) => {
    if (current?.rec) setSelected(current.rec.id, e.target.checked);
  });
  onSelectionChange(() => syncSelect());
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('has-modal');
    loadToken++; // stop pending image loads
    current = null;
    annotations?.destroy();
    annotations = null;
  });
}

function wireSplit() {
  const { split } = parts;
  split.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    split.setPointerCapture(e.pointerId);
    split.classList.add('is-dragging');
  });
  split.addEventListener('pointermove', (e) => {
    if (split.hasPointerCapture(e.pointerId)) setMetaWidth(parts.body.getBoundingClientRect().right - e.clientX - split.offsetWidth / 2);
  });
  const endDrag = () => split.classList.remove('is-dragging');
  split.addEventListener('pointerup', endDrag);
  split.addEventListener('pointercancel', endDrag);
  split.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? SPLIT_STEP * 3 : SPLIT_STEP;
    const actions = {
      ArrowLeft: () => setMetaWidth(metaWidth + step),
      ArrowRight: () => setMetaWidth(metaWidth - step),
      Home: () => setMetaWidth(Infinity),
      End: () => setMetaWidth(0),
    };
    if (!actions[e.key]) return;
    e.preventDefault();
    actions[e.key]();
  });
}

/** Apply an information panel width (px), clamped so both sides stay usable. */
function setMetaWidth(px) {
  const { body, split } = parts;
  const total = body.clientWidth - split.offsetWidth;
  if (total <= 0) return;
  metaWidth = Math.round(Math.min(Math.max(px, MIN_META), Math.max(MIN_META, total - MIN_IMAGE)));
  body.style.setProperty('--meta-width', `${metaWidth}px`);
  const share = Math.round(((total - metaWidth) / total) * 100);
  split.setAttribute('aria-valuenow', String(share));
  split.setAttribute('aria-valuetext', `Image ${share} %`);
}

function syncSelect() {
  const box = parts.select.querySelector('input');
  const on = !!current?.rec && isSelected(current.rec.id);
  box.checked = on;
  parts.select.classList.toggle('is-on', on);
  parts.select.querySelector('span').textContent = on ? 'Selected' : 'Select';
  parts.select.title = on ? 'Remove from the selection' : 'Add to the selection (main images for the Candidates tab)';
}

async function browseBy(step) {
  const b = current?.browse;
  if (!b) return;
  const index = b.index + step;
  if (index < 0 || index >= b.count) return;
  const image = b.at(index);
  if (image) await show(image, { ...b, index });
}

/** Image in the viewport: the loaded <img>, or a thumbnail first and then the larger image. */
function showImage(image, rec) {
  const token = ++loadToken;
  parts.imgStatus.textContent = '';
  if (image.img) {
    const img = image.img.cloneNode();
    img.alt = image.label || '';
    parts.content.replaceChildren(img);
    // The comparison tab may show the photochrom cropped to the print; regions refer to the scan.
    parts.regions.attach(img, image.cropped ?? null);
    return;
  }
  const big = rec ? fullImageUrl(rec, DETAIL_SIZE) : image.url;
  const small = image.fallbackUrl || image.thumb || '';
  const img = new Image();
  img.alt = image.label || '';
  img.decoding = 'async';
  if (!big && !small) {
    parts.content.replaceChildren(Object.assign(document.createElement('p'), { className: 'details-noimg', textContent: 'No online image yet.' }));
    parts.regions.attach(null);
    return;
  }
  img.src = small || big;
  parts.content.replaceChildren(img);
  parts.regions.attach(img);
  if (!big || big === img.src) return;
  parts.imgStatus.textContent = 'Loading the larger image…';
  const full = new Image();
  full.onload = () => {
    if (token !== loadToken) return;
    img.src = full.src;
    parts.imgStatus.textContent = '';
  };
  full.onerror = () => {
    if (token === loadToken) parts.imgStatus.textContent = small ? 'Larger image not available, showing the thumbnail.' : 'Image could not be loaded.';
  };
  full.src = big;
}

function section(title, ...children) {
  const el = document.createElement('section');
  el.className = 'details-section';
  const h = document.createElement('h3');
  h.innerHTML = title;
  el.append(h, ...children);
  return el;
}

function fromHtml(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content;
}

/** Catalog block of a record: the media library's view of the work. */
async function catalogBlock(rec, catalog) {
  const nodes = [];
  const genre = catalog.genres[rec.g];
  const date = escapeHtml(dateLabel(rec));
  const catalogDate = rec.d && rec.d !== dateLabel(rec) ? ` <span class="muted">(catalog: ${escapeHtml(rec.d)})</span>` : '';
  const dateNote = DATE_NOTES[rec.df] ? ` ${infoTip(DATE_NOTES[rec.df], 'About this date')}` : '';
  let box = null;
  try { box = await printAreaFor(rec); } catch { /* no print areas */ }
  const rows = [
    rec.n ? ['Number', `No. ${escapeHtml(rec.n)}`] : null,
    ['Date', `${date}${catalogDate}${dateNote}`],
    ['Place', escapeHtml(rec.p || '–')],
    ['Country', escapeHtml(rec.c.join(', ') || '–')],
    ['Genre', genre ? `${escapeHtml(genre)} ${MACHINE}` : '–'],
    rec.art ? ['Painting', `Reproduces a painting (match: ${escapeHtml(rec.art)})`] : null,
    ['Image source', rec.iiif ? 'Recatalogued, IIIF (e-rara)' : 'Legacy record, 2K scan'],
    isCropping(box) ? ['Print area', `Color chart / scan border detected; mosaic and comparison show only the print ${MACHINE}`] : null,
    ['MMS ID', `<code>${escapeHtml(rec.id)}</code>`],
  ].filter(Boolean);
  const dl = document.createElement('dl');
  dl.className = 'meta-key';
  for (const [label, value] of rows) dl.append(fromHtml(`<dt>${label}</dt><dd>${value}</dd>`));
  nodes.push(section('Record', dl));

  if (rec.desc) nodes.push(section(`Description ${MACHINE}`, Object.assign(document.createElement('p'), { textContent: rec.desc })));
  const features = catalog.features.filter((_, i) => rec.f & (1 << i)).map(([, label]) => `<li>${escapeHtml(label)}</li>`).join('');
  if (features) nodes.push(section(`Image content ${MACHINE}`, fromHtml(`<ul class="tags">${features}</ul>`)));
  return nodes;
}

function linksBlock(rec) {
  const link = (href, text) => `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(text)} ${icon('external', 12)}</a>`;
  const links = [
    link(recordUrl(rec), 'swisscollections'),
    rec.doi ? link(doiUrl(rec), `DOI ${rec.doi}`) : '',
    rec.iiif ? link(`${rec.iiif}/full/full/0/default.jpg`, 'Full resolution') : '',
    rec.man ? link(rec.man, 'IIIF manifest') : '',
    rec.ll ? link(`https://www.openstreetmap.org/?mlat=${rec.ll[0]}&mlon=${rec.ll[1]}#map=12/${rec.ll[0]}/${rec.ll[1]}`, 'Map') : '',
  ].filter(Boolean);
  return section('Links', fromHtml(`<p class="details-links">${links.join('')}</p>`));
}

let fillToken = 0;

async function fillInfo(image, rec) {
  const token = ++fillToken;
  const info = parts.info;
  info.replaceChildren();
  if (image.credit) {
    const credit = document.createElement('p');
    credit.className = 'details-credit';
    if (isUrl(image.creditUrl)) credit.append(Object.assign(document.createElement('a'), { href: image.creditUrl, target: '_blank', rel: 'noopener', textContent: image.credit }));
    else credit.textContent = image.credit;
    info.append(credit);
  }
  if (rec) {
    const catalog = await loadCatalog();
    const block = await catalogBlock(rec, catalog);
    if (token !== fillToken) return; // another image was opened meanwhile
    info.append(...block);
  }
  // Fields of the image's source (sample CSV, painting pairs, link sources), without
  // the ones the catalog block already shows; plus every raw column.
  const meta = metadataSection(image, { skip: rec ? COVERED_BY_CATALOG : new Set(), emptyText: rec ? null : 'No metadata available.' });
  const keys = meta.querySelector('.meta-key');
  if (keys) info.append(section(rec ? 'More metadata' : 'Metadata', keys));
  if (rec) info.append(linksBlock(rec));
  annotations?.destroy();
  annotations = annotationSection({ image, compareWith: current?.compareWith ?? null, regions: parts.regions });
  info.append(annotations.element);
  if (meta.childElementCount) info.append(meta);
}

/** Scroll the information panel to the annotations and put the cursor in the comment field. */
function showAnnotations() {
  const target = annotations?.element;
  if (!target?.isConnected) return;
  target.scrollIntoView({ block: 'start' });
  target.querySelector('textarea')?.focus({ preventScroll: true });
}

async function show(image, browse, compareWith = null) {
  let rec = null;
  if (image.recordId) {
    try { rec = (await loadCatalog()).byId.get(String(image.recordId)) ?? null; } catch { rec = null; }
  }
  current = { image, rec, browse, compareWith };
  parts.kicker.textContent = image.position ? `${image.position} image` : (rec ? 'Photochrom' : '');
  parts.kicker.hidden = !parts.kicker.textContent;
  parts.title.textContent = image.label || image.title || 'Untitled';
  parts.sub.textContent = image.year || '';
  parts.select.hidden = !rec;
  syncSelect();
  parts.nav.hidden = !browse;
  if (browse) {
    parts.pos.textContent = `${(browse.index + 1).toLocaleString('en-US')} / ${browse.count.toLocaleString('en-US')}`;
    parts.nav.querySelector('[data-nav="-1"]').disabled = browse.index <= 0;
    parts.nav.querySelector('[data-nav="1"]').disabled = browse.index >= browse.count - 1;
  }
  showImage(image, rec);
  parts.zoom.ensure();
  parts.zoom.reset();
  await fillInfo(image, rec);
  parts.info.scrollTop = 0;
}

/**
 * Open the details of one image.
 * @param browse  optional { index, count, at(i) -> image }: previous / next buttons and ← →
 * @param compareWith  optional other image of a comparison: new annotations can link it
 * @param annotate  scroll to the annotation form after opening
 */
export async function openDetails(image, { browse = null, compareWith = null, annotate = false } = {}) {
  if (!dialog) build();
  if (!dialog.open) {
    document.documentElement.classList.add('has-modal');
    dialog.showModal();
    setMetaWidth(metaWidth);
    dialog.querySelector('[data-close]').focus();
  }
  await show(image, browse, compareWith);
  if (annotate) showAnnotations();
}
