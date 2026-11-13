// Shared catalog: loads data/catalog.json once (built by scripts/build_catalog.py)
// and offers helpers for image URLs and links. Used by all tabs.

export const CATALOG_URL = 'data/catalog.json';

// Base URL of the static IIIF (level 0) image service for legacy records.
// Empty until the images repository is published; legacy records then show no thumbnail.
// Expected layout: <base>/<img>/full/<width>,/0/default.jpg
export const LEGACY_IIIF_BASE = '';

// Widths available on the legacy level-0 service (IIIF level 0 only serves listed sizes).
export const LEGACY_SIZES = [300];

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

/** Thumbnail URL for a record at about `width` px, or '' if no image is available online. */
export function imageUrl(rec, width = 300) {
  if (rec.iiif) return `${rec.iiif}/full/${width},/0/default.jpg`;
  if (rec.img && LEGACY_IIIF_BASE) {
    const size = LEGACY_SIZES.find((s) => s >= width) ?? LEGACY_SIZES[LEGACY_SIZES.length - 1];
    return `${LEGACY_IIIF_BASE}/${rec.img}/full/${size},/0/default.jpg`;
  }
  return '';
}

export const recordUrl = (rec) => `https://swisscollections.ch/Record/${rec.id}`;
export const doiUrl = (rec) => (rec.doi ? `https://doi.org/${rec.doi}` : '');

/** Human-readable date, with a hint for open or suspect catalogue dates. */
export function dateLabel(rec) {
  if (rec.y0 == null) return rec.d || 'undated';
  if (rec.df === 'open') return `after ${rec.y0}`;
  if (rec.df === 'suspect') return `${rec.d} (?)`;
  return rec.y0 === rec.y1 ? String(rec.y0) : `${rec.y0}–${rec.y1}`;
}

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
