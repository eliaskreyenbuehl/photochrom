"""Find the photochrom print inside a scan, without color chart, gray scale or background.

Many scans show a Kodak color control strip and/or a gray scale next to the print,
on a dark or gray scanner background. This script estimates the bounding box of the
print itself with classical image processing (numpy only, no model):

1. Color chart: lines along an edge that contain strongly saturated pixels of several
   different hues (chart patches). Photochroms themselves are much less saturated.
2. Background: pixels close to the border color are background. The print is the
   largest block of rows/columns with content; strips separated by background
   (gray scales, labels) are dropped.

Output: CSV with the box as fractions of width/height (x0, y0, x1, y1), so it applies
to any resolution of the same scan, plus method and a confidence note.

    python scripts/detect_print_area.py --images <folder with iiif/<id>/full/300,/0/default.jpg> \
        --ids-from data/zenodo/photochrom-image-content.csv --out data/print-area.csv [--limit 50]
"""

import argparse
import csv
import zipfile
from io import BytesIO
from pathlib import Path, PurePosixPath

import numpy as np
from PIL import Image

METHOD = "detect_print_area-v1"


def hsv(a):
    """a: float RGB 0..1 -> (h 0..1, s, v)."""
    mx, mn = a.max(axis=2), a.min(axis=2)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    h = np.zeros_like(mx)
    m = d > 1e-6
    rm, gm = m & (mx == r), m & (mx == g) & (mx != r)
    bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    return h / 6, s, mx


def chart_lines(h, s, v, axis):
    """Boolean per line (rows if axis=1, cols if axis=0): looks like chart patches."""
    sat = (s > 0.5) & (v > 0.3)
    hue_bin = np.floor(h * 6).astype(int)
    n = sat.shape[0] if axis == 1 else sat.shape[1]
    out = np.zeros(n, bool)
    for i in range(n):
        line_sat = sat[i] if axis == 1 else sat[:, i]
        line_hue = hue_bin[i] if axis == 1 else hue_bin[:, i]
        if line_sat.mean() > 0.12 and len(set(line_hue[line_sat].tolist())) >= 3:
            out[i] = True
    return out


def cut_chart(h, s, v):
    """Returns (top, bottom, left, right) cut positions removing chart strips at the edges."""
    H, W = s.shape
    top, bottom, left, right = 0, H, 0, W
    rows, cols = chart_lines(h, s, v, 1), chart_lines(h, s, v, 0)
    # neutral gray lines (Kodak label band "KODAK Color Control Patches", gray background)
    neutral_rows, neutral_cols = s.mean(axis=1) < 0.08, s.mean(axis=0) < 0.08

    def depth(flags, neutral):
        """Depth of a chart strip seen from index 0: it must start in the outer 30 %
        and be contiguous (small gaps allowed). Colorful areas deeper inside the
        print (blue lakes, gilded interiors) are not taken for a chart. The neutral
        label band that often lies between the patches and the print is cut too."""
        n = len(flags)
        runs, start, end, count, gap = [], None, 0, 0, 0
        for i in range(int(n * 0.45)):
            if flags[i]:
                if start is None:
                    start, count = i, 0
                end, gap, count = i + 1, 0, count + 1
            elif start is not None:
                gap += 1
                if gap > 3:
                    runs.append((start, end, count))
                    start = None
        if start is not None:
            runs.append((start, end, count))
        # outermost block of chart lines that starts in the outer 30 %
        for s0, e0, c0 in runs:
            if c0 >= 3 and s0 < n * 0.3:
                limit = min(n, e0 + int((e0 - s0) * 1.5))
                while e0 < limit and neutral[e0]:
                    e0 += 1
                return e0
        return 0

    top = depth(rows, neutral_rows)
    bottom = H - depth(rows[::-1], neutral_rows[::-1])
    left = depth(cols, neutral_cols)
    right = W - depth(cols[::-1], neutral_cols[::-1])
    return top, bottom, left, right


def largest_run(flags, min_gap=2):
    """Longest run of True, tolerating gaps shorter than min_gap. Returns (start, end)."""
    best, start, gap = (0, len(flags)), None, 0
    best_len = 0
    for i, f in enumerate(list(flags) + [False] * (min_gap + 1)):
        if f:
            if start is None:
                start = i
            gap = 0
            end = i + 1
        elif start is not None:
            gap += 1
            if gap > min_gap:
                if end - start > best_len:
                    best, best_len = (start, end), end - start
                start, gap = None, 0
    return best


def outer_trim(flags, edge=0.3, min_gap=3):
    """Trim background lines from both ends. Then, if a background gap of at least
    min_gap lines lies in the outer `edge` share, cut there: it separates a strip
    (gray scale, label) from the print. Gaps in the middle are kept, because dark
    or uniform areas inside the print look like background too."""
    idx = np.nonzero(flags)[0]
    if len(idx) == 0:
        return 0, len(flags)
    a, b = int(idx[0]), int(idx[-1]) + 1
    span = b - a
    i = a
    while i < b:
        if not flags[i]:
            j = i
            while j < b and not flags[j]:
                j += 1
            if j - i >= min_gap:
                if j <= a + edge * span:
                    a = j
                elif i >= b - edge * span:
                    b = i
                    break
            i = j
        else:
            i += 1
    return a, b


def expand_to_edges(sub, rows, cols, y0, y1, x0, x1, strength=0.06, share=0.5, bg_share=0.2):
    """Edge refinement: dark or light parts of the print can look like background,
    so the box may stop inside the print. The paper edge of the print is a long
    straight edge. Each side is moved outwards to the outermost line with a
    continuous strong edge, if everything beyond it looks like background."""
    g = sub.mean(axis=2)
    Hs, Ws = g.shape
    # edge share per row (between row y-1 and y) within the current column range, and per column
    dy = np.abs(np.diff(g[:, x0:x1], axis=0)) > strength      # shape (Hs-1, w)
    dx = np.abs(np.diff(g[y0:y1, :], axis=1)) > strength      # shape (h, Ws-1)
    row_edge = dy.mean(axis=1) > share                          # edge between y and y+1 at index y
    col_edge = dx.mean(axis=0) > share
    bg_rows, bg_cols = ~rows, ~cols

    row_tex = g.std(axis=1)    # texture per row / column: print content varies, background does not
    col_tex = g.std(axis=0)

    def textured(tex, a, b):
        return b > a and tex[a:b].mean() > 0.04

    for y in range(2, y0):
        if row_edge[y] and bg_rows[:y + 1].mean() >= 1 - bg_share and textured(row_tex, y + 1, y0):
            y0 = y + 1
            break
    for y in range(Hs - 3, y1 - 1, -1):
        if row_edge[y] and bg_rows[y + 1:].mean() >= 1 - bg_share and textured(row_tex, y1, y + 1):
            y1 = y + 1
            break
    for x in range(2, x0):
        if col_edge[x] and bg_cols[:x + 1].mean() >= 1 - bg_share and textured(col_tex, x + 1, x0):
            x0 = x + 1
            break
    for x in range(Ws - 3, x1 - 1, -1):
        if col_edge[x] and bg_cols[x + 1:].mean() >= 1 - bg_share and textured(col_tex, x1, x + 1):
            x1 = x + 1
            break
    return y0, y1, x0, x1


def print_box(img):
    a = np.asarray(img.convert("RGB"), dtype=np.float32) / 255
    H, W = a.shape[:2]
    h, s, v = hsv(a)
    t, b, l, r = cut_chart(h, s, v)
    chart = (t, b, l, r) != (0, H, 0, W)
    sub = a[t:b, l:r]
    # background colour: median of the outer frame of the remaining area
    frame = np.concatenate([sub[:3].reshape(-1, 3), sub[-3:].reshape(-1, 3),
                            sub[:, :3].reshape(-1, 3), sub[:, -3:].reshape(-1, 3)])
    bg = np.median(frame, axis=0)
    content = np.abs(sub - bg).max(axis=2) > 0.12
    # also treat near-neutral dark pixels as background (dark scanner bed)
    content &= ~((sub.max(axis=2) < 0.18) & (np.ptp(sub, axis=2) < 0.06))
    rows = content.mean(axis=1) > 0.35
    cols = content.mean(axis=0) > 0.35
    y0, y1 = outer_trim(rows)
    x0, x1 = outer_trim(cols)
    y0, y1, x0, x1 = expand_to_edges(sub, rows, cols, y0, y1, x0, x1)
    box = (l + x0, t + y0, l + x1, t + y1)
    area = (box[2] - box[0]) * (box[3] - box[1]) / (W * H)
    note = "chart" if chart else "no chart"
    cut_area = (b - t) * (r - l) / (W * H)
    if area < 0.5 * cut_area:
        # Background trimming removed too much (e.g. light sky on light background):
        # fall back to the area left after removing the chart, minus a small margin.
        m = 0.02
        box = (l + int((r - l) * m), t + int((b - t) * m), r - int((r - l) * m), b - int((b - t) * m))
        note += "; fallback chart cut only, check"
    return [round(box[0] / W, 4), round(box[1] / H, 4), round(box[2] / W, 4), round(box[3] / H, 4)], note


def load_thumb(args, ident):
    """300 px thumbnail as used for tuning: from the thumbnail folder, or made from a preview ZIP
    exactly like build_thumbs_iiif.py does (LANCZOS to 300 px width, JPEG quality 80)."""
    if args.images:
        p = args.images / "iiif" / ident / "full" / "300," / "0" / "default.jpg"
        return Image.open(p).convert("RGB") if p.exists() else None
    hit = args.members.get(ident)
    if hit is None:
        return None
    z, name = hit
    with Image.open(BytesIO(z.read(name))) as im:
        im = im.convert("RGB")
        w = min(300, im.width)
        small = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    buf = BytesIO()
    small.save(buf, "JPEG", quality=80, optimize=True, progressive=True)
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--images", type=Path, help="thumbnail folder: <images>/iiif/<id>/full/300,/0/default.jpg")
    src.add_argument("--zip", type=Path, nargs="+",
                     help="preview ZIPs from Zenodo (images-*-preview.zip); images are reduced to the "
                          "300 px thumbnails used for tuning (same steps as build_thumbs_iiif.py)")
    ap.add_argument("--ids-from", required=True, type=Path, help="CSV with image_filename and scan_farbkarte")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--all", action="store_true", help="all images, not only those with scan_farbkarte = ja")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--seed", type=int, help="shuffle with this seed before --limit (test samples)")
    args = ap.parse_args()

    with open(args.ids_from, encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.DictReader(f) if args.all or r["scan_farbkarte"] == "ja"]
    ids = [r["image_filename"].rsplit(".", 1)[0] for r in rows]
    if args.seed is not None:
        import random
        random.Random(args.seed).shuffle(ids)
    if args.limit:
        ids = ids[: args.limit]

    if args.zip:
        args.members = {}
        for zp in args.zip:
            z = zipfile.ZipFile(zp)
            for name in z.namelist():
                if name.lower().endswith(".jpg"):
                    args.members[PurePosixPath(name).stem] = (z, name)
    missing = 0
    with open(args.out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["img", "x0", "y0", "x1", "y1", "note", "method", "review_status"])
        for ident in ids:
            im = load_thumb(args, ident)
            if im is None:
                missing += 1
                continue
            box, note = print_box(im)
            w.writerow([ident, *box, note, METHOD, "machine-generated, unreviewed"])
    print(f"{len(ids) - missing} images -> {args.out} ({missing} not found)")


if __name__ == "__main__":
    main()
