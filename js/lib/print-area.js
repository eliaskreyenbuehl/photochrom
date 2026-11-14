// Print area: the box of the photochrom print inside a scan, without color chart,
// gray scale and scanner background (data/print-area.csv, built by
// scripts/detect_print_area.py; machine-generated, unreviewed).
//
// Boxes are fractions of width and height (0–1), so they apply to every resolution
// of the same scan. Images without a row are used whole.

import { loadCsvObjects } from './csv.js';

export const PRINT_AREA_URL = 'data/print-area.csv';

let areasPromise = null;

/** Loads print-area.csv once: Map img -> { x0, y0, x1, y1, note }. */
export function loadPrintAreas() {
  if (!areasPromise) {
    areasPromise = loadCsvObjects(PRINT_AREA_URL).then((rows) => new Map(rows.map((r) => [r.img, {
      x0: Number(r.x0), y0: Number(r.y0), x1: Number(r.x1), y1: Number(r.y1), note: r.note,
    }])));
  }
  return areasPromise;
}

/** Box for a catalog record (field `img`), or null. */
export async function printAreaFor(rec) {
  if (!rec?.img) return null;
  return (await loadPrintAreas()).get(rec.img) ?? null;
}

/** Does the box actually remove something (more than 1 % on any side)? */
export const isCropping = (box) => !!box && (box.x0 > 0.01 || box.y0 > 0.01 || box.x1 < 0.99 || box.y1 < 0.99);
