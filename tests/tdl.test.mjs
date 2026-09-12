/* The Mahogany True Divided Lite collection, walked through with the dealer on
   2026-09-11/12 against catalog pages 12 and 14-20 and all seven pages of the
   Dealer Wood Pricing sheet (effective 7-1-2026).

   The first half reconciles our catalogue against an independent transcription
   of the vendor's price sheet — tests/fixtures/wood-price-sheet.json, typed
   from the vendor PDF rather than generated from catalog.json — so a later
   edit that moves a wood price fails here instead of on a purchase order. The
   second half drives the app through what the section asks. */
import { playwright } from './playwright.mjs';
const { chromium } = await playwright();
import http from 'node:http'; import fs from 'node:fs';
import path from 'node:path'; import url from 'node:url';

const ROOT=path.resolve(url.fileURLToPath(import.meta.url),'../..');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json',
            '.webp':'image/webp','.png':'image/png','.css':'text/css'};
const srv=http.createServer((q,r)=>{
  const p=decodeURIComponent(q.url.split('?')[0]);
  const f=ROOT+(p.endsWith('/')?p+'index.html':p);
  try{const b=fs.readFileSync(f);
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);}
  catch(e){r.writeHead(404);r.end('nf');}
});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const BASE='http://127.0.0.1:'+srv.address().port;

const cat=JSON.parse(fs.readFileSync(ROOT+'/data/catalog.json','utf8'));
const sheet=JSON.parse(fs.readFileSync(ROOT+'/tests/fixtures/wood-price-sheet.json','utf8'));
const T=[]; const ok=(n,c,x='')=>T.push((c?'PASS':'FAIL')+'  '+n+(x?'  :: '+x:''));
let reported=false;
const report=()=>{ if(reported) return; reported=true;
  console.log(T.join('\n'));
  const f=T.filter(t=>t.startsWith('FAIL')).length;
  console.log('\n'+(T.length-f)+' passed, '+f+' failed'); };
process.on('uncaughtException',e=>{ report(); console.error('\nCRASHED: '+e.message); process.exit(1); });

/* ================= 1. every wood price, against the vendor sheet ========= */
const cents=v=>v===null?null:Math.round(Number(v)*100);
const K=['slab','singlePH','doublePH'];
const bySku={}; sheet.rows.forEach(r=>{(bySku[r.sku]=bySku[r.sku]||[]).push(r);});
let exact=0; const unmatched=[];
for(const p of cat.woodProducts){
  const cand=bySku[p.sku]||[];
  const hit=cand.find(r=>K.every((k,i)=>p.prices.unfinished[k]===cents(r.u[i]))
                      && K.every((k,i)=>p.prices.prefinished[k]===cents(r.f[i])));
  if(hit) exact++; else unmatched.push(p);
}
const decorative=x=>/Decorative Glass/i.test(x.description||'');
/* One row deliberately diverges from the sheet: the sheet gives the Curved
   double the same number as the Arch Top, and the dealer chose the catalog's
   M6LCAT5080 instead. It is allowed here by name, so any OTHER divergence
   still fails. */
const curvedDivergence=x=>x.sku==='M6LC--AT5080';
ok('the price sheet transcription is the vendor\'s, not ours',
   sheet.rows.length===355 && sheet.netMultiplierPrinted===0.48, sheet.rows.length+' rows');
ok('every wood row matches the sheet on all six price cells, bar the known two kinds',
   unmatched.every(x=>decorative(x)||curvedDivergence(x)),
   exact+' of '+cat.woodProducts.length+' exact; '+unmatched.length+' unmatched, '+
   unmatched.filter(decorative).length+' of them Decorative Glass');
ok('and the only non-decorative divergence is the Curved, on purpose',
   unmatched.filter(x=>!decorative(x)).length===1 &&
   unmatched.filter(x=>!decorative(x)).every(curvedDivergence),
   unmatched.filter(x=>!decorative(x)).map(x=>x.sku).join(', ')||'none');
ok('the sheet carries 60 rows for page 12, as many as we hold',
   sheet.rows.filter(r=>r.glass==='P.12').length===60 &&
   cat.woodProducts.filter(p=>p.priceSheetPage==='P.12').length===60);

/* ================= 2. the rules the walkthrough produced ================ */
const p12=(cat.glassRules||[]).find(r=>r.appliesToPriceSheetPage==='P.12');
const TEN=['Clear Low E','Clear Bevel Low E','Baroque','Flemish','Water',
           'Stippolyte','Rain','Reeded','Small Reeded','Satin'];
ok('page 12 carries a glass rule of ten',
   !!p12 && p12.options.length===10 && TEN.every(g=>p12.options.includes(g)),
   p12?p12.options.length+' options':'none');
ok('and it withholds the two the page does not print',
   !!p12 && !p12.options.includes('Digital') && !p12.options.includes('Sandblast'));
ok('every one of the ten has a code in the sheet\'s legend',
   !!p12 && p12.options.every(g=>(cat.glassCodes||[]).some(c=>c.name===g)));

const pairs=(cat.sideliteRules||[]).filter(r=>/^\^[46] Lite 1 Panel/.test(r.appliesToModelPattern||''));
ok('the four TDL door-and-sidelite pairings are recorded', pairs.length===4,
   pairs.map(r=>r.appliesToModelPattern).join(' | '));
ok('and each pairing keeps raised moulding with raised moulding',
   pairs.every(r=>/NRM\$$/.test(r.appliesToModelPattern)===/NRM\$$/.test(r.allowSkuPattern)),
   pairs.map(r=>r.appliesToModelPattern+' -> '+r.allowSkuPattern).join('  '));

const curved=cat.woodProducts.find(p=>/Curved/.test(p.description||''));
ok('the Curved double no longer shares a part number with the Arch Top',
   curved && curved.sku==='M6LC--AT5080' &&
   cat.woodProducts.filter(p=>p.sku===curved.sku).length===1, curved?curved.sku:'missing');
const arch=cat.woodProducts.find(p=>p.sku==='MCMA4L--3080');
ok('the 3080 Arch Lite is named Arch Lite again',
   arch && /Arch Lite/.test(arch.description), arch?arch.description:'missing');
ok('so the two Craftsman 4 Lite doors no longer share a card',
   new Set(cat.woodProducts.filter(p=>/^MCM(A)?4L/.test(p.sku))
     .map(p=>p.description.replace(/^\d+\s+/,''))).size===2);

const ds=cat.dentilShelfRule;
ok('the dentil shelf is recorded as a free specification',
   !!ds && ds.suffix==='S' && ds.priceImpact==='none');
ok('and the row whose number already carries the S is not asked',
   !!ds && new RegExp(ds.excludeSkuPattern).test('MCM--3068S') &&
   !new RegExp(ds.excludeSkuPattern).test('MCM--3080'));
ok('no wood dentil shelf is priced anywhere, so none is charged',
   !(cat.woodComponents||[]).some(c=>/dentil/i.test(c.description||'')));

/* ================= 3. the app, driven =================================== */
const b=await chromium.launch();
const page=await (await b.newContext({viewport:{width:1440,height:1000}})).newPage();
const errs=[];
page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
page.on('console',m=>{if(m.type()==='error'&&!/favicon|Failed to load resource/i.test(m.text()))errs.push(m.text());});
await page.route('https://cdn.tailwindcss.com*',r=>r.abort());
await page.route('https://fonts.googleapis.com/**',r=>r.abort());
await page.addInitScript(()=>{window.__printed=0;window.print=()=>{window.__printed++;};});

const steps=()=>page.$$eval('#detail .steprow',ns=>ns.map(r=>{
  const h=r.parentElement.querySelector('p');return h?h.textContent.trim():'';}).filter(Boolean));
const optionsOf=t=>page.$$eval('#detail .steprow',(ns,x)=>{
  const i=[...ns].findIndex(r=>{const h=r.parentElement.querySelector('p');
    return h&&h.textContent.trim()===x;});
  return i<0?[]:[...ns[i].querySelectorAll('.opt')].map(n=>n.textContent.trim());},t);
async function pick(step,label){
  const hit=await page.$$eval('#detail .steprow',(ns,a)=>{
    const row=[...ns].find(r=>{const h=r.parentElement.querySelector('p');
      return h&&h.textContent.trim()===a.step;});
    if(!row) return 'no step '+a.step;
    const live=[...row.querySelectorAll('.opt')].filter(x=>!x.disabled);
    const n=live.find(x=>x.textContent.trim().startsWith(a.label));
    if(!n) return 'no option "'+a.label+'" in '+a.step+'; offered '+live.map(x=>x.textContent.trim().slice(0,24)).join('|');
    n.click(); return true;},{step,label});
  if(hit!==true) throw new Error(hit);
  await page.waitForTimeout(200);
}
async function open(name){
  await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});
  await page.goto(BASE+'/quoter/');
  await page.waitForSelector('#lineGate:not(.hidden)',{timeout:30000});
  await page.$$eval('#lineChoices button',ns=>ns.find(n=>/^Wood/.test(n.textContent.trim())).click());
  await page.waitForTimeout(700);
  await page.$$eval('#lineChoices button',ns=>ns.find(n=>/^Mahogany/.test(n.textContent.trim())).click());
  await page.waitForSelector('#catalog article',{timeout:30000});
  await page.click('#clearFilters').catch(()=>{});
  await page.fill('#q',name); await page.waitForTimeout(520);
  const found=await page.$$eval('#catalog article',(ns,n)=>{
    const h=[...ns].find(a=>a.querySelector('h3').textContent.trim()===n);
    if(!h) return false; h.querySelector('button').click(); return true;},name);
  if(!found) throw new Error('no card named '+name);
  await page.waitForSelector('#detail:not(.hidden)');
}
const orderDoc=async who=>{
  await page.$$eval('#detail button',ns=>{const x=ns.find(n=>n.textContent.trim()==='Add to quote');if(x)x.click();});
  await page.waitForTimeout(600);
  await page.fill('#job_customer',who); await page.waitForTimeout(150);
  await page.click('#printOrder'); await page.waitForTimeout(500);
  return page.evaluate(()=>document.querySelector('#printDoc').textContent);
};

await open('6 Lite 1 Panel RM');
ok('a TDL door is asked its glass first',(await steps())[0]==='Glass',(await steps())[0]);
const g=await optionsOf('Glass');
ok('and offered the ten from catalog page 12',g.length===10,g.length+' offered');
ok('with neither Digital nor Sandblast among them',
   !g.some(o=>/^Digital|^Sandblast/.test(o)), g.filter(o=>/Digital|Sandblast/.test(o)).join('|')||'neither');

await pick('Glass','Clear Bevel Low E'); await pick('Size',"3'0\" x 8'0\"");
await pick('Finish','Unfinished'); await pick('Opening','Single + 1 sidelite');
const slRM=await optionsOf('Sidelite');
ok('a raised-moulding door is offered only raised-moulding sidelites',
   slRM.length>0 && slRM.every(o=>!/NRM/i.test(o)) && slRM.every(o=>/3 Lite 1 Panel Sidelite/.test(o)),
   slRM.join(' | '));

await open('6 Lite 1 Panel NRM');
await pick('Glass','Clear Bevel Low E'); await pick('Size',"3'0\" x 8'0\"");
await pick('Finish','Unfinished'); await pick('Opening','Single + 1 sidelite');
const slNRM=await optionsOf('Sidelite');
ok('and a no-raised-moulding door only the NRM ones',
   slNRM.length>0 && slNRM.every(o=>/NRM/i.test(o)), slNRM.join(' | '));

await open('4 Lite 1 Panel RM');
await pick('Glass','Clear Bevel Low E'); await pick('Size',"3'0\" x 6'8\"");
await pick('Finish','Unfinished'); await pick('Opening','Single + 1 sidelite');
const sl4=await optionsOf('Sidelite');
ok('a 4 Lite takes the 2 Lite sidelite, not the 3 Lite',
   sl4.length>0 && sl4.every(o=>/2 Lite 1 Panel Sidelite/.test(o)), sl4.join(' | '));

/* the dentil shelf */
await open('Craftsman 4 Lite');
await pick('Glass','Clear Bevel Low E'); await pick('Finish','Unfinished');
ok('a Craftsman is asked about the dentil shelf, before the opening',
   (await steps()).includes('Dentil shelf') && !(await steps()).includes('Opening'),
   (await steps()).join(' > '));
const shelfOpts=await optionsOf('Dentil shelf');
ok('offered both ways, at no price difference',shelfOpts.length===2,shelfOpts.join(' | '));
await pick('Dentil shelf','With shelf');
await pick('Opening','Single door'); await pick('Handing','Left hand'); await pick('Swing','Inswing'); await pick('Jamb depth','4-9/16');
const withShelf=await page.$eval('#detail .font-display.text-3xl',n=>n.textContent.trim());
const doc1=await orderDoc('Shelf Test');
ok('choosing the shelf puts the S on the end of the number',
   /MCM4LCBLE3080S/.test(doc1),(doc1.match(/MCM4L\S*/)||['none'])[0]);
ok('and says so in words on the sheet',/with dentil shelf/i.test(doc1));

await open('Craftsman 4 Lite');
await pick('Glass','Clear Bevel Low E'); await pick('Finish','Unfinished');
await pick('Dentil shelf','No shelf');
await pick('Opening','Single door'); await pick('Handing','Left hand'); await pick('Swing','Inswing'); await pick('Jamb depth','4-9/16');
const noShelf=await page.$eval('#detail .font-display.text-3xl',n=>n.textContent.trim());
ok('and the shelf costs nothing, exactly as the sheet has it',withShelf===noShelf,
   withShelf+' with, '+noShelf+' without');
const doc2=await orderDoc('No Shelf Test');
ok('no shelf, no S',/MCM4LCBLE3080(?!S)/.test(doc2),(doc2.match(/MCM4L\S*/)||['none'])[0]);

await open('Craftsman 6 Lite');
await pick('Glass','Clear Bevel Low E'); await pick('Size',"3'0\" x 6'8\"");
ok('the 6\'8" Craftsman 6 Lite is not asked — its number carries the S already',
   !(await steps()).includes('Dentil shelf'),(await steps()).join(' > '));

ok('no console or page errors',!errs.length,errs.slice(0,3).join(' | '));
report();
await b.close(); srv.close();
process.exit(T.filter(t=>t.startsWith('FAIL')).length?1:0);
