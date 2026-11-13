// Lazy loader for Plotly (https://plotly.com/javascript/).
// Plotly ships as a UMD bundle, so it is added as a classic <script> on first use
// instead of an ES module import; the ~3.5 MB download only happens when a plot
// is actually shown.

const PLOTLY_URL = 'https://cdn.plot.ly/plotly-2.35.2.min.js';

let loading = null;

/** Resolves to the global Plotly object. */
export function loadPlotly() {
  if (window.Plotly) return Promise.resolve(window.Plotly);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PLOTLY_URL;
    script.async = true;
    script.onload = () => resolve(window.Plotly);
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('Could not load the plotting library (Plotly) from its CDN.'));
    };
    document.head.append(script);
  });
  return loading;
}
