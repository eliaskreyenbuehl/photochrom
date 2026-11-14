// Wikimedia Commons: file pages (and upload.wikimedia.org image links) loaded via the
// Commons API, which, like the image server, sends CORS headers (origin=*).

import { fetchJson, stripHtml, yearIn } from './image.js';

const API = 'https://commons.wikimedia.org/w/api.php';
const ZOOM_SIZE = 4000; // Commons serves standard widths; 4000 gives its 3840 px version

/** File name (without "File:") in a Commons / Wikipedia link, or null. */
export function commonsFile(url) {
  if (!/(^|\.)(wikimedia|wikipedia)\.org$/.test(url.hostname)) return null;
  const decoded = (s) => decodeURIComponent(s ?? '').replace(/_/g, ' ');
  const fromHash = decoded(url.hash).match(/(?:File|Datei|Fichier|Image):(.+)$/)?.[1];
  const fromPath = decoded(url.pathname).match(/\/wiki\/(?:File|Datei|Fichier|Image):(.+)$/)?.[1];
  const fromTitle = decoded(url.searchParams.get('title')).match(/^(?:File|Datei):(.+)$/)?.[1];
  const fromUpload = url.hostname === 'upload.wikimedia.org'
    ? decoded(url.pathname.split('/').filter(Boolean).pop()).replace(/^\d+px-/, '')
    : null;
  return (fromHash || fromPath || fromTitle || fromUpload || '').trim() || null;
}

/** Short title: the object name if it is short and plain, otherwise the file name. */
function titleOf(objectName, file) {
  const fileTitle = file.replace(/\.[a-z0-9]+$/i, '');
  return objectName && objectName.length <= 80 && !/^[A-Z][a-z]+:\s/.test(objectName) ? objectName : fileTitle;
}

export const commonsSource = {
  id: 'commons',
  label: 'Wikimedia Commons',
  matchesLink: (url) => Boolean(commonsFile(url)),
  async fromLink(url) {
    const file = commonsFile(url);
    if (!file) return null;
    const params = new URLSearchParams({
      action: 'query',
      titles: `File:${file}`,
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: String(ZOOM_SIZE),
      format: 'json',
      origin: '*',
    });
    const data = await fetchJson(`${API}?${params}`);
    const page = Object.values(data.query?.pages ?? {})[0];
    const info = page?.imageinfo?.[0];
    if (!page || page.missing !== undefined || !info) throw new Error(`Wikimedia Commons has no file named "${file}".`);
    if (!/^image\//.test(info.mime)) throw new Error(`"${file}" is not an image (${info.mime}).`);

    const meta = (key) => stripHtml(info.extmetadata?.[key]?.value);
    const title = titleOf(meta('ObjectName'), file);
    const artist = meta('Artist');
    const date = meta('DateTimeOriginal');
    const license = meta('LicenseShortName');
    const year = yearIn(date);
    return {
      key: `commons:${file}`,
      role: 'external',
      label: title,
      title,
      year: year || date.slice(0, 30),
      url: info.thumburl || info.url,
      fallbackUrl: info.url,
      credit: `${[artist, title].filter(Boolean).join(', ')}${year ? ` (${year})` : ''}. ${license || 'License unknown'}, Wikimedia Commons`,
      creditUrl: info.descriptionurl,
      fields: {
        source: 'Wikimedia Commons',
        title,
        artist,
        date,
        license,
        license_url: info.extmetadata?.LicenseUrl?.value ?? '',
        credit: meta('Credit'),
        description: meta('ImageDescription').slice(0, 600),
        file_page: info.descriptionurl,
        size: `${info.width} × ${info.height} px`,
      },
    };
  },
};
