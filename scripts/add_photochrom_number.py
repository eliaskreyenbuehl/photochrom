"""Add the column `photochrom_number` to the metadata CSVs.

Files: data/zenodo/photochrom-metadata.csv (note column `general_note`) and
data/sample/sample-metadata.csv (note column `photochrom_general_note`).

The Photochrom number (e.g. "17510.P.Z.", printed in the lower left corner) is recorded
in the general note, together with other remarks. This script copies only the number.

Which part of the note counts: the note is split at "###" and the first segment with an
number on the print wins, e.g.

    Photochrom-Nummer "18503.P.Z." -- unten links in Gold
    "11683 P.Z." -- unten links
    Unten links: "4804. P.Z."

Segments that refer to other prints or to handwritten notes ("Grösseres Format von 662. P.Z.",
"Photochrom Nr. 1751 ist das gleiche Bild", "Ohne Photochrom-Nummer ...", "Ermittelte
Photochromnummer 4698") are skipped. A number is taken when it is followed by "P.Z." or
"PH.Z." (also "P.Z. 4733" with the number after), or when it stands alone in quotes in a
segment labelled "Photochrom-Nummer" ("12122."). Thousands separators are dropped
("15,133" -> 15133), suffixes as well ("1381.B.P.Z." -> 1381, "15389_1, P.Z." -> 15389,
"8337-2. P.Z." -> 8337). For a corrected reading ("[fehlt]16.P.Z." i.e. "1316.P.Z.") the
corrected number is used. No number: empty.

Method: rule-based (regular expressions), machine-made, unreviewed. Re-running the script
replaces the column, so it is safe to run twice. All other cells stay byte-identical.

    py scripts/add_photochrom_number.py            # write the column
    py scripts/add_photochrom_number.py --dry-run  # only print counts and odd cases
"""

import argparse
import csv
import io
import re
from collections import Counter
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
# CSV file -> column holding the general note
CSV_FILES = {
    DATA / "zenodo" / "photochrom-metadata.csv": "general_note",
    DATA / "sample" / "sample-metadata.csv": "photochrom_general_note",
}
COLUMN = "photochrom_number"
BOM = b"\xef\xbb\xbf"

# Segments that refer to another print or a handwritten note, not to this print.
REFERENCE = re.compile(r"Ohne Photochrom-Nummer|Unnummeriert|Vgl\.|Entspricht|dasselbe Motiv|Format von|"
                       r"Photochrom Nr\.|Bild Nr\.|Ermittelte|handschriftlich|Fassung|gleiche Bild", re.I)
# Corrected reading: ... i.e. "1316.P.Z."
CORRECTED = re.compile(r'i\.\s*e\.\s*"(?P<text>[^"]*)"')
NUMBER = r"(?P<num>\d{1,3}(?:,\d{3})+|\d+)"
# Number, optional suffix (_1, -2, .B), optional "(?)" or stray quote, then P.Z. / PH.Z.
BEFORE_PZ = re.compile(NUMBER + r"(?:[_-]\d+)?[\s.,\"]*(?:\(\?\)\s*)?(?:[A-Z]\.\s*)?P\.?\s*H?\.?\s*Z\b")
AFTER_PZ = re.compile(r"\bP\.?\s*H?\.?\s*Z\.?\s*" + NUMBER)
LABELLED = re.compile(r"Photochrom-Nummer")
QUOTED_NUMBER = re.compile(r'"\s*' + NUMBER + r'(?:[_-]\d+)?\.?\s*"')


def clean(num):
    return num.replace(",", "")


def photochrom_number(note):
    """Engraved Photochrom number from general_note, or '' if there is none."""
    for segment in note.split("###"):
        corrected = CORRECTED.search(segment)
        if corrected:
            m = BEFORE_PZ.search(corrected.group("text"))
            if m:
                return clean(m.group("num"))
        if REFERENCE.search(re.sub(r"\([^)]*\)", "", segment)):  # remarks in brackets do not count
            continue
        for pattern in (BEFORE_PZ, AFTER_PZ):
            m = pattern.search(segment)
            if m:
                return clean(m.group("num"))
        if LABELLED.search(segment):  # 'Photochrom-Nummer "12122."' without P.Z.
            m = QUOTED_NUMBER.search(segment)
            if m:
                return clean(m.group("num"))
    return ""


def add_column(path, note_name, dry_run):
    """Add or refresh the column in one CSV; keeps BOM, line endings and all other cells."""
    raw = path.read_bytes()
    bom = raw.startswith(BOM)
    newline = "\r\n" if b"\r\n" in raw else "\n"
    rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"), newline="")))
    header, body = rows[0], rows[1:]
    note_col = header.index(note_name)
    if COLUMN in header:  # re-run: replace the column
        col = header.index(COLUMN)
    else:
        col = len(header)
        header.append(COLUMN)
        for r in body:
            r.append("")

    lengths = Counter()
    odd = []
    for r in body:
        num = photochrom_number(r[note_col])
        r[col] = num
        lengths[len(num)] += 1
        if num and len(num) not in (3, 4, 5):
            odd.append((num, r[note_col][:120]))

    print(f"{path.name}: {len(body)} rows, {len(body) - lengths[0]} with a number, {lengths[0]} without")
    print("  digits:", dict(sorted((k, v) for k, v in lengths.items() if k)))
    for num, note in odd:
        print(f"  check {num:>7}  {note}")

    if not dry_run:
        out = io.StringIO(newline="")
        csv.writer(out, lineterminator=newline).writerows([header, *body])
        path.write_bytes((BOM if bom else b"") + out.getvalue().encode("utf-8"))
        print(f"  written: {path}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    for path, note_name in CSV_FILES.items():
        add_column(path, note_name, args.dry_run)


if __name__ == "__main__":
    main()
