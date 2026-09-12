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
    python3 tools/extract-door-images.py --designs CATALOG.pdf # grilles, decorative glass, masks

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
BELOW_REACH = 60.0       # how far under a photo its own part numbers may sit
PANEL_PAD  = 14.0        # a centred caption may start this far left of its photo
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
    # The catalog tells a raised-moulding door from a no-raised-moulding one by
    # the letters it prints after the size — M4L1P3068 against M4L1P3068NRM —
    # and our own model names carry the same designation. The size-plus-prefix
    # index throws those letters away, so they are put back here as a tie-break.
    def moulding_of(text):
        u = re.sub(r'[^A-Za-z]', ' ', str(text)).upper()
        if re.search(r'\bNRM\b', u):
            return 'NRM'
        if re.search(r'\bRM\b', u):
            return 'RM'
        return None

    def by_moulding(keys, token, size):
        m = re.search(re.escape(size), token)
        tail = token[m.end():] if m else ''
        # The catalog spells out NRM and leaves the plain door unmarked.
        want = 'NRM' if moulding_of(tail) == 'NRM' else 'RM'
        marks = {k: moulding_of(k) for k in keys}
        if len({v for v in marks.values() if v}) < 2:
            return None                      # they do not differ on this
        hit = [k for k, v in marks.items() if v == want]
        return hit[0] if len(hit) == 1 else None

    def pick(keys, context, token='', size=''):
        keys = sorted(keys)
        if len(keys) == 1:
            return keys[0]
        settled = by_moulding(keys, token, size) if token and size else None
        if settled:
            return settled
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
        return pick(best[1], context, token, size)
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

DESIGN_DIR = os.path.join(ROOT, 'quoter', 'assets', 'designs')
# Every grille design Hoelscher makes, by the three letters its part number
# uses. Naming them explicitly stops the pattern reading any three letters in a
# part number as a design.
GRILLE_CODES = ('AVI', 'BAL', 'BAR', 'BER', 'CRD', 'HMM', 'SLT', 'STG', 'SIE', 'SHN', 'WHI')
# KA34AVIC3068 for knotty alder; M23ACRDC3068, M34AVIC3068 and MFULLAVIC3068 for
# mahogany: line letters, then the lite style, then the design, then the size.
GRILLE_LINE = {'KA': 'knotty_alder', 'M': 'mahogany'}
GRILLE_STYLE = {'34': '3/4 Lite', '23A': '2/3 Lite', '23': '2/3 Lite', 'FULL': 'Full Lite'}
# The style is spelled out rather than left as "any letters", so a sidelite's
# number (KA34SLAVIC1268) cannot be read as a door's with a style we don't know.
GRILLE_PN = re.compile(r'\b(' + '|'.join(GRILLE_LINE) + r')('
                       + '|'.join(sorted(GRILLE_STYLE, key=len, reverse=True)) + r')('
                       + '|'.join(GRILLE_CODES) + r')C(\d{4})\b')

def _cell(x, y, xs, ys):
    """Which half of the page a thing sits in. The catalog lays these pages out
    as a 2x2 of panels, so a column and a row band is all it takes."""
    return ('R' if x >= xs else 'L', 'T' if y >= ys else 'B')

def extract_grilles(reader, pdf, found):
    """The iron-grille pages carry four doors in a 2x2, each with its own
    part numbers. The price sheet prices them as one generic '3/4 Lite Iron
    Grille' row, so the design is a choice rather than a product and the photo
    has to be filed by the design's name, not by a part number.

    The design code in the part number (KA34*AVI*C3068) is always positioned,
    so the code fixes which cell of the 2x2 a design occupies. The printed
    name is read from the caption above that cell; where the PDF has lost the
    caption's transform, the leftover names are assigned to the leftover cells
    in reading order, and only when the two counts agree.
    """
    for pno, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ''
        if 'Iron Grille' not in text:
            continue
        runs = text_runs(page)
        codes = {}
        for x, y, t in runs:
            for m in GRILLE_PN.finditer(t):
                line, style, code, size = m.groups()
                d = codes.setdefault(code, {'xs': [], 'ys': [], 'sizes': set(),
                                            'line': GRILLE_LINE.get(line),
                                            'style': GRILLE_STYLE.get(style)})
                d['xs'].append(x); d['ys'].append(y); d['sizes'].add(size)
        if not codes:
            continue
        photos = [(n, x, y, w, h) for n, x, y, w, h in placements(page)
                  if h >= 200 and w >= 80 and 1.8 <= h / max(w, 1) <= 3.4]
        if not photos:
            continue
        # The knotty alder grille pages are a clean 2x2 whose captions sit above
        # each photo, and every assignment off them has been checked by eye. The
        # mahogany grille pages lay their captions out differently and come out
        # paired to the wrong design, so they are left alone rather than filed
        # on a guess. Lifting this needs those pages read properly first.
        if {d['line'] for d in codes.values()} != {'knotty_alder'}:
            print(f'  skipped the grille page p{pno}: only the knotty alder '
                  f'layout is understood')
            continue
        xs = (min(p[1] for p in photos) + max(p[1] for p in photos)) / 2 + 1
        ys = (min(p[2] for p in photos) + max(p[2] for p in photos)) / 2 + 1
        by_cell = {}
        for n, x, y, w, h in photos:
            by_cell.setdefault(_cell(x, y, xs, ys), (n, x, y, w, h))

        placed, unnamed = {}, []
        for code, d in codes.items():
            cx = sum(d['xs']) / len(d['xs'])
            cy = sum(d['ys']) / len(d['ys'])
            key = _cell(cx, cy, xs + 150, ys)   # text sits right of its photo
            shot = by_cell.get(key)
            if not shot:
                continue
            n, x, y, w, h = shot
            # The design's name is printed just above its photo.
            above = [(ry - (y + h), t) for rx, ry, t in runs
                     if 0 < ry - (y + h) < 30 and abs(rx - x) < 60]
            label = min(above)[1].strip() if above else None
            # 'Stain Shown:' sits in the same column as the part numbers and
            # names the finish in the photo, which is worth showing with it.
            stain = None
            for rx, ry, t in runs:
                if t.strip().startswith('Stain Shown') and abs(rx - cx) < 40 \
                        and abs(ry - cy) < 120:
                    below = [r for r in runs if abs(r[0] - rx) < 30 and 0 < ry - r[1] < 20]
                    if below:
                        stain = min(below, key=lambda r: ry - r[1])[2].strip()
            if label:
                placed[label] = (page, n, code, sorted(d['sizes']), 'caption', pno,
                                 stain, d['line'], d['style'])
            else:
                unnamed.append((key, page, n, code, sorted(d['sizes']), pno,
                                stain, d['line'], d['style']))

        # Names whose transform the PDF dropped come through at the origin.
        lost = [t.strip() for x, y, t in runs if x == 0 and y == 0
                and re.fullmatch(r"[A-Z][a-z]+", t.strip()) and t.strip() not in placed]
        if unnamed and len(lost) == len(unnamed):
            order = {('L', 'T'): 0, ('R', 'T'): 1, ('L', 'B'): 2, ('R', 'B'): 3}
            unnamed.sort(key=lambda u: order.get(u[0], 9))
            for name, (key, page, n, code, sizes, pn, stain, ln, st) in zip(lost, unnamed):
                placed[name] = (page, n, code, sizes, 'remainder', pn, stain, ln, st)
        elif unnamed:
            for key, page, n, code, sizes, pn, stain, ln, st in unnamed:
                print(f'  skipped grille {code} on p{pn}: the page does not name it')

        for name, (page, n, code, sizes, basis, pn, stain, ln, st) in placed.items():
            # One design can be offered on more than one lite style and line, so
            # a photo is filed under the three together, not the name alone.
            found['grilles'].setdefault((ln, st, name), {
                'page': page, 'xobj': n, 'code': code, 'sizes': sizes,
                'basis': basis, 'stainShown': stain, 'line': ln, 'style': st,
                'source': f'{os.path.basename(pdf)} p{pn} {n}'})

def extract_decorative(reader, pdf, found, vocab):
    """The decorative-glass panels print the glass the photo shows, then a row
    of smaller doors under 'Other Available Decorative Glass Options'. Each
    thumbnail sits above its own name in the part-number table, so it is filed
    by the column it lines up with; the option that never appears as a
    thumbnail is the one the big photo shows."""
    for pno, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ''
        if 'Other Available Decorative Glass Options' not in text:
            continue
        runs = text_runs(page)
        # Which glasses this page names. The vocabulary is the set of glazings
        # our own catalog records, so a heading is only read as a glass name
        # when it is one we already price.
        names = {}
        for x, y, t in runs:
            t = t.strip().rstrip(':').strip()
            if t in vocab:
                names.setdefault(t, []).append((x, y))
        thumbs = [(n, x, y, w, h) for n, x, y, w, h in placements(page)
                  if 150 <= h <= 230 and 55 <= w <= 100]
        if not thumbs:
            continue
        # 'Glass Shown:' appears once per panel and most panels say
        # 'Open For Glass'; the one that names a decorative glass is the one
        # that tells us what the big photo is.
        shown = None
        for x, y, t in runs:
            if not t.strip().startswith('Glass Shown'):
                continue
            below = [r for r in runs if abs(r[0] - x) < 30 and 0 < y - r[1] < 20]
            if below and min(below, key=lambda r: y - r[1])[2].strip() in vocab:
                shown = min(below, key=lambda r: y - r[1])[2].strip()
        used = set()
        for n, x, y, w, h in sorted(thumbs, key=lambda t: t[1]):
            # the column whose heading this thumbnail sits over
            cands = [(abs(px - x), nm) for nm, pos in names.items()
                     for px, py in pos if abs(px - x) < 12 and py < y]
            label = min(cands)[1] if cands else None
            if label is None:
                continue
            used.add(label)
            found['decorative'].setdefault(label, {
                'page': page, 'xobj': n, 'basis': 'column',
                'source': f'{os.path.basename(pdf)} p{pno} {n}'})
        # Thumbnails whose transform is gone: assign leftover names in order.
        lost = [t.strip() for x, y, t in runs if x == 0 and y == 0
                and t.strip() in vocab]
        spare = [t for t in sorted(thumbs, key=lambda t: t[1])
                 if not any(abs(px - t[1]) < 12 for nm in used for px, py in names[nm])]
        if lost and len(lost) == len(spare):
            for label, (n, x, y, w, h) in zip(lost, spare):
                used.add(label)
                found['decorative'].setdefault(label, {
                    'page': page, 'xobj': n, 'basis': 'remainder',
                    'source': f'{os.path.basename(pdf)} p{pno} {n}'})
        # The big photo shows the option the thumbnails leave out.
        big = [(n, x, y, w, h) for n, x, y, w, h in placements(page)
               if h >= 240 and w >= 80 and x < 200]
        if big:
            rest = [nm for nm in names if nm not in used and len(names[nm]) >= 1]
            pick = shown if shown in names else (rest[0] if len(rest) == 1 else None)
            if pick and pick not in used:
                n, x, y, w, h = max(big, key=lambda t: t[2])
                found['decorative'].setdefault(pick, {
                    'page': page, 'xobj': n,
                    'basis': 'caption' if pick == shown else 'remainder',
                    'source': f'{os.path.basename(pdf)} p{pno} {n}'})

def extract_accessories(reader, pdf, found):
    """The speakeasy page shows the two insert options and the three iron
    masks. Several of its captions have lost their transform, so the rows are
    read by position and named in the printed left-to-right order, which was
    checked against the images themselves."""
    for pno, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ''
        if 'Iron Masks Options' not in text:
            continue
        small = [p for p in placements(page)
                 if 50 <= p[3] <= 70 and 70 <= p[4] <= 90]
        rows = {}
        for p in small:
            rows.setdefault(round(p[2] / 40), []).append(p)
        # The masks are the row of three, the inserts the row of two.
        masks = sorted(next((r for r in rows.values() if len(r) == 3), []), key=lambda p: p[1])
        inserts = sorted(next((r for r in rows.values() if len(r) == 2), []), key=lambda p: p[1])
        # The clavos and straps sit in their own column and the PDF gives them no
        # scale at all, so they are found by position rather than by size, and
        # named in the printed left-to-right order. Their shapes bear it out:
        # a round dome, a square pyramid, and a strap hinge.
        header = next((x for x, y, t in text_runs(page)
                       if t.strip().startswith('Clavos and Straps')), None)
        claimed = {p[0] for p in masks} | {p[0] for p in inserts}
        studs = sorted([p for p in placements(page)
                        if p[0] not in claimed and not p[0].startswith('/Fm')
                        and p[4] < 100          # not one of the door photographs
                        and header is not None and p[1] > header - 60],
                       key=lambda p: p[1])
        for names, row, kind in ((['Standard', 'Balfour', 'Windsor'], masks, 'ironMask'),
                                 (['Wood Insert', 'Glass Insert'], inserts, 'speakeasyInsert'),
                                 (['Round Clavos', 'Square Clavos', 'Straps'], studs, 'clavosStrap')):
            if len(row) != len(names):
                print(f'  skipped {kind} on p{pno}: found {len(row)} images for {len(names)} names')
                continue
            for name, (n, x, y, w, h) in zip(names, row):
                found['accessories'].setdefault(f'{kind}:{name}', {
                    'page': page, 'xobj': n, 'kind': kind, 'label': name,
                    'source': f'{os.path.basename(pdf)} p{pno} {n}'})

def glazing_vocabulary():
    """Every decorative glass our own catalog names, so the page reader has a
    closed set to match against instead of guessing at capitalised words."""
    catalog = json.load(open(os.path.join(ROOT, 'data', 'catalog.json')))
    vocab = set()
    for key in ('woodProducts', 'fiberglassProducts'):
        for p in catalog.get(key, []):
            for part in str(p.get('glazing') or '').split(','):
                part = part.strip()
                if part:
                    vocab.add(part)
    return vocab

def extract_designs(pdfs, dry):
    found = {'grilles': {}, 'decorative': {}, 'accessories': {}}
    vocab = glazing_vocabulary()
    for pdf in pdfs:
        reader = PdfReader(pdf)
        extract_grilles(reader, pdf, found)
        extract_decorative(reader, pdf, found, vocab)
        extract_accessories(reader, pdf, found)

    if not dry:
        os.makedirs(DESIGN_DIR, exist_ok=True)
    out = {'grilles': {}, 'decorativeGlass': {}, 'accessories': {}}
    caps = {'grilles': 560, 'decorative': 420, 'accessories': 300}
    total = 0
    for group, prefix, dest in (('grilles', 'grille', 'grilles'),
                                ('decorative', 'glass', 'decorativeGlass'),
                                ('accessories', 'acc', 'accessories')):
        for label, d in sorted(found[group].items(), key=lambda kv: str(kv[0])):
            if group == 'grilles':
                ln, st, name = label
                label = '-'.join(str(x) for x in (ln, st, name))
                rec = {'file': f'{prefix}-{slug(label)}.webp', 'source': d['source'],
                       'name': name}
            else:
                rec = {'file': f'{prefix}-{slug(label)}.webp', 'source': d['source']}
            fn = rec['file']
            for k in ('code', 'sizes', 'basis', 'stainShown', 'line', 'style', 'kind', 'label'):
                if k in d:
                    rec[k] = d[k]
            if not dry:
                im = load_image(d['page'], d['xobj'])
                if im is None:
                    print('  ERROR decoding', label)
                    continue
                im = trim(im)
                cap = caps[group]
                if im.height > cap:
                    im = im.resize((round(im.width * cap / im.height), cap), Image.LANCZOS)
                path = os.path.join(DESIGN_DIR, fn)
                im.save(path, 'WEBP', quality=WEBP_QUALITY, method=6)
                total += os.path.getsize(path)
            out[dest][rec.pop('label', label) if group == 'accessories' else label] = rec

    # The SDL bar profiles were supplied by the dealer as drawings, not pulled
    # from a PDF, so a re-extraction carries them over rather than dropping them.
    mpath = os.path.join(DESIGN_DIR, 'manifest.json')
    if os.path.exists(mpath):
        with open(mpath) as f:
            kept = json.load(f).get('accessories', {})
        for k, v in kept.items():
            if v.get('kind') == 'sdlBar':
                out.setdefault('accessories', {}).setdefault(k, v)
    if not dry:
        with open(mpath, 'w') as f:
            json.dump({'note': 'Iron grille designs, decorative glass and speakeasy '
                               'hardware from the Hoelscher catalogs, by the name the '
                               'catalog prints. basis says how the name was tied to the '
                               'photo: caption (printed above or beside it), column '
                               '(aligned with its column of part numbers) or remainder '
                               '(the only option the page had left).',
                       **out}, f, indent=2, sort_keys=True)
            f.write('\n')
    for dest in out:
        print(f'{len(out[dest])} {dest}')
        for k, v in sorted(out[dest].items()):
            extra = v.get('code', '') and (f" {v['code']} {'/'.join(v.get('sizes', []))}"
                                           f"  {v.get('stainShown') or ''}")
            print(f"   {k:<42} {v.get('basis','-'):<9}{extra}")
    print(f'{total // 1024} KB total')
    return out

def main(argv):
    dry = '--dry-run' in argv
    pdfs = [a for a in argv if not a.startswith('--')]
    if not pdfs:
        sys.exit(__doc__)
    if '--glass' in argv:
        extract_glass(pdfs, dry)
        return
    if '--designs' in argv:
        extract_designs(pdfs, dry)
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
            # An iron-grille page photographs one door per grille design, not
            # one per model, so its pictures belong to the --designs pass. Left
            # here they file a grille door under whatever model the page's part
            # numbers happen to resolve to. Such a page is known by carrying
            # grille part numbers — not by the words "Iron Grilles", which also
            # head the speakeasy page's list of add-ons.
            if GRILLE_PN.search(page.extract_text() or ''):
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
                # Most pages set the part numbers beside the photo, but the barn
                # page prints them underneath it. Either way the run belongs to
                # the photo whose panel it is printed in, and a panel runs from
                # its own photo across to the next photo in that row.
                #
                # Nearest-centre is not good enough: a door listing its 6'8" and
                # 8'0" sizes in two columns puts the second column closer to the
                # middle of the photo beside it than to its own.
                inside, under = [], []
                for pn, px, py, pw, ph in photos:
                    if py <= ty <= py + ph:
                        inside.append((px, pn))
                    elif 0 < py - ty <= BELOW_REACH:
                        under.append((px, pn))
                # Beside beats beneath: a run in the gap between two rows
                # belongs to a photo it sits level with, not one it sits under.
                row = inside or under
                if not row:
                    continue
                row.sort()
                # A caption centred under its photo can start a little left of it.
                owner = row[0][1]
                for px, pn in row:
                    if tx >= px - PANEL_PAD:
                        owner = pn
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
