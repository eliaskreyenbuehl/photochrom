"""Resolve the Wikimedia Commons images of data/artwork-pairs.csv to direct, CORS-enabled URLs.

`commons_image_url` in artwork-pairs.csv uses Special:FilePath. Its redirects send no CORS
header, so the browser refuses pixel access (color analysis, canvas). The direct URLs on
upload.wikimedia.org / thumb.wikimedia.org allow CORS. This script asks the Commons API once
per file and writes data/commons-images.csv (one row per Commons file), including size,
license and author, because museum photographs on Commons have varying rights.

    python scripts/resolve_commons_urls.py [--limit 10]

Requests: batches of 50 titles, at least 1 s pause, answers cached in ../cache/commons/
(outside the repository), so re-runs do not query Commons again.
"""

import argparse
import csv
import hashlib
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import date
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAIRS = ROOT / "data" / "artwork-pairs.csv"
OUT = ROOT / "data" / "commons-images.csv"
CACHE = ROOT.parent / "cache" / "commons"
API = "https://commons.wikimedia.org/w/api.php"
UA = "photochrom-research-environment/1.0 (https://github.com/eliaskreyenbuehl/photochrom)"
THUMB_WIDTH = 1600
METHOD = "commons-api-imageinfo"


def title_of(file_page_url):
    """'https://commons.wikimedia.org/wiki/File:A%20B.jpg' -> 'File:A B.jpg'"""
    name = urllib.parse.unquote(file_page_url.split("/wiki/", 1)[1])
    return name if name.startswith("File:") else f"File:{name}"


def plain(html):
    """Strip HTML from extmetadata values."""
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", "", html or ""))).strip()


def query(titles, last_call):
    params = {
        "action": "query", "format": "json", "formatversion": "2", "redirects": "1",
        "titles": "|".join(titles), "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata", "iiurlwidth": str(THUMB_WIDTH),
        "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|Credit|AttributionRequired|UsageTerms",
    }
    url = f"{API}?{urllib.parse.urlencode(params)}"
    key = hashlib.sha1(url.encode()).hexdigest()
    cached = CACHE / f"{key}.json"
    if cached.exists():
        return json.loads(cached.read_text(encoding="utf-8")), last_call
    wait = 1.0 - (time.monotonic() - last_call)
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        data = json.load(res)
    last_call = time.monotonic()
    CACHE.mkdir(parents=True, exist_ok=True)
    cached.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data, last_call


def thumb_size(ii):
    m = re.search(r"/(\d+)px-[^/]*$", ii.get("thumburl", "").split("?")[0])
    if not m:
        return {"thumb_width": ii.get("width", ""), "thumb_height": ii.get("height", "")}
    w = int(m.group(1))
    return {"thumb_width": w, "thumb_height": round(ii["height"] * w / ii["width"])}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, help="resolve only the first N files (test runs)")
    args = ap.parse_args()

    with open(PAIRS, encoding="utf-8-sig", newline="") as f:
        files = sorted({r["commons_file"] for r in csv.DictReader(f) if r["commons_file"]})
    if args.limit:
        files = files[: args.limit]
    titles = {title_of(u): u for u in files}

    found, last_call = {}, 0.0
    names = list(titles)
    for i in range(0, len(names), 50):
        data, last_call = query(names[i:i + 50], last_call)
        q = data.get("query", {})
        # map requested title -> final title (normalization and redirects)
        alias = {n["from"]: n["to"] for n in q.get("normalized", [])}
        alias.update({r["from"]: r["to"] for r in q.get("redirects", [])})
        pages = {p["title"]: p for p in q.get("pages", [])}
        for t in names[i:i + 50]:
            final = t
            while final in alias:
                final = alias[final]
            found[t] = (final, pages.get(final))

    today = date.today().isoformat()
    cols = ["commons_file", "commons_title", "status", "original_url", "thumb_url", "thumb_width",
            "thumb_height", "width", "height", "mime", "license", "license_url", "artist", "credit",
            "attribution_required", "method", "retrieved"]
    counts = {}
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for t, page_url in titles.items():
            final, page = found.get(t, (t, None))
            row = {"commons_file": page_url, "commons_title": final, "method": METHOD, "retrieved": today}
            info = (page or {}).get("imageinfo")
            if not info:
                row["status"] = "missing" if page and page.get("missing") else "not found"
            else:
                ii, meta = info[0], info[0].get("extmetadata", {})
                row.update({
                    "status": "ok",
                    # strip tracking parameters (utm_*) the API appends
                    "original_url": ii["url"].split("?")[0],
                    "thumb_url": ii.get("thumburl", "").split("?")[0],
                    # Wikimedia serves standard sizes (e.g. 1920 px when 1600 is asked); take the real
                    # width from the URL, or the original size when no smaller thumbnail exists
                    **thumb_size(ii),
                    "width": ii.get("width", ""), "height": ii.get("height", ""), "mime": ii.get("mime", ""),
                    "license": plain(meta.get("LicenseShortName", {}).get("value")),
                    "license_url": plain(meta.get("LicenseUrl", {}).get("value")),
                    "artist": plain(meta.get("Artist", {}).get("value"))[:300],
                    "credit": plain(meta.get("Credit", {}).get("value"))[:300],
                    "attribution_required": plain(meta.get("AttributionRequired", {}).get("value")),
                })
            counts[row["status"]] = counts.get(row["status"], 0) + 1
            w.writerow(row)
    print(f"{len(titles)} Commons files -> {OUT.relative_to(ROOT)}: {counts}")


if __name__ == "__main__":
    main()
