#!/bin/sh
# Every suite, in order of how long it takes. Run from anywhere.
#   TAILWIND_CSS=/path/tw.css  faithful screenshots (optional)
#   SHOT_DIR=/path             where screenshots land (default .test-output/)
set -e
here=$(cd "$(dirname "$0")" && pwd)
node "$here/../packages/pricing-engine/engine.test.mjs"
node "$here/../packages/pricing-engine/stress.test.mjs"
node "$here/appa.test.mjs"
node "$here/quoter.test.mjs"
node "$here/print.test.mjs"
node "$here/opening-extras.test.mjs"
node "$here/contemporary.test.mjs"
node "$here/contemporary-extras.test.mjs"
node "$here/tdl.test.mjs"
node "$here/stress-ui.mjs"
