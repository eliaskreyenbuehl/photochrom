// Difference view: computes the structure difference map when the "Differences"
// view is shown (and again after the alignment changes) and shows it on the
// viewer's difference layer.
//
// The heatmap canvas has the resolution of the difference grid and is scaled by
// CSS together with the image. The numbered region boxes are HTML elements in the
// zoomed stage, sized with --inv-zoom, so they stay sharp at any zoom.

import { computeDifference, findRegions, heatImage, thresholdFor } from './difference.js';
import { baseImage, overlayImage, overlayMatrix, store, subscribe } from './store.js';

const INVALIDATING = new Set(['pair', 'swap', 'transform']);

export function createDiffView(viewer, { onResult, onBusy }) {
  let current = null; // { result, analysis, sensitivity }
  let timer = null;
  let token = 0;

  function drawBoxes() {
    const { w, h } = current.result;
    viewer.diffBoxes.replaceChildren(
      ...current.analysis.regions.map((r, i) => {
        const box = document.createElement('div');
        box.className = 'cmp-diff-box';
        Object.assign(box.style, { left: `${(r.x / w) * 100}%`, top: `${(r.y / h) * 100}%`, width: `${(r.w / w) * 100}%`, height: `${(r.h / h) * 100}%` });
        box.append(Object.assign(document.createElement('span'), { textContent: String(i + 1) }));
        return box;
      })
    );
  }

  function drawHeat() {
    const { result } = current;
    const canvas = viewer.diffCanvas;
    if (canvas.width !== result.w || canvas.height !== result.h) {
      canvas.width = result.w;
      canvas.height = result.h;
    }
    canvas.getContext('2d').putImageData(heatImage(result, thresholdFor(store.diff.sensitivity), store.diff.opacity), 0, 0);
  }

  /** Redraw after a sensitivity / opacity change; regions only depend on the sensitivity. */
  function refresh() {
    if (!current) return;
    if (current.sensitivity !== store.diff.sensitivity) {
      current.sensitivity = store.diff.sensitivity;
      current.analysis = findRegions(current.result, thresholdFor(current.sensitivity));
      drawBoxes();
      onResult(current);
    }
    drawHeat();
  }

  function clear() {
    current = null;
    viewer.diffBoxes.replaceChildren();
  }

  function schedule(delay) {
    clearTimeout(timer);
    const my = ++token;
    onBusy(true);
    timer = setTimeout(() => {
      if (my !== token || store.view !== 'diff' || !baseImage()) return;
      try {
        current = { result: computeDifference(baseImage(), overlayImage(), overlayMatrix()), sensitivity: null };
        refresh();
      } catch (err) {
        console.error(err);
        clear();
        onResult(null, err);
      } finally {
        onBusy(false);
      }
    }, delay);
  }

  subscribe((reason) => {
    if (INVALIDATING.has(reason)) clear();
    if (store.view !== 'diff') return;
    if (reason === 'diff') refresh();
    else if (INVALIDATING.has(reason)) schedule(250);
    else if (reason === 'view' && !current) schedule(30);
  });

  return { current: () => current };
}
