// Image sources: where the comparison tab (and later other tabs) can get images from.
// The UI only talks to this module, so a source can be swapped or added (e.g.
// Wikidata, an API instead of catalog.json) without touching the UI.
//
// A source is an object with an `id`, a `label` and some of:
//   search(query, { limit }) -> Promise<{ total, results: [{ key, title, detail, thumb, load() }] }>
//       load() resolves to an image (shape documented in image.js)
//   matchesLink(url: URL) -> boolean   cheap check, used to label a pasted link
//   fromLink(url: URL) -> Promise<image | null>   null = not this source's link
//
// Links are tried in order: the catalog first, so links to photochroms in the media
// library get the full catalog record (metadata, print-area crop) even when they point
// to e-rara.

import { loadCatalog, recordUrl } from '../catalog.js';
import { catalogSource } from './catalog.js';
import { commonsFile, commonsSource } from './commons.js';
import { eraraSource } from './erara.js';
import { imageName } from './image.js';

export { imageFromRecord } from './catalog.js';
export { imageName };

const SOURCES = [catalogSource, eraraSource, commonsSource];

export const LINK_HELP = 'a Wikimedia Commons file page, an e-rara page or DOI, or a swisscollections record';

/** The text as http(s) URL, or null. */
export function parseLink(text) {
  try {
    const url = new URL(String(text).trim());
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/** Name of the source that will handle a link ("Wikimedia Commons", "e-rara", …), or null. */
export function linkSourceLabel(url) {
  return SOURCES.find((s) => s.matchesLink?.(url))?.label ?? null;
}

/** Search all searchable sources; results in source order. */
export async function searchImages(query, options = {}) {
  const found = await Promise.all(SOURCES.filter((s) => s.search).map((s) => s.search(query, options)));
  return { total: found.reduce((n, f) => n + f.total, 0), results: found.flatMap((f) => f.results) };
}

/** Load the image a link points to. Throws with a readable message if no source can. */
export async function imageFromLink(url) {
  for (const source of SOURCES) {
    const image = await source.fromLink?.(url);
    if (image) return image;
  }
  throw new Error(`This link is not supported. Paste ${LINK_HELP}.`);
}

const SWISSCOLLECTIONS = /^https:\/\/swisscollections\.ch\/Record\/(\d+)$/;
const commonsPage = (file) => `https://commons.wikimedia.org/wiki/File:${encodeURI(file.replace(/ /g, '_'))}`;

function commonsFileOf(...links) {
  for (const link of links) {
    const url = parseLink(link ?? '');
    const file = url && commonsFile(url);
    if (file) return file;
  }
  return null;
}

/**
 * Stable web address of the work an image shows, independent of the image file and size:
 * the swisscollections record for catalog photochroms, the Commons file page for Commons
 * images (however they were linked), otherwise the source's page or the image URL.
 * Used as annotation target (js/lib/annotation-model.js), so the same work always gets
 * the same address.
 */
export function canonicalUrl(image) {
  if (image.recordId) return recordUrl({ id: String(image.recordId) });
  const file = image.key?.startsWith('commons:') ? image.key.slice(8) : commonsFileOf(image.creditUrl, image.url);
  if (file) return commonsPage(file);
  if (parseLink(image.creditUrl ?? '')) return image.creditUrl;
  if (parseLink(image.url ?? '')) return image.url;
  return `urn:photochrom:image:${encodeURIComponent(image.key ?? image.label ?? 'unknown')}`;
}

/** Short readable name for a canonicalUrl(): the catalog title, the Commons file name, or the link. */
export async function describeUrl(link) {
  const id = String(link).match(SWISSCOLLECTIONS)?.[1];
  if (id) {
    try {
      const rec = (await loadCatalog()).byId.get(id);
      if (rec) return imageName({ number: rec.n, title: rec.t });
    } catch { /* catalog unavailable */ }
    return `Record ${id}`;
  }
  const file = commonsFileOf(link);
  if (file) return file.replace(/\.[a-z0-9]+$/i, '');
  if (String(link).startsWith('urn:photochrom:image:')) return decodeURIComponent(link.slice(21));
  const url = parseLink(link);
  return url ? `${url.hostname}${url.pathname.length > 1 ? url.pathname : ''}` : String(link);
}
