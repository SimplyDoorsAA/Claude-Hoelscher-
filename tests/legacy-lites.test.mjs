/* Mahogany Legacy & Panel — the Full Lite and 3/4 Lite pages, 28–29.

   Flat glass takes the page-22 list and the legend's code; decorative glass
   takes the design infix and the caming letter together; each door pairs with
   the sidelite of its own lite style. The rules as data first, then the app. */
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
const designs=JSON.parse(fs.readFileSync(ROOT+'/quoter/assets/designs/manifest.json','utf8'));
const T=[]; const ok=(n,c,x='')=>T.push((c?'PASS':'FAIL')+'  '+n+(x?'  :: '+x:''));
let reported=false;
const report=()=>{ if(reported) return; reported=true;
  console.log(T.join('\n'));
  const f=T.filter(t=>t.startsWith('FAIL')).length;
  console.log('\n'+(T.length-f)+' passed, '+f+' failed'); };
process.on('uncaughtException',e=>{ report(); console.error('\nCRASHED: '+e.message); process.exit(1); });

/* ================= 1. the rules as data ================================= */
const TEN=['Clear Low E','Clear Bevel Low E','Baroque','Flemish','Water','Stippolyte','Rain','Reeded','Small Reeded','Satin'];
const p22=(cat.glassRules||[]).find(r=>r.appliesToPriceSheetPage==='P.22');
ok('page 22 carries a glass rule of ten', !!p22 && p22.options.length===10 && TEN.every(g=>p22.options.includes(g)),
   p22?p22.options.join('|'):'none');
ok('every one of the ten has a code in the sheet\'s legend',
   !!p22 && p22.options.every(g=>(cat.glassCodes||[]).some(c=>c.name===g)));
const flat=cat.woodProducts.filter(p=>p.priceSheetPage==='P.22' && !/SE/.test(p.sku));
ok('the sheet keys 16 flat-glass rows to it, none of them speakeasy', flat.length===16 && flat.every(p=>/Flat Glass/.test(p.description)),
   flat.length+' rows');

const dar=(cat.decorativeGlassDesigns||[]).find(d=>d.name==='Dartmouth');
ok('Dartmouth is a decorative design, DAR, in Patina and Zinc', !!dar && dar.partNumberInfix==='DAR' && dar.caming.join()==='Patina,Zinc');
ok('and has a photograph filed', !!designs.decorativeGlass.Dartmouth && fs.existsSync(ROOT+'/quoter/assets/designs/'+designs.decorativeGlass.Dartmouth.file));
const dd=(cat.skuPlaceholders||{}).decorativeDesign;
ok('the design-infix fill is recorded with the catalog\'s own numbers as evidence',
   !!dd && dd.codes.Patina==='P' && dd.codes.Zinc==='Z' && /M34COLZ3068/.test(dd.evidence) && /KA34COLP3068/.test(dd.evidence));
const named=[...new Set(cat.woodProducts.flatMap(p=>String(p.glazing||'').split(',').map(s=>s.trim())))].filter(Boolean);
const decoNamed=named.filter(n=>!(cat.glassCodes||[]).some(c=>c.name===n));
const missing=decoNamed.filter(n=>!(cat.decorativeGlassDesigns||[]).some(d=>d.name===n));
ok('every decorative glass a row names is a design with an infix, bar Brazos (page 30, not yet walked)',
   missing.every(n=>n==='Brazos'), missing.join(', ')||'none missing');

const pairs=(cat.sideliteRules||[]).filter(r=>/^\^(3\/4|Full) Lite - \(Flat\|Decorative\) Glass\$$/.test(r.appliesToModelPattern||''));
ok('the 3/4 Lite and Full Lite pair with the sidelite of their own lite style', pairs.length===2 &&
   pairs.some(r=>r.allowSkuPattern==='^M34SL-') && pairs.some(r=>r.allowSkuPattern==='^MFULLSL-'),
   pairs.map(r=>r.appliesToModelPattern+' -> '+r.allowSkuPattern).join('  '));

/* ================= 2. the app, driven =================================== */
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
  return i<0?[]:[...ns[i].querySelectorAll('.opt')].map(n=>(n.disabled?'[x] ':'')+n.textContent.trim());},t);
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
async function open(name, wood){
  await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});
  await page.goto(BASE+'/quoter/');
  await page.waitForSelector('#lineGate:not(.hidden)',{timeout:30000});
  await page.$$eval('#lineChoices button',ns=>ns.find(n=>/^Wood/.test(n.textContent.trim())).click());
  await page.waitForTimeout(700);
  await page.$$eval('#lineChoices button',(ns,w)=>ns.find(n=>new RegExp('^'+w).test(n.textContent.trim())).click(), wood||'Mahogany');
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
const finishSingle=async()=>{ await pick('Finish','Unfinished'); await pick('Opening','Single door');
  await pick('Handing','Left'); await pick('Swing','Inswing'); await pick('Jamb depth','4-9/16'); };
const numbers=doc=>[...new Set(doc.match(/(?:KA|M)(?:34|FULL|23)[A-Z-]*\d{4}(?:NRM)?/g)||[])];

/* flat glass: the ten, the legend's code in the gap, the sidelite of its style */
await open('3/4 Lite - Flat Glass');
const g=await optionsOf('Glass');
ok('a flat-glass 3/4 Lite is asked its glass, from the ten on page 22', g.length===10 && TEN.every(t=>g.some(o=>o.startsWith(t))), g.join('|'));
await pick('Glass','Clear Low E'); await pick('Size',"3'0\" x 6'8\""); await pick('Finish','Unfinished'); await pick('Opening','Single + 1 sidelite');
const sl=await optionsOf('Sidelite');
ok('and offered only 3/4 sidelites beside it', sl.length>0 && sl.length<=2 && sl.every(o=>/^3\/4 Sidelite/.test(o)), sl.join(' | '));
await pick('Sidelite','3/4 Sidelite - Flat');
await pick('Handing','Left'); await pick('Swing','Inswing'); await pick('Jamb depth','4-9/16');
const d1=await orderDoc('Flat 3/4');
ok('the door prints with the legend\'s code where the sheet prints the gap', /M34LE3068/.test(d1), numbers(d1).join(', '));
ok('and so does the sidelite, its three-dash gap filled whole', /M34SLLE1268/.test(d1) && !/M34SL-|M34SLLE-/.test(d1), numbers(d1).join(', '));
ok('nothing on that sheet is still a placeholder', !/still holds a placeholder/i.test(d1));

await open('Full Lite - Flat Glass');
await pick('Glass','Clear Bevel Low E'); await finishSingle();
const d2=await orderDoc('Flat Full');
ok('the Full Lite flat door likewise: MFULLCBLE3068', /MFULLCBLE3068/.test(d2), numbers(d2).join(', '));

/* decorative glass: infix + caming */
await open('3/4 Lite - Decorative Glass');
const dg=await optionsOf('Glass');
ok('the decorative 3/4 Lite offers its four designs', dg.length===4 && ['Columbia','Medina','Pecos','San Jacinto'].every(n=>dg.some(o=>o.replace(/^\[x\] /,'').startsWith(n))), dg.join('|'));
await pick('Glass','Columbia');
const cam=await optionsOf('Caming');
ok('and asks the caming', cam.join('|')==='Patina|Zinc', cam.join('|'));
await pick('Caming','Zinc');
const sizes=await optionsOf('Size');
ok('Columbia comes in all four sizes', sizes.length===4, sizes.join('|'));
await pick('Size',"3'0\" x 6'8\""); await finishSingle();
const d3=await orderDoc('Deco 3/4');
ok('and prints as the catalog does: M34COLZ3068', /M34COLZ3068/.test(d3) && !/still holds a placeholder/i.test(d3), numbers(d3).join(', '));

await open('3/4 Lite - Decorative Glass');
await pick('Glass','Medina'); await pick('Caming','Patina');
const medSizes=await optionsOf('Size');
const medLive=medSizes.filter(x=>!x.startsWith('[x] '));
ok('Medina is made in 2868 and 3068 only, as the page says: the 8\'0" sizes are shown but cannot be chosen',
   medSizes.length===4 && medLive.length===2 && medLive.every(x=>/6'8"/.test(x)), medSizes.join('|'));

await open('Full Lite - Decorative Glass');
await pick('Glass','Dartmouth'); await pick('Caming','Patina'); await pick('Finish','Unfinished'); await pick('Opening','Single + 1 sidelite');
const fsl=await optionsOf('Sidelite');
ok('a Dartmouth Full Lite is offered the Full sidelite and no other', fsl.length>0 && fsl.every(o=>/^Full Sidelite/.test(o)), fsl.join(' | '));
await pick('Sidelite','Full Sidelite - Decorative');
await pick('Handing','Left'); await pick('Swing','Inswing'); await pick('Jamb depth','4-9/16');
const d4=await orderDoc('Deco Full');
ok('the door prints MFULLDARP3068', /MFULLDARP3068/.test(d4), numbers(d4).join(', '));
ok('and the sidelite by the same grammar, MFULLSLDARP1068', /MFULLSLDARP1068/.test(d4) && !/still holds a placeholder/i.test(d4), numbers(d4).join(', '));

/* knotty alder prints the same grammar on page 48 */
await open('KA 3/4 Lite RM - Decorative Glass','Knotty');
await pick('Glass','Columbia'); await pick('Caming','Patina'); await pick('Size',"3'0\" x 6'8\""); await finishSingle();
const d5=await orderDoc('KA Deco');
ok('a knotty alder decorative door prints KA34COLP3068', /KA34COLP3068/.test(d5) && !/still holds a placeholder/i.test(d5), numbers(d5).join(', '));

ok('no console or page errors', errs.length===0, errs.slice(0,2).join(' | '));
report();
await b.close(); srv.close();
process.exit(T.some(t=>t.startsWith('FAIL'))?1:0);
