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

import { catalogSource } from './catalog.js';
import { commonsSource } from './commons.js';
import { eraraSource } from './erara.js';

export { imageFromRecord } from './catalog.js';
export { imageName } from './image.js';

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
