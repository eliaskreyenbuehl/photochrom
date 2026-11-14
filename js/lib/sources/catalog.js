// The media library as an image source: data/catalog.json with the thumbnail service,
// e-rara IIIF (recatalogued records) and the 2K scans on Hugging Face (legacy records),
// see js/lib/catalog.js. Searchable, and it recognises links to its own records
// (swisscollections, e-rara DOI, e-rara page/title ids), so those get full metadata.

import { dateLabel, doiUrl, fullImageUrl, imageUrl, loadCatalog, recordUrl } from '../catalog.js';
import { eraraDoi, eraraId } from './erara.js';
import { imageName } from './image.js';

// Longest side requested for comparing (zoom quality). Recatalogued: e-rara IIIF scales
// to fit (4K scans); legacy: the 2K scan, its largest version.
const ZOOM_SIZE = 4000;

/** Image side for a catalog record. */
export function imageFromRecord(rec) {
  return {
    key: `catalog:${rec.id}`,
    role: 'photochrom',
    label: imageName({ number: rec.n, title: rec.t }),
    number: rec.n,
    title: rec.t,
    year: dateLabel(rec),
    url: fullImageUrl(rec, ZOOM_SIZE),
    fallbackUrl: imageUrl(rec, 300), // own thumbnail service, if the full image is missing
    credit: `${rec.t}${rec.d ? `, ${rec.d}` : ''}. Zentralbibliothek Zürich, Public Domain Mark`,
    creditUrl: doiUrl(rec) || recordUrl(rec),
    fields: {
      title: rec.t,
      photochrom_number: rec.n,
      date: rec.d,
      place: rec.p,
      countries: rec.c.join(', '),
      mms_id: rec.id,
      subset: rec.s === 'r' ? 'recatalogued (IIIF)' : 'legacy',
      record: recordUrl(rec),
      iiif_manifest: rec.man ?? '',
    },
    recordId: rec.id,
  };
}

// Search text and link lookups, built once per catalog.
const indexes = new WeakMap();
async function index() {
  const catalog = await loadCatalog();
  if (!indexes.has(catalog)) {
    const text = new Map();
    const byDoi = new Map();
    const byEraraId = new Map();
    for (const r of catalog.records) {
      text.set(r, `${r.t} ${r.p} ${r.c.join(' ')} ${r.id} ${r.n ?? ''}`.toLowerCase());
      if (r.doi) byDoi.set(r.doi.toLowerCase(), r);
      const page = r.iiif?.match(/\/(\d+)$/)?.[1];
      const title = r.man?.match(/\/(\d+)\/manifest$/)?.[1];
      if (page) byEraraId.set(page, r);
      if (title) byEraraId.set(title, r);
    }
    indexes.set(catalog, { text, byDoi, byEraraId });
  }
  return { catalog, ...indexes.get(catalog) };
}

export const catalogSource = {
  id: 'catalog',
  label: 'Media library',

  /**
   * Records whose title, place, country, MMS ID or photochrom number contain all words.
   * An exact photochrom number or MMS ID comes first, then titles starting with the query.
   * @returns {Promise<{ total, results: { key, title, detail, thumb, load }[] }>}
   */
  async search(query, { limit = 20 } = {}) {
    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    if (!words.length) return { total: 0, results: [] };
    const { catalog, text } = await index();
    const hits = catalog.records.filter((r) => fullImageUrl(r) && words.every((w) => text.get(r).includes(w)));
    const rank = (r) => (r.n === q || r.id === q ? 0 : r.t.toLowerCase().startsWith(q) ? 1 : 2);
    hits.sort((a, b) => rank(a) - rank(b));
    return {
      total: hits.length,
      results: hits.slice(0, limit).map((r) => ({
        key: `catalog:${r.id}`,
        title: imageName({ number: r.n, title: r.t }),
        detail: [dateLabel(r), r.p].filter(Boolean).join(' · '),
        thumb: imageUrl(r, 300),
        load: async () => imageFromRecord(r),
      })),
    };
  },

  matchesLink: (url) => /(^|\.)swisscollections\.ch$/.test(url.hostname),

  /** Image for a link to a catalog record, or null if the link points elsewhere. */
  async fromLink(url) {
    const { catalog, byDoi, byEraraId } = await index();
    const mms = /(^|\.)swisscollections\.ch$/.test(url.hostname) ? url.pathname.match(/\/Record\/(\d+)/)?.[1] : null;
    const doi = eraraDoi(url.href);
    const id = eraraId(url);
    const rec = (mms && catalog.byId.get(mms)) || (doi && byDoi.get(doi)) || (id && byEraraId.get(id));
    if (rec) return imageFromRecord(rec);
    if (mms) throw new Error(`Record ${mms} is not in the media library (only photochroms up to 1914 are).`);
    return null;
  },
};
