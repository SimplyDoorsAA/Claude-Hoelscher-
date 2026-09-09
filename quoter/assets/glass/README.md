# Glass swatches

Pulled from the catalogs' "Available Glass Options" pages by
`tools/extract-door-images.py --glass`, where each square swatch sits directly
above its printed name. `manifest.json` holds the name → file map and
Hoelscher's own privacy rating, 0 (clear) to 9 (opaque).

The Quoter shows the swatch and rating beside each option in the Glass
question. The two sheets spell some names differently — `Clear Low E` on the
price sheet against `Clear Low-E` here, `Sandblast` against
`Sandblast w/1" Clear Border` — so matching is on letters and digits alone,
exactly first and then by prefix.

Seven of the nineteen glass names in the catalogue have a swatch. The rest are
the decorative glasses (Pecos, San Jacinto, Columbia, Medina, Dartmouth,
Brazos, Blanco, Mason, Bowie, Kerrville) and Translucent, which the catalogs
show only as an unlabelled "Other Available Decorative Glass Options" gallery.
There is nothing on the page to name those images from, so they get no swatch
rather than a guessed one. A glass with no swatch simply shows its name.
