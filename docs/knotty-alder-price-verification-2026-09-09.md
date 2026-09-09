# Knotty Alder price verification and add-on rules

Source: `Simplydoors__Wood_Pricing_7126_2.pdf`, the knotty alder pages of the
dealer wood price list (its pages 4-6 of 7, effective 7-1-2026), read against
`data/catalog.json`.

## Every line on the price list is in the catalog

| | |
| --- | --- |
| Priced rows parsed from the sheet | 148 |
| Rows the vendor prints twice | 4 |
| Distinct rows | **144** |
| Knotty alder rows in `catalog.json` | **144** |
| Part numbers missing from the catalog | **0** |
| Rows whose six prices match exactly | **147 of 148** |

All six price columns were compared per row — slab, single prehung and double
prehung, unfinished and prefinished. The seven add-on SKUs at the foot of the
section (`SEGHWI-1B/2B/4B`, `KASEKOR`, `CLAVOS--`, `STRAP14`, `STRAP17`) are
all present at the printed price.

The one row that did not match is the vendor's own duplicate: `KA2PASEBW2880`
is printed twice, once at $1,432 (Balfour + wood, correct) and once at $1,467
where the Windsor row should read `KA2PASEWW2880`. Both prices are in the
catalog on the right doors; only the part number carries the typo.

The four rows printed twice are `KACT2PSEM--3080/3680` and `KACT2PSEMW3080/3680`
— the Circle Top standard-mask block appears twice, and **no Balfour block
appears at all**. `KACT2PSEB--` is not priced anywhere on the sheet.

## The add-ons now belong to the doors on pages 50-53

The Speakeasy Kit, the three Iron Masks, the Clavos and the Straps are printed
on catalog page 50 as add-ons. They are now offered only on doors printed on
catalog pages 50-53, driven by each row's own `catalogPage` rather than by a
pattern in its name. Outside knotty alder nothing changed.

**A door that already has a speakeasy does not get offered one again.** The
sheet's own arithmetic shows why:

| | slab, unfinished |
| --- | --- |
| `KA2PSQ3068` plain | $777 |
| `KA2PSQSE--3068` with speakeasy | $1,122 — exactly +$345, the kit |
| `KA2PSQSEM--3068` with standard mask | $1,329 — exactly +$207, the mask |
| `KA2PSQSEB--3068` with Balfour mask | $1,329 — +$207 |
| `KA2PSQSEW--3068` with Windsor mask | $1,363 — +$241 against a $242 mask |

Adding the kit or a mask to one of those doors would charge for it twice, so
those two are withheld there. Clavos and straps are still offered: they are
surface decoration, not part of the speakeasy.

## Part numbers now complete

The sheet prints `KA34--3068` with a legend — "For Complete Part Number Fill In
Glass Code In Place of (--)" — and twelve codes: Clear Low E (LE), Clear Bevel
Low E (CBLE), Baroque (BQ), Digital (D), Flemish (F), Water (W), Stippolyte
(ST), Rain (RN), Reeded (RD), Small Reeded (SR), Satin (SN), Sandblast (SB).

239 rows across the catalog carry that placeholder. The legend is now
`catalog.glassCodes`, and a quote names the part the customer actually orders:
choosing Clear Low E on the 3/4 Lite flat-glass door gives `KA34LE3068`, not
`KA34--3068`.

## Rows that point at a glass page now ask which glass

71 knotty alder rows carry a page reference in the glass column instead of a
glass — `P.42` and `P.46` for the collection's ten glasses, `P.54` for the five
offered behind an iron grille. The app used to ask nothing on those rows, so
they could never complete their part number. A glass rule can now key off that
page reference, and those doors ask properly.

## Sidelites sort last

Sidelites are an add-on to an opening — the Opening step is where they are
really chosen — so their cards now sort below every door in the catalogue.

## Photography

23 add-on and design pictures are in `quoter/assets/designs/`, including the
round and square clavos, the strap and the two speakeasy inserts pulled from
catalog page 50. Each shows beside its item once it is on the opening.

Of the 63 knotty alder models, 12 have a door photograph of their own, and
three more now borrow one that is genuinely a picture of them: the iron-grille
door shows a grille design, the two decorative-glass doors show themselves
glazed. **The remaining 48 are not photographed in the catalog we hold.** Most
are speakeasy variants: page 51 photographs four of them, but its part numbers
are internally inconsistent (the `KA2PASEBW2880` typo puts a Balfour number in
the Windsor panel), so the tool refuses to file them rather than risk filing a
photo under the wrong door. A corrected page 51 would fix that.

## Still open with Hoelscher

1. `KACT2PSEB--3080/3680` — the Circle Top with a Balfour mask is not priced;
   its block appears to have been replaced by a second copy of the standard one.
2. `KA2PASEBW2880` is printed on two different rows at two different prices.
3. 3'6" decorative glass (`KA34PECP3680`, `KA34SJCP3680`) is in the catalog but
   not on the price sheet.
4. Circle Top 2 Panel V-Grooved has no part numbers printed on catalog page 52.
5. Small Reeded's privacy rating is 7 on three catalog pages and 8 on two.
