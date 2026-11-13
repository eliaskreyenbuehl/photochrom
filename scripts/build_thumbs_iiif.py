"""Build static IIIF Image API 2.1 (level 0) thumbnails for all records.

Legacy records have no IIIF service, and the web app should not load hundreds of
thumbnails from e-rara (a production system) while scrolling. This script reads the
800 px previews from images-legacy-preview.zip and images-recatalogued-preview.zip
(Zenodo) and writes, per image (identifier = file name = catalog field "img"):

    <out>/iiif/<id>/info.json
    <out>/iiif/<id>/full/<w>,/0/default.jpg     for each width in --sizes

The output folder is meant for a separate repository published with GitHub Pages
(e.g. photochrom-images), not for this code repository.

Level 0 means: no image server, only the sizes listed in info.json exist. The "full"
image of this service is the 800 px preview; only the listed widths are served.

    python scripts/build_thumbs_iiif.py --zip <legacy-preview.zip> --zip <recatalogued-preview.zip> \
        --out <folder> --base-url https://<user>.github.io/photochrom-images/iiif --limit 50

Existing files are not overwritten (re-runs skip finished images).
"""

import argparse
import json
import zipfile
from io import BytesIO
from pathlib import Path, PurePosixPath

from PIL import Image


def build_one(z, name, root, base, widths, quality):
    """Writes info.json and thumbnails for one ZIP member; returns bytes written (0 = skipped)."""
    ident = PurePosixPath(name).stem
    folder = root / ident
    info_path = folder / "info.json"
    if info_path.exists():
        return 0
    written = 0
    with Image.open(BytesIO(z.read(name))) as im:
        im = im.convert("RGB")
        sizes = []
        for w in widths:
            w = min(w, im.width)
            h = round(im.height * w / im.width)
            target = folder / "full" / f"{w}," / "0" / "default.jpg"
            target.parent.mkdir(parents=True, exist_ok=True)
            im.resize((w, h), Image.LANCZOS).save(target, "JPEG", quality=quality,
                                                  optimize=True, progressive=True)
            written += target.stat().st_size
            sizes.append({"width": w, "height": h})
        info = {
            "@context": "http://iiif.io/api/image/2/context.json",
            "@id": f"{base}/{ident}",
            "protocol": "http://iiif.io/api/image",
            "width": im.width,
            "height": im.height,
            "profile": ["http://iiif.io/api/image/2/level0.json"],
            "sizes": sizes,
        }
    # info.json last: its presence marks the image as finished
    info_path.write_text(json.dumps(info, indent=1), encoding="utf-8")
    return written + info_path.stat().st_size


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zip", required=True, type=Path, action="append",
                    help="preview ZIP from Zenodo; repeat for several ZIPs")
    ap.add_argument("--out", required=True, type=Path, help="output folder (root of the images repo)")
    ap.add_argument("--base-url", required=True, help="public URL of <out>/iiif, used as @id in info.json")
    ap.add_argument("--sizes", default="300", help="comma-separated widths, default 300")
    ap.add_argument("--quality", type=int, default=80, help="JPEG quality, default 80")
    ap.add_argument("--limit", type=int, help="process only the first N images per ZIP (test runs)")
    args = ap.parse_args()

    widths = sorted(int(w) for w in args.sizes.split(","))
    base = args.base_url.rstrip("/")
    root = args.out / "iiif"
    total = done = skipped = written_bytes = 0

    for zip_path in args.zip:
        with zipfile.ZipFile(zip_path) as z:
            members = sorted(m for m in z.namelist() if m.lower().endswith(".jpg"))
            if args.limit:
                members = members[: args.limit]
            total += len(members)
            for i, name in enumerate(members, 1):
                n = build_one(z, name, root, base, widths, args.quality)
                if n:
                    done += 1
                    written_bytes += n
                else:
                    skipped += 1
                if i % 500 == 0:
                    print(f"  {zip_path.name}: {i}/{len(members)}", flush=True)

    print(f"{done} images written, {skipped} already present, of {total}")
    if done:
        print(f"{written_bytes / 1e6:.2f} MB written, {written_bytes / done / 1e3:.1f} KB per image")


if __name__ == "__main__":
    main()
