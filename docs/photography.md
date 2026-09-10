# Door photography — where every picture comes from

`tools/extract-door-images.py` reads the catalog PDFs and files each photo
under the model its part numbers name. Nothing is guessed: a photo whose part
numbers do not resolve to exactly one model is reported and skipped.

## Coverage

Of 207 models in the published catalog:

| | count |
| --- | --- |
| Photographed in a catalog, filed under that model | 82 |
| Shown by a picture that is genuinely of that door | 10 |
| Borrows the photograph of the door it is a variation of | 68 |
| Nothing to show — falls back to the drawn silhouette | 47 |

**Shown by another picture of the same door.** An iron-grille door is
photographed once per grille design and a decorative-glass door once per glass,
so those models use one of those pictures rather than a silhouette.

**Borrowed.** The catalogs photograph a door once and describe its variants in
words. An Impact door is the same door with different glass; a speakeasy door
the same door with a speakeasy cut into it; a flat-glass door the same door
glazed plainly. Those cards show the base door's photograph with a caption
naming it — "KA 2 Panel Square VG shown" — so nobody reads it as a picture of
the variant.

## What the catalogs we hold cannot supply

Catalog pages held: wood 5-41 and 42-59, plus the 2025 fiberglass catalog.
Missing: nothing needed for the doors we price.

Of the 47 with no picture, 18 are sidelites and 29 are doors. The reasons:

- **Mahogany iron-grille pages (34-41) are laid out differently** from the
  knotty alder ones, and their captions come out paired to the wrong design.
  Rather than file a guess, `--designs` refuses any grille page that is not the
  knotty alder layout, so the mahogany grille models have no picture yet. This
  is fixable by reading those pages properly.
- **Circle Top 2 Panel V-Grooved** is photographed on catalog page 52 but the
  page prints no part numbers for it, so nothing ties the photo to the model.
- **Knotty alder page 51's speakeasy photographs** cannot be filed because that
  page's part numbers contradict each other: `KA2PASEBW2880` (a Balfour number)
  is printed in the Windsor panel.
- **Sidelites** are photographed beside their doors at a size the matcher reads
  as part of the door panel; most resolve to the door, not the sidelite.

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
