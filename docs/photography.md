# Door photography — where every picture comes from

`tools/extract-door-images.py` reads the catalog PDFs and files each photo
under the model its part numbers name. Nothing is guessed: a photo whose part
numbers do not resolve to exactly one model is reported and skipped. The
photographs it skips are matched by eye instead and written into
`quoter/assets/doors/hand-filed.json`, which `tools/hand-file-photos.py` turns
into files and manifest entries; see *Filed by hand* below.

## Coverage

Of 208 models in the published catalog (2026-09-13):

| | count |
| --- | --- |
| Photographed in a catalog, filed under that model | 112 |
| Shown by a picture that is genuinely of that door | 10 |
| Borrows the photograph of the door it is a variation of | 68 |
| Nothing to show — falls back to the drawn silhouette | 18 |

None of the 18 is mahogany: 14 are knotty alder, 4 fiberglass.

**Shown by another picture of the same door.** An iron-grille door is
photographed once per grille design and a decorative-glass door once per glass,
so those models use one of those pictures rather than a silhouette.

**Borrowed.** The catalogs photograph a door once and describe its variants in
words. An Impact door is the same door with different glass; a speakeasy door
the same door with a speakeasy cut into it; a flat-glass door the same door
glazed plainly. Those cards show the base door's photograph with a caption
naming it — "KA 2 Panel Square VG shown" — so nobody reads it as a picture of
the variant.

## Filed by hand — the mahogany line, 2026-09-13

The dealer asked for every mahogany option to carry its picture. Of the 68
mahogany doors and sidelites, 23 drew a silhouette and 13 showed a knotty alder
stand-in. The catalog PDF on file has the photographs for all 23, on pages 9,
14, 15, 17–21 and 28–32; the extractor had skipped them because their part
numbers sit away from the picture (the double-door and Craftsman pages), are
printed once for two doors (the flat and decorative Legacy pages), or belong to
a sidelite too narrow for its door-photo rule.

Each was matched by eye against the page and written into `hand-filed.json`
with the PDF, page, image name, an optional crop and the reason that settled
the match — the stain the page names for a sidelite, the curved muntins of the
curved-panel door, the shelf table beside the Craftsman. Thirty entries: the
23, the five decorative doors and sidelites whose own page photographs them
(they had shown a knotty alder door glazed with the same glass), and the 3/4
Lite Iron Grille door and sidelite, cut out of page 32's photograph of the door
with the Whitney grille and matching sidelites. The manifest marks these
`handFiled`, and the extractor keeps them when it rewrites the manifest; a hand
match was checked against the page, so it outranks a part-number match for the
same model.

With that, every mahogany card shows a catalog photograph: 63 the model's own,
5 (the 2/3 Arch, 2/3 and Full Lite grille doors and the two Full grille
sidelites) a grille-design picture, which is a true picture of that door.
Nothing in the mahogany line draws a silhouette.

Since 2026-09-13 the card of a grille or decorative-glass door shows its
flat-glass twin's photograph instead, with a badge counting the designs, and
the design pictures are chosen from a full-size gallery
(`docs/quoter-design-gallery.md`); the grille-door pictures above are still
the door's own and are used once a design is not the point (the header
thumbnail, fallbacks).

**The mahogany grille pages.** The compressed catalog PDF stops at page 33,
but a fuller mahogany PDF the dealer had uploaded (`Joel_mahogany.pdf`)
carries pages 34–41, and page 32 sharper. Each grille page is a 2×2 of
photographs with the design names printed as a row of captions above each row
of pictures, so the match is by position, left caption to left picture; the
26 mahogany designs now carry their own photograph
(`quoter/assets/designs/grille-mahogany-*.webp`, `kind: "grille"` in the
list) instead of the knotty alder namesake's, and the catalog's `photo` field
points at it. The 3/4 Lite grille door and sidelite are re-cut from the
sharper page 32, and the 2/3 Lite grille sidelite is cut from page 37's
"Grille Sidelites" photograph.

**Black glass.** The catalog photographs an "open for glass" door with the
opening black, and shoots the double-door kits on a black ground. The dealer
found the black jarring on a card, so those fourteen pictures (the flat-glass
doors and sidelites, the decorative sidelites that share their photograph, the
three double-door kits and one sidelite cut from a black ground) are
`whiten`ed as they are filed: every connected run of near-black pixels large
enough to be a pane or a background (at least a hundredth of the picture, so
a shadow in a dark panel is left alone) becomes the pale glass tone the other
photographs show, with a one-pixel feather. The Ebony contemporary sidelite,
whose door is itself black, is cut from its ground but not whitened.

**Stains.** Page 5 prints the six stains as swatches, one chart for mahogany
and one for knotty alder. Both charts are filed the same way (matched by
position: each swatch sits above its caption) into `quoter/assets/stains/`,
and the Stain colour step shows the swatch beside each name for the line being
quoted. No price or part-number change.

**Grille sidelites on their own.** Checking the cards turned up that a grille
sidelite quoted alone dead-ended: its Grille design step greyed every design
"not this size", because a design's sizes are door sizes. A sidelite now takes
any design of its lite style (beside a door it takes the door's, as before),
and the sheet's "Full Sidelite Iron Grille", named without "Lite", is read as
the Full Lite's sidelite like its twin, so it shows the same picture and asks
the same designs.

`tests/mahogany-photos.test.mjs` pins all of it: the thirty-one door entries
and the twenty-six grille entries with their files, the whitened fourteen, the
68 cards with no silhouette, the page-32 and page-37 cuts, a pale pane where
the black was, the six swatches on a prefinished door of each line, and the
grille sidelite reaching a price.

## Supplied by the dealer — sidelites and caming, 2026-09-13

The catalogs photograph a grille or decorative-glass door once per design and
never the sidelite made to match it, so a grille sidelite's gallery showed the
door. The dealer supplied twelve of Hoelscher's "door with sidelites"
composites (door in the middle, its sidelites either side) and the "Caming
Options" strip. The left sidelite is cut out of each composite by a crop box
written into `hand-filed.json`, so a rerun reproduces it; the source file
is the dealer's upload, named in the entry.

| Picture | Filed as | Used |
|---|---|---|
| Cordoba Full Lite | `ironGrilleDesigns` Full Lite Cordoba, `sidelitePhoto` | the Full grille sidelite's tile, preview and quote picture |
| Whitney, Santiago, Sienna 3/4 Lite | 3/4 Lite designs, `sidelitePhoto` | the 3/4 grille sidelite, likewise |
| Avignon 2/3 Lite | 2/3 Lite Avignon, `sidelitePhoto` | the 2/3 grille sidelite |
| Blanco 2/3 Arch, Pecos 2/3 Arch | `decorativeGlass` Blanco / Pecos → `sidelites["2/3"]` | the 2/3 decorative sidelite glazed with that glass |
| Caming Options | `caming` Patina / Zinc | swatches on the Caming question |
| Imperial 2/3 Oval, Austin Full Oval | `decorativeGlass` Imperial / Austin, `unpriced` | nowhere: the sheet prices no oval door and no Imperial or Austin glass |
| Blanco Deluxe Oval with Blanco 3/4 sidelites | Blanco `sidelites["3/4"]`, `unpriced` | nowhere: the sheet lists Columbia, Medina, Pecos and San Jacinto on the 3/4 sidelite, not Blanco |

A second Whitney composite, on reeded glass, was supplied too; the water-glass
one cuts cleaner and is the one filed. The three unpriced pictures are on
file so the dealer can decide whether to ask Hoelscher for those
combinations; the quoter offers nothing from them.

A sidelite's picture is now chosen the same way a door's is, one step truer:
the sidelite matching the chosen grille, or the sidelite glazed with the
chosen decorative glass, ahead of its generic catalog photograph. A door's
pictures are unchanged. The knotty alder sidelites, and the mahogany designs
with no sidelite picture yet (Balfour, Barcelona, Hammond, Saltillo,
Southampton, and Cordoba on the 3/4 and 2/3), still show the door.

## What the catalogs we hold cannot supply

Catalog pages held: wood 5-41 and 42-59, plus the 2025 fiberglass catalog.
Missing: nothing needed for the doors we price.

Of the 18 with no picture, 5 are sidelites and 13 are doors. The reasons:

- **Mahogany iron-grille pages (34-41)** are in the fuller mahogany PDF only;
  their 26 design photographs are filed by hand from it (above).
- **Circle Top 2 Panel V-Grooved** is photographed on catalog page 52 but the
  page prints no part numbers for it, so nothing ties the photo to the model.
- **Knotty alder page 51's speakeasy photographs** cannot be filed because that
  page's part numbers contradict each other: `KA2PASEBW2880` (a Balfour number)
  is printed in the Windsor panel.
- **Sidelites** are photographed beside their doors at a size the matcher reads
  as part of the door panel; most resolve to the door, not the sidelite. The
  mahogany ones are now filed by hand; the knotty alder ones are not yet.

## How a photo is tied to a model

- **Part numbers beside or beneath the photo.** A run of text belongs to the
  photo whose panel it is printed in, and a panel runs from its own photo
  across to the next photo in that row. Nearest-centre is not enough: a door
  listing its 6'8" and 8'0" sizes in two columns puts the second column closer
  to the middle of the photo beside it than to its own.
- **The moulding designation.** The catalog tells a raised-moulding door from a
  no-raised-moulding one by the letters after the size — `M4L1P3068` against
  `M4L1P3068NRM` — and our model names carry the same designation, so it breaks
  a tie the size-plus-prefix index would lose.
- **The words beside the photo**, where a part number is shared by several
  doors: "Decorative Glass" against "Flat Glass". Decisive or nothing — the
  winner must be named and every other candidate unnamed.
- **Brightness**, where models differ only by colour, so a white door never
  stands in for a black one.

Every match is checked on a contact sheet by eye before it ships.
