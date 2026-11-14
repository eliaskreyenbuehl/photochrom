# Photochrom Research Environment

GLAMhack26, Winterthur. A digital research environment for the photochrom collection of the
Zentralbibliothek Zürich (ZB), built for the challenge **Detecting Image Manipulation**.

## Page

[https://eliaskreyenbuehl.github.io/photochrom/#media-library](https://eliaskreyenbuehl.github.io/photochrom/#media-library)

## About

_(in progress)_

## Repository

```
photochrom/
├── README.md
├── Outline.md                       concept, requirements and how-tos for contributors (start here to develop)
├── LICENSE                          MIT, for the code
├── index.html                       the web app: page shell with tab bar (static site, GitHub Pages)
├── css/
│   └── styles.css                   global styles and CSS variables
├── js/
│   ├── main.js                      registers the tabs, handles tab switching
│   ├── config.js                    default image URLs for the comparison tab
│   └── tabs/
│       ├── media-library.js         Media Library tab
│       ├── pair-matching.js         Candidates tab
│       └── comparison.js            Image Comparison tab
├── data/
│   ├── artwork-pairs.csv            240 photochroms reproducing paintings, matched to the originals (Wikidata, Commons)
│   ├── candidates.csv               photochrom–photochrom candidate pairs from pairing methods (Candidates tab)
│   ├── sample/                      2 comparison pairs as JPEG + sample-metadata.csv (full metadata, image rights)
│   └── zenodo/                      copy of the dataset files (without images)
│       ├── photochrom-metadata.csv      9,610 records, IIIF links, coordinates
│       ├── photochrom-image-content.csv image content per record (genre, people, mountains …)
│       ├── photochrom-places.csv        place mentions with coordinates
│       ├── photochrom-main-place.csv    main motif per legacy record
│       └── embeddings-siglip2/          SigLIP 2 image vectors (embeddings.npy, dateien.csv)
├── docs/
│   ├── data.md                      the data in short: groups, files, keys, traps
│   ├── background.md                how photochroms were made, why they differ from the originals
│   └── notes-for-devs.md            image hosts and CORS, colour charts on scans, related work
├── prototypes/
│   └── artwork-pairs.html           first comparison page: photochrom (IIIF) next to the original (Commons), German labels
├── .nojekyll                        disables Jekyll on GitHub Pages
├── .gitattributes                   keeps files in data/ byte-identical to Zenodo
└── .gitignore                       images are not in the repo, except data/sample/
```

## Related work at the hack

- **Photochrom Colours** by Nobu ([NbtKmy](https://github.com/NbtKmy)): colour bands of the photochroms by year,
  and an overlay of art reproductions on the paintings they copy (drag, rotate, fade, difference blending).
  Repo: https://github.com/NbtKmy/glamhack2026_photochrom, live: https://nbtkmy.github.io/glamhack2026_photochrom/index.html

## Data and licences

- Dataset: *Photochrom Collection of the Zentralbibliothek Zürich*, version 1.1, https://doi.org/10.5281/zenodo.24141227
  (files in `data/zenodo/` are byte-identical to this version)
- Metadata and derived data: CC0. Photochrom images: Public Domain Mark. Images are not in this
  repo; recatalogued images are available via IIIF (e-rara.ch), all images as ZIPs on Zenodo.
- Museum images (right side of the comparison) have **varying rights**; check before reuse.
- Code: MIT (see `LICENSE`).
