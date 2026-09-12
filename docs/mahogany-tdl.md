# Mahogany True Divided Lite — what the app knows, and how

Walked through with the dealer on 2026-09-11 and 12, against catalog pages 12
and 14–20 and **all seven pages** of the Hoelscher *Dealer Wood Pricing* sheet
(effective 7-1-2026).

24 models, 60 price rows. `tests/tdl.test.mjs` holds the checks.

## The price sheet is now reconciled in full

The dealer supplied the complete 7-page sheet, and
`tests/fixtures/wood-price-sheet.json` is an independent transcription of it —
typed from the vendor PDF, not generated from `catalog.json`, so the two can
disagree.

| | |
|---|---|
| Wood rows we hold | 365 |
| Matching the sheet on **all six** price cells | 347 |
| Decorative Glass rows the sheet does not price at all | 17 |
| Deliberate divergence (the Curved, below) | 1 |
| **Unexplained** | **0** |

The Decorative Glass rows are priced roughly 50% above the flat-glass row of the
same part number and appear nowhere on these seven pages, so they came from a
separate decorative price list. That is worth knowing when the P.22 section is
walked through; it is not an error.

This check runs on every CI run, so a later edit that moves any wood price fails
a test rather than a purchase order.

## Glass

All 60 rows write `P.12` in the sheet's Glass Type column — the ten glasses on
catalog page 12:

Clear Low-E · Clear Bevel Low-E · Baroque · Flemish · Water · Stippolyte ·
Rain · Reeded · Small Reeded · Satin

The same ten the P.42 and P.46 pages already used, so no new glass data. The two
the legend carries that this page does not — **Digital** and **Sandblast** — are
exactly the two page 6 adds. The two pages between them use all twelve codes.

Codes come from the legend, as everywhere in wood. Catalog pages 14 and 19 print
`CLE` on three doors (`M3LCTLCLE1P3080`, `M3LSQTLCLE1P3080/3680`) and on the
Craftsman shelf variants, which is the fiberglass letter; page 19 prints `CBLE`
on the no-shelf variant of the same card. One card, two conventions. The legend
governs.

## Sidelites pair two ways at once

Catalog pages 15 and 17 pair each door with exactly one sidelite, matched on
**lite count** and on **raised moulding**:

| Door | Sidelite |
|---|---|
| 4 Lite 1 Panel **RM** | 2 Lite 1 Panel Sidelite **RM** |
| 4 Lite 1 Panel **NRM** | 2 Lite 1 Panel Sidelite **NRM** |
| 6 Lite 1 Panel **RM** | 3 Lite 1 Panel Sidelite **RM** |
| 6 Lite 1 Panel **NRM** | 3 Lite 1 Panel Sidelite **NRM** |

Raised moulding beside no-raised-moulding would not look right in one opening.
Height still breaks the tie between the sidelite's own sizes, which is how the
3 Lite RM's 12"-wide `M3LSL1080` and 14"-wide `M3LSL1280` both reach an 8'0"
door.

The other 20 TDL models show no sidelite on any catalog page, so their sidelite
behaviour is **left as it was** rather than guessed at.

## The Curved double had the Arch Top's part number

The price sheet gives both `M6L--AT5080`:

| Door | Slab | Double PH |
|---|---|---|
| 6 Lite Arch Top Double | $3,088.00 | $3,748.00 |
| 6 Lite Curved Panel Double | $3,278.00 | $3,938.00 |

Two different doors, $190 apart, one number. Catalog page 18 disambiguates them
— it prints `M6LCAT5080` for the Curved — and the dealer chose the catalog's on
2026-09-11. The Curved's stem is now `M6LC--AT5080`; its `id` is unchanged, so
saved quotes still resolve. This also clears a duplicate-part-number warning the
catalogue audit had been printing since it was written.

## The dentil shelf

Catalog pages 18–19 print **two** part numbers for each Craftsman size, under an
explicit *Shelf: Yes / No* column, and the price sheet prices **one** row per
size. So on a wood door the shelf costs nothing and only changes the number —
the same shape as the 1×4 exterior profiles.

The app asks it as a property of the door, before the opening questions, because
a slab has one or has not. Choosing it appends `S`.

**Nothing is charged.** The only dentil shelf in the catalogue is a $184.00
**fiberglass** component, and the word "shelf" appears nowhere on the seven pages
of the wood sheet. Billing the fiberglass part's price against a wood door would
have been inventing a charge.

`MCM--3068S` already carries the `S`: at 6'8" the sheet prices only the shelf
variant, so that row is not asked.

## Where the two vendor documents disagree

Catalog page 19 advertises **six** Craftsman 6 Lite part numbers. The sheet
prices **two**, and not even matching variants:

```
MCM--3068S   $939.00     6'8", shelf      — no no-shelf row
MCM--3080  $1,329.00     8'0", no shelf   — no shelf row
                         no 3'6" at all
```

The dealer chose **only what is priced**, so the app offers those two and not the
four the catalog advertises. This is Hoelscher's gap between their own two
documents, not ours — our data mirrors the sheet faithfully.

Also noted, no action: `M6LRN1P3680NRM` carries `RN` (Rain) under a caption
reading "Clear Bevel Low-E", and `M4L1P--3680NRM` puts the glass code after the
`1P` where every sibling puts it before. The sheet and the catalog agree on that
second one, so it is a real vendor quirk and our data already had it right.

The Arch Lite's shelf numbers, page 18, change glass code with the shelf:
`MCMA4LCLE3068S` (shelf) against `MCMA4LCBLE3068` (no shelf), and the same at
3080, where every other door on the page keeps `CBLE` both ways. The sheet
prices one row, `MCMA4L--3068`, for the door. The dealer read it as a
misprint (2026-09-12): the glass code follows the glass chosen and the `S`
follows the shelf, so Clear Bevel with a shelf is `MCMA4LCBLE3068S` even
though the catalog never prints it. One more for Hoelscher.

## A description we had lost

`MCMA4L--3080` read "Craftsman 4 Lite" where both the sheet's Door Style column
and catalog page 18 say **Craftsman 4 Lite Arch Lite**. It shared a card with
`MCM4L--3080`, a different door $725 cheaper, so picking "Craftsman 4 Lite" at
3'0" × 8'0" could reach either. The name is restored.
