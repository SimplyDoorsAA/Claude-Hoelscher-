# The knotty alder Craftsman's trailing dash is the dentil shelf

Closed 2026-09-14. No price, id or rule changed; two doors that could not be
ordered now order cleanly.

## What was open

The Dealer Wood Pricing sheet prices the Knotty Alder Craftsman as two rows:

```
KACM--3068-      KA 3068 Craftsman
KACM--3080-      KA 3080 Craftsman
```

The leading `(--)` is the glass code, filled from the P.42 glass list like
every other wood row. The **trailing single `-`** was not identified. The app
never guesses at a placeholder — a part number that still holds one is printed
on the order sheet with *"still holds a placeholder — confirm with
Hoelscher"* rather than as though it were final — so both doors were
effectively unsellable. The audits of 2026-09-09 and 2026-09-12 both carried
them as open, parked for the dealer to ask Hoelscher.

## What the catalog says

The dealer sent a capture of page 45 of the 2026 hardwood catalog, *Knotty
Alder True Divided Lite (TDL) Doors*, which prints the Craftsman twice — once
without the shelf, once with it — and lists the part numbers against a **Shelf**
column:

| | Part Number | Shelf |
|---|---|---|
| 36" | `KACMCBLE3068S` | Yes |
| 36" | `KACMCBLE3068` | No |
| 36" | `KACMCBLE3080S` | Yes |
| 36" | `KACMCBLE3080` | No |

Glass Shown: Clear Bevel Low-E, whose code is `CBLE` — which is what fills the
sheet's leading `(--)`. That leaves the trailing dash as the shelf slot: `S`
with the shelf, nothing at all without it.

This is the same dentil shelf the app already asks about. The two sheets
simply write it two ways: mahogany leaves it off the number and adds an `S`
for the shelf (`MCM--3080` → `MCMCBLE3080S`), and the sheet even prices one
mahogany row with the `S` already in it (`MCM--3068S`, which is why the
question is not asked at 6'8"). Knotty alder prints a placeholder for it
instead. The sheet prices one row per size either way, so the shelf costs
nothing — as `dentilShelfRule` already recorded.

## What changed

- `data/catalog.json` gains `skuPlaceholders.dentilShelf`, one rule in the
  same shape as the handing and caming rules: the pattern `^KACM--\d{4}-$`,
  the codes `yes: "S"` and `no: ""`, the four part numbers above as evidence,
  and the dealer's capture as `confirmedBy`.
- `withShelf` in the quoter fills that slot rather than appending to it, but
  only where the pattern is one the catalogue confirms. Mahogany is untouched:
  it has no trailing slot, so the `S` is still appended.
- Any other unidentified trailing character still reads as incomplete and is
  still flagged on the order sheet. The mechanism was not weakened, only
  taught one more confirmed pattern.

## Verified

`tests/opening-extras.test.mjs` drives a 3'0" × 6'8" Craftsman in Clear Bevel
Low-E both ways and reads the printed order sheet: with the shelf it prints
`KACMCBLE3068S`, without it `KACMCBLE3068`, and neither is flagged. It also
asserts the catalogue's rule carries page 45's numbers as its evidence, so the
grammar cannot drift from the page that established it.
