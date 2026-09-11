# Mahogany Contemporary — what the app knows, and how

Walked through door by door with the dealer on 2026-09-11 against catalog
pages 6 and 8–11 and page 1 of the Hoelscher *Dealer Wood Pricing* sheet
(effective 7-1-2026). Everything below is either printed on one of those pages
or answered by the dealer in that conversation; nothing is inferred.

`tests/contemporary.test.mjs` holds the sheet transcribed cell for cell, so a
later edit that moves one of these prices fails a test rather than a purchase
order.

## The range

Eleven models across 22 price rows.

| | Models | Sizes |
|---|---|---|
| Wide glazed | 1 Lite Vertical, 3 Lite, 4 Lite, 5 Lite | 2880, 3068, 3080, 3680 |
| Horizontal | 5 Lite Horizontal, 6 Lite Horizontal | 3068, 3080 |
| Narrow profile | 3 Lite, 4 Lite, 5 Lite Narrow LH/RH | 2880, 3080 |
| Solid | 7 Panel | 3080, 3680 |
| Sidelite | Contemporary Full Lite | 1268, 1280 |

## Glass

The price sheet writes `P.6` in its Glass Type column for all 22 rows, meaning
the eight glasses printed on catalog page 6:

Clear Low-E · Sandblast w/1" Clear Border · Flemish · Digital · Rain ·
Reeded · Small Reeded · Satin

Every row is priced the same whichever is chosen. The code goes into the `(--)`
in the part number, taken from the legend printed on the sheet:

    LE  CBLE  BQ  D  F  W  ST  RN  RD  SR  SN  SB

**On `CLE` and `R`.** Catalog pages 8–11 print `M1LVCLE3080` and the like. Those
are the *fiberglass* letters: all eight `CLE` rows and all eight `R` rows in the
catalogue are `FG…` skus, and no wood row uses either. Fiberglass is sold as a
complete part number with no `(--)` to fill, so it gets its own letters. Wood is
stem plus legend code — `M5HGLE3068`, not `M5HGCLE3068`. The dealer confirmed on
2026-09-11 that Hoelscher's desk takes the legend form.

The solid 7 Panel is on page 6 too but its part number, `M7P3080`, has nowhere
to put a code. A page rule no longer applies to a row that cannot hold one.

## Sidelites

The Contemporary range takes the Contemporary Full Lite Sidelite and nothing
else — `data/catalog.json` → `sideliteRules`. Before that rule existed a
Contemporary door was offered eleven sidelites, because line and height were
all that had to match.

Pairing falls out of the sizes: a 6'8" door takes the 1269 (`M1LCSL--1268`), an
8'0" door the 1281 (`M1LCSL--1280`) — each one inch taller than its door, which
is the frame allowance. The dealer confirmed this holds for the narrow-profile
doors and for the solid 7 Panel as well.

A sidelite is glazed like its door unless somebody changes it. When it is
changed, the customer estimate says so on the line.

## Stain

Six colours, from the dealer's chart: Aged Barrel, Ebony, English Chestnut,
Jacobean, Red Oak, Special Walnut. Mahogany and knotty alder, **prefinished
only** — an unfinished door is sold bare and is never offered one.

No colour changes the price and none reaches the part number, which is why the
order sheet has to name it in the Spec column: it is the one specification
Hoelscher cannot read off the number.

The question is required. A prefinished door will not price until it is
answered.

## Handing

The six narrow-profile rows carry the hand in the part number — `M3GPWN--2880--`
→ `M3GPWNSR2880L`. The lite is offset to clear the handle, which is a property
of the door and not of the frame, so **a bare slab is asked for its hand too**.
Until 2026-09-11 the app skipped the question on a slab and the resulting
number could not be printed at all, so a narrow-lite slab was unsellable.

It is put as handing, never as "which side is the glass on" — the offset exists
for the handle, and wording it as a preference invites somebody to flip it.

On a pair the wording changes to **Left hand active / Right hand active**, after
Hoelscher's own order screen: the question there is which leaf operates. A pair
is two mirrored leaves, so the order sheet carries both numbers — `…3080L` and
`…3080R` — and says *one of each hand* beside them.

## Prices

All 22 rows, all six columns, reconciled against the sheet with no
disagreements. The sheet's header — "Use a 0.48 multiplier for NET cost" — is
Hoelscher putting the net multiplier in writing, so `netMultiplierScope`
carries `vendorConfirmed: true` as of 2026-09-11.

## Still open

- **`KACM--3068-` / `KACM--3080-`** (Knotty Alder Craftsman, not Contemporary,
  but the same class of problem). The leading `(--)` is glass and the P.42 rule
  fills it. The **trailing single `-`** is an unidentified one-character
  placeholder. It is not guessed at: the order sheet refuses to treat the
  number as final and prints the reason. Both doors are unsellable until
  Hoelscher is asked.
- **Casing and 1×4 trim have no `2880` row.** A 2'8" × 8'0" door prehangs
  correctly — the prehung price is on the door row — but no trim adder exists
  for that size. Same gap at 2668, 2680 and 2868.
- **Catalog pages 8–11 print `CLE` where wood ordering wants `LE`**, on 14 of
  the 16 numbers, and `M5HGC3068` / `M6HGC3080` drop the glass code
  altogether. Worth telling Hoelscher.
