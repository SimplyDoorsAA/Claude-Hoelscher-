# Knotty Alder deep dive — catalog pages 42–57

Source: `HoelscherWood_Doors.pdf`, 14 pages, printed as catalog pages 42–57.
It covers the Knotty Alder True Divided Lite collection, the Legacy & Panel
collection, and the iron grilles. Everything below was read off those pages
and checked against `data/catalog.json`.

## What went into the app

### Iron grille designs — eleven, previously none

The wood price sheet prices **one generic row**, `KA 3/4 Lite Iron Grille`, in
four sizes, plus a sidelite row in two. The catalog then shows **eleven
designs** against it (pages 55–57). The design costs nothing extra, so it is a
choice on the model, not a product of its own — which is why it had never
reached the app: nothing in the price sheet names a single one of them.

They are now `catalog.ironGrilleDesigns`, each with the sizes the catalog lists
it in, and each with its photograph. Picking `KA 3/4 Lite Iron Grille` now asks
which design, and greys out the ones not made in the chosen size.

| Design | Code | Sizes | Stain shown |
|---|---|---|---|
| Avignon | AVI | 2880, 3068, 3080, 3680 | Special Walnut |
| Balfour | BAL | 2880, 3068, 3080 | Red Oak |
| Barcelona | BAR | 2880, 3068, 3080, 3680 | English Chestnut |
| Berkley | BER | 2880, 3068, 3080 | Aged Barrel |
| Cordoba | CRD | 2880, 3068, 3080 | Ebony |
| Hammond | HMM | 2880, 3068, 3080 | Jacobean |
| Saltillo | SLT | 2880, 3080, 3680 | Special Walnut |
| Santiago | STG | 2880, 3068, 3080 | Red Oak |
| Sienna | SIE | 2880, 3068, 3080, 3680 | English Chestnut |
| Southampton | SHN | 2880, 3080, 3680 | Aged Barrel |
| Whitney | WHI | 2880, 3068, 3080, 3680 | Ebony |

Nine of the eleven are the same designs the fiberglass line offers
(`fiberglassIronGrilles`), so the photographs serve both lines. Saltillo and
Southampton are knotty alder only.

### Iron grille glass is a shorter list

Catalog page 54 lists the glass available **behind a grille**: Clear Low-E (0),
Flemish (3), Stippolyte (5), Rain (6), Reeded (7). That is five of the ten the
Legacy & Panel collection offers — Baroque, Clear Bevel Low-E, Water, Small
Reeded and Satin are not offered behind a grille.

The price sheet records no glazing at all on the grille row, so the app used to
ask nothing. It now asks, and offers exactly those five, as `catalog.glassRules`.

### Decorative glass was being offered as one unreadable option

The decorative-glass rows carry their options in a single field —
`"Columbia, Medina, Pecos, San Jacinto"` — because the sheet prices one row
whichever glass is chosen. The app was rendering that whole string as **one
button**. It now splits such a field into separate choices (this also fixes
`"Wood, Clear Low E, Rain or Flemish"` on the speakeasy rows — 32 rows in all
carried a list).

Each decorative glass now shows the catalog's photograph of a door glazed with
it. There is no flat swatch of these in any catalog; a door is what Hoelscher
prints.

### Caming

The leaded decorative glasses come with a choice of lead: the 3/4 Lite doors in
**patina or zinc** (the P/Z in `KA34COLP3068` / `KA34COLZ3068`), the Arch Top
1/2 Lite doors in **patina only**. The app now asks where there is a choice and
records it on the quote. No price impact.

### Iron mask photographs

The three masks — Standard, Balfour, Windsor — are photographed on page 50 and
now appear beside the item once it is added to an opening. The two speakeasy
inserts (wood and glass) were extracted too and are in the manifest, though
nothing displays them yet: the sheet sells the kit as
"Speakeasy Kit (Wood or Glass)", one line covering both.

## Open questions for Hoelscher

1. **Speakeasies and masks may fit more doors than we allow.** Pages 50 and 52
   print "Speakeasy kits & iron mask options available" under **five** models:
   2 Panel Square V-Grooved, 2 Panel Arch V-Grooved, **Arch Top 2 Panel Arch
   V-Grooved**, **Circle Panel 2 Panel V-Grooved** and **Circle Top 2 Panel
   V-Grooved**. Our rule allows the first two only. The price sheet does carry
   SE + IM/IMB/IMW variants for AT2PA, CP2P and CT2P, so the wider list looks
   right — but it contradicts the list we were given, so nothing was changed.
   Widening it is one line in `accessoryRules`.

2. **3'6" decorative glass is shown but not priced.** Page 48 lists
   `KA34PECP3680` and `KA34SJCP3680` (Pecos and San Jacinto at 42"), but the
   price sheet has no 3680 row for `KA 3/4 Lite RM - Decorative Glass`. The size
   cannot be quoted.

3. **A part number on page 48 looks like a typo.** San Jacinto at 42" is printed
   as `KA34SJCP3680` on both the patina and the zinc line; the zinc one should
   presumably read `KA34SJCZ3680`.

4. **Circle Top 2 Panel V-Grooved has no part numbers.** Page 52 gives its sizes
   and stain but prints no part numbers, unlike every other door on that page.

5. **Small Reeded's privacy rating is inconsistent in Hoelscher's own catalogs** —
   printed as 8 on two pages and 7 on three, including this one. We show 7,
   the majority. Hoelscher notes the ratings are "subjective and open to
   interpretation", so this may not matter.

## Photographs added

23 images, 392 KB, in `quoter/assets/designs/`: 11 iron grille designs, 7
decorative glasses, 5 speakeasy and mask pieces. `manifest.json` records for
each how its name was tied to its picture:

- `caption` — the name is printed directly above or beside the photo.
- `column` — the photo is aligned with that name's column of part numbers.
- `remainder` — the only name the page had left once the others were placed.

Three grille names (Balfour, Berkley, Southampton) lost their text transform in
the PDF and were placed by elimination. Each is corroborated independently: the
stain in the photograph matches the stain the catalog prints for that name.
