# Door photography

These images were extracted from the Hoelscher catalog PDFs by
`tools/extract-door-images.py` and are filed by **model**, not by part number —
a catalog photographs the door, not each of its part numbers:

```sh
python3 tools/extract-door-images.py --dry-run FIBERGLASS.pdf WOOD.pdf   # look first
python3 tools/extract-door-images.py FIBERGLASS.pdf WOOD.pdf            # then write
```

`manifest.json` maps a model name to its file, and the Quoter reads it at boot.
A model that is not in the manifest renders a drawn architectural silhouette
instead, derived from its description — lite count, arch, sidelite proportion,
barn slab. That fallback is deliberate: a catalog of silhouettes still reads as
a catalog, and because the manifest says which models have a photo, the page
never fires a request that can only 404.

`sharedAcrossSkins` in the manifest lists models that share one photo because
the catalog itself prints one for them — a door offered in both Smooth and Fir,
for instance. Skins that differ by *colour* are never shared.

To add or replace a photograph by hand: drop a WebP in here, portrait, around
800px tall, and add its model name to `manifest.json`. Re-running the extractor
regenerates both.
