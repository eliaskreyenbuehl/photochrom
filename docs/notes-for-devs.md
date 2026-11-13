# Notes for developers

Findings from 13 November 2026 that matter for the web app. See also [data.md](data.md) and
[Outline.md](../Outline.md).

## 1. Image hosts and CORS

Pixel access in the browser (`getImageData`, filters on a canvas, colour analysis, screenshots with
`canvas.toDataURL`) only works if the image host sends an `Access-Control-Allow-Origin` header.
Checked on 13 November 2026 with GET requests:

| Host | Example | CORS on GET | Pixel access on canvas |
|---|---|---|---|
| e-rara IIIF image (v21 and v20) | `https://www.e-rara.ch/i3f/v21/30620827/full/,560/0/default.jpg` | `*` | yes, with `img.crossOrigin = 'anonymous'` |
| e-rara IIIF `info.json` and manifest | `https://www.e-rara.ch/i3f/v20/30620826/manifest` | `*` | n/a (JSON, loadable with `fetch`) |
| Wikimedia Commons (originals) | `https://upload.wikimedia.org/wikipedia/commons/...` | `*` | yes, with `img.crossOrigin = 'anonymous'` |
| This repo on GitHub Pages | `data/sample/*.jpg` | same origin | yes |

Notes:

- **Test with GET, not HEAD.** e-rara omits the CORS header on HEAD requests (`curl -I`), which
  looks like “no CORS” although the browser gets the header on the real request.
- Set `img.crossOrigin = 'anonymous'` **before** setting `img.src`, otherwise the canvas is tainted.
- Not tested yet in a real browser on GitHub Pages; check early, including browser caching (an image
  first loaded without `crossOrigin` can be served from cache without the header).
- So IIIF can likely be used for pixel work too; `data/sample/` stays the offline fallback.
- Museum images have varying rights. The Gleyre original in the sample is CC BY-SA 4.0 (credit
  Françoise Foliot); the app has to show that credit. See `data/sample/README.md`.

## 2. Colour charts on the scans

Many scans show a colour chart or grey scale next to the print (Outline: “crop out the color palette”).
`data/zenodo/photochrom-image-content.csv` already flags them:

- column `scan_farbkarte` (German, “scan colour chart”): `ja` = yes (4,893 images), `nein` = no (4,717)
- column `scan_bildunterschrift`: caption visible on the scan
- key: `mms_id` = `identifier_swisscollections` in the metadata

The flags come from a local vision-language model (Qwen3.5-4B) and are **not checked** by a person
(`review_status`). Use them as a hint, not as truth. Cropping the chart itself still has to be done.

## 3. Related work: Nobu's Photochrom Colours

Nobu ([NbtKmy](https://github.com/NbtKmy)) has already built parts of what the Outline lists:

- **Overlay** of an art reproduction on the painting: drag, rotate, zoom, fade, difference blending
  (`site/compare.html`)
- **Colour bands by year**: share of each colour per year, click to list prints, palette per print
  (`site/index.html`)

Repo: https://github.com/NbtKmy/glamhack2026_photochrom ·
live: https://nbtkmy.github.io/glamhack2026_photochrom/index.html

Worth a look before building the overlay and colour features from scratch; agree with Nobu on
reuse (check the licence of his repo).
