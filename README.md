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
| `packages/pricing-engine/engine.test.mjs` | 32 unit tests, incl. a full-catalogue sweep |
| `quoter/assets/doors/` | Optional product photography, `{SKU}.webp` |
| `data/catalog.json` | Master catalog — `products[]`, `prehangAdders[]`, `components[]`, `hardware[]` |
| `data/pricing-rules.json` | Net multiplier, currency, rounding, freight and defaults |
| `.nojekyll` | Serve files verbatim from Pages |

## The catalog

`data/catalog.json` holds 699 priced items converted from
`SimplyDoors_Complete_Catalog.xlsx` (Hoelscher dealer price lists, 7-1-2026):

| Section | Items |
| --- | --- |
| `products` | 589 doors, sidelites and barn slabs — fiberglass, mahogany, knotty alder, barn |
| `prehangAdders` | 62 interior-casing / 1x4 adders by line, top style and configuration |
| `components` | 26 millwork items — jambs, casing, brickmould, T-astragal, SDL bars |
| `hardware` | 22 barn-hardware, iron-mask, speakeasy, clavos and strap SKUs |

Every one of the 2,994 door price cells was verified against the source
spreadsheet after conversion, with zero mismatches. The 546 `N/A` cells became
`null` (not offered), never `0`. `NET` columns were not imported: they are
`list x 0.48` throughout and are derived at quote time from
`pricing-rules.json`, so storing them would be duplicated state that can drift.

Each array becomes its own tab. The grid is built from the data, so a catalog
carrying different arrays or extra fields still renders — unmodelled fields
appear as extra columns rather than being dropped.

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

**Cost vs customer pricing.** A lock control in the header, mirrored inside the
quote drawer, switches the whole app between `grandTotalSellCents` /
`unitSellCents` and `totalCostCents` / `unitCostCents`. Cost mode paints a
banner across the header so it cannot be shown to a customer by accident. It is
a display switch only — no credential, no gate. Anyone who opens the page can
flip it, and cost is derived from data the page already downloads, so treat the
published catalogue as public.

**Images.** Products look for `quoter/assets/doors/{SKU}.webp`. A missing file
triggers the `onerror` fallback, which draws an architectural silhouette from
the product's own description — lite count, arch, sidelite proportion, barn
slab. With no photography loaded the catalogue still reads as a catalogue.

**CDN resilience.** If `cdn.tailwindcss.com` is unreachable — a locked-down job
site network, a CDN outage — the page flags itself and a structural fallback
stylesheet keeps the catalogue, drawer and totals usable. Scrim inert state is
plain CSS rather than a Tailwind utility, so the app never becomes unclickable.
