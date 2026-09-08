"""Audit data/catalog.json against the Hoelscher dealer price sheets.

The price sheets are the source of truth. catalog.json was built from a
spreadsheet that was itself derived from these PDFs, so this closes the one
link in the chain that no test covered.

Usage:  python3 tools/audit-price-sheets.py <fiberglass.pdf> <wood.pdf>

COVERAGE, honestly stated. This reads rows of the shape
    PART-NUMBER  <text>  <six prices>
which is every ordinary door and sidelite row. It does NOT yet handle:

  * adder-style rows, where a price is printed "+1444(ea)" or "+35 per lite"
    rather than as an absolute figure (fiberglass sidelites, SDL bars);
  * rows whose part number is printed as the literal words CONFIGURED ITEM;
  * the wood sheet's leading Page# column, which is printed once per group and
    carried down. Attributing it by line order alone mis-assigns it wherever a
    group spans a page break, so page numbers are NOT verified here. Doing that
    properly needs column-geometry extraction, not line splitting.

Rows it cannot read are counted and printed rather than skipped silently.
"""
import sys, re, json, collections
from pypdf import PdfReader

if len(sys.argv) >= 3:
    SHEETS=[('fiberglass', sys.argv[1]), ('wood', sys.argv[2])]
else:
    sys.exit("usage: python3 tools/audit-price-sheets.py <fiberglass.pdf> <wood.pdf>")
U=''

NUM=r'(?:[\d,]+|N/?A|-{1,3})'
ROW=re.compile(r'^([A-Z0-9][A-Z0-9\-\.]{3,})\s+(.+?)\s+('+NUM+r'(?:\s+'+NUM+r'){5})\s*$')
COLS=[('unfinished','slab'),('unfinished','singlePH'),('unfinished','doublePH'),
      ('prefinished','slab'),('prefinished','singlePH'),('prefinished','doublePH')]

def cents(tok):
    t=tok.strip().replace(',','')
    if t.upper() in ('N/A','NA','-','--','---',''): return None
    if not re.fullmatch(r'\d+', t): return 'BAD:'+tok
    return int(t)*100

def parse(path):
    rows=[]; skipped=[]
    r=PdfReader(path)
    for pi,pg in enumerate(r.pages):
        for raw in (pg.extract_text() or '').split('\n'):
            line=raw.strip()
            if not line or line.lower().startswith('part number'): continue
            m=ROW.match(line)
            if not m:
                if re.match(r'^[A-Z0-9][A-Z0-9\-\.]{4,}\s', line): skipped.append((pi+1,line))
                continue
            sku, desc, nums = m.group(1), m.group(2).strip(), m.group(3).split()
            rows.append({'sku':sku,'desc':desc,'sheetPage':pi+1,
                         'prices':{f+'.'+c: cents(nums[i]) for i,(f,c) in enumerate(COLS)}})
    return rows, skipped

cat=json.load(open('data/catalog.json'))
by=collections.defaultdict(list)
for p in cat['products']: by[p['sku']].append(p)

report={'checked':0,'match':0,'mismatch':[],'missing_in_catalog':[],'extra_in_catalog':[],
        'unparsed':[],'sheet_rows':0,'desc_diff':[]}
seen_sku=collections.Counter()

for line,f in SHEETS:
    rows,skipped=parse(U+f)
    report['sheet_rows']+=len(rows)
    report['unparsed'] += [(line,)+s for s in skipped]
    for row in rows:
        seen_sku[row['sku']]+=1
        cands=by.get(row['sku'])
        if not cands:
            report['missing_in_catalog'].append((line,row['sku'],row['desc'][:60])); continue
        # a SKU can cover several products (glass placeholder); match on price vector
        target={k:v for k,v in row['prices'].items()}
        def vec(p): return {f+'.'+c: p['prices'][f][c] for f,c in COLS}
        exact=[p for p in cands if vec(p)==target]
        chosen = exact[0] if exact else cands[0]
        for k,v in target.items():
            report['checked']+=1
            f,c=k.split('.')
            got=chosen['prices'][f][c]
            if isinstance(v,str):
                report['mismatch'].append((line,row['sku'],k,'UNPARSED '+v,got)); continue
            if got==v: report['match']+=1
            else: report['mismatch'].append((line,row['sku'],k,v,got))
        if row['desc'] and chosen['description'] and row['desc'].lower()!=chosen['description'].lower():
            report['desc_diff'].append((row['sku'],row['desc'],chosen['description']))

sheet_skus=set(seen_sku)
for sku,ps in by.items():
    if sku not in sheet_skus: report['extra_in_catalog'].append((sku,ps[0]['description'][:60]))

print("PRICE SHEET ROWS PARSED      :", report['sheet_rows'])
print("PRICE CELLS COMPARED         :", report['checked'])
print("  exact match                :", report['match'])
print("  MISMATCH                   :", len(report['mismatch']))
print("SKUs on sheet, absent in app  :", len(report['missing_in_catalog']))
print("SKUs in app, absent from sheet:", len(report['extra_in_catalog']))
print("rows the parser could not read:", len(report['unparsed']))
print("description differences       :", len(report['desc_diff']))
print()
for m in report['mismatch'][:20]: print("  MISMATCH", m)
print()
for m in report['missing_in_catalog'][:15]: print("  ON SHEET ONLY", m)
print()
for m in report['extra_in_catalog'][:15]: print("  IN APP ONLY  ", m)
print()
for u in report['unparsed'][:15]: print("  UNPARSED", u[0], "p%d"%u[1], u[2][:100])
json.dump({k:(v if not isinstance(v,list) else v[:400]) for k,v in report.items()},
          open('/tmp/audit.json','w'), indent=1, default=str)
