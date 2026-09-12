/* Every fiberglass price, against the vendor's own sheet.

   tests/fixtures/fiberglass-price-sheet.json is an independent transcription
   of the Dealer Fiberglass Price List (4 pages, effective 7-1-2026), typed
   from the vendor PDF rather than generated from catalog.json, so a later
   edit that moves a fiberglass price fails here instead of on a purchase
   order. Pure data — no browser — so it runs in well under a second. */
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';

const ROOT=path.resolve(url.fileURLToPath(import.meta.url),'../..');
const cat=JSON.parse(fs.readFileSync(ROOT+'/data/catalog.json','utf8'));
const sheet=JSON.parse(fs.readFileSync(ROOT+'/tests/fixtures/fiberglass-price-sheet.json','utf8'));
const T=[]; const ok=(n,c,x='')=>T.push((c?'PASS':'FAIL')+'  '+n+(x?'  :: '+x:''));

const cents=v=>v===null?null:Math.round(Number(v)*100);
const K=['slab','singlePH','doublePH'];
const norm=s=>String(s||'').replace(/\s+/g,' ').replace(/\*$/,'').replace(/w\/ /g,'w/').trim().toLowerCase();
const bySku={}, byDesc={};
for(const r of sheet.rows){ if(r.sku)(bySku[r.sku]=bySku[r.sku]||[]).push(r); (byDesc[norm(r.desc)]=byDesc[norm(r.desc)]||[]).push(r); }
const noSku=sheet.rows.filter(r=>r.sku===null);

ok('the price sheet transcription is the vendor\'s, not ours',
   sheet.rows.length===222 && sheet.netMultiplierPrinted===0.48 && /7-1-2026/.test(sheet.source),
   sheet.rows.length+' rows');
ok('the sheet prints ten rows as CONFIGURED ITEM with no part number', noSku.length===10, String(noSku.length));

/* A row matches when all six cells agree. Rows the sheet prints without a
   part number (CONFIGURED ITEM) match by description instead, which is how
   the catalogue's CFG- numbers and the two speakeasy doors it named itself
   (FG2PAVG3068SE / 3080SE) find their sheet row. */
let exact=0; const unmatched=[]; const hitRows=new Set();
for(const p of cat.fiberglassProducts){
  const cand=(bySku[p.sku]||[]).concat(byDesc[norm(p.description)]||[]).filter(r=>r.sku===null||r.sku===p.sku);
  const hit=cand.find(r=>K.every((k,i)=>p.prices.unfinished[k]===cents(r.u[i]))
                      && K.every((k,i)=>p.prices.prefinished[k]===cents(r.f[i])));
  if(hit){ exact++; hitRows.add(hit); } else unmatched.push(p);
}
ok('every fiberglass row matches the sheet on all six price cells',
   unmatched.length===0,
   exact+' of '+cat.fiberglassProducts.length+' exact'+(unmatched.length?'; first miss '+unmatched[0].sku:''));
ok('every sheet row is accounted for by a catalogue row',
   sheet.rows.every(r=>hitRows.has(r)),
   sheet.rows.filter(r=>!hitRows.has(r)).map(r=>r.sku||r.desc).slice(0,3).join(', ')||'all 222');

/* The sidelites are printed with per-each prehung adders; the catalogue holds
   those as the singlePH/doublePH cells, so a sidelite's two prehung cells are
   equal by construction on the sheet and must be equal here too. */
const eaRows=sheet.rows.filter(r=>r.ea);
const sidelites=cat.fiberglassProducts.filter(p=>eaRows.some(r=>r.sku===p.sku));
ok('sidelite prehung cells carry the sheet\'s per-each adder',
   eaRows.length===18 && sidelites.length===18 &&
   sidelites.every(p=>p.prices.unfinished.singlePH===p.prices.unfinished.doublePH &&
                      p.prices.prefinished.singlePH===p.prices.prefinished.doublePH),
   eaRows.length+' sheet rows, '+sidelites.length+' catalogue rows');

/* Two rows the sheet prints without a description — the vendor's omission,
   not ours; the catalogue names them. */
const blank=sheet.rows.filter(r=>r.sku&&r.desc==='');
ok('the two description-less sheet rows are named in the catalogue',
   blank.length===2 && blank.every(r=>(cat.fiberglassProducts.find(p=>p.sku===r.sku)||{}).description),
   blank.map(r=>r.sku).join(', '));

/* The sheet's own quirk, recorded so nobody "fixes" it: the 3080 Oak 6 Panel
   is priced identically to the 3080 2 Panel Square on every prefinished cell. */
const oak=cat.fiberglassProducts.find(p=>p.sku==='FGKTX6P3080'), sq=cat.fiberglassProducts.find(p=>p.sku==='FG2PSQS3080');
ok('the Oak 6 Panel 3080 shares the 2 Panel Square\'s prefinished cells, as the sheet prints them',
   oak && sq && K.every(k=>oak.prices.prefinished[k]===sq.prices.prefinished[k]) &&
   bySku['FGKTX6P3080'][0].f.join()===bySku['FG2PSQS3080'][0].f.join());

console.log(T.join('\n'));
const f=T.filter(t=>t.startsWith('FAIL')).length;
console.log('\n'+(T.length-f)+' passed, '+f+' failed');
process.exit(f?1:0);
