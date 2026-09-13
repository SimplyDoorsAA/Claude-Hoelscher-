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
"""
import sys, os, json, importlib.util
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOORS = os.path.join(ROOT, 'quoter', 'assets', 'doors')
STAINS = os.path.join(ROOT, 'quoter', 'assets', 'stains')
LIST = os.path.join(DOORS, 'hand-filed.json')

spec = importlib.util.spec_from_file_location('extract', os.path.join(ROOT, 'tools', 'extract-door-images.py'))
extract = importlib.util.module_from_spec(spec); spec.loader.exec_module(extract)
from pypdf import PdfReader


def find_pdf(name, folders):
    for d in folders:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    raise SystemExit(f'cannot find {name} in {folders}')


def picture(reader, entry):
    page = reader.pages[entry['page'] - 1]
    im = extract.load_image(page, entry['image'])
    if im is None:
        raise SystemExit(f"cannot decode p{entry['page']} {entry['image']}")
    if entry.get('crop'):
        im = im.crop(tuple(entry['crop']))
    return im


def main(argv):
    dry = '--dry-run' in argv
    folders = [a for a in argv if not a.startswith('--')] or [os.environ.get('CATALOG_PDFS') or os.getcwd()]
    entries = json.load(open(LIST))['entries']
    readers = {}
    doors_manifest = json.load(open(os.path.join(DOORS, 'manifest.json')))
    doors_manifest.setdefault('handFiled', {})
    stains = {'note': 'Stain swatches off the catalogs\' stain-options page, one chart per line. '
                      'Filed by tools/hand-file-photos.py from quoter/assets/doors/hand-filed.json; '
                      'source says which page and image each came off.',
              'stains': {}, 'source': {}}
    for e in entries:
        pdf = e['pdf']
        if pdf not in readers:
            readers[pdf] = PdfReader(find_pdf(pdf, folders))
        im = picture(readers[pdf], e)
        src = f"{pdf} p{e['page']} {e['image']}" + (f" crop {e['crop']}" if e.get('crop') else '') + ' (filed by hand: ' + e['why'] + ')'
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
    print(f"{len(entries)} entr{'y' if len(entries)==1 else 'ies'} filed" + (' (dry run)' if dry else ''))


if __name__ == '__main__':
    main(sys.argv[1:])
