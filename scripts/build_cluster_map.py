"""Builds the similarity map of the Media Library (view "Map").

Each image becomes a point in 2D: UMAP of its SigLIP 2 image embedding, so visually similar
images lie close together. Points are coloured by the HDBSCAN cluster from the cluster analysis
(scripts/similarity.ipynb), each cluster gets its keyword label and a light background area.
Everything here is machine-generated and unreviewed.

Inputs (repo root):
  data/zenodo/embeddings-siglip2/embeddings.npy, dateien.csv
      the embeddings the clusters were computed from (same rows as the notebook)
  data/cluster-analysis/clusters_with_labels.csv
      cluster id and keyword label per embedding row (from the notebook)
  data/catalog.json
      only images of catalog records are written (field `img`)

Outputs:
  data/cluster-analysis/umap-2d.npy   2D UMAP coordinates per embedding row (cache, see below)
  data/cluster-map.json               points, clusters, palette, extent for the web app
  data/cluster-map-bg.png             light cluster areas, drawn behind the points

The 2D UMAP is computed once and cached in umap-2d.npy (UMAP output differs between versions
and machines, so the map stays stable). Pass --recompute to compute it again.

Requires: numpy, scipy, pillow; umap-learn only for --recompute or a missing cache
  (pip install umap-learn pillow scipy)

Usage: python scripts/build_cluster_map.py [--recompute]
"""

import argparse
import csv
import json
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent.parent
EMB = ROOT / "data/zenodo/embeddings-siglip2/embeddings.npy"
FILES = ROOT / "data/zenodo/embeddings-siglip2/dateien.csv"
CLUSTERS = ROOT / "data/cluster-analysis/clusters_with_labels.csv"
CATALOG = ROOT / "data/catalog.json"
CACHE = ROOT / "data/cluster-analysis/umap-2d.npy"
OUT_JSON = ROOT / "data/cluster-map.json"
OUT_PNG = ROOT / "data/cluster-map-bg.png"

# UMAP parameters of the 2D plot in scripts/similarity.ipynb
UMAP_PARAMS = dict(n_components=2, n_neighbors=30, min_dist=0.1, metric="cosine", random_state=42)

# Categorical palette (8 hues, validated order). There are far more clusters than hues, so
# hues are assigned like on a political map: clusters whose areas touch get different hues.
# Clusters are identified by their labels, not by colour alone.
PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
GRID = 1000              # background raster, cells per side
BG_RADIUS_FRAC = 0.025   # a cell belongs to the nearest clustered point within this share of the extent
LIGHTNESS = 0.8          # background tint: 0 = full hue, 1 = white
SCALE = 100              # coordinates are rescaled to 0..SCALE on the longer side


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def umap_2d(recompute):
    if CACHE.exists() and not recompute:
        print(f"using cached {CACHE.relative_to(ROOT)}")
        return np.load(CACHE)
    import umap  # only needed here

    emb = np.load(EMB).astype(np.float32)
    X = emb / np.linalg.norm(emb, axis=1, keepdims=True)
    print(f"computing UMAP of {X.shape} …")
    xy = umap.UMAP(**UMAP_PARAMS).fit_transform(X).astype(np.float32)
    np.save(CACHE, xy)
    return xy


def color_clusters(grid_labels, n_clusters):
    """Greedy graph colouring: clusters whose background areas touch get different hues."""
    neighbors = [set() for _ in range(n_clusters)]
    for a, b in ((grid_labels[:, :-1], grid_labels[:, 1:]), (grid_labels[:-1, :], grid_labels[1:, :])):
        mask = (a >= 0) & (b >= 0) & (a != b)
        for i, j in set(zip(a[mask].tolist(), b[mask].tolist())):
            neighbors[i].add(j)
            neighbors[j].add(i)
    slot = [-1] * n_clusters
    used = [0] * len(PALETTE)
    for c in sorted(range(n_clusters), key=lambda c: -len(neighbors[c])):
        taken = {slot[n] for n in neighbors[c]}
        free = [s for s in range(len(PALETTE)) if s not in taken]
        if not free:
            print(f"warning: cluster {c} touches all {len(PALETTE)} hues")
            free = list(range(len(PALETTE)))
        slot[c] = min(free, key=lambda s: used[s])  # spread hues evenly
        used[slot[c]] += 1
    return slot


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--recompute", action="store_true", help="compute the 2D UMAP again")
    args = ap.parse_args()

    files = read_csv(FILES)
    rows = read_csv(CLUSTERS)
    assert len(files) == len(rows), "dateien.csv and clusters_with_labels.csv must have the same rows"
    for f, r in zip(files, rows):
        assert (f["image_filename"], f["subset"]) == (r["image_filename"], r["subset"]), f"row order differs at {f}"

    xy = umap_2d(args.recompute)
    assert len(xy) == len(rows)

    # rescale to 0..SCALE, keep the aspect ratio
    xy = xy - xy.min(axis=0)
    xy = xy * (SCALE / xy.max())
    labels = np.array([int(r["cluster"]) for r in rows])
    n_clusters = labels.max() + 1

    # --- background areas: every cell takes the cluster of the nearest clustered point nearby ---
    pad = 0.04 * SCALE
    x0, y0 = xy.min(axis=0) - pad
    x1, y1 = xy.max(axis=0) + pad
    clustered = labels >= 0
    gx, gy = np.meshgrid(np.linspace(x0, x1, GRID), np.linspace(y0, y1, GRID))
    dist, idx = cKDTree(xy[clustered]).query(np.c_[gx.ravel(), gy.ravel()])
    radius = BG_RADIUS_FRAC * max(x1 - x0, y1 - y0)
    grid_labels = np.where(dist <= radius, labels[clustered][idx], -1).reshape(GRID, GRID)

    slot = color_clusters(grid_labels, n_clusters)
    colors = [PALETTE[s] for s in slot]

    rgb = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in colors], dtype=float)
    tint = np.round((1 - LIGHTNESS) * rgb + LIGHTNESS * 255).astype(np.uint8)
    rgba = np.zeros((GRID, GRID, 4), dtype=np.uint8)
    inside = grid_labels >= 0
    rgba[inside, :3] = tint[grid_labels[inside]]
    rgba[inside, 3] = 255
    # grid row 0 is y0 (bottom); image row 0 is the top
    Image.fromarray(rgba[::-1], "RGBA").save(OUT_PNG, optimize=True)

    # --- clusters: label on the member closest to the cluster median (inside even if non-convex) ---
    clusters = []
    for c in range(n_clusters):
        members = np.flatnonzero(labels == c)
        pts = xy[members]
        center = pts[np.argmin(np.linalg.norm(pts - np.median(pts, axis=0), axis=1))]
        names = {rows[i]["label"] for i in members}
        assert len(names) == 1, f"cluster {c} has several labels: {names}"
        clusters.append({
            "id": c, "label": names.pop(), "n": int(len(members)),
            "x": round(float(center[0]), 2), "y": round(float(center[1]), 2), "color": colors[c],
        })

    # --- points of catalog records ---
    catalog_imgs = {r.get("img") for r in json.loads(CATALOG.read_text(encoding="utf-8"))["records"]}
    keep = [i for i, r in enumerate(rows) if Path(r["image_filename"]).stem in catalog_imgs]
    points = {
        "img": [Path(rows[i]["image_filename"]).stem for i in keep],
        "x": [round(float(xy[i, 0]), 2) for i in keep],
        "y": [round(float(xy[i, 1]), 2) for i in keep],
        "c": [int(labels[i]) for i in keep],
    }

    out = {
        "source": "scripts/build_cluster_map.py",
        "built": date.today().isoformat(),
        "method": (
            "Positions: UMAP (2D, n_neighbors=30, min_dist=0.1, cosine) of the SigLIP 2 image embeddings "
            "(data/zenodo/embeddings-siglip2). Clusters and labels: HDBSCAN on a 10D UMAP with keyword "
            "labels (scripts/similarity.ipynb, data/cluster-analysis/clusters_with_labels.csv). "
            "Machine-generated, unreviewed."
        ),
        "background": OUT_PNG.relative_to(ROOT).as_posix(),
        "extent": [round(float(v), 2) for v in (x0, y0, x1, y1)],
        "clusters": clusters,
        "points": points,
    }
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"{n_clusters} clusters, {int((labels < 0).sum())} noise points")
    print(f"{len(keep)} of {len(rows)} points written (others are not in catalog.json)")
    print(f"hues used: {sorted(set(slot))}")
    print(f"{OUT_JSON.relative_to(ROOT)}: {OUT_JSON.stat().st_size / 1024:.0f} KB, "
          f"{OUT_PNG.relative_to(ROOT)}: {OUT_PNG.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
