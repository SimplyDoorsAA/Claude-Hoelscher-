# The speakeasy programme

*Generated from `data/catalog.json` on 2026-09-10.*

The catalog prints *"Speakeasy kits & iron mask options available"* beside nine
doors. The price sheet then prices every combination of insert and iron mask as
its own part number, so the quoter asks for them as questions on the door rather
than as add-ons with charges of their own.

Part-number grammar: `{stem}SE{mask}{insert}{size}` — mask `—`/`M`/`B`/`W`, insert `--` (glass) or `W` (wood).

| Line | Catalog p. | Door | Sizes | Priced | Of |
| --- | --- | --- | --- | --- | --- |
| Mahogany | 25 | 2 Panel Square VG | 3'0" x 8'0" | 8 | 8 |
| Mahogany | 25 | 2 Panel Square Smooth | 3'0" x 8'0" | 8 | 8 |
| Mahogany | 26 | 2 Panel Arch VG | 3'0" x 6'8", 3'0" x 8'0" | 16 | 16 |
| Mahogany | 26 | 2 Panel Arch Smooth | 3'0" x 6'8", 3'0" x 8'0" | 16 | 16 |
| Knotty alder | 50 - 51 | KA 2 Panel Square VG | 3'0" x 6'8", 3'0" x 8'0" | 16 | 16 |
| Knotty alder | 50 - 51 | KA 2 Panel Arch V-Grooved | 2'8" x 8'0", 3'0" x 6'8", 3'0" x 8'0" | 24 | 24 |
| Knotty alder | 52 | KA Arch Top 2 Panel Arch VG | 2'8" x 8'0", 3'0" x 8'0", 3'6" x 8'0" | 24 | 24 |
| Knotty alder | 52 | KA Circle Top 2 Panel VG | 3'0" x 8'0", 3'6" x 8'0" | 12 | 16 |
| Knotty alder | 52 | KA Circle Panel 2 Panel VG | 3'0" x 8'0", 3'6" x 8'0" | 16 | 16 |
| | | **9 doors** | | **140** | **144** |

## Combinations Hoelscher never priced

Shown in the configurator, disabled, with the reason. Nothing is guessed.

| Door | Combination |
| --- | --- |
| KA Circle Top 2 Panel VG | 3080 Balfour + Glass Insert |
| KA Circle Top 2 Panel VG | 3080 Balfour + Wood Insert |
| KA Circle Top 2 Panel VG | 3680 Balfour + Glass Insert |
| KA Circle Top 2 Panel VG | 3680 Balfour + Wood Insert |

## Misprinted part numbers

Each row below prints a part number the sheet already uses elsewhere, or one
that is plainly wrong. The description beside it names the door and mask the
vendor meant, so the row is placed by that. **The quote still carries the number
as printed**, with a note to confirm it before ordering.

| As printed | Description | Belongs at |
| --- | --- | --- |
| `KA2PSE--3080` | KA 3080 2PA VG, SE + Glass | `KA2PASE--3080` |
| `M2PSQSEMW3080` | 3080 2PSQ VG, SE + Wood + IMB | `M2PSQSEBW3080` |
| `M2PASSEW3080` | 3080 2PA Smooth, SE + Wood + IM | `M2PASSEMW3080` |
| `KA2PASEBW2880` | KA 2880 2PA VG, SE + Wood + IMW | `KA2PASEWW2880` |

## To ask Hoelscher

1. The Circle Top 2 Panel is shown with a Balfour mask in the catalog but no
   Balfour row is priced in any size. What is `KACT2PSEB--` / `KACT2PSEBW`?
2. Four rows carry a misprinted part number (table above). Confirm the correct
   number for each before any of them is ordered.
3. The fiberglass 2 Panel Arch V-Grooved, Mahogany Grain Skin prices its masked
   speakeasy variants as CONFIGURED ITEM with no part number. What are they?


## The glass insert is Clear IG — added 2026-09-12

The sheet keys every glass-insert row to "P.22" (the ten-glass list) and
prints the number with `--`. Both catalogs print it with a `C`: mahogany page
26 (`M2PASEC3068`, *Clear IG*) and knotty alder page 8 (`KA2PASEC3068`). The
dealer chose the catalog's reading. `skuPlaceholders.speakeasyGlass` names the
pattern; `completeSku` fills the `C`; no glass is asked. The 70 glass-insert
rows, 24 mahogany and 46 knotty alder, print complete numbers from here on.
