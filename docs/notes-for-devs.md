# Notes for developers

Findings from 13 November 2026 that matter for the web app. See also [data.md](data.md) and
[Outline.md](../Outline.md).

## 1. Image hosts and CORS

Pixel access in the browser (`getImageData`, filters on a canvas, colour analysis, screenshots with
`canvas.toDataURL`) only works if the image host sends an `Access-Control-Allow-Origin` header.
Checked on 13 November 2026:

| Host | Example | CORS | Display in `<img>` | Pixel access on canvas |
|---|---|---|---|---|
| e-rara IIIF (photochroms) | `https://www.e-rara.ch/i3f/v21/30620827/full/,560/0/default.jpg` | **no header** | yes | **no** (canvas is tainted) |
| Wikimedia Commons (originals) | `https://upload.wikimedia.org/wikipedia/commons/...` | `*` | yes | yes, with `img.crossOrigin = 'anonymous'` |
| This repo on GitHub Pages | `data/sample/*.jpg` | same origin | yes | yes |

Consequences:

- Showing photochroms side by side via IIIF works; CSS filters (`filter: brightness() grayscale()`) also
  work on tainted images, because they do not read pixels.
- **Colour analysis, canvas filters, screenshots and auto-alignment need the photochrom pixels.**
  For now, use the images in `data/sample/`. For more pairs, copy the needed images into the repo
  (photochroms are public domain) or ask e-rara for CORS headers.
- Do not load e-rara images with `crossOrigin = 'anonymous'`: without the header the browser then
  refuses to load the image at all.
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
