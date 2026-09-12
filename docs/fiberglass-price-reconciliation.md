# Fiberglass prices, against the vendor sheet — 2026-09-12

The wood catalogue was reconciled cell for cell against Hoelscher's Dealer Wood
Pricing in `mahogany-tdl.md`. This does the same for fiberglass, and it is the
first time the 222 fiberglass rows have been proven against a vendor document
rather than the marketing catalog.

## The two sheets

The dealer supplied two fiberglass price lists, and they are not the same
document:

| | Dated | Pages | Columns | Rows |
|---|---|---|---|---|
| *Hoelscher 2025 Fiberglass Dealer Price List* | effective 2/1/2025 | 5 | Unfinished, Pre-Finished (slab only) | 221 |
| *Dealer Fiberglass Price List — Follows Catalog* | effective 7-1-2026 | 4 | slab / single PH / double PH, unfinished and prefinished | 222 |

The catalogue was built from the 7-1-2026 lists (`catalog.json` says so in its
`source`), and the dealer confirmed the app should follow the 2026 list. The
2025 sheet was checked first, before the 2026 one was found among the earlier
uploads, and the difference between the two is recorded below because it is
the size of a price increase the dealer will want to know about.

## Result against the 7-1-2026 sheet

`tests/fixtures/fiberglass-price-sheet.json` is a transcription of the
four-page PDF — typed from it, not generated from `catalog.json` — and
`tests/fiberglass-sheet.test.mjs` runs the comparison in CI.

| | |
|---|---|
| Fiberglass rows | 222 |
| Match the sheet on all six price cells | **222** |
| Sheet rows without a catalogue row | 0 |
| Unexplained | **0** |

How the awkward rows were matched:

- **Ten `CONFIGURED ITEM` rows.** The sheet prints no part number for the two
  iron-grille doors and the eight speakeasy doors. The catalogue gave them
  `CFG-001`…`CFG-010`, and later named the two plain speakeasy doors
  `FG2PAVG3068SE` / `FG2PAVG3080SE`. These match by description, all six cells.
- **Eighteen sidelites.** The sheet prints their prehung cells as a per-each
  adder (`+1444(ea)`). The catalogue holds that adder in the `singlePH` and
  `doublePH` cells, so those two cells are equal on every sidelite, as they
  are on the sheet.
- **The sidelite block is printed twice** on the sheet (page 2 and page 4),
  identically. The fixture keeps one copy.
- **Two rows the sheet prints with no description** — `FGSHCMLEF3680NP` and
  `NLSMFL3080NB`. The vendor's omission; the catalogue names them.
- **`FGKTX6P3080`**, the 3080 Oak 6 Panel, is priced on every prefinished
  cell identically to the 3080 2 Panel Square (`FG2PSQS3080`). That is what
  the sheet prints, so the test pins it rather than letting anyone "fix" it.
  Worth a question to Hoelscher.

## What changed between the 2025 and 2026 lists

Slab prices only, since the 2025 sheet has no prehung columns.

| Family | Rows | Unfinished | Prefinished |
|---|---|---|---|
| Mahogany-grain doors | 106 | unchanged | unchanged, with exceptions below |
| Smooth / Fir / Brushed skins | 115 | **+5.5%** across the board, except the 16 Shaker rows (`FGSH…`, `FG2PSQSM…`), unchanged | n/a |

The exceptions on the mahogany-grain prefinished column, all confirmed by the
2026 sheet:

| Rows | 2025 | 2026 | Change |
|---|---|---|---|
| Contemporary Full Lite Sidelite 1268 (5 glazings) | $966 | $1,245 | +29% |
| Contemporary Full Lite Sidelite 1280 (5 glazings) | $1,207 | $1,511 | +25% |
| Craftsman 6 Lite 2 Panel Shaker 3068 (3) | $1,877 | $1,772 | −5.6% |
| Craftsman 6 Lite 2 Panel Shaker 3080 (3) | $2,387 | $2,221 | −7.0% |
| Oak 6 Panel 3080 | $1,193 | $1,462 | +22.5% (see `FGKTX6P3080` above) |
| 2 Panel Square / Arch 3068 | $1,136 | $1,150 | +1.2% |
| Contemporary doors (32 rows) | | | −$3 each |

Two more things the 2025 sheet shows:

- `NLSM6P3080NB` is printed twice on it, once as the 6 Panel and once as the
  3080 Flush. The 2026 sheet and the catalogue give the Flush its own number,
  `NLSMFL3080NB`.
- `FGSHCMLEF3680NP` (3680 Craftsman 1 Lite 2 Panel Shaker, Fir) is not on the
  2025 sheet at all. It is on the 2026 sheet, priced, and in the catalogue.

## What this closes

Every door price in the catalogue — 365 wood rows and 222 fiberglass rows —
is now checked against a vendor price sheet on every pull request. The
fiberglass check is pure data and runs in under a second.
