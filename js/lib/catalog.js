// Shared catalog: loads data/catalog.json once (built by scripts/build_catalog.py)
// and offers helpers for image URLs and links. Used by all tabs.

export const CATALOG_URL = 'data/catalog.json';

// Static IIIF (level 0) thumbnail service for all records, built by
// scripts/build_thumbs_iiif.py and published as a separate repository (photochrom-images).
// Identifier = record field "img". Layout: <base>/<img>/full/<width>,/0/default.jpg
// Empty: recatalogued records fall back to e-rara, legacy records have no image.
const THUMB_IIIF_BASE_DEFAULT = 'https://eliaskreyenbuehl.github.io/photochrom-images/iiif';

// Development only: ?thumbs=<url> overrides the base, e.g. a local server
// (python -m http.server 8766 in the photochrom-images folder, then ?thumbs=http://127.0.0.1:8766/iiif).
export const THUMB_IIIF_BASE = (() => {
  try {
    return new URLSearchParams(location.search).get('thumbs') || THUMB_IIIF_BASE_DEFAULT;
  } catch {
    return THUMB_IIIF_BASE_DEFAULT;
  }
})().replace(/\/$/, '');

// Widths available on the thumbnail service (IIIF level 0 only serves listed sizes).
export const THUMB_SIZES = [300];

let catalogPromise = null;

/** Loads the catalog once; later calls return the same promise. */
export function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch(CATALOG_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`${CATALOG_URL}: HTTP ${res.status}`);
        return res.json();
      })
      .then((catalog) => {
        catalog.byId = new Map(catalog.records.map((r) => [r.id, r]));
        return catalog;
      });
  }
  return catalogPromise;
}

/** Does the record have an image that can be shown online? */
export const hasImage = (rec) => !!((THUMB_IIIF_BASE && rec.img) || rec.iiif);

/**
 * Thumbnail URL (lists, mosaic). Uses the own thumbnail service when configured,
 * so scrolling does not load hundreds of images from e-rara.
 */
export function imageUrl(rec, width = 300) {
  if (THUMB_IIIF_BASE && rec.img) {
    const size = THUMB_SIZES.find((s) => s >= width) ?? THUMB_SIZES[THUMB_SIZES.length - 1];
    return `${THUMB_IIIF_BASE}/${rec.img}/full/${size},/0/default.jpg`;
  }
  if (rec.iiif) return `${rec.iiif}/full/${width},/0/default.jpg`;
  return '';
}

/** Larger image for the detail panel: e-rara IIIF where available (single requests are fine). */
export function largeImageUrl(rec, width = 600) {
  if (rec.iiif) return `${rec.iiif}/full/${width},/0/default.jpg`;
  return imageUrl(rec, width);
}

export const recordUrl = (rec) => `https://swisscollections.ch/Record/${rec.id}`;
export const doiUrl = (rec) => (rec.doi ? `https://doi.org/${rec.doi}` : '');

/** Human-readable date. Flags are explained in the detail panel (see build_catalog.py). */
export function dateLabel(rec) {
  if (rec.y0 == null) return rec.d || 'undated';
  if (rec.df === 'suspect') return `${rec.d} (?)`;
  if (rec.df === 'open') return `after ${rec.y0}`;
  const range = rec.y0 === rec.y1 ? String(rec.y0) : `${rec.y0}–${rec.y1}`;
  return rec.df === 'capped' ? `${range}*` : range;
}

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
