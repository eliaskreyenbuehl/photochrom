# Photochrom Research Environment

GLAMhack26, Winterthur. A digital research environment for the photochrom collection of the
Zentralbibliothek Zürich (ZB), built for the challenge **Detecting Image Manipulation**.

## About

_(in progress)_

## Repository

```
photochrom/
├── README.md
├── LICENSE                          MIT, for the code
├── data/
│   ├── artwork-pairs.csv            240 photochroms reproducing paintings, matched to the originals (Wikidata, Commons)
│   ├── sample/                      2 comparison pairs as JPEG + sample-metadata.csv (full metadata, image rights)
│   └── zenodo/                      copy of the dataset files (without images)
│       ├── photochrom-metadata.csv      9,610 records, IIIF links, coordinates
│       ├── photochrom-image-content.csv image content per record (genre, people, mountains …)
│       ├── photochrom-places.csv        place mentions with coordinates
│       ├── photochrom-main-place.csv    main motif per legacy record
│       └── embeddings-siglip2/          SigLIP 2 image vectors (embeddings.npy, dateien.csv)
├── docs/
│   ├── data.md                      the data in short: groups, files, keys, traps
│   └── background.md                how photochroms were made, why they differ from the originals
└── prototypes/
    └── artwork-pairs.html           first comparison page: photochrom (IIIF) next to the original (Commons), German labels
```

## Data and licences

- Dataset: *Photochrom Collection of the Zentralbibliothek Zürich*, https://doi.org/10.5281/zenodo.23956325
- Metadata and derived data: CC0. Photochrom images: Public Domain Mark. Images are not in this
  repo; recatalogued images are available via IIIF (e-rara.ch), all images as ZIPs on Zenodo.
- Museum images (right side of the comparison) have **varying rights**; check before reuse.
- Code: MIT (see `LICENSE`).
