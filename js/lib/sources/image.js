// Shared pieces of the image sources (see index.js).
//
// Every source returns images in the same shape, the pair side of js/state.js:
//   { key, role, label, number, title, year, url, fallbackUrl, credit, creditUrl, fields, recordId }
//   key        stable id across sources, e.g. 'catalog:991000093999705501', 'commons:File.jpg', 'erara:30418783'
//   role       'photochrom' | 'original' | 'external' — selects the metadata fields shown
//   url        full image for comparing and analysing; must be served with CORS
//   fallbackUrl  smaller image used when `url` fails (optional)
//   recordId   MMS ID when the image is a catalog record (enables the print-area crop)

/** Display name of an image: photochrom number (if any) and title, e.g. "No. 73 · Le soir". */
export const imageName = ({ number, title }) => [number && `No. ${number}`, title].filter(Boolean).join(' · ') || 'Untitled';

/** Plain text of an HTML snippet (Commons and IIIF metadata contain markup). */
export function stripHtml(html) {
  if (!html) return '';
  return new DOMParser().parseFromString(String(html), 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
}

/** First four-digit year in a text, or ''. */
export const yearIn = (text) => String(text ?? '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/)?.[1] ?? '';

export async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${new URL(url).hostname}: HTTP ${res.status}`);
  return res.json();
}
