# Mahogany Simulated Divided Lite — what the app knows, and how

Catalog page 21, walked with the dealer on 2026-09-12. One door, one sidelite,
two bars. The page settled three things the app had been guessing at.

## The door and its sidelite

| | Catalog | Sheet | App |
|---|---|---|---|
| 3/4 Lite 1 Panel for SDL, No Raised Moulding | `M34LE1P2668NRM` … `3680NRM` (7 sizes) | `M34--1P….NRM`, glass column *Clear Low-E* | `M34--1P….NRM`, glazing Clear Low E |
| 3/4 Lite 1 Panel Sidelite for SDL | `M34SLLE1P1068` / `1080`, 1'0" × 6'9" / 8'1" | `M34SL--1P1068` / `1080` | same |

The door comes in one glass, so the app does not ask; the part number
completes from the row's glazing through the sheet's legend (`LE`), and the
order sheet prints exactly the catalog's numbers. Both were already in the
365-row reconciliation; nothing about the prices changed.

**Sidelite pairing.** The page shows the door with its own sidelite and no
other. The app was offering nineteen — every wood sidelite in the collection
that fit the height — which is the same fault the 4 Lite and 6 Lite doors had
before page 15 and 17 gave them their pairings. A fifth `sideliteRules` entry
now pairs `^3/4 Lite 1 Panel NRM$` with `^M34SL--1P\d+$`. The dealer confirmed
it.

## The factory grid is priced by bar

The sheet prints the simulated divided lites on the two lineal-bar rows:

```
MSDLBAR7880    7/8"   x 8-0    $26 the bar    +35 per lite, applied at the factory
MSDLBAR11480   1-1/4" x 8-0    $30 the bar    +40 per lite, applied at the factory
```

The app had one per-lite row at $35 and never asked the width, so a 1-1/4"
grid was under-charged $5 a lite. There are now two per-lite rows in
`woodComponents` (`SDL-LITE-78` at $35, `SDL-LITE-114` at $40 — our own
numbers, the sheet prints none), and `sdlRule.bars` names them. The
configurator asks the bar first, then counts lites; switching bars carries the
count across and reprices it, and the order sheet's grid line names the bar.

The 8' lineal bars themselves stay in the components picker, for a grid applied
in-house. They are a different way of doing the same thing and are not charged
per lite.

## Which doors get the grid

The catalog offers the factory grid on this door alone — it is the only door on
the Simulated Divided Lite page, and its name says "for SDL". The app was
offering the counter on every wood door except the Contemporary range. The
dealer chose the catalog's reading: `sdlRule.appliesToModelPattern.wood` is
`^3/4 Lite 1 Panel NRM$`, and every other wood door, mahogany and knotty
alder, stops offering it. A collection the rule does not name (fiberglass)
keeps its previous behaviour.

## Verification

`tests/sdl.test.mjs` — the rules as data (both rows, both bars, the pairing,
the gate), then the app driven: no glass step, one sidelite offered, the two
bars at the sheet's prices after cost and margin, six lites on the 7/8" bar,
the same six carried onto the 1-1/4" bar and repriced, the order sheet's three
numbers, the estimate's wording, and a TDL door offered no grid. The knotty
alder suite now asserts the grid is absent there.
