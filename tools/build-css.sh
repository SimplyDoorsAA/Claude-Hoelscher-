#!/bin/sh
# Compile the quoter's stylesheet. Run from anywhere; needs node + network for
# the pinned Tailwind CLI the first time (npx caches it afterwards).
#   sh tools/build-css.sh
set -e
cd "$(dirname "$0")/.."
npx --yes tailwindcss@3.4.17 -c tools/tailwind.config.cjs -i quoter/assets/tw.src.css -o quoter/assets/tw.css --minify
echo "quoter/assets/tw.css: $(wc -c < quoter/assets/tw.css) bytes"
