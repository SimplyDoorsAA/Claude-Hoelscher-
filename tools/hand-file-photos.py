#!/usr/bin/env python3
"""File catalog photographs the extractor cannot tie to a model on its own.

tools/extract-door-images.py files a photo only when a part number sits beside
it. Some catalog pages print the numbers elsewhere, or print one number for two
doors, and their photographs are matched by eye instead. Each such match is
written down in quoter/assets/doors/hand-filed.json — the PDF, page, image and
model, with an optional crop box and the reason — and this tool turns that list
into the .webp files and manifest entries. Because the list is data, a rerun
reproduces every hand-filed picture exactly, and extract-door-images.py keeps
these entries when it rewrites the manifest.

    python3 tools/hand-file-photos.py [--dry-run] [UPLOAD_DIR]

UPLOAD_DIR is where the catalog PDFs named in the list are found (default: the
directory given by $CATALOG_PDFS, else the current directory). Needs pypdf +
Pillow. Stain swatches (kind "stain") land in quoter/assets/stains/.

An entry may name a picture file the dealer supplied ("upload") instead of a
PDF page; it is found in the same folders. Kinds "grilleSidelite" (the sidelite
that matches a grille design), "decorativeSidelite" (a sidelite glazed with a
decorative glass, by lite style) and "caming" (a leading swatch) land in
quoter/assets/designs/ and are read by the quoter beside the design pictures.
"""
import sys, os, json, importlib.util
from collections import deque
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOORS = os.path.join(ROOT, 'quoter', 'assets', 'doors')
STAINS = os.path.join(ROOT, 'quoter', 'assets', 'stains')
DESIGNS = os.path.join(ROOT, 'quoter', 'assets', 'designs')
CATALOG = os.path.join(ROOT, 'data', 'catalog.json')
LIST = os.path.join(DOORS, 'hand-filed.json')

# The catalog photographs an "open for glass" door with the opening black, and
# shoots a few doors on a black ground. On a card that black is jarring, so an
# entry may ask for it whitened: every connected run of near-black pixels big
# enough to be a pane or a background (not the grain of a dark stain) becomes
# the pale glass tone the other photographs show, with a one-pixel feather.
GLASS = (237, 239, 242)


def whiten(im, lo=24):
    im = im.convert('RGB'); px = im.load(); w, h = im.size
    # A pane or a background is a sizeable share of the picture; a shadow in a
    # dark panel is not, however deep.
    min_area = max(250, (w * h) // 100)
    dark = [[max(px[x, y]) < lo for x in range(w)] for y in range(h)]
    seen = [[False] * w for _ in range(h)]; fill = set()
    for y0 in range(h):
        for x0 in range(w):
            if dark[y0][x0] and not seen[y0][x0]:
                comp = []; q = deque([(x0, y0)]); seen[y0][x0] = True
                while q:
                    x, y = q.popleft(); comp.append((x, y))
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and dark[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True; q.append((nx, ny))
                if len(comp) >= min_area:
                    fill.update(comp)
    ring = set()
    for x, y in fill:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in fill:
                ring.add((nx, ny))
    for x, y in fill:
        px[x, y] = GLASS
    for x, y in ring:
        r, g, b = px[x, y]
        px[x, y] = tuple((GLASS[i] + (r, g, b)[i]) // 2 for i in range(3))
    return im

spec = importlib.util.spec_from_file_location('extract', os.path.join(ROOT, 'tools', 'extract-door-images.py'))
extract = importlib.util.module_from_spec(spec); spec.loader.exec_module(extract)
from pypdf import PdfReader


def find_pdf(name, folders):
    for d in folders:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    raise SystemExit(f'cannot find {name} in {folders}')


def picture(reader, entry, folders=()):
    if entry.get('upload'):
        im = Image.open(find_pdf(entry['upload'], folders)).convert('RGB')
    else:
        page = reader.pages[entry['page'] - 1]
        im = extract.load_image(page, entry['image'])
    if im is None:
        raise SystemExit(f"cannot decode p{entry['page']} {entry['image']}")
    if entry.get('crop'):
        im = im.crop(tuple(entry['crop']))
    if entry.get('whiten'):
        im = whiten(im)
    return im


def main(argv):
    dry = '--dry-run' in argv
    folders = [a for a in argv if not a.startswith('--')] or [os.environ.get('CATALOG_PDFS') or os.getcwd()]
    entries = json.load(open(LIST))['entries']
    readers = {}
    doors_manifest = json.load(open(os.path.join(DOORS, 'manifest.json')))
    doors_manifest.setdefault('handFiled', {})
    designs = json.load(open(os.path.join(DESIGNS, 'manifest.json')))
    designs.setdefault('grilles', {})
    catalog = json.load(open(CATALOG))
    catalog_touched = False
    stains = {'note': 'Stain swatches off the catalogs\' stain-options page, one chart per line. '
                      'Filed by tools/hand-file-photos.py from quoter/assets/doors/hand-filed.json; '
                      'source says which page and image each came off.',
              'stains': {}, 'source': {}}
    designs.setdefault('decorativeGlass', {})
    designs.setdefault('caming', {})
    NEW_KINDS = ('grille', 'grilleSidelite', 'decorativeSidelite', 'caming')

    def save_design(im, fn):
        if dry:
            return
        im = extract.trim(im)
        if im.height > extract.MAX_PX_H:
            im = im.resize((max(1, round(im.width * extract.MAX_PX_H / im.height)), extract.MAX_PX_H), Image.LANCZOS)
        im.save(os.path.join(DESIGNS, fn), 'WEBP', quality=extract.WEBP_QUALITY, method=6)

    for e in entries:
        if e.get('upload'):
            im = picture(None, e, folders)
            src = (f"dealer upload {e['upload']}" + (f" crop {e['crop']}" if e.get('crop') else '')
                   + ' (filed by hand: ' + e['why'] + ')')
        else:
            pdf = e['pdf']
            if pdf not in readers:
                readers[pdf] = PdfReader(find_pdf(pdf, folders))
            im = picture(readers[pdf], e)
            src = (f"{pdf} p{e['page']} {e['image']}" + (f" crop {e['crop']}" if e.get('crop') else '')
                   + (' whitened' if e.get('whiten') else '') + ' (filed by hand: ' + e['why'] + ')')
        if e.get('kind') == 'grilleSidelite':
            # The sidelite made to match a grille design. Filed beside the
            # design's door picture; the catalog entry's sidelitePhoto points
            # at it, and a grille sidelite's gallery shows it instead of the
            # door.
            key = f"{e['line']}-{e['style']}-{e['name']}"
            fn = extract.slug(f"grille {e['line']} {e['style']} {e['name']} sidelite") + '.webp'
            hits = [g for g in catalog.get('ironGrilleDesigns', [])
                    if g.get('line') == e['line'] and g.get('style') == e['style'] and g.get('name') == e['name']]
            if len(hits) != 1:
                raise SystemExit(f'{key}: {len(hits)} catalog designs match')
            rec = designs['grilles'].setdefault(key, {'line': e['line'], 'name': e['name'], 'style': e['style']})
            rec['sideliteFile'] = fn; rec['sideliteSource'] = src; rec['handFiled'] = True
            if hits[0].get('sidelitePhoto') != fn:
                hits[0]['sidelitePhoto'] = fn; catalog_touched = True
            save_design(im, fn)
            print('grille sidelite', key, '->', fn)
            continue
        if e.get('kind') == 'decorativeSidelite':
            # A sidelite glazed with a decorative glass, by lite style ("2/3",
            # "3/4", "Full"). A glass the sheet does not price on that sidelite
            # is still filed, marked so, and the quoter offers nothing from it.
            fn = extract.slug(f"glass {e['name']} {e['style']} sidelite") + '.webp'
            rec = designs['decorativeGlass'].setdefault(e['name'], {'handFiled': True})
            rec.setdefault('sidelites', {})[e['style']] = fn
            rec.setdefault('sideliteSource', {})[e['style']] = src
            if e.get('unpriced'):
                rec.setdefault('unpriced', {})[e['style']] = e['unpriced']
            save_design(im, fn)
            print('decorative sidelite', e['name'], e['style'], '->', fn)
            continue
        if e.get('kind') == 'caming':
            fn = extract.slug('caming ' + e['name']) + '.webp'
            designs['caming'][e['name']] = {'file': fn, 'source': src, 'handFiled': True}
            if not dry:
                extract.trim(im).convert('RGB').resize((240, 240), Image.LANCZOS).save(
                    os.path.join(DESIGNS, fn), 'WEBP', quality=extract.WEBP_QUALITY, method=6)
            print('caming', e['name'], '->', fn)
            continue
        if e.get('kind') == 'grille':
            # An iron grille design: the picture goes beside the design in the
            # configurator and stands in for the grille door's card, so it is
            # filed under the design (line, lite style, name) and the catalog
            # entry's photo field points at it.
            key = f"{e['line']}-{e['style']}-{e['name']}"
            fn = extract.slug(f"grille {e['line']} {e['style']} {e['name']}") + '.webp'
            hits = [g for g in catalog.get('ironGrilleDesigns', [])
                    if g.get('line') == e['line'] and g.get('style') == e['style'] and g.get('name') == e['name']]
            if len(hits) != 1:
                raise SystemExit(f'{key}: {len(hits)} catalog designs match')
            g = hits[0]
            designs['grilles'][key] = {'basis': 'caption', 'code': g.get('code'), 'file': fn, 'line': e['line'],
                                       'name': e['name'], 'sizes': g.get('sizeCodes', []), 'source': src,
                                       'stainShown': g.get('stainShown'), 'style': e['style'], 'handFiled': True}
            if g.get('photo') != fn:
                g['photo'] = fn; catalog_touched = True
            if not dry:
                im = extract.trim(im)
                if im.height > extract.MAX_PX_H:
                    im = im.resize((max(1, round(im.width * extract.MAX_PX_H / im.height)), extract.MAX_PX_H), Image.LANCZOS)
                im.save(os.path.join(DESIGNS, fn), 'WEBP', quality=extract.WEBP_QUALITY, method=6)
            print('grille', key, '->', fn)
            continue
        if e.get('kind') == 'stain':
            fn = extract.slug(e['line'] + ' ' + e['name']) + '.webp'
            stains['stains'].setdefault(e['line'], {})[e['name']] = fn
            stains['source'][e['line'] + ' / ' + e['name']] = src
            out = os.path.join(STAINS, fn)
            if not dry:
                os.makedirs(STAINS, exist_ok=True)
                im.convert('RGB').resize((160, 120), Image.LANCZOS).save(out, 'WEBP', quality=extract.WEBP_QUALITY, method=6)
            print('stain ', e['line'], e['name'], '->', fn)
            continue
        fn = extract.slug(e['model']) + '.webp'
        doors_manifest['models'][e['model']] = fn
        doors_manifest['source'][e['model']] = src
        doors_manifest['handFiled'][e['model']] = True
        out = os.path.join(DOORS, fn)
        if not dry:
            im = extract.trim(im)
            if im.height > extract.MAX_PX_H:
                im = im.resize((max(1, round(im.width * extract.MAX_PX_H / im.height)), extract.MAX_PX_H), Image.LANCZOS)
            im.save(out, 'WEBP', quality=extract.WEBP_QUALITY, method=6)
        print('door  ', e['model'], '->', fn)
    if not dry:
        with open(os.path.join(DOORS, 'manifest.json'), 'w') as f:
            json.dump(doors_manifest, f, indent=2, sort_keys=True); f.write('\n')
        if stains['stains']:
            with open(os.path.join(STAINS, 'manifest.json'), 'w') as f:
                json.dump(stains, f, indent=2, sort_keys=True); f.write('\n')
        if any(e.get('kind') in NEW_KINDS for e in entries):
            with open(os.path.join(DESIGNS, 'manifest.json'), 'w') as f:
                json.dump(designs, f, indent=2, sort_keys=True); f.write('\n')
        if catalog_touched:
            # Only the photo field moves; ids, numbers and prices are untouched.
            with open(CATALOG, 'w') as f:
                json.dump(catalog, f, indent=2, ensure_ascii=False); f.write('\n')
    print(f"{len(entries)} entr{'y' if len(entries)==1 else 'ies'} filed" + (' (dry run)' if dry else ''))


if __name__ == '__main__':
    main(sys.argv[1:])
