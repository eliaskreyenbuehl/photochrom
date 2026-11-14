// Inline SVG icons shared by all tabs: one style (16 px grid, 1.5 px stroke, round caps,
// currentColor), so icons look the same everywhere. Use icon(name) inside a button
// together with a text label, or with aria-label + title when the button shows only the icon.
//
// Add an icon: one entry in PATHS (path data on a 16 × 16 grid).

const PATHS = {
  // views and layout
  mosaic: 'M2 2.5h5v6H2zM9 2.5h5v3.5H9zM2 10.5h5v3H2zM9 8h5v5.5H9z',
  list: 'M5.5 4h8.5M5.5 8h8.5M5.5 12h8.5M2 4h.01M2 8h.01M2 12h.01',
  filter: 'M2 4h12M4.5 8h7M7 12h2',
  map: 'M3.5 11.5h.01M5.5 8.5h.01M3 6h.01M7 12.5h.01M10 3.5h.01M12.5 5h.01M11 7.5h.01M13 9.5h.01M9.5 11h.01',
  side: 'M1.5 3h5.5v10H1.5zM9 3h5.5v10H9z',
  overlay: 'M1.5 2.5h9v7.5h-9zM5.5 6h9v7.5h-9z',
  slider: 'M1.5 3h13v10h-13zM8 1.5v13M5.5 8H3.5M10.5 8h2',
  difference: 'M1.5 3h13v10h-13zM5 6.5l2 2-2 2M9.5 10.5H11',
  // actions
  search: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.5 10.5 14 14',
  close: 'M4 4l8 8M12 4l-8 8',
  info: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 7.5V11M8 5h.01',
  download: 'M8 2v8.5M4.5 7 8 10.5 11.5 7M2.5 13.5h11',
  upload: 'M8 10.5V2M4.5 5.5 8 2l3.5 3.5M2.5 13.5h11',
  trash: 'M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v4.5M9.2 6.5v4.5',
  compare: 'M1.5 3.5h5v9h-5zM9.5 3.5h5v9h-5zM7.5 8h1',
  'arrow-right': 'M2.5 8h11M9.5 4l4 4-4 4',
  'chevron-left': 'M10 3 5 8l5 5',
  'chevron-right': 'M6 3l5 5-5 5',
  'chevrons-lr': 'M6 4.5 2.5 8 6 11.5M10 4.5l3.5 3.5-3.5 3.5',
  external: 'M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v4h-9v-9h4',
  camera: 'M2 5h2.5l1.2-1.8h4.6L11.5 5H14v8H2zM8 11.2a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z',
  sparkle: 'M7 1.5l1.3 3.7L12 6.5 8.3 7.8 7 11.5 5.7 7.8 2 6.5l3.7-1.3zM12.5 10.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z',
  'check-all': 'M2.5 2.5h11v11h-11zM5 8l2 2 4-4',
  'check-none': 'M2.5 2.5h11v11h-11zM5.5 8h5',
  copy: 'M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3',
  align: 'M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5M8 5v6M5 8h6',
  undo: 'M3 6h7a3.5 3.5 0 0 1 0 7H6M5.5 3.5 3 6l2.5 2.5',
  reset: 'M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v3h3',
  edit: 'M10.5 2.5l3 3-8 8h-3v-3zM8.5 4.5l3 3',
  // annotations
  region: 'M2.5 5V2.5H5M7 2.5h2M11 2.5h2.5V5M13.5 7v2M13.5 11v2.5H11M9 13.5H7M5 13.5H2.5V11M2.5 9V7',
  folder: 'M1.5 3h4.5l1.5 1.5h7v8.5h-13z',
  image: 'M2 2.5h12v11H2zM2 11l3.5-3.5 3 3 2-2L14 12M10.5 5.5h.01',
  note: 'M2.5 2.5h11v8h-6l-3 3v-3h-2z',
  // zoom and tools (comparison viewer)
  move: 'M8 1.5v13M1.5 8h13M8 1.5 6.2 3.3M8 1.5l1.8 1.8M8 14.5l-1.8-1.8M8 14.5l1.8-1.8M1.5 8l1.8-1.8M1.5 8l1.8 1.8M14.5 8l-1.8-1.8M14.5 8l-1.8 1.8',
  pan: 'M5.5 8.5V3.8a1 1 0 0 1 2 0V7.5M7.5 7V2.8a1 1 0 0 1 2 0V7.5M9.5 7.5V3.8a1 1 0 0 1 2 0V8M11.5 8V6a1 1 0 0 1 2 0v4a4.5 4.5 0 0 1-4.5 4.5H8.3a4 4 0 0 1-3.1-1.5L2.6 9.8a1 1 0 0 1 1.5-1.3l1.4 1.4V8.5',
  minus: 'M3.5 8h9',
  plus: 'M3.5 8h9M8 3.5v9',
  fit: 'M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4',
  link: 'M6.5 9.5l3-3M7.2 4.6 8.4 3.4a2.6 2.6 0 0 1 3.7 3.7L10.9 8.3M8.8 11.4l-1.2 1.2a2.6 2.6 0 0 1-3.7-3.7l1.2-1.2',
};

/** SVG markup of an icon (decorative: the button around it carries the label). */
export function icon(name, size = 16) {
  const d = PATHS[name];
  if (!d) throw new Error(`Unknown icon: ${name}`);
  return `<svg class="icon" viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}
