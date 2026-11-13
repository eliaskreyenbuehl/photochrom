# Sample: two comparison pairs

Two photochroms that reproduce paintings, each with an image of the original, for building and
testing the comparison view. Both pairs come from `data/artwork-pairs.csv` (Wikidata match,
`match_status = certain`, unreviewed) and are starting cases of the challenge.

| sample_id | photochrom | original | what to look at |
|---|---|---|---|
| `gleyre-le-soir` | *Les illusions perdues : Musée du Louvre*, ca. 1899, [e-rara](https://doi.org/10.3931/e-rara-139591) | Charles Gleyre, *Le Soir / Les Illusions perdues*, 1843, Louvre INV 10039, [Wikidata Q24413307](https://www.wikidata.org/wiki/Q24413307) | colours and mood |
| `correggio-heilige-nacht` | *Madonna mit Kind : Dresdener Galerie*, ca. 1901, [e-rara](https://doi.org/10.3931/e-rara-139553) | Correggio, *Die Heilige Nacht*, c. 1529–1530, Dresden Gal.-Nr. 152, [Wikidata Q1527541](https://www.wikidata.org/wiki/Q1527541) | the photochrom shows only a **detail** of the painting |

## Files

- `<sample_id>_photochrom.jpg`: from the e-rara IIIF service, 2000 px long side
- `<sample_id>_original.jpg`: from Wikimedia Commons
- `sample-metadata.csv`: one row per pair, 104 columns
  - `photochrom_*`: the full catalogue record from `photochrom-metadata.csv`
  - `pair_*`: the Wikidata match from `artwork-pairs.csv`
  - `original_*`: source, size, author, credit and licence of the Commons image

## Rights

- Photochroms: Public Domain Mark, Zentralbibliothek Zürich.
- `correggio-heilige-nacht_original.jpg`: public domain (Wikimedia Commons). Only 733 × 1000 px;
  the [SKD online collection](https://skd-online-collection.skd.museum/Details/Index/243576) has a better image.
- `gleyre-le-soir_original.jpg`: photograph by **Françoise Foliot, CC BY-SA 4.0**,
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Fran%C3%A7oise_Foliot_-_Charles_Gleyre_-_Le_Soir.jpg).
  Attribution and share-alike are required whenever it is shown or passed on.
