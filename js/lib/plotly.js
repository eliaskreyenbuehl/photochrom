// Lazy loader for Plotly (https://plotly.com/javascript/).
// Plotly ships as a UMD bundle, so it is added as a classic <script> on first use
// instead of an ES module import; the ~3.5 MB download only happens when a plot
// is actually shown.

import { loadScript } from './script.js';

const PLOTLY_URL = 'https://cdn.plot.ly/plotly-2.35.2.min.js';

/** Resolves to the global Plotly object. */
export async function loadPlotly() {
  if (!window.Plotly) await loadScript(PLOTLY_URL, 'Could not load the plotting library (Plotly) from its CDN.');
  return window.Plotly;
}
