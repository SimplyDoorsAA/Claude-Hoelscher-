#!/usr/bin/env python3
"""Pull the door photography out of the Hoelscher catalog PDFs and file it by model.

The catalogs place one tall photo per door beside the part numbers for that
door, so a photo can be tied to a model by reading the part numbers that sit
within its vertical span and looking them up in data/catalog.json. Nothing is
guessed: a photo whose part numbers do not resolve to exactly one model is
reported and skipped rather than filed under a guess.

    python3 tools/extract-door-images.py CATALOG.pdf [CATALOG.pdf ...]
    python3 tools/extract-door-images.py --dry-run CATALOG.pdf
    python3 tools/extract-door-images.py --glass CATALOG.pdf   # the glass swatches

Writes quoter/assets/doors/<slug>.webp and manifest.json. Needs pypdf + Pillow.
"""
import sys, os, re, io, json, unicodedata
from pypdf import PdfReader
from pypdf.generic import ContentStream
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT  = os.path.join(ROOT, 'quoter', 'assets', 'doors')

# A door photo is tall and big. Swatches are square, banners are wide, and the
# iron-grille style thumbnails are tall but half the height of a door photo.
MIN_H_PT, MIN_W_PT, MIN_ASPECT = 180.0, 40.0, 1.8
MAX_PX_H = 900           # nobody needs more on a card or a phone
WEBP_QUALITY = 82

SIZE_PREFIX = re.compile(r'^\d{4,5}[A-Z]?\s+')
TOKEN = re.compile(r'\b[A-Z0-9][A-Z0-9\-]{4,}\b')

def model_key(p):
    d = str(p.get('description') or '').strip()
    code = (p.get('size') or {}).get('code')
    if code:
        rx = re.compile(r'(^|\s)' + re.escape(str(code)) + r'(?=\s|$)')
        if rx.search(d):
            return re.sub(r'\s+', ' ', rx.sub(r'\1', d, count=1)).strip()
    return SIZE_PREFIX.sub('', d).strip()

def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    s = re.sub(r"[^A-Za-z0-9]+", '-', s).strip('-').lower()
    return re.sub(r'-{2,}', '-', s)[:80]

def mul(a, b):
    return [a[0]*b[0]+a[1]*b[2], a[0]*b[1]+a[1]*b[3],
            a[2]*b[0]+a[3]*b[2], a[2]*b[1]+a[3]*b[3],
            a[4]*b[0]+a[5]*b[2]+b[4], a[4]*b[1]+a[5]*b[3]+b[5]]

def placements(page):
    """Every XObject draw on the page as (name, x, y, width, height) in points."""
    try:
        cs = ContentStream(page.get_contents(), page.pdf)
    except Exception:
        return []
    ctm, stack, out = [1, 0, 0, 1, 0, 0], [], []
    for operands, op in cs.operations:
        if op == b'q':
            stack.append(list(ctm))
        elif op == b'Q':
            ctm = stack.pop() if stack else [1, 0, 0, 1, 0, 0]
        elif op == b'cm':
            try: ctm = mul([float(x) for x in operands], ctm)
            except Exception: pass
        elif op == b'Do':
            out.append((str(operands[0]), ctm[4], ctm[5], abs(ctm[0]), abs(ctm[3])))
    return out

def text_runs(page):
    """Text with positions, dropping anything the transform puts off the page.
    Some catalog pages carry runs at negative x that belong to another layer;
    left in, they attach one door's part numbers to the door above it."""
    try:
        box = page.mediabox
        pw, ph = float(box.width), float(box.height)
    except Exception:
        pw, ph = 612.0, 792.0
    runs = []
    def visit(text, cm, tm, font, size):
        t = (text or '').strip()
        if not t: return
        x, y = tm[4], tm[5]
        if x < -1 or y < -1 or x > pw + 1 or y > ph + 1: return
        runs.append((x, y, t))
    try: page.extract_text(visitor_text=visit)
    except Exception: pass
    return runs

def alpha_size(token, sizes):
    """Split a part number into (letters before the size, size code)."""
    for m in re.finditer(r'\d{4,5}', token):
        if m.group(0) in sizes:
            head = re.sub(r'[^A-Za-z0-9]', '', token[:m.start()]).upper()
            return head, m.group(0)
    return None, None

AMBIGUOUS = object()   # the number is real but says which door only ambiguously

def sku_resolver(products):
    """Match a part number printed in a catalog to a model in our data.

    The wood catalog and the wood price sheet do not spell part numbers the
    same way — the sheet writes M3GPWN--2880--, the catalog M3GPWNSR2880L —
    so an exact lookup finds nothing for the wood line. Fall back to the size
    code plus the longest letter prefix that still matches, which keeps the
    narrow-profile door (M3GPWN) from being confused with the wide one
    (M3GPW).
    """
    by_sku = {p['sku']: p for p in products}
    sizes = {(p.get('size') or {}).get('code') for p in products}
    sizes.discard(None)
    index = {}
    for p in products:
        head, size = alpha_size(p['sku'], sizes)
        if head:
            index.setdefault((size, head), set()).add(model_key(p))

    # 25 part numbers in the sheet are used by more than one door (see
    # docs/audit-2026-09-09.md), so a number alone cannot always say which. The
    # catalog page prints the difference in words — "Decorative Glass" against
    # "Flat Glass" — so a tie is broken on the text beside the photo.
    def pick(keys, context):
        keys = sorted(keys)
        if len(keys) == 1:
            return keys[0]
        ctx = re.sub(r'[^a-z0-9]+', ' ', (context or '').lower())
        common = set()
        for k in keys:
            words = {w for w in re.split(r'[^a-z0-9]+', k.lower()) if len(w) > 3}
            common = words if not common else common & words
        scored = []
        for k in keys:
            words = {w for w in re.split(r'[^a-z0-9]+', k.lower()) if len(w) > 3} - common
            scored.append((sum(1 for w in words if w in ctx), k))
        scored.sort(reverse=True)
        # Decisive or nothing: the winner must be named and every other
        # candidate unnamed. A near-miss here files a photo under the wrong
        # door, which is worse than leaving the silhouette in place.
        if scored[0][0] > 0 and (len(scored) == 1 or scored[1][0] == 0):
            return scored[0][1]
        return AMBIGUOUS

    def resolve(token, context=''):
        p = by_sku.get(token)
        if p:
            return model_key(p)
        head, size = alpha_size(token, sizes)
        if not head:
            return None
        best = None
        for (sz, h), keys in index.items():
            if sz != size or not head.startswith(h):
                continue
            if best is None or len(h) > len(best[0]):
                best = (h, set(keys))
            elif len(h) == len(best[0]):
                best = (h, best[1] | keys)
        if not best:
            return None
        return pick(best[1], context)
    return resolve

# Skins that differ only in colour must not share one photo: a white door
# standing in for the black one is worse than no photo at all. When the models
# a photo could belong to differ by one of these words, the photos on that page
# are ranked by brightness and matched to the words in the same order.
# Only actual colours belong here. Fir and Smooth are textures, and the catalog
# genuinely prints one photo for both, so they take the shared-photo path.
COLOUR_ORDER = {'black': 0, 'ebony': 1, 'espresso': 2, 'white': 3}

def colour_word(key):
    for w in re.split(r'[^A-Za-z]+', key.lower()):
        if w in COLOUR_ORDER:
            return w
    return None

def brightness(im):
    g = im.convert('L').resize((24, 48))
    px = list(g.getdata())
    return sum(px) / len(px)

def load_image(page, name):
    """Decode one image XObject. Most are plain JPEG and come out of the stream
    untouched; the rest go through pypdf, which handles the flate and CCITT
    cases a raw read cannot."""
    try:
        obj = page['/Resources']['/XObject'].get_object()[name].get_object()
        return Image.open(io.BytesIO(obj._data)).convert('RGB')
    except Exception:
        pass
    try:
        want = name.lstrip('/')
        for img in page.images:
            # pypdf names images with an extension ("Im1.png"); the content
            # stream refers to them without one.
            if img.name.rsplit('.', 1)[0] == want:
                return img.image.convert('RGB')
    except Exception:
        pass
    return None

def trim(im, tol=248):
    """Crop the flat near-white margin the catalog leaves around each door."""
    g = im.convert('L')
    w, h = g.size
    px = g.load()
    def row_blank(y): return all(px[x, y] >= tol for x in range(0, w, max(1, w // 60)))
    def col_blank(x): return all(px[x, y] >= tol for y in range(0, h, max(1, h // 60)))
    top = 0
    while top < h - 1 and row_blank(top): top += 1
    bot = h - 1
    while bot > top and row_blank(bot): bot -= 1
    left = 0
    while left < w - 1 and col_blank(left): left += 1
    right = w - 1
    while right > left and col_blank(right): right -= 1
    if right - left < w * 0.3 or bot - top < h * 0.3:
        return im                       # a trim that aggressive is a mistake
    return im.crop((left, top, right + 1, bot + 1))

GLASS_DIR = os.path.join(ROOT, 'quoter', 'assets', 'glass')

def extract_glass(pdfs, dry):
    """The catalogs devote a page per line to the glass, one square swatch with
    its name printed underneath. Those swatches turn the configurator's Glass
    question from a row of words into something a customer can actually judge.

    A swatch is square and sits directly above its caption, so it is matched to
    the nearest caption below it in the same column.
    """
    found = {}
    for pdf in pdfs:
        reader = PdfReader(pdf)
        for pno, page in enumerate(reader.pages, 1):
            text = page.extract_text() or ''
            if not re.search(r'Available Glass Options\s*:', text):
                continue
            runs = text_runs(page)
            squares = [(n, x, y, w, h) for n, x, y, w, h in placements(page)
                       if 50 <= w <= 140 and 0.85 <= h / max(w, 1) <= 1.15]
            for name, x, y, w, h in squares:
                below = [(y - ry, rx, t) for rx, ry, t in runs
                         if 0 < y - ry < 26 and abs(rx - x) < w]
                if not below:
                    continue
                label = min(below)[2].strip().rstrip(':').strip()
                if not label or label.lower().startswith('privacy'):
                    continue
                privacy = None
                for rx, ry, t in runs:
                    m = re.match(r'Privacy:\s*(\d+)', t.strip())
                    if m and abs(rx - x) < w and 0 < y - ry < 40:
                        privacy = int(m.group(1))
                key = re.sub(r'\s+', ' ', label)
                if key in found:
                    continue
                found[key] = (page, name, privacy)

    files, meta = {}, {}
    if not dry:
        os.makedirs(GLASS_DIR, exist_ok=True)
    total = 0
    for label, (page, name, privacy) in sorted(found.items()):
        fn = slug(label) + '.webp'
        files[label] = fn
        if privacy is not None:
            meta[label] = privacy
        if dry:
            continue
        im = load_image(page, name)
        if im is None:
            print('  ERROR decoding glass', label); files.pop(label); continue
        if im.width > 320:
            im = im.resize((320, round(im.height * 320 / im.width)), Image.LANCZOS)
        path = os.path.join(GLASS_DIR, fn)
        im.save(path, 'WEBP', quality=WEBP_QUALITY, method=6)
        total += os.path.getsize(path)

    if not dry:
        with open(os.path.join(GLASS_DIR, 'manifest.json'), 'w') as f:
            json.dump({'note': 'Glass swatches from the Hoelscher catalogs, by the name '
                               'the catalog prints. privacy is the vendor rating, 0-9.',
                       'glass': files, 'privacy': meta}, f, indent=2, sort_keys=True)
            f.write('\n')
    print(f'{len(files)} glass swatch(es), {total // 1024} KB')
    for label in sorted(files):
        print(f'  {label:<22} privacy {meta.get(label, "-")}')
    return files

def main(argv):
    dry = '--dry-run' in argv
    pdfs = [a for a in argv if not a.startswith('--')]
    if not pdfs:
        sys.exit(__doc__)
    if '--glass' in argv:
        extract_glass(pdfs, dry)
        return

    catalog = json.load(open(os.path.join(ROOT, 'data', 'catalog.json')))
    products = catalog['fiberglassProducts'] + catalog['woodProducts']
    by_sku = {p['sku']: p for p in products}
    key_of_sku = {p['sku']: model_key(p) for p in products}
    all_models = sorted({model_key(p) for p in products})
    resolve = sku_resolver(products)

    found, skipped, files = {}, [], {}
    for pdf in pdfs:
        reader = PdfReader(pdf)
        label = os.path.basename(pdf)
        for pno, page in enumerate(reader.pages, 1):
            try: xo = page['/Resources']['/XObject'].get_object()
            except Exception: continue
            dims = {}
            for name, ref in xo.items():
                o = ref.get_object()
                if o.get('/Subtype') == '/Image':
                    dims[name] = o
            photos = [(n, x, y, w, h) for n, x, y, w, h in placements(page)
                      if n in dims and h >= MIN_H_PT and w >= MIN_W_PT and h / max(w, 1) >= MIN_ASPECT]
            if not photos:
                continue
            runs = text_runs(page)
            placed = [(x, y, t) for x, y, t in runs if x or y]
            # A part number belongs to the photo it sits beside: the one whose
            # vertical band it falls in and whose column is nearest. The wood
            # catalog runs two doors side by side, each with its own part-number
            # column, so the band alone would attach both to whichever is first.
            bands = {name: [] for name, *_ in photos}
            # The words printed beside a photo settle a part number that two
            # doors share, so collect each photo's text before resolving.
            # A door's own caption sits directly above its photo, so reach a
            # little past the top of the band to catch it — but not as far as
            # the page title, which would say the same thing about every photo
            # on the page and so separate none of them.
            context = {name: ' '.join(
                           t for tx, ty, t in placed
                           if y - 10 <= ty <= y + h + 45 and abs(tx - (x + w / 2)) < 320)
                       for name, x, y, w, h in photos}
            poisoned = set()
            for tx, ty, t in placed:
                near = [(abs(tx - (px + pw / 2)), pn)
                        for pn, px, py, pw, ph in photos if py <= ty <= py + ph]
                if not near:
                    continue
                owner = min(near)[1]
                for tok in TOKEN.findall(t):
                    k = resolve(tok, context.get(owner, ''))
                    # A number the sheet gives to more than one door, that the
                    # page does not disambiguate, makes the whole band unsafe:
                    # whatever else resolves there could belong to either door.
                    if k is AMBIGUOUS:
                        poisoned.add(owner)
                    elif k:
                        bands[owner].append(k)

            for name, x, y, w, h in photos:
                if name in poisoned:
                    skipped.append((label, pno, name,
                                    'a part number beside it is shared by several doors '
                                    'and the page does not say which'))
                    continue
                band = bands.get(name) or []
                if not band:
                    skipped.append((label, pno, name, 'no part number beside it'))
                    continue
                keys = sorted(set(band))
                # The catalog prints one photo for a door offered in several
                # skins ("Craftsman 3 Panel Shaker" in Smooth and in Fir), so a
                # photo may legitimately serve more than one model. Accept that
                # only when the names differ after the last " - ", which is the
                # skin; anything else means the band caught the wrong door.
                if len(keys) > 1:
                    stems = {k.rsplit(' - ', 1)[0] for k in keys}
                    if len(stems) != 1:
                        skipped.append((label, pno, name,
                                        'part numbers span unrelated models: ' + '; '.join(keys)))
                        continue
                    words = [colour_word(k) for k in keys]
                    if any(w is not None for w in words) and len(set(words)) == len(words):
                        # Rank every photo overlapping this band by brightness
                        # and pair it with the colour word of the same rank.
                        siblings = [pn for pn, px, py, pw, ph in photos
                                    if not (py + ph < y or py > y + h)]
                        lit = []
                        for pn in siblings:
                            im = load_image(page, pn)
                            if im is not None: lit.append((brightness(im), pn))
                        order = sorted(range(len(keys)), key=lambda i: COLOUR_ORDER.get(words[i], 2))
                        lit.sort()
                        if len(lit) >= len(keys):
                            pairs = {keys[order[i]]: lit[i][1] for i in range(len(keys))}
                            for key, pn in pairs.items():
                                if key not in found:
                                    found[key] = (label, pno, pn, page, False)
                            continue
                        skipped.append((label, pno, name,
                                        'colour skins share one photo: ' + '; '.join(keys)))
                        continue
                for key in keys:
                    if key in found:
                        continue                  # first photo of a model wins
                    found[key] = (label, pno, name, page, len(keys) > 1)

    print(f'{len(found)} model(s) matched to a photo, {len(skipped)} photo(s) skipped')
    for s in skipped:
        print(f'  skipped  {s[0][:34]} p{s[1]} {s[2]}: {s[3]}')

    if not dry:
        os.makedirs(OUT, exist_ok=True)
    total = 0
    shared = sorted(k for k, v in found.items() if v[4])
    for key, (label, pno, name, page, _sh) in sorted(found.items()):
        fn = slug(key) + '.webp'
        files[key] = fn
        if dry:
            continue
        im = load_image(page, name)
        if im is None:
            print('  ERROR decoding', key, 'from', label, 'p' + str(pno), name)
            files.pop(key); continue
        im = trim(im)
        if im.height > MAX_PX_H:
            im = im.resize((max(1, round(im.width * MAX_PX_H / im.height)), MAX_PX_H), Image.LANCZOS)
        path = os.path.join(OUT, fn)
        im.save(path, 'WEBP', quality=WEBP_QUALITY, method=6)
        total += os.path.getsize(path)

    manifest = {
        'note': 'Door photography extracted from the Hoelscher catalogs by '
                'tools/extract-door-images.py. Keyed by model, the way a card is. '
                'source says which catalog page each photo came off, so a match '
                'can be checked against the original.',
        'sharedAcrossSkins': shared,
        'models': files,
        'source': {k: f'{v[0]} p{v[1]} {v[2]}' for k, v in sorted(found.items()) if k in files},
    }
    if not dry:
        with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
            json.dump(manifest, f, indent=2, sort_keys=True)
            f.write('\n')

    missing = [m for m in all_models if m not in files]
    print(f'\n{len(files)} image(s), {total // 1024} KB total')
    print(f'{len(missing)} of {len(all_models)} models still have no photo')
    for m in missing[:15]:
        print('  no photo:', m)
    if len(missing) > 15:
        print(f'  ... and {len(missing) - 15} more')

if __name__ == '__main__':
    main(sys.argv[1:])
