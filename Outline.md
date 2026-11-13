# Outline - Photochrom Comparison Tool

## Architecture

The project is hosted on Github and therefore can only use static HTML. If things cannot be built due to this constraint, don't implement it and tell me about the problem.

Use appropriate skills like planning and frontend skills for the implementation.

In a first iteration we use two example images which should be used for the comparison tool (data/sample/gleyre-le-soir_original.jpg and data/sample/gleyre-le-soir_photochrom.jpg).

## Requirements/Ideas

The site consists of 3 tabs:

### Media Library Tab

- **Media Gallery of Picture Set**
- **Image analyses over time** by plotting metadata of all images over time

### Pair matching Tab

- **Use metadata** to match images to pairs
- **Use image similarity** to match images
- **Display pairs as gallery** and add option to open in comparison tab
- **Allow for running custom scripts** on the image data (LLM could produce that script based on user prompt)

### Image Comparison Tab

- **Load 2 images** (for now static urls, later from gallery)
- **Display images side by side** for comparison
- **Display image metadata** (loaded via seperate local csv)
- **Allow for image manipulation** (brightness, saturation, etc.)

tbd for later:

- **Add comments?**
- **Update metadata?**

Image Overlay:

- **Overlay images** Drag the images with mouse and move them
- **Adjust transparency** of overlay
- **Scale/rotate overlay**
- **Auto align/Deskew images** Use e.g. keypoint detection to align images and overlay them
- **Take screenshot** and save as file
- **Overlay slider** to compare images (like before/after sliders)
- **Compare image overlay match percentage** by detecting cropping (one image is only part of another)
- **Show image manipulations** like people added or landscape changed

tbd: crop out the color palette on scans to only analyze the colors of the actual image and not the palette.

Image analysis:

For the following use a plot type chooser where useful and make it possible to implement more later.
Use a plotting library like Plotly or Chart.js for the plots.

- **Visualize ocurring colors on CIE plot**
- **Visualize occurring colors in CIE Lab 3D plot** (show pixel colors in scatters)
- **Visualize color frequency in CIE Lab 3D plot** (frequency of used colors in scattered 3D plot)
- **Visualize in HSV plot?**
- **Compare 3D plots** use one color for each picture and show in 3D scatter plot (plot type selectable)
- **Generate color palette for image**

## Project Structure & How-Tos (for contributors/agents)

Plain static site: vanilla HTML/CSS/JS ES modules, **no build step, no npm**. Runs directly on GitHub Pages.

```
index.html                page shell: header, tab bar (nav.tab-bar), panel container (#tab-panels)
css/styles.css            global styles + CSS variables (--bg, --fg, --muted, --accent, --border)
js/main.js                registers tabs, builds tab buttons/panels, handles switching; exports showTab(id)
js/config.js              DEFAULT_IMAGES { left, right } — the two hardcoded image URLs (first iteration)
js/tabs/comparison.js     Image Comparison tab
js/tabs/media-library.js  Media Library tab
js/tabs/pair-matching.js  Pair Matching tab
.nojekyll                 disables Jekyll processing on GitHub Pages
```

### Run locally

ES modules do not load over `file://`. Serve the folder:

```
python3 -m http.server
```

then open http://localhost:8000.

### Tab module contract

Each tab is one file in `js/tabs/` with a default export:

```js
export default {
  id: 'comparison',          // used for DOM ids (tab-<id>, panel-<id>) and URL hash (#<id>)
  label: 'Image Comparison', // text on the tab button
  render(container) { ... }, // called once at startup; build the tab's DOM inside `container`
  activate() { ... },        // optional; called each time the tab becomes visible
};
```

- All tab panels are rendered at startup and hidden/shown via the `hidden` attribute.
- Keep tab-specific logic inside the tab's file (or a sub-folder like `js/tabs/comparison/` if it grows).
- Tab-specific styles: add to `css/styles.css` scoped under `#panel-<id>`, or create `css/<id>.css` and link it in `index.html`.

### Add a new tab

1. Create `js/tabs/<name>.js` following the contract above.
2. Import it in `js/main.js` and add it to the `TABS` array (order = button order).

### Switch tabs programmatically

`import { showTab } from '../main.js'; showTab('comparison');` — e.g. for "open pair in comparison tab". To pass data (which images to load), add a shared state module (e.g. `js/state.js`) rather than coupling tabs directly.

### Constraints & gotchas

- **Static only**: no server code, no secrets/API keys in the repo. Third-party libraries must be loaded from a CDN as ES modules (e.g. `https://esm.sh/...` or jsDelivr) or vendored into `js/vendor/`.
- **CORS / tainted canvas**: pixel access (`getImageData`, filters, color analysis, screenshots via `canvas.toDataURL`) only works if the image host sends CORS headers. Set `img.crossOrigin = 'anonymous'` and use CORS-enabled hosts, or store images in this repo.
- **Accessibility**: tabs use `role="tab"` / `role="tabpanel"` / `aria-selected`; keep this when changing the tab bar.
