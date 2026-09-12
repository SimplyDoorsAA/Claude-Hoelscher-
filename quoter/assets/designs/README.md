# Design photography

Pulled from the Hoelscher catalogs by
`tools/extract-door-images.py --designs`, which files each picture by the name
printed with it rather than by a part number — these are all choices the price
sheet does not name.

- **grilles** — the eleven knotty alder iron grille designs (catalog pages
  55–57). The sheet prices one generic `KA 3/4 Lite Iron Grille` row, so the
  design is a free choice; `sizes` records which sizes the catalog lists each in.
  Nine of the eleven are also the fiberglass line's grille styles.
- **decorativeGlass** — the seven leaded glasses (pages 48–49). No catalog shows
  these as a flat swatch; each is printed as a door glazed with it, which is
  what is stored here.
- **accessories** — the three iron masks and the two speakeasy inserts (page 50).
- **decorativeGlass / Blanco** — page 25 photographs the Blanco only as the
  Blanco Center Arch door, which is the door card's own picture; it is filed
  here by hand so the glass has a swatch where it is a choice (page 31).
- **decorativeGlass / Dartmouth** — page 28's "Other Available Decorative Glass
  Options" strip, leftmost, captioned Dartmouth; the extractor did not place it,
  so it is filed by hand.
- **accessories / sdlBar** — the two SDL bar profile drawings (7/8" and
  1-1/4", both 1/2" tall on 1 mm adhesive tape) from the SDL Bars page,
  supplied by the dealer as images rather than extracted from a PDF. Keyed by
  the bar label `sdlRule.bars` uses, so the grid step shows the profile beside
  the price.

`basis` in the manifest says how each name was tied to its picture:

- `caption` — printed directly above or beside the photo.
- `column` — aligned with that name's column of part numbers.
- `remainder` — the only name left on the page once the others were placed.

Balfour, Berkley and Southampton lost their text transform in the PDF and were
placed by elimination. Each is corroborated independently: the stain in the
photograph matches the stain the catalog prints for that design.

The iron mask photographs are shot on black, so the app puts them on a dark
tile rather than a white one.

Entries marked `handFiled: true` were placed by hand; `extract-door-images.py
--designs` keeps them across a re-run.
