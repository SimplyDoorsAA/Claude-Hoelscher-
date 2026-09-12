# Mahogany iron grilles — what the app knows, and how

Catalog pages 34–36, walked with the dealer on 2026-09-12: the grille glass
list, the 2/3 Arch Lite grilles and the 2/3 Lite grilles. Pages 37–41 (the 3/4
Lite and Full Lite grilles and the grille sidelites) are still to come. No
price changes.

## The glass list

Page 34 prints the iron-grille glass options: Clear Low-E, Flemish, Rain,
Reeded, Stippolyte, with privacy ratings. The app already carried this as the
`Iron Grille` glass rule from the knotty alder pages; the mahogany page prints
the same five, so nothing changed.

## The designs, per door

| Door | Page | Designs | Sizes |
|---|---|---|---|
| 2/3 Arch Lite Iron Grille | 35 | Cordoba, Santiago, Sienna, Whitney | 3068 |
| 2/3 Lite Iron Grille | 36 | Avignon, Barcelona, Cordoba, Santiago | 2880, 3080 |

Until now the `ironGrilleDesigns` were all knotty alder's, so a mahogany
grille door offered no design at all. Eight mahogany entries now exist, one per
design per lite style, each with the infix the catalog prints (the same as its
knotty alder namesake) and the knotty alder photograph standing in for the
mahogany one — the grille pattern is what the picture is for, and the
compressed catalog PDF on file stops at page 33.

The 3/4 Lite and Full Lite grille doors offer no design yet, and a grille door
with no design keeps its placeholder and goes out flagged rather than guessed.

## How a grille door's number is written

The sheet prices one generic row per size, with the gap: `M23A--3068`,
`KA34--3068`. Both catalogs print a number per design:

```
M23ACRDC3068   2/3 Arch Lite, Cordoba      KA34AVIC3068   knotty alder 3/4 Lite, Avignon
M23AVIC2880    2/3 Lite, Avignon           KA34BALC2880   knotty alder, Balfour
```

Stem, grille infix, `C`, size — every one shown with Clear Low-E. The dealer
chose: **infix + `C` when the glass is Clear Low-E**, exactly as printed;
**infix + the legend's code** for Flemish, Rain, Reeded and Stippolyte
(`M23AWHIF3068`), which no catalog prints and which go on the Hoelscher list.
`skuPlaceholders.ironGrille` records it; `completeSku` fills it whenever the
row is an iron-grille row and a design is chosen. The design still appears in
words on the order sheet. Knotty alder grille doors, which had printed
`KA34LE3068` with the design in words only, now print `KA34AVIC3068` as their
pages do.

Grille sidelites take the same grammar with `SL` in the stem
(`M23SLAVIC1280`); the pages say "matching sidelites available" and print no
numbers, so this is on the Hoelscher list too.

## The sheet's stem on the 2/3 Lite grille

The sheet prints the 2/3 Lite (not arch) grille rows as `M23A--2880` and
`M23A--3080`, with the arch door's `A`. Page 36 prints them without it —
`M23AVIC2880`, `M23BARC2880`, `M23CRDC3080`, `M23STGC3080` — and page 35 keeps
the `A` for the arch doors alone. The dealer read the sheet's `A` as a
misprint. The two rows keep the sheet's number for price matching; a
catalog-level `skuCorrections` entry, marked `appliesToNumber`, gives the
written number the `M23` stem. (The speakeasy misprints in
`speakeasyOptions.skuCorrections` are different: they keep the number as
printed and say their doubt on the sheet.)

## Sidelites

Two `sideliteRules` pair the 2/3 Arch Lite and 2/3 Lite grille doors with the
2/3 Lite Sidelite Iron Grille, the one 2/3 grille sidelite the sheet prices.

## Verification

`tests/legacy-grilles.test.mjs` — the designs per door, their infixes and
photographs, the grammar with both catalogs' numbers as evidence, the two stem
corrections and the arch door keeping its `A`, the pairings; then the app: the
five glasses, the four designs on each door, `M23ACRDC3068` with "Cordoba
grille" in words, `M23AWHIF3068` for Flemish, `M23AVIC2880` with no `A` and
its sidelite `M23SLAVIC1280`, the 3/4 Lite grille still flagged with no design,
and a knotty alder door printing `KA34AVIC3068`.
