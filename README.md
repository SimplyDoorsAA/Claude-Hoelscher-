# Simply Doors — Price Manager (App A)

Single-file, dependency-free web application that authenticates a pricing administrator
against GitHub and edits the master door catalog in place. It is the **write side** of the
two-app architecture:

```
App A  Price Manager  ──PUT──▶  data/catalog.json          ──fetch──▶  App B  Quoter
(/index.html)                   data/pricing-rules.json                (/quoter/)
                                          │                                 │
                                          └──────▶ packages/pricing-engine ─┘
                                                   (all money maths)
```

| App | URL | Audience |
| --- | --- | --- |
| A — Price Manager | `/` | Pricing administrator (PAT required) |
| B — Quote Builder | `/quoter/` | Sales staff and customers (no auth) |

Everything lives in `index.html` — HTML, CSS and vanilla JavaScript. No build step,
no framework, no server. Drop it on GitHub Pages and it works.

## Deploy

1. **Settings → Pages → Build and deployment → Deploy from a branch**, branch `main`, folder `/ (root)`.
2. The app is then served at `https://<owner>.github.io/<repo>/`.
3. The Quoter reads the published artifact directly, no token required:
   `https://raw.githubusercontent.com/<owner>/<repo>/main/data/catalog.json`
   (or `https://<owner>.github.io/<repo>/data/catalog.json`, which is CDN-cached for a few minutes).

## Sign in

The administrator supplies a **GitHub Personal Access Token**, repository owner, repository
name, branch and the two file paths. Settings persist in `localStorage`; the token is stored
in `sessionStorage` (this tab only) unless *Remember this token on this device* is ticked.

| Token type | Required permission |
| --- | --- |
| Fine-grained PAT | Repository permissions → **Contents: Read and write** on this repository |
| Classic PAT | **repo** scope |

The token is sent only to `api.github.com` over HTTPS. There is no backend, so nothing else
ever sees it. Use **Clear credentials** on shared machines.

## Data contracts

These are enforced in the editor *and* re-validated immediately before every commit. A
violation blocks the publish — nothing is written to GitHub.

1. **Integer cents only.** Every money value is an integer number of cents. Dollar entry is
   parsed with string arithmetic (`1728.35 → 172835`), never `value * 100`, so no
   floating-point residue can reach the JSON. Toggle **$ dollars / ¢ cents** to see and edit
   the raw stored integers.
2. **`null` means "not offered".** A blank money cell round-trips as `null`, never `0` and
   never `""`. Null cells are hatched and labelled `null`. Type `0` for a genuine zero price.
3. **`priceBasis`** is a constrained dropdown and must be exactly `"list"` or `"net"`.
   A pre-existing out-of-contract value is surfaced in red rather than silently coerced.
4. **`id` is read-only.** Ids are content hashes referenced by saved quotes, so they are
   rendered as locked text and never edited or regenerated. Only a brand-new row gets an id
   minted (SHA-1 of its content, first 10 hex), and it is locked from that moment on.

Unmodelled fields are preserved: the app mutates the parsed object graph in place and
re-serializes it, so any key the grid does not show still round-trips byte-for-byte. Fields
that are present in the data but absent from the reference schema are appended as extra
columns rather than dropped.

> One benign normalisation: JSON has a single number type, so `1.0` re-serializes as `1`
> (`freightUnits`). The value is unchanged; the first publish may show this as a diff.

## The grid

Desktop-primary, high density, ~26px rows.

* Sticky header and sticky SKU column, so horizontal scrolling never loses the row's identity.
* **Columns** — show/hide any column, with *Pricing focus* and *Specs only* presets. Hidden
  columns are display-only; their values still publish untouched. The choice persists locally.
* Click a header to sort (view-only — file order is never rewritten). Filter box does a
  multi-term match across the whole row.
* Modified rows are highlighted amber and revert to clean if you type the original value back.
* Free-text columns (line, family, type, glazing, category) offer a datalist of values already
  present in the catalog, which keeps the vocabulary consistent.
* `+ Row` appends, `⧉` duplicates (new id minted, SKU suffixed `-COPY`), `✕` deletes with a
  warning about saved quotes.

### Keyboard

| Key | Action |
| --- | --- |
| `Enter` / `↓` | Next row, same column |
| `Shift+Enter` / `↑` | Previous row, same column |
| `Tab` / `Shift+Tab` | Next / previous cell |
| `Ctrl+←` / `Ctrl+→` | Previous / next column (plain arrows move the caret) |
| `Ctrl+F` | Focus the filter |
| `Ctrl+S` | Publish |

## Responsive behaviour

Breakpoints at 1200px, 900px and 640px scale padding, type and chrome down. **The pricing
grids keep their `<table>` structure at every width** — cells are never restacked into cards.
The grid's own container is the scroller (`overflow:auto`) and the table stays
`width:max-content`, so on a phone you scroll the grid horizontally against a sticky SKU
column while the page body itself never scrolls sideways.

## Publishing

`Publish Catalog` runs the full validation pass, then for each changed file:

1. `GET /repos/{owner}/{repo}/contents/{path}?ref={branch}` — re-reads the current blob SHA.
2. If the remote content changed since load, it stops and asks: overwrite, or cancel and
   reload. Nothing is force-pushed silently.
3. `PUT /repos/{owner}/{repo}/contents/{path}` with `{message, content (base64), sha, branch}`
   — a direct commit to the branch (`main` by default).

The status console logs every request, its HTTP status code, the rate-limit budget, the
resulting **commit SHA**, the new blob SHA and a link to the commit. Unchanged files are
skipped, so publishing is idempotent.

`Backup` downloads the current in-memory catalog and rules as a single JSON bundle before
you commit anything.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | App A — Price Manager |
| `quoter/index.html` | App B — Quote Builder |
| `packages/pricing-engine/index.js` | Shared money maths — the only place prices are computed |
| `packages/pricing-engine/engine.test.mjs` | Engine unit tests, incl. a full-catalogue sweep |
| `packages/pricing-engine/stress.test.mjs` | Engine figures recomputed from the raw catalogue |
| `tests/run.sh` | Every suite, in order |
| `tests/appa.test.mjs` | App A loads and edits both published files |
| `tests/quoter.test.mjs` | App B end to end, incl. the whole configurator |
| `tests/stress-ui.mjs` | Real quotes built through App B, checked against the sheets |
| `tools/audit-catalog.mjs` | Structural audit of the published data |
| `docs/audit-2026-09-09.md` | What the last full audit found, and what is still open |
| `quoter/assets/doors/` | Door photography extracted from the catalogs, plus `manifest.json` |
| `quoter/assets/glass/` | Glass swatches with Hoelscher's privacy ratings |
| `quoter/assets/designs/` | Iron grille designs, decorative glass and mask photography |
| `docs/knotty-alder-deep-dive-2026-09-09.md` | Catalog pages 42-57 read in full: what was added, what is still open |
| `tools/extract-door-images.py` | Pulls that photography out of the catalog PDFs |
| `data/catalog.json` | Master catalog — `products[]`, `prehangAdders[]`, `components[]`, `hardware[]` |
| `data/pricing-rules.json` | Net multiplier, currency, rounding, freight and defaults |
| `.nojekyll` | Serve files verbatim from Pages |

## Tests

```sh
./tests/run.sh                       # all five suites, ~4 minutes
TAILWIND_CSS=/path/to/tw.css ./tests/run.sh   # faithful screenshots
node tools/audit-catalog.mjs         # data contracts and cross-references
```

227 checks. The browser suites drive real Chromium through Playwright, resolved
from `PLAYWRIGHT_MODULE` if the default install path does not exist. Each serves
the repo on a port the OS picks, so a killed run cannot block the next one.
Screenshots land in `.test-output/` (override with `SHOT_DIR`).

Every expected figure is recomputed inside the test from `data/catalog.json`
and the printed shipping schedule rather than asked of the engine, so a bug
shared by both sides cannot make them agree. The App B suites run with
`cdn.tailwindcss.com` unreachable, which is also how the fallback stylesheet
gets exercised.

## The catalog

`data/catalog.json` holds 699 priced items converted from
`SimplyDoors_Complete_Catalog.xlsx` (Hoelscher dealer price lists, 7-1-2026):

| Section | Items |
| --- | --- |
| `fiberglassProducts` | 222 fiberglass doors and sidelites, each carrying a `skin` |
| `fiberglassPrehangAdders` | 24 interior-casing / 1x4 adders |
| `fiberglassComponents` | 11 PVC jambs, brickmould, T-astragal, dentil shelf, SDL bars |
| `woodProducts` | 365 mahogany, knotty alder and barn doors, sidelites and slabs |
| `woodPrehangAdders` | 38 interior-casing / 1x4 adders |
| `woodComponents` | 17 jamb legs, casing, mull covers, subsills, T-astragal, SDL bars |
| `hardware` | 22 barn-hardware, iron-mask, speakeasy, clavos and strap SKUs — shared |
| `ironGrilleDesigns` | 11 knotty alder grille designs, with the sizes each is made in |
| `decorativeGlassDesigns` | 7 leaded glasses and the caming each is offered in |
| `glassRules` | Where the catalog names glasses the price sheet does not |

The split follows the vendor price sheets, not a guess: the fiberglass sheet
carries its own Components, SDL Bars and Prehang Adders sections and no
hardware at all, so `hardware` stays shared. Iron masks and speakeasy kits are
priced on the wood sheet but fit fiberglass doors too, which is the other
reason not to file them under one line.

Every one of the 2,994 door price cells was verified against the source
spreadsheet after conversion, with zero mismatches. The 546 `N/A` cells became
`null` (not offered), never `0`. Two of those rows — the mahogany Simulated
Divided Lite Bars — have since moved to `woodComponents`, where the fiberglass
SDL bars already were, so the door arrays now hold 2,982 cells. `NET` columns were not imported: they are
`list x 0.48` throughout and are derived at quote time from
`pricing-rules.json`, so storing them would be duplicated state that can drift.

Each vendor price sheet is its own set of arrays, and therefore its own set of
tabs in App A, so fiberglass can be worked on without wood in the way. The split is for
editing only: the pricing engine merges every `*Products` array, so the Quoter
and every price are unaffected, and the net multiplier's scope still names one
logical `products` section whatever the arrays are called.

Each array becomes its own tab. The grid is built from the data, so a catalog
carrying different arrays or extra fields still renders — unmodelled fields
appear as extra columns rather than being dropped.

### Freight

Transcribed from the Hoelscher San Antonio / Austin shipping schedule. Two
separate charges:

**1. Prehang charge — $100 net per prehung OPENING.** Not per door leaf: the
schedule's example #3 bills five double prehung units (ten leaves) at
`$100 x 5`. A single door with two sidelites and a transom is likewise one
opening, so accessories attached to a line never add a charge of their own.

**2. Crate & shipping — banded on the whole order's unit count.**

| Units | FOB Run — San Antonio / Austin |
| --- | --- |
| 1-3 | $120 | 
| 4-6 | $165 |
| 7-9 | $200 |
| 10+ | Prepaid |

Units: door slab 1, sidelite 0.5, transom 1, 25 jamb legs 1, 50 pcs other
components 1. A double prehung opening carries two leaves and counts twice.
Fractional totals round up. Because the band depends on the whole order, this
charge is computed at quote level, not per line.

Both charges are quoted net and are never multiplied by `netMultiplier`.

All five worked examples printed on the schedule are pinned as tests, two of
them rebuilt from real quote lines rather than from the numbers alone.

### Margin tiers

Two customer tiers, set in `pricing-rules.json` and editable in App A's Pricing
Rules tab:

| Tier | Margin | Resulting price |
| --- | --- | --- |
| Builder | 30% | 68.6% of Hoelscher list |
| Retail | 40% | 80.0% of Hoelscher list |

Because cost is a fixed 48% of list, the margin is also a discount-off-list
dial: `sell = list x 0.48 / (1 − margin)`. Selling at list would be a 52%
margin. `defaultMarginTier` decides which one the Quoter opens on — retail, so
a builder price is never shown by default. `defaults.fallbackMarginPercent`
applies only if a tier cannot be resolved.

App B carries a Builder/Retail switch in the header and a second one inside the
quote drawer (the drawer is modal and covers the header). Cost is unaffected by
the tier; only the customer price moves.

### Reading prices in App A

Money is shown as `$1,728.00` — dollar sign, thousands separator, always two
decimals. The cells stay editable and still accept `1728.35`, `$1,728.35` or
`1,728.35`; the `$` and commas are stripped on the way in and the value is
stored as integer cents.

**+ Cost** adds a grey line under every list price showing our cost at the net
multiplier — `$1,728.00` list, `$829.44` cost. Cost is derived on the fly from
`netMultiplier` and never written to `catalog.json`: a stored copy would drift
the moment either the list price or the multiplier changed. A configuration
priced `null` shows a dash there, never `$0.00`. A test pins App A's cost
figures to the pricing engine's across the catalogue so the two cannot diverge.

**Page numbers** are shown per item — `Cat. Page` on products, `Src Page` on
adders, components and hardware — and are editable. **⚑ Needs page** filters
any grid to just the rows that have none, which is the working set for filling
them in. `docs/missing-catalog-pages.md` lists the same rows, currently 127 of
699.

### Known gaps in the imported data

- **`freightUnits` is `null` on every product.** The spreadsheet export carries
  no per-door freight column, and it is not safe to invent one. Freight cannot
  be computed for a door until this is supplied.
- **One duplicate row was dropped.** `M23SL--1280` / "1281 2/3 Lite Sidelite
  Iron Grille" appeared twice, identical on every field and all six prices, and
  flagged `dup part#` in the source. Its note was merged onto the surviving row.
- **SKU is not unique, by design.** The vendor uses `--` as a glass-code
  placeholder, so `M34--3068` covers both the Flat Glass and Iron Grille doors
  at different prices. The `id` content hash includes description and glazing,
  so ids stay unique where SKUs do not.
- **53 products still have no catalog page.** The fiberglass dealer price
  sheet has no Page# column at all — only the wood sheet does — so those pages
  had to come from the 2025 Fiberglass Product Catalog. 169 of 222 fiberglass
  products are now mapped from it. The remaining 53 are 45 Smooth Collection
  (`NL*`) products, whose pages were not in the portion of the catalog
  supplied, and 8 rows the price sheet prints as `CONFIGURED ITEM` with no
  vendor part number.
- **Two SDL bar products have no parsable size** — they are lineal bars, not
  doors, so `size.widthIn` / `heightIn` are `null`.
- **`M23A--3068`** prices Decorative Glass identically to Flat Glass, which is
  the only place in the catalog where those two differ by nothing. Worth
  confirming with Hoelscher.

### Net multiplier scope

Every catalogued item carries `priceBasis: "list"`, so `NET = list x
netMultiplier` across all four sections. That scope is now stated explicitly in
`pricing-rules.json` under `netMultiplierScope` rather than left for the Quoter
to infer:

| Field | Meaning |
| --- | --- |
| `appliesTo` | Sections the multiplier covers — all four |
| `excludesFreight` | Freight is quoted already net and is never multiplied |
| `decidedBy` / `decidedOn` | Dealer instruction, 2026-09-07 |
| `vendorConfirmed` | **`false`** — Hoelscher has not confirmed this yet |

`vendorConfirmed` is the live risk. If Hoelscher states that components,
prehang adders or hardware are already net, drop those entries from
`appliesTo`; leaving them would understate those costs by 52%. No price data
changes either way — only the scope list.

The workbook's `Open Items` sheet lists the remaining vendor questions:
unpriced 3680 iron-grille and Craftsman variants, the Impact glass SKUs absent
from the product catalog, brickmould length (100" vs 104"), and several
Speakeasy + Iron Mask bundles with no combined part number.

## App B — Quote Builder

`/quoter/` is a static, unauthenticated page: Tailwind via CDN, vanilla ES
modules, no build step. It fetches the two published data files and delegates
every calculation to `packages/pricing-engine`.

**Pricing engine.** The engine did not exist when App B was written; it is
derived from `pricing-rules.json`, which is authoritative, and unit-tested
against the live catalogue. Two judgement calls the rules file does not settle
are isolated in an exported `ASSUMPTIONS` object at the top of the module:

| Assumption | Default | If wrong |
| --- | --- | --- |
| `marginMode` | `margin-on-sell` — sell = cost / (1 − m) | Markup instead would price a $1,000 cost at $1,350, not $1,538.46 |
| `doublePrehangUnits` | `1` — the prehang freight charge is per opening | Per leaf would add $100.00 to every double opening |

Both are one-line changes. Everything else — the 0.48 multiplier and the
sections it covers, the $100.00 prehang charge, labour defaults, half-up-to-cent
rounding — is read from `pricing-rules.json` at load and changes when App A
publishes.

**Choosing a line.** The Quoter asks which line is being built before it shows
anything, because the two price from separate vendor schedules and mixing them
on screen is what causes mis-quotes. The choice scopes the catalogue, the
filters, and the sidelites and components offered as accessories. Hardware
stays available to both, since an iron mask fits either. The choice is
remembered, shown in the header, and switching with work in progress asks
whether to keep the existing quote lines or start fresh rather than silently
dropping or hiding them.

**Choosing a collection.** One line is still too much to scroll, so the gate
runs in two steps and the second is the division the price sheets already make:

| Line | Question | Collections | Field |
| --- | --- | --- | --- |
| Fiberglass | Woodgrain or smooth? | Woodgrain, Smooth | `skin` |
| Wood | Which wood? | Mahogany, Knotty Alder, Barn Doors | `line` |

`skin` is a catalogue field added for this, classified from each row's own
description (`Mahogany Grain`, `Oak Grain` and `Fir` are woodgrain; everything
carrying `Smooth`, brushed or not, is smooth) and editable in App A like any
other column. Wood needed no new field — the sheet already splits on `line`.
Both are read from the data, so a new value appears in the gate on its own;
only the labels and blurbs live in the app.

The choice scopes the catalogue, the facet filters and the sidelites offered
inside an opening. It shows as a second chip in the header, next to the line,
and either chip reopens its step. A facet with nothing left to choose between
hides itself, so picking Knotty Alder does not leave a Line filter offering
mahogany. A search that finds nothing here but matches in a sibling collection
says so and offers to switch, rather than showing an empty page.

**The catalogue and the gate always agree.** One function decides what a card
counts — models, not part numbers, with option-only rows excluded — and what to
call them, and both the gate cards and the result count read it. Model keys
strip the row's own size code wherever it appears, not only at the front:
knotty alder prints it after the line prefix (`KA 2680 4 Lite 1 Panel RM`),
which had been leaving all 144 of its part numbers as their own card. It now
shows 63.

**The guided configurator.** The price sheets carry one part number per glass
and per size, so a single door appears in the catalogue as many as sixteen
times. The Quoter groups them into models — 222 fiberglass part numbers are 40
doors — and each card opens a configurator that asks one question at a time:

| # | Question | Where the answers come from | Priced? |
| --- | --- | --- | --- |
| 1 | Glass | the model's own glazings, or a `glassRules` list | yes — a dearer glass shows `+$x` |
| 1b | Caming | `decorativeGlassDesigns`, where both leads are made | no |
| 2 | Size | the sizes offered in that glass | yes |
| 2b | Grille design | `ironGrilleDesigns`, filtered to the chosen size | no — one row prices them all |
| 3 | Iron grille | `fiberglassIronGrilles` | yes — resolves to the grille row |
| 4 | Finish | `availableOptions()` | yes |
| 5 | Stain colour | `fiberglassStainColors`, grained skins only | no |
| 6 | Opening | see below | yes |
| 7 | Sidelite | sidelites of the line at a matching height | yes, each |
| 8 | Handing | `openingSpec.handing` | no |
| 9 | Swing | `openingSpec.swing` | no |
| 10 | Jamb depth | `openingSpec.jambDepths` | not yet — see below |

Each question appears only once the one before it is answered; anything with a
single possible answer is settled without asking; no price shows until every
question is answered. A rail across the top says which step you are on and
holds each answer as a chip, and clicking a chip takes that answer back along
with everything that depended on it.

**The opening.** "Configuration" as a customer means it — slab only, single,
single with one or two sidelites, or a double door. That is also the dimension
both `*PrehangAdders` arrays are keyed by (`3068 Single`, `3068 Single,12-14"
Sidelite`, `3068 Double`). It maps onto the engine's three priced
configurations plus a count of sidelites, so the engine's vocabulary is left
alone: single and its sidelite variants are `singlePH`, a double is `doublePH`,
and the sidelites ride inside the same line. One line is one opening, so a door
with two sidelites still carries exactly one $100 prehang charge and counts 2
freight units (1 + 0.5 + 0.5).

Sidelites are offered at a height that matches the door — a 6'8" door takes a
6'9" sidelite — and in the door's own collection: a woodgrain door is never
offered a smooth-skin sidelite, a mahogany door never a knotty alder one. One
option per model and width rather than per part number, with the door's glass
preferred where the sidelite is offered in it. Fiberglass sidelites are offered
unfinished only, which the option says on its face when the door is prefinished.

**What is recorded but not charged.** Handing, swing and jamb depth are order
spec. Neither price sheet prices handing or swing, so neither moves the total.
Jamb depth is the open question: both lines catalogue a jamb at each depth
(fiberglass `PVC Jamb 4-9/16"` $65.00 and `6-9/16"` $94.00; wood
`Exterior Jamb Leg` at $90.00 / $111.00 mahogany), but neither sheet states
whether a prehung price already includes a jamb, nor at which depth. Until
Hoelscher confirms, the depth is recorded on the quote and nothing is charged —
`openingSpec.jambDepths.vendorConfirmed` is `false` and `chargeUpgrade` is
`false`. Turning the charge on also needs a decision about how many pieces an
opening takes, which is why it is not a flag flip. Cost view names the
catalogue jamb behind each depth so a dealer can see the difference exists.

**Which accessories fit which door.** Not every component or piece of hardware
pairs with every door. `accessoryRules` in `data/catalog.json` says which do;
an accessory no rule matches stays offered on any door in its line. Each rule
names the accessories it constrains (by category or a description pattern) and
what the door must be, so widening one is an edit in App A rather than a code
change.

| Accessory | Offered on |
| --- | --- |
| Barn Door Hardware | barn slabs |
| Iron Mask — Standard, Balfour, Windsor | wood two-panel square and arch doors |
| Speakeasy Kit — Mahogany / Knotty Alder | two-panel doors of that wood |
| Dentil Shelf | Craftsman models |
| T-Astragal | a double opening |
| Mull Cover, Fat Boy Mullion | an opening with sidelites |

Sidelites are deliberately **not** in the picker: they belong to the opening,
and the Opening step asks for them, so offering them twice would put a second
sidelite on the line at full price. The picker says how many items it hid, so a
missing accessory reads as a rule rather than a bug.

**Cost vs customer pricing.** A lock control in the header, mirrored inside the
quote drawer, switches the whole app between `grandTotalSellCents` /
`unitSellCents` and `totalCostCents` / `unitCostCents`. Cost mode paints a
banner across the header so it cannot be shown to a customer by accident. It is
a display switch only — no credential, no gate. Anyone who opens the page can
flip it, and cost is derived from data the page already downloads, so treat the
published catalogue as public.

**Images.** The door photography is pulled straight out of the Hoelscher
catalog PDFs by `tools/extract-door-images.py` and filed by **model**, which is
what a catalog photographs — one picture of the door, not one per part number:

```sh
python3 tools/extract-door-images.py FIBERGLASS.pdf WOOD.pdf   # --dry-run to look first
```

The catalogs set one tall photo beside the part numbers for that door, so the
tool reads the part numbers that fall in a photo's vertical band and nearest
column, resolves them against `catalog.json`, and files the photo under the
model they agree on. **Nothing is guessed** — a photo it cannot pin to one
model is reported and skipped. Four wrinkles it handles rather than fudges:

- The wood catalog and the wood price sheet spell part numbers differently
  (`M3GPWNSR2880L` against `M3GPWN--2880--`), so matching falls back to the
  size code plus the longest letter prefix that still matches, which keeps the
  narrow-profile door (`M3GPWN`) from being confused with the wide one.
- Some pages carry text runs at negative coordinates belonging to another
  layer; left in, they attach one door's part numbers to the door above it.
- 25 part numbers are shared by more than one door (see the audit). Where the
  caption directly above the photo names the difference — "Flat Glass" against
  "Decorative Glass" — that settles it. Where it does not, the whole band is
  treated as unsafe and every photo in it is skipped, because a near-miss files
  a picture under the wrong door.
- Where one photo covers a door offered in two skins it is shared, as the
  catalog itself does — except when the skins differ by colour, where the
  photos are ranked by brightness so the black door never stands in for the
  white one.

**Glass swatches.** `--glass` pulls the swatches off the catalogs' "Available
Glass Options" pages, where each square sits directly above its name, into
`quoter/assets/glass/` with Hoelscher's own privacy rating (0 clear to 9
opaque). The configurator's Glass question shows the swatch and the rating
beside each option.

The two sheets do not spell the names the same way — the price sheet writes
`Clear Low E` where the swatch page writes `Clear Low-E`, and `Sandblast`
against `Sandblast w/1" Clear Border` — so the app matches on letters and
digits alone, exactly first and then by prefix. That covers 7 of the 19 glass
names in the catalogue and 203 of the 299 rows that name one. The rest are the
decorative glasses (Pecos, San Jacinto, Columbia and the like), which the
catalogs show only as an unlabelled "Other Available Decorative Glass Options"
gallery — there is nothing to name them from, so they get no swatch rather than
a guessed one.

Output is `quoter/assets/doors/*.webp` plus a `manifest.json` the Quoter reads
at boot. A model with no photograph falls back to an architectural silhouette
drawn from its own description — lite count, arch, sidelite proportion, barn
slab — and because the manifest says which models have one, the page never
fires a request that can only 404. A missing or unreadable manifest is not
fatal: the catalogue still reads as a catalogue.

**CDN resilience.** If `cdn.tailwindcss.com` is unreachable — a locked-down job
site network, a CDN outage — the page flags itself and a structural fallback
stylesheet keeps the catalogue, drawer and totals usable. Scrim inert state is
plain CSS rather than a Tailwind utility, so the app never becomes unclickable.
