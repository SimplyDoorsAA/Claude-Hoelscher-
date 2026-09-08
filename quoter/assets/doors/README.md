# Door photography

App B looks for one image per product at:

```
quoter/assets/doors/{SKU}.webp
```

The SKU is taken verbatim from `data/catalog.json` — for example
`quoter/assets/doors/FG1LVCLE3080.webp`. SKUs containing `-` or `--`
(`M34--3068`, `KAAT12A--3080`) are used exactly as written.

Any product with no image renders a drawn architectural silhouette instead,
derived from its description — lite count, arch, sidelite proportion, barn
slab. That fallback is deliberate, not a placeholder to be rushed: a catalog of
silhouettes still reads as a catalog. Add photography incrementally; each file
dropped in here replaces its silhouette on the next page load.

Suggested export: WebP, 3:5 portrait crop, ~800x1333, quality ~80.
