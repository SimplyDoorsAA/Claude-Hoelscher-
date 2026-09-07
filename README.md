# Simply Doors — Price Manager (App A)

Single-file, dependency-free web application that authenticates a pricing administrator
against GitHub and edits the master door catalog in place. It is the **write side** of the
two-app architecture:

```
App A  Price Manager  ──PUT──▶  data/catalog.json          ──raw fetch──▶  App B  Quoter
(this repo, /index.html)        data/pricing-rules.json     (read-only)     (customer facing)
```

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
| `index.html` | The entire application |
| `data/catalog.json` | Master catalog — `products[]` and `prehangAdders[]` |
| `data/pricing-rules.json` | Net multiplier, currency, rounding, freight and defaults |
| `.nojekyll` | Serve files verbatim from Pages |

`data/catalog.json` ships with a representative starter set (10 products across the
fiberglass / knotty alder / mahogany / steel lines plus a sidelite, and 12 prehang adders)
including the exact reference record `5a762b97f5` from the data contract. Replace it with the
real catalog; the app adapts to the file it finds.
