# Mahogany Legacy & Panel — what the app knows, and how

Catalog pages 22–25, walked with the dealer on 2026-09-12.

## The ten panel doors

| Catalog | Sizes | Numbers |
|---|---|---|
| 6 Panel No Raised Moulding | 2868, 3068 | `M6P2868`, `M6P3068` |
| 6 Panel Raised Moulding | 3068, 2880, 3080, 3680 | `M6PRM3068`, `M6PRM2880`, `M6PRM3080`, `M6PRM3680` |
| Panel In Panel Raised Moulding | 3068, 3080 | `MPIP3068`, `MPIP3080` |
| Center Arch Raised Moulding | 3068, 3080 | `MCA3068`, `MCA3080` |

All ten were already in the catalogue with the sheet's prices (the 365-row
reconciliation covers them), carry no glass, and print their numbers on the
order sheet exactly as the catalog does. Nothing changed; the suite pins it.

## The Blanco Center Arch takes a caming letter

Page 25 prints the Blanco Center Arch Raised Moulding as two numbers:

```
MCABLAP3068   Patina caming
MCABLAZ3068   Zinc caming
```

The sheet prices one row, `MCABLA--3068`. Everywhere else in the wood
catalogue the first `--` is a glass code, so the app had left this one
unfilled and the order sheet flagged it. Now:

- **Blanco** is a `decorativeGlassDesigns` entry (infix `BLA`, caming Patina
  and Zinc, no price impact), so the configurator asks *Caming* the way it
  does for Columbia.
- `skuPlaceholders.caming` lists the pattern `^MCABLA--\d{4}$` with codes
  `P` / `Z`, the same shape as the handing placeholder on the narrow lites.
  `completeSku` fills a caming letter only where such a rule names the row;
  every other placeholder still takes the glass code.
- Both camings price the same, since the sheet has one row.

The rule is deliberately one row wide. The other decorative-glass rows
(pages 28–31, `M34---3068` and kin) carry a three-dash placeholder for a
design infix and are a later walkthrough.

## The glass list — held

Page 22 prints the Legacy & Panel glass options: Clear Low-E, Clear Bevel
Low-E, Baroque, Flemish, Water, Stippolyte, Rain, Reeded, Small Reeded, Satin,
with privacy ratings 0–9 — the same ten as page 12. The sheet keys **42 rows**
to "P.22": the flat-glass Full / 3/4 / 2/3 Lite doors and sidelites (pages
28–30) and the 2 Panel Arch / Square speakeasy doors, whose `--` is the glass
in the insert. The dealer is checking the catalog before this becomes a rule;
until then those rows keep going out flagged, as they have.

## Verification

`tests/legacy-panel.test.mjs` — the ten doors held complete and matching the
sheet; the Blanco design, its placeholder rule and that the rule reaches no
other row; then the app: a panel door asked no glass and printing its number,
the Blanco asked its caming and not its glass, Patina → `MCABLAP3068`, Zinc →
`MCABLAZ3068`, the same price both ways, the caming in words on the sheet.
