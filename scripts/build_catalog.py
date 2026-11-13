"""Build data/catalog.json, the compact catalog the web app loads.

The four Zenodo CSVs in data/zenodo/ are about 20 MB. The browser only needs a few
fields per record, so this script joins them into one small JSON file.

Run from the repository root:

    python scripts/build_catalog.py

Inputs (unchanged): data/zenodo/photochrom-metadata.csv, photochrom-image-content.csv,
photochrom-places.csv, data/artwork-pairs.csv. Output: data/catalog.json.

Derived values and their provenance are described in the "fields" block of the output.
"""

import csv
import json
import re
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZENODO = ROOT / "data" / "zenodo"
OUT = ROOT / "data" / "catalog.json"

# Image content flags (yes/no columns) shown as filter pills, in display order.
FEATURES = {
    "menschen": "People",
    "kinder": "Children",
    "tiere": "Animals",
    "gebaeude": "Buildings",
    "kirche": "Church",
    "burg_festung": "Castle / fortress",
    "bruecke": "Bridge",
    "denkmal_statue": "Monument / statue",
    "hafenanlage": "Harbor",
    "schiff_boot": "Ship / boat",
    "dampfschiff": "Steamboat",
    "segelboot": "Sailboat",
    "eisenbahn": "Railroad",
    "fuhrwerk": "Carriage / cart",
    "strasse_weg": "Road / path",
    "berg": "Mountain",
    "verschneite_gipfel": "Snowy peaks",
    "gletscher": "Glacier",
    "fels": "Rocks",
    "tal": "Valley",
    "wald": "Forest",
    "wiese": "Meadow",
    "see": "Lake",
    "fluss_bach": "River / stream",
    "meer": "Sea",
    "wasserfall": "Waterfall",
}

GENRES = {
    "landschaft": "Landscape",
    "stadtansicht": "Townscape",
    "architektur": "Architecture",
    "dorfansicht": "Village view",
    "genreszene": "Genre scene",
    "reproduktion": "Reproduction",
    "industrie_technik": "Industry / technology",
    "portraet": "Portrait",
    "ereignis": "Event",
    "stillleben": "Still life",
    "luftbild": "Aerial view",
}

# GND area codes -> present-day country (English). Values not listed here
# (continents, oceans, historical states such as Yugoslavia, Czechoslovakia,
# Soviet Union, GDR, Ottoman or Roman Empire) are ignored: in this dataset they
# almost always appear next to a present-day country.
GERMAN_STATES = """Bayern Baden-Württemberg Rheinland-Pfalz Niedersachsen Thüringen Hessen
Sachsen-Anhalt Schleswig-Holstein Nordrhein-Westfalen Sachsen Mecklenburg-Vorpommern Brandenburg
Hamburg Berlin Bremen Saarland""".split()
AUSTRIAN_STATES = ["Tirol", "Wien", "Oberösterreich", "Niederösterreich", "Steiermark",
                   "Kärnten", "Land Salzburg", "Vorarlberg"]
COUNTRIES = {
    "Schweiz": "Switzerland", "Deutschland": "Germany", "Deutschland, Deutsches Reich": "Germany",
    "Österreich": "Austria", "Großbritannien": "United Kingdom", "Frankreich": "France",
    "Italien": "Italy", "Trentino-Südtirol": "Italy", "Vatikanstadt": "Vatican City",
    "Spanien": "Spain", "Portugal": "Portugal", "Norwegen": "Norway", "Svalbard und Jan Mayen": "Norway",
    "Schweden": "Sweden", "Dänemark": "Denmark", "Finnland": "Finland",
    "Niederlande": "Netherlands", "Belgien": "Belgium", "Luxemburg": "Luxembourg", "Monaco": "Monaco",
    "Irland": "Ireland", "Jersey": "Jersey", "Guernsey": "Guernsey", "Man (Insel)": "Isle of Man",
    "Gibraltar": "Gibraltar", "Montserrat (Insel)": "Montserrat",
    "Tschechische Republik": "Czech Republic", "Slowakei": "Slovakia", "Polen": "Poland",
    "Ungarn": "Hungary", "Rumänien": "Romania", "Slowenien": "Slovenia", "Kroatien": "Croatia",
    "Bosnien-Herzegowina": "Bosnia and Herzegovina", "Montenegro": "Montenegro", "Serbien": "Serbia",
    "Albanien": "Albania", "Griechenland": "Greece", "Türkei": "Turkey",
    "Russland": "Russia", "Ukraine": "Ukraine", "Weißrussland": "Belarus", "Lettland": "Latvia",
    "Georgien": "Georgia", "Aserbaidschan": "Azerbaijan", "Usbekistan": "Uzbekistan",
    "Ägypten": "Egypt", "Algerien": "Algeria", "Tunesien": "Tunisia", "Marokko": "Morocco",
    "Elfenbeinküste": "Côte d'Ivoire", "Israel": "Israel", "Jordanien": "Jordan",
    "Libanon": "Lebanon", "Syrien": "Syria", "Saudi-Arabien": "Saudi Arabia", "Iran": "Iran",
    "Indien": "India", "Nepal": "Nepal", "Sri Lanka": "Sri Lanka", "China": "China",
    "Singapur": "Singapore", "USA": "United States", "Kanada": "Canada", "Argentinien": "Argentina",
    "Australien": "Australia", "Neuseeland": "New Zealand",
}


def country_of(area):
    """Map one GND area code to a present-day country, or None."""
    if area.startswith("Kanton "):
        return "Switzerland"
    if area in GERMAN_STATES:
        return "Germany"
    if area in AUSTRIAN_STATES:
        return "Austria"
    return COUNTRIES.get(area)


def read(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def parse_years(value):
    """'1897' -> (1897, 1897); '1891/1914' -> (1891, 1914); anything else -> (None, None)."""
    m = re.fullmatch(r"(\d{4})(?:/(\d{4}))?", value.strip())
    if not m:
        return None, None
    y0 = int(m.group(1))
    return y0, int(m.group(2) or y0)


def date_flag(y0, y1):
    """'open' for an open end ('nach 1914' is catalogued as 1914/9999),
    'suspect' for dates that are probably typos in the catalogue
    (e.g. 1804/1896, 1814/1889, 1891/1941). Neither is corrected here."""
    if y0 is None:
        return None
    if y1 == 9999:
        return "open"
    if y0 < 1880 or y1 - y0 > 40:
        return "suspect"
    return None


def main():
    meta = read(ZENODO / "photochrom-metadata.csv")
    content = {r["mms_id"]: r for r in read(ZENODO / "photochrom-image-content.csv")}
    pairs = {r["mms_id"]: r["match_status"] for r in read(ROOT / "data" / "artwork-pairs.csv")}

    places = {}
    for r in sorted(read(ZENODO / "photochrom-places.csv"), key=lambda r: int(r["place_seq"] or 0)):
        places.setdefault(r["identifier_swisscollections"], []).append(r)

    feature_keys = list(FEATURES)
    records, unmapped, undated, flagged = [], Counter(), [], []
    for r in meta:
        mms = r["identifier_swisscollections"]
        y0, y1 = parse_years(r["date_of_publication_or_production_standardised"])
        flag = date_flag(y0, y1)
        if y0 is None:
            undated.append(mms)
        elif flag:
            flagged.append((mms, r["date_of_publication_or_production"], flag))
        if flag == "open":
            y1 = y0

        countries, labels = [], []
        for p in places.get(mms, []):
            if p["place_label"] and p["place_label"] not in labels:
                labels.append(p["place_label"])
            for area in filter(None, p["gnd_area_codes"].split("|")):
                c = country_of(area.strip())
                if c is None:
                    unmapped[area] += 1
                elif c not in countries:
                    countries.append(c)

        ic = content.get(mms, {})
        mask = 0
        for i, key in enumerate(feature_keys):
            if ic.get(key) == "ja":
                mask |= 1 << i

        rec = {
            "id": mms,
            "t": r["title"],
            "d": r["date_of_publication_or_production"],
            "y0": y0,
            "y1": y1,
            "s": "r" if r["subset"] == "recatalogued" else "l",
            "g": ic.get("genre") or None,
            "c": countries,
            "p": ", ".join(labels[:2]),
            "f": mask,
        }
        if flag:
            rec["df"] = flag
        if r["geo_primary_lat"]:
            rec["ll"] = [round(float(r["geo_primary_lat"]), 4), round(float(r["geo_primary_lon"]), 4)]
        if r["iiif_image_uris"]:
            # IIIF Image API base, without region/size/rotation/quality.
            first = r["iiif_image_uris"].split(" | ")[0]
            rec["iiif"] = re.sub(r"/full/full/0/default\.jpg$", "", first)
        if r["iiif_manifest_url"]:
            rec["man"] = r["iiif_manifest_url"]
        if r["digital_object_identifier"]:
            rec["doi"] = r["digital_object_identifier"]
        if r["image_files"]:
            rec["img"] = Path(r["image_files"].split(" | ")[0]).stem
        if ic.get("beschreibung_en"):
            rec["desc"] = ic["beschreibung_en"]
        if mms in pairs:
            rec["art"] = pairs[mms]
        records.append(rec)

    dated = [r for r in records if r["y0"] and r.get("df") != "suspect"]
    years = [r["y0"] for r in dated] + [r["y1"] for r in dated]
    catalog = {
        "source": "Photochrom Collection of the Zentralbibliothek Zürich, Zenodo v1.1, "
                  "https://doi.org/10.5281/zenodo.24141227 (metadata CC0)",
        "built": date.today().isoformat(),
        "years": [min(years), max(years)],
        "genres": GENRES,
        "features": [[k, FEATURES[k]] for k in feature_keys],
        "fields": {
            "id": "MMS ID (identifier_swisscollections)",
            "t": "title", "d": "date as catalogued",
            "y0/y1": "first/last year from date_of_publication_or_production_standardised; null if not parseable",
            "df": "date flag: 'open' = open end ('after y0', catalogued as y0/9999, y1 set to y0); "
                  "'suspect' = probably a typo in the catalogue, left uncorrected and outside the timeline axis",
            "s": "subset: r = recatalogued (IIIF), l = legacy (no IIIF)",
            "g": "genre, machine-generated (photochrom-image-content.csv, unreviewed)",
            "c": "present-day countries derived from GND area codes of all place mentions "
                 "(photochrom-places.csv); method: scripts/build_catalog.py, rule-based, unreviewed",
            "p": "first two place labels (photochrom-places.csv)",
            "f": "bit mask of image content flags, order as in 'features'; machine-generated, unreviewed",
            "ll": "primary coordinates [lat, lon]",
            "iiif": "IIIF Image API base URL of the first image (recatalogued only)",
            "man": "IIIF manifest URL", "doi": "DOI",
            "img": "image file name without extension (Zenodo image ZIPs)",
            "desc": "short image description, machine-generated, unreviewed",
            "art": "match_status in artwork-pairs.csv (record reproduces a painting)",
        },
        "records": records,
    }
    OUT.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"{len(records)} records -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.2f} MB)")
    print(f"years {catalog['years']}, undated: {len(undated)} {undated[:5]}")
    for mms, raw, flag in flagged:
        print(f"  date {flag}: {mms} {raw}")
    print(f"records without country: {sum(1 for r in records if not r['c'])}")
    print("ignored area codes:", ", ".join(f"{k} ({v})" for k, v in unmapped.most_common()))


if __name__ == "__main__":
    main()
