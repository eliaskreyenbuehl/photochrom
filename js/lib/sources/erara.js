// e-rara (https://www.e-rara.ch): items that are not in the media library, loaded via
// IIIF. Manifests and images are served with CORS; the DOI landing pages are not, so a
// DOI can only be resolved through the catalog (catalog.js handles that first).

import { fetchJson, stripHtml, yearIn } from './image.js';

const IIIF = 'https://www.e-rara.ch/i3f/v21';
const ZOOM_SIZE = 4000;

/** e-rara DOI in a link (doi.org/… or e-rara.ch/doi/…), lower-cased, or null. */
export const eraraDoi = (href) => href.match(/10\.3931\/e-rara-\d+/i)?.[0].toLowerCase() ?? null;

/** Numeric e-rara id in a link (titleinfo, zoom, pageview, IIIF, /id/ …), or null. */
export function eraraId(url) {
  if (!/(^|\.)e-rara\.ch$/.test(url.hostname)) return null;
  return url.pathname.match(/\/(\d{5,})(?=\/|$)/)?.[1] ?? null;
}

const label = (value) => (typeof value === 'string' ? value : Array.isArray(value) ? label(value[0]) : value?.['@value'] ?? Object.values(value ?? {})[0]?.[0] ?? '');

/** Image side from an IIIF image service base URL. */
function fromService(service, id, { title, fields = {}, credit, creditUrl }) {
  return {
    key: `erara:${id}`,
    role: 'external',
    label: title,
    title,
    year: yearIn(fields.Impressum) || '',
    url: `${service}/full/!${ZOOM_SIZE},${ZOOM_SIZE}/0/default.jpg`,
    fallbackUrl: `${service}/full/600,/0/default.jpg`,
    credit: credit ?? `${title}. e-rara`,
    creditUrl: creditUrl ?? `https://www.e-rara.ch/zuz/content/titleinfo/${id}`,
    fields: { source: 'e-rara', ...fields },
  };
}

function fromManifest(manifest, id) {
  const fields = Object.fromEntries((manifest.metadata ?? []).map((m) => [stripHtml(label(m.label)), stripHtml(label(m.value))]));
  // IIIF Presentation 2 (e-rara) and 3; photochroms have one image, longer items use the first.
  const service =
    manifest.sequences?.[0]?.canvases?.[0]?.images?.[0]?.resource?.service?.['@id'] ??
    manifest.items?.[0]?.items?.[0]?.items?.[0]?.body?.service?.[0]?.id;
  if (!service) throw new Error('This e-rara item has no image.');
  const title = stripHtml(label(manifest.label)) || `e-rara ${id}`;
  const doi = Object.values(fields).find((v) => /doi\.org\/10\.3931/.test(v));
  const holder = fields['Besitzende Institution'];
  return fromService(service.replace(/\/$/, ''), id, {
    title,
    fields,
    credit: `${title}${fields.Impressum ? `, ${fields.Impressum}` : ''}. ${holder ? `${holder}, ` : ''}e-rara`,
    creditUrl: doi,
  });
}

export const eraraSource = {
  id: 'erara',
  label: 'e-rara',
  matchesLink: (url) => Boolean(eraraId(url) || eraraDoi(url.href)),
  async fromLink(url) {
    const id = eraraId(url);
    if (!id) {
      if (eraraDoi(url.href)) {
        throw new Error('This e-rara DOI is not in the media library. Open the item on e-rara and paste the address of its page (…/titleinfo/<number>) instead.');
      }
      return null;
    }
    // Title ids have a manifest; page ids only an image service.
    const manifest = await fetchJson(`${IIIF}/${id}/manifest`).catch(() => null);
    if (manifest) return fromManifest(manifest, id);
    const info = await fetchJson(`${IIIF}/${id}/info.json`).catch(() => null);
    if (info) return fromService((info['@id'] ?? info.id ?? `${IIIF}/${id}`).replace(/\/$/, ''), id, { title: `e-rara image ${id}` });
    throw new Error(`e-rara has no item or image with the number ${id}.`);
  },
};
