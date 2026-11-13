// CIE 1931 2° standard observer: spectral locus in xy chromaticity coordinates
// (380–700 nm, 5 nm steps) and helpers to draw the chromaticity diagram.

import { encodeSrgb } from './color.js';

// prettier-ignore
const LOCUS_XY = [
  [0.1741, 0.0050], [0.1740, 0.0050], [0.1738, 0.0049], [0.1736, 0.0049], [0.1733, 0.0048],
  [0.1730, 0.0048], [0.1726, 0.0048], [0.1721, 0.0048], [0.1714, 0.0051], [0.1703, 0.0058],
  [0.1689, 0.0069], [0.1669, 0.0086], [0.1644, 0.0109], [0.1611, 0.0138], [0.1566, 0.0177],
  [0.1510, 0.0227], [0.1440, 0.0297], [0.1355, 0.0399], [0.1241, 0.0578], [0.1096, 0.0868],
  [0.0913, 0.1327], [0.0687, 0.2007], [0.0454, 0.2950], [0.0235, 0.4127], [0.0082, 0.5384],
  [0.0039, 0.6548], [0.0139, 0.7502], [0.0389, 0.8120], [0.0743, 0.8338], [0.1142, 0.8262],
  [0.1547, 0.8059], [0.1929, 0.7816], [0.2296, 0.7543], [0.2658, 0.7243], [0.3016, 0.6923],
  [0.3373, 0.6589], [0.3731, 0.6245], [0.4087, 0.5896], [0.4441, 0.5547], [0.4788, 0.5202],
  [0.5125, 0.4866], [0.5448, 0.4544], [0.5752, 0.4242], [0.6029, 0.3965], [0.6270, 0.3725],
  [0.6482, 0.3514], [0.6658, 0.3340], [0.6801, 0.3197], [0.6915, 0.3083], [0.7006, 0.2993],
  [0.7079, 0.2920], [0.7140, 0.2859], [0.7190, 0.2809], [0.7230, 0.2770], [0.7260, 0.2740],
  [0.7283, 0.2717], [0.7300, 0.2700], [0.7311, 0.2689], [0.7320, 0.2680], [0.7327, 0.2673],
  [0.7334, 0.2666], [0.7340, 0.2660], [0.7344, 0.2656], [0.7346, 0.2654], [0.7347, 0.2653],
];

/** Spectral locus points as { nm, x, y }. */
export const SPECTRAL_LOCUS = LOCUS_XY.map(([x, y], i) => ({ nm: 380 + i * 5, x, y }));

/** sRGB primaries and D65 white point in xy. */
export const SRGB_GAMUT = { r: [0.64, 0.33], g: [0.3, 0.6], b: [0.15, 0.06], white: [0.3127, 0.329] };

/** Visible extent of the diagram (axis ranges). */
export const DIAGRAM_RANGE = { x: [0, 0.8], y: [0, 0.9] };

function insideLocus(x, y) {
  // Ray casting against the closed locus (the purple line closes 700 nm -> 380 nm).
  let inside = false;
  for (let i = 0, j = LOCUS_XY.length - 1; i < LOCUS_XY.length; j = i++) {
    const [xi, yi] = LOCUS_XY[i];
    const [xj, yj] = LOCUS_XY[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

let horseshoeCache = null;

/**
 * PNG data URL of the filled "horseshoe" covering DIAGRAM_RANGE, for use as a
 * Plotly layout image. Each chromaticity is shown at maximum brightness;
 * colors outside sRGB are clipped, so the fill is only an orientation aid.
 */
export function horseshoeImage(size = 400) {
  if (horseshoeCache) return horseshoeCache;
  const [x0, x1] = DIAGRAM_RANGE.x;
  const [y0, y1] = DIAGRAM_RANGE.y;
  const w = size;
  const h = Math.round((size * (y1 - y0)) / (x1 - x0));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);

  for (let py = 0; py < h; py++) {
    const y = y1 - ((py + 0.5) / h) * (y1 - y0);
    for (let px = 0; px < w; px++) {
      const x = x0 + ((px + 0.5) / w) * (x1 - x0);
      if (y <= 0 || !insideLocus(x, y)) continue;
      // xyY with Y = 1 -> XYZ -> linear sRGB; clip negatives, normalise to max channel.
      const X = x / y;
      const Z = (1 - x - y) / y;
      let r = Math.max(0, 3.2404542 * X - 1.5371385 - 0.4985314 * Z);
      let g = Math.max(0, -0.969266 * X + 1.8760108 + 0.041556 * Z);
      let b = Math.max(0, 0.0556434 * X - 0.2040259 + 1.0572252 * Z);
      const max = Math.max(r, g, b) || 1;
      const o = (py * w + px) * 4;
      img.data[o] = encodeSrgb(r / max);
      img.data[o + 1] = encodeSrgb(g / max);
      img.data[o + 2] = encodeSrgb(b / max);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  horseshoeCache = canvas.toDataURL('image/png');
  return horseshoeCache;
}
