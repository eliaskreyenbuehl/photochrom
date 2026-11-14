"""Write data/image-sizes.csv: pixel size of each image on the thumbnail IIIF service.

The Media Library mosaic (masonry columns) needs the aspect ratio of every image before
it loads, so the tiles can be placed without jumping. The sizes are read from the
info.json files of the static thumbnail service (repository photochrom-images, built by
scripts/build_thumbs_iiif.py). Its "full" image is a downscaled copy of the scan, so the
aspect ratio is that of the whole scan (including colour chart and margin).

Run from the repository root, with photochrom-images checked out next to this repository:

    python scripts/build_image_sizes.py
    python scripts/build_image_sizes.py --thumbs ../photochrom-images/iiif

Then rebuild the catalog (python scripts/build_catalog.py), which copies the ratio into
the field "ar". Output columns: img, width, height (px of the thumbnail service's full image).
"""

import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "image-sizes.csv"


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--thumbs", type=Path, default=ROOT.parent / "photochrom-images" / "iiif",
                        help="folder with one sub-folder per image, each holding info.json")
    args = parser.parse_args()

    rows, broken = [], []
    for info in sorted(args.thumbs.glob("*/info.json")):
        try:
            data = json.loads(info.read_text(encoding="utf-8"))
            rows.append((info.parent.name, int(data["width"]), int(data["height"])))
        except (ValueError, KeyError) as err:
            broken.append((info.parent.name, err))

    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["img", "width", "height"])
        w.writerows(rows)
    print(f"{len(rows)} images -> {OUT.relative_to(ROOT)}")
    for name, err in broken:
        print(f"  unreadable: {name} ({err})")


if __name__ == "__main__":
    main()
