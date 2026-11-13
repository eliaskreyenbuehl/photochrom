"""Upload the 2K legacy scans to a public Hugging Face dataset repository.

Legacy records have no IIIF service. For zooming in the Image Comparison tab the app
loads the whole 2K JPEG on demand (no tiles; about 620 KB per image). GitHub Pages is
limited to 1 GB, the 7,638 images are 4.8 GB, so they live on Hugging Face, which
serves files with CORS (needed for color analysis on canvas).

Reads directly from images-legacy-2k.zip (Zenodo), no extraction. Uploads in commits of
--batch files; files already in the repository are skipped, so a re-run continues.

Login first (once, token with write access): hf auth login

    python scripts/upload_legacy_2k_hf.py --zip <images-legacy-2k.zip> --repo eliaskre/photochrom-legacy-2k --limit 20
    python scripts/upload_legacy_2k_hf.py --zip <images-legacy-2k.zip> --repo eliaskre/photochrom-legacy-2k

Image URL: https://huggingface.co/datasets/<repo>/resolve/main/images/<img>.jpg
"""

import argparse
import zipfile
from pathlib import PurePosixPath

from huggingface_hub import CommitOperationAdd, HfApi

CARD = """---
license: other
license_name: public-domain-mark-1.0
license_link: https://creativecommons.org/publicdomain/mark/1.0/
pretty_name: Photochrom Collection ZB Zürich, legacy scans (2K)
tags:
- cultural-heritage
- glam
- photochrom
- images
size_categories:
- 1K<n<10K
---

# Photochrom Collection of the Zentralbibliothek Zürich: legacy scans (2K)

The 2K JPEG scans of the **legacy** records of the Photochrom Collection of the
Zentralbibliothek Zürich (records without a IIIF service on e-rara.ch). Hosted here so the
Photochrom research environment (https://github.com/eliaskreyenbuehl/photochrom) can load
single images for zooming and color analysis.

- **Source:** Photochrom Collection of the Zentralbibliothek Zürich, Zenodo, version 1.1,
  https://doi.org/10.5281/zenodo.24141227 (file `images-legacy-2k.zip`, unchanged copies)
- **Rights:** images Public Domain Mark 1.0; metadata of the dataset CC0
- **Layout:** `images/<id>.jpg`, `<id>` = image file name in the dataset (field `img` in the
  app's `data/catalog.json`; MARC 993$a for most records)
- **Metadata** (titles, dates, places, MMS IDs) is in the Zenodo dataset, not here.
- About half of the scans show a Kodak color chart next to the print. Boxes of the print area
  are being computed (`print-area.csv` in the app repository).
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zip", required=True)
    ap.add_argument("--repo", required=True, help="e.g. eliaskre/photochrom-legacy-2k")
    ap.add_argument("--batch", type=int, default=100)
    ap.add_argument("--limit", type=int, help="upload at most N new images (test runs)")
    args = ap.parse_args()

    api = HfApi()
    api.create_repo(args.repo, repo_type="dataset", private=False, exist_ok=True)
    existing = set(api.list_repo_files(args.repo, repo_type="dataset"))
    if "README.md" not in existing:
        api.upload_file(path_or_fileobj=CARD.encode("utf-8"), path_in_repo="README.md",
                        repo_id=args.repo, repo_type="dataset", commit_message="Dataset card")

    z = zipfile.ZipFile(args.zip)
    todo = []
    for name in sorted(z.namelist()):
        if not name.lower().endswith(".jpg"):
            continue
        target = f"images/{PurePosixPath(name).name}"
        if target not in existing:
            todo.append((name, target))
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(existing)} files in repo, {len(todo)} to upload")

    done = 0
    for i in range(0, len(todo), args.batch):
        chunk = todo[i:i + args.batch]
        ops = [CommitOperationAdd(path_in_repo=t, path_or_fileobj=z.read(n)) for n, t in chunk]
        api.create_commit(args.repo, repo_type="dataset", operations=ops,
                          commit_message=f"Add {len(chunk)} legacy 2K scans")
        done += len(chunk)
        print(f"{done}/{len(todo)} uploaded", flush=True)


if __name__ == "__main__":
    main()
