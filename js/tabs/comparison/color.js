// Color space conversions (sRGB, D65 white point).
// All functions are pure; inputs are 0–255 sRGB channel values unless noted.

// sRGB 8-bit -> linear light, precomputed for all 256 values.
const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// D65 reference white (Y normalised to 1).
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;

const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

/** sRGB (0–255) -> CIE XYZ (D65, Y in 0–1). */
export function rgbToXyz(r, g, b) {
  const R = SRGB_TO_LINEAR[r];
  const G = SRGB_TO_LINEAR[g];
  const B = SRGB_TO_LINEAR[b];
  return [
    0.4124564 * R + 0.3575761 * G + 0.1804375 * B,
    0.2126729 * R + 0.7151522 * G + 0.072175 * B,
    0.0193339 * R + 0.119192 * G + 0.9503041 * B,
  ];
}

/** CIE XYZ -> sRGB (0–255, clamped, rounded). */
export function xyzToRgb(X, Y, Z) {
  const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const G = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return [encodeSrgb(R), encodeSrgb(G), encodeSrgb(B)];
}

/** Linear light (0–1) -> sRGB 8-bit, clamped. */
export function encodeSrgb(c) {
  const v = c <= 0 ? 0 : c >= 1 ? 1 : c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(v * 255);
}

/** sRGB (0–255) -> CIE 1931 xy chromaticity, or null for pure black. */
export function rgbToXy(r, g, b) {
  const [X, Y, Z] = rgbToXyz(r, g, b);
  const sum = X + Y + Z;
  return sum > 0 ? [X / sum, Y / sum] : null;
}

const labF = (t) => (t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116);
const labFInv = (t) => {
  const t3 = t * t * t;
  return t3 > LAB_EPSILON ? t3 : (116 * t - 16) / LAB_KAPPA;
};

/** sRGB (0–255) -> CIE L*a*b* (D65). */
export function rgbToLab(r, g, b) {
  const [X, Y, Z] = rgbToXyz(r, g, b);
  const fx = labF(X / XN);
  const fy = labF(Y / YN);
  const fz = labF(Z / ZN);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE L*a*b* (D65) -> sRGB (0–255, clamped). */
export function labToRgb(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  return xyzToRgb(labFInv(fx) * XN, labFInv(fy) * YN, labFInv(fz) * ZN);
}

/** sRGB (0–255) -> HSV with h in degrees [0, 360), s and v in [0, 1]. */
export function rgbToHsv(r, g, b) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === R) h = 60 * (((G - B) / d) % 6);
    else if (max === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max === 0 ? 0 : d / max, max];
}

/** HSV (h degrees, s/v 0–1) -> sRGB (0–255). */
export function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export const rgbCss = (r, g, b) => `rgb(${r},${g},${b})`;

export const rgbHex = (r, g, b) => '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
