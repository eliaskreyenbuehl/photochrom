// Per-image adjustments, implemented as CSS filter functions. The same filter
// string styles the on-screen canvases and is applied via ctx.filter to screenshots.

export const ADJUSTMENTS = [
  { id: 'brightness', label: 'Brightness', min: 0, max: 200, default: 100, unit: '%', css: (v) => `brightness(${v}%)` },
  { id: 'contrast', label: 'Contrast', min: 0, max: 200, default: 100, unit: '%', css: (v) => `contrast(${v}%)` },
  { id: 'saturate', label: 'Saturation', min: 0, max: 300, default: 100, unit: '%', css: (v) => `saturate(${v}%)` },
  { id: 'hue', label: 'Hue', min: -180, max: 180, default: 0, unit: '°', css: (v) => `hue-rotate(${v}deg)` },
  { id: 'grayscale', label: 'Grayscale', min: 0, max: 100, default: 0, unit: '%', css: (v) => `grayscale(${v}%)` },
  { id: 'sepia', label: 'Sepia', min: 0, max: 100, default: 0, unit: '%', css: (v) => `sepia(${v}%)` },
  { id: 'invert', label: 'Invert', min: 0, max: 100, default: 0, unit: '%', css: (v) => `invert(${v}%)` },
];

export const defaultAdjustments = () => Object.fromEntries(ADJUSTMENTS.map((a) => [a.id, a.default]));

/** CSS filter value for an adjustment set ('none' when nothing is changed). */
export function filterString(values) {
  const parts = ADJUSTMENTS.filter((a) => values[a.id] !== a.default).map((a) => a.css(values[a.id]));
  return parts.length ? parts.join(' ') : 'none';
}

export const isDefault = (values) => ADJUSTMENTS.every((a) => values[a.id] === a.default);
