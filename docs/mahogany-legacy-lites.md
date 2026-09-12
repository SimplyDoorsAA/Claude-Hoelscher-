# Mahogany Legacy & Panel — the Full Lite and 3/4 Lite pages

Catalog pages 28–29, walked with the dealer on 2026-09-12. Three decisions,
one new design, two sidelite pairings. No price changes.

## The page-22 glass list reaches the flat-glass rows

Every flat-glass door and sidelite on these pages says *"Open For Glass — see
page 22 for all available flat glass options."* That is the ten-glass list
(Clear Low-E, Clear Bevel Low-E, Baroque, Flemish, Water, Stippolyte, Rain,
Reeded, Small Reeded, Satin) and the sheet keys these rows to "P.22". A
`glassRules` entry for P.22 now carries the ten; the 16 flat-glass rows (Full,
3/4 and 2/3 Lite doors and sidelites, pages 28–30) ask their glass from it and
stop going out flagged.

## How a flat-glass number is written

The sheet prints the gap: `M34--3068`, `MFULL--3068`, `M34SL---1268`. The
catalog prints these doors with no glass code at all — `M343068`, `M342868`,
`M342880NRM` — or with an `F`: `MFULLF3068`, `M34SLF1268`, `MFULLSLF1268`,
`MFULLSL1068-8`. The dealer chose the legend, as for every other wood door:
the glass code fills the gap, `M34LE3068`, `MFULLCBLE3068`, `M34SLLE1268`.
The catalog's `F`, its missing codes and its `M342880NRM` on the raised
moulding page go on the Hoelscher list.

Two mechanics that follow from this:

- The sheet prints the same gap two or three dashes wide (`M34--3068`,
  `M34SL---1268`). Whatever fills it now replaces the whole run; before, a
  three-dash gap kept a stray dash and stayed flagged.
- The 3/4 sidelite's flat and decorative rows share the number `M34SL---1268`;
  the glass chosen decides which is which.

## Decorative glass is a design infix and a caming letter

The pages print every decorative door as stem + design + caming:

```
M34COLZ3068   Columbia, Zinc       MFULLPECP3068   Pecos, Patina
M34MEDP2868   Medina, Patina       MFULLDARZ3068   Dartmouth, Zinc
M34SJCZ3080   San Jacinto, Zinc    KA34COLP3068    (knotty alder page 48)
```

The sheet prints one row per door with the gap. `skuPlaceholders.
decorativeDesign` records the grammar (`P` / `Z`), and `completeSku` fills the
gap with the chosen design's infix and caming letter whenever the glass
chosen is a `decorativeGlassDesigns` entry — the Blanco, whose infix is already
in its stem, keeps its own one-row rule. **Dartmouth** joins the designs (DAR,
Patina and Zinc, page 28), with its photograph from the page's "Other
Available Decorative Glass Options" strip, filed by hand.

The sidelites print no decorative numbers, only "Available Decorative Glass:
Columbia, Medina, Pecos and San Jacinto". The dealer chose the same grammar
for them — `M34SLCOLZ1268`, `MFULLSLDARP1068` — leaded like the door, so the
door's caming reaches the sidelite's number. Unprinted, so on the Hoelscher
list.

Medina is made in 2868 and 3068 only, as the page says with an asterisk; the
8'0" sizes show but cannot be chosen once Medina is picked. That was already
so — the rows' glazing lists carry it — and the suite now pins it.

Brazos, named on the 2/3 Lite rows (page 30), is not yet a design; those rows
wait for that page.

## Each door pairs with the sidelite of its lite style

Page 29 shows the 3/4 Lite Raised Moulding with the 3/4 Sidelite Raised
Moulding; page 28 the Full Lite with the Full Lite Sidelite. Two
`sideliteRules` entries pair `^3/4 Lite - (Flat|Decorative) Glass$` with the
3/4 sidelites and `^Full Lite - (Flat|Decorative) Glass$` with the Full ones,
flat and decorative both, and the glass chosen picks between them. Because the
flat and iron-grille Full sidelites share a number (`MFULLSL--1268`), a
sidelite rule may now also name the model (`allowModelPattern`), and these two
do, so the SDL and iron-grille sidelites stay out.

## Verification

`tests/legacy-lites.test.mjs` — the P.22 rule of ten, the 16 rows it reaches,
Dartmouth and its photograph, the design-infix rule with the catalog's numbers
as evidence, every named decorative glass a design bar Brazos, the two
pairings; then the app: the ten offered on a flat 3/4 Lite, only 3/4 sidelites
beside it, `M34LE3068` and `M34SLLE1268` on the order sheet with nothing
flagged, `MFULLCBLE3068`, the four designs and the caming on the decorative
3/4 Lite, `M34COLZ3068`, Medina's two sizes, a Dartmouth Full Lite with its
Full sidelite printing `MFULLDARP3068` and `MFULLSLDARP1068`, and a knotty
alder door printing `KA34COLP3068`.
