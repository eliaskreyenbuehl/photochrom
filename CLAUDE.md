# CLAUDE.md

Photochrom research environment (GLAMhack26): a web app to explore the photochrom collection of
the Zentralbibliothek Zürich and compare photochroms with paintings and other photochroms.
Tabs: Media Library → Candidates → Image Comparison.

**Read [Outline.md](Outline.md) first** — requirements, project structure, how-tos and gotchas.
Data: [docs/data.md](docs/data.md). Image hosts, CORS: [docs/notes-for-devs.md](docs/notes-for-devs.md).

## Run

Static site, **no build step, no npm**. ES modules do not load over `file://`, so serve the repo root:

```
python3 -m http.server      # Windows: python -m http.server
```

Open http://localhost:8000 (tabs by hash: `#media-library`, `#pair-matching`, `#comparison`).

## Rules

- **Static only** (GitHub Pages): vanilla HTML/CSS/JS ES modules, no server code, no secrets.
  If something cannot be built static, say so instead of working around it.
- Libraries: vendored in `js/vendor/` (needed at startup) or lazy-loaded from a CDN on first use
  (`js/lib/plotly.js`, `js/lib/opencv.js`).
- **Git**: every feature on its own branch, PR into `main`; `main` is always deployable.
- Tabs never import each other; they share state through `js/state.js`.
- Images come through `js/lib/sources/` (search, links); don't build image URLs in the UI.
- Images are not in the repo (only `data/sample/`). Pixel access needs CORS:
  `img.crossOrigin = 'anonymous'` before `src`; check with GET, not HEAD.
- Machine-generated data (genres, image content, print areas, photochrom numbers, pair matches)
  is unreviewed — label it as such in the UI.
- Keep `Outline.md` (structure, guidelines) up to date when adding files or learning something.
- Use relative paths and cross-platform commands; nothing machine-specific in the repo.

## Data scripts (Python 3, run from the repo root)

`scripts/build_catalog.py` rebuilds `data/catalog.json` from the CSVs in `data/zenodo/` — run it after
data changes. Other scripts in `scripts/` document their inputs and outputs at the top.

## Testing

No test runner. Serve the folder and check the affected tab in a browser with the console open
(no errors). For interactions (drag, pinch, wheel, keys) a headless Chromium driven via the DevTools
protocol works well; use a fresh profile per run (ES modules are cached aggressively).
`tests/` is git-ignored (personal experiments) — don't rely on it.
