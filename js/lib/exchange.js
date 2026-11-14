// Export and import of the selection as a file. Nothing is uploaded:
// export creates a download in the browser, import reads a local file.

import { recordUrl } from './catalog.js';

function download(name, type, text) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
const stamp = () => new Date().toISOString().slice(0, 10);

export function exportCsv(ids, catalog) {
  const head = ['mms_id', 'title', 'date', 'place', 'countries', 'swisscollections_url', 'doi'];
  const lines = [head.join(',')];
  for (const id of ids) {
    const r = catalog.byId.get(id);
    if (!r) { lines.push(csvCell(id)); continue; }
    lines.push([r.id, r.t, r.d, r.p, r.c.join(' | '), recordUrl(r), r.doi || ''].map(csvCell).join(','));
  }
  download(`photochrom-selection-${stamp()}.csv`, 'text/csv;charset=utf-8', `﻿${lines.join('\r\n')}\r\n`);
}

export function exportJson(ids) {
  const data = {
    description: 'Main images selected in the Photochrom Media Library',
    exported: new Date().toISOString(),
    source: 'https://doi.org/10.5281/zenodo.24141227',
    mms_ids: ids,
  };
  download(`photochrom-selection-${stamp()}.json`, 'application/json', `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Reads MMS IDs from a selection file: our JSON export, or any CSV/text file
 * (an mms_id column, or simply the IDs anywhere in the text).
 * Returns { known, unknown }.
 */
export async function importFile(file, catalog) {
  const text = await file.text();
  let ids = [];
  try {
    const data = JSON.parse(text);
    ids = Array.isArray(data) ? data : data.mms_ids || [];
  } catch {
    ids = text.match(/\b99\d{10,}\b/g) || []; // MMS IDs of the ZB start with 99
  }
  ids = [...new Set(ids.map(String))];
  return {
    known: ids.filter((id) => catalog.byId.has(id)),
    unknown: ids.filter((id) => !catalog.byId.has(id)),
  };
}
