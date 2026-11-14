# UI review: open questions

Notes from the UI consistency pass (branch `feature/ui-consistency`). Each item is either a decision
taken without asking (marked **Decided**, easy to change) or something skipped because it was unclear
(**Open**).

## Details dialog

1. **Decided: one modal dialog instead of the side panel.** The Media Library used a side panel
   (no zoom) and the Image Comparison tab a modal dialog (zoomable image, resizable metadata). Both
   are now `openDetails()` in `js/lib/ui/details.js`, in the dialog form, because it shows more
   (zoom, all fields). To keep browsing fast in the Media Library, the dialog has ← / → (buttons and
   arrow keys) through the works in the current order. If you prefer a non-modal side panel (keep
   clicking tiles while it is open), the content code can stay; only the container changes.
2. **Decided: the dialog shows the whole scan in the Media Library and Candidates** (with color chart,
   as the old panel did), but the cropped print in the Image Comparison tab (what is compared).
   Should it always crop to the print area?
3. **Decided: the dialog loads the image at 2,000 px** (e-rara IIIF or the 2K Hugging Face scan),
   showing the 300 px thumbnail until it arrives. Fine for e-rara ("single images on demand")?
4. **Decided: painting metadata.** The key fields for paintings only knew the sample CSV columns
   (`pair_*`), so painting pairs from `artwork-pairs.csv` showed "No metadata available" (also in
   the old dialog). They now fall back to the `artwork-pairs.csv` columns.

## Selection and clicks

5. **Decided: Candidates tab, click = pick for comparison**, not "remove from selection". Removing a
   work is the × button on the card (visible on hover). Suggested pair cards: single click does
   nothing, double-click on one of the two images opens its details, Compare opens the pair.
6. **Decided: double-click in the Overlay / Slider / Differences views still zooms** (as before).
   Details are available there through the side-by-side view (double-click or the title link).
   Should double-click open details in those views too? It would conflict with zoom-on-double-click.
7. **Note:** a double-click first selects and then un-selects a tile (the outline flashes briefly).
   The alternative, waiting ~250 ms before a single click selects, makes selecting feel slow.

## Layout and labels

8. **Open: the "machine-generated" badge wraps** under "Image content" in the 260 px filter sidebar.
   Options: a shorter badge text ("auto"), a wider sidebar, or only the info icon there.
9. **Open: the selection bar wraps below about 1,100 px** window width (the primary button moves to
    a second line). Could collapse "Select all shown" / "Deselect shown" to icons on narrow windows.
10. **Decided: visible tab headings removed** ("Candidates", "Image Comparison" were large `h2`s;
    the Media Library had none). Each tab keeps a visually hidden `h2` for screen readers.
11. **Decided: kept visible**: the crop status line under the comparison toolbar (important to
    know that an image is cropped), the plot-type description in the color analysis (changes with the
    plot type), and error and status messages. Moved behind "i" buttons: the viewer usage hint, the
    adjustments note, difference blend, overlap and palette explanations, date filter and facet
    explanations, how pairs are found, how to pick two works.
12. **Decided: wording.** "N selected" in both selection bars; "CSV" / "JSON" with a download icon
    instead of "Export CSV" / "Export JSON"; "Screenshot" instead of "Save screenshot";
    "Open in Candidates" with an arrow icon.
