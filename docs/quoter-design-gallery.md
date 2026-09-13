# The design gallery — choosing a grille or a leaded glass

Walked with the dealer 2026-09-13. No price, number or id changed.

## The problem

An iron-grille door is one price row on the sheet and eight photographs in
the catalog; a decorative-glass door is one row and four. The sheet does not
care which design is chosen, but the customer does — it is the whole point of
the door. The configurator asked the design as a row of forty-by-eighty pixel
thumbnails, third, after glass and size, and the catalogue card showed the
door with one design already in it, as if it had been chosen. The dealer's
screenshots made the case: nobody could tell Avignon from Barcelona at that
size, and a card that shows Whitney reads as a door called Whitney.

## What was decided

Four questions, asked one at a time, answered with the mock-ups in hand:

1. **The card shows the door with plain glass.** Every grille and
   decorative-glass model has a flat-glass twin photographed on the door
   pages ("3/4 Lite Iron Grille" is "3/4 Lite - Flat Glass" with a grille;
   "Full Sidelite Iron Grille" is "Full Sidelite - Flat Glass"), so the card
   shows that, with a badge counting the designs ("8 grille designs",
   "4 decorative glasses") and three of them small in the corner.
2. **The design is the first question.** Before glass texture, before size.
   A grille door asks design → size → glass → finish → opening; a
   decorative-glass door's glass *is* its design, so it asks glass (as the
   gallery) → caming → size → finish → opening, as before.
3. **The gallery is full width, three across on a tablet, two on a phone**,
   each photograph about the size of the sheet's own preview (roughly 280 ×
   470 on an iPad, 170 × 280 on a phone). The dealer was shown a smaller
   size first and asked for larger; this is the size chosen. The preview
   column is put away while the gallery is open, and the plain-glass door
   sits small beside the title so the gallery reads as designs *for* it.
   The name and the sizes it is made in sit under each picture ("All 4
   sizes", "2'8" x 8'0" · 3'0" x 8'0"").
4. **A magnifier on each picture opens it full size** in a lightbox, with a
   "Choose this design" button. The preview in the sheet has the same
   magnifier once a design is chosen.

After the choice the two-column sheet returns with the chosen design in the
preview (the catalog's photograph of that door with that grille, or of that
glass), and the size question greys the sizes the design is not made in,
with the reason ("Not made with Saltillo", "2 not made with Saltillo" on the
heading). The glass swatches behind a grille grew from 36 to 56 px.

## Where the pictures come from

- A grille tile is the catalog's photograph of that door with that grille:
  `ironGrilleDesigns[].photo`, filed from pages 34–41 of the mahogany catalog
  and pages 55–57 of the wood catalog (`docs/photography.md`).
- A decorative-glass tile is the catalog's picture of that glass
  (`quoter/assets/designs/manifest.json` → `decorativeGlass`); for Columbia,
  Medina, Pecos and San Jacinto that is the glass alone, for Blanco,
  Dartmouth and Brazos the mahogany door glazed with it.
- The card's plain-glass picture is the flat-glass twin's photograph from
  `quoter/assets/doors/manifest.json`. Spellings the sheet varies are
  tried in turn: "Lite Sidelite" against "Sidelite", the knotty alder
  moulding code present and absent. Where no twin is photographed (the
  knotty alder 3/4 Lite RM flat door has no picture yet) the card falls back
  to what it showed before, and still carries the badge.

## Sidelites, since the same afternoon

The dealer supplied Hoelscher's "door with sidelites" pictures for five
grille designs and two decorative glasses, and the caming strip
(`docs/photography.md`, "Supplied by the dealer"). A grille or decorative
sidelite's gallery now shows the sidelite itself where one is on file and
the door otherwise; the preview, the quote drawer and both printed documents
follow; and the Caming question shows the Patina and Zinc swatches.

## What did not change

- The rules: which designs a door offers, which sizes each is made in, the
  five grille glasses, the caming, the sidelite pairings. They are the same
  catalog fields read in a different order.
- The part number. `completeSku` is untouched; the suites that print
  M34AVIC3068, M23ACRDC3068, MFULLBALC3068 and KA34AVIC3068 still do.
- The quote line: `grilleDesign` and `glazing` are saved as before, and the
  drawer and both printed documents show the chosen design's picture as
  they did.
- A door with neither a grille nor a leaded glass: glass as a row of
  swatches, preview beside it, exactly as before.

## Verification

`tests/design-gallery.test.mjs`, 55 checks: the card rule (plain-glass
twin, badge, three-design strip, none on a flat door), the gallery (full
width, no preview column, eight tiles with photographs and magnifiers, three
across, tile size, names and sizes under each), the lightbox (opens the
tile's picture larger, named, Escape closes it, Choose chooses), the sheet
after the choice (two columns, chosen design in the preview, sizes greyed
for Southampton with the reason, larger swatches, the rail order), taking
the design back on the rail, a priced Southampton door on the quote with
its picture, the decorative-glass gallery on the 3/4 Lite (Medina's two
sizes), a flat door untouched, and the phone layout. The three suites that
drove the old order (`legacy-grilles`, `mahogany-photos`, `quoter`) now pick
the design first and assert the card rule.
