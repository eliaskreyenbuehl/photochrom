// Image Comparison tab
// Implemented: color analysis (CIE xy, Lab 3D, Lab frequency, HSV, palettes) — see comparison/analysis.js.
// Planned: load 2 images side by side, metadata, per-image adjustments, overlay
// (drag/opacity/scale/rotate, slider, auto-align), screenshot.

import * as analysis from './comparison/analysis.js';

export default {
  id: 'comparison',
  label: 'Image Comparison',

  render(container) {
    container.innerHTML = `
      <h2>Image Comparison</h2>
      <p class="placeholder">Side-by-side view, metadata, adjustments and overlay: not implemented yet.</p>
    `;
    analysis.render(container);
  },

  activate() {
    analysis.activate();
  },
};
