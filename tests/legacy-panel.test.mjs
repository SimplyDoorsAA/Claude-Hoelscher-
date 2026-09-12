/* Mahogany Legacy & Panel Doors — catalog pages 22–25.

   Ten panel doors with no glass at all, and the Blanco Center Arch whose
   part number takes a caming letter (P / Z) where every other placeholder
   takes a glass code. The rules as data first, then the app driven. */
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

/* ================= 1. the rules as data ================================= */
const PANEL=['M6P2868','M6P3068','M6PRM3068','M6PRM2880','M6PRM3080','M6PRM3680','MPIP3068','MPIP3080','MCA3068','MCA3080'];
const panel=cat.woodProducts.filter(p=>PANEL.includes(p.sku));
ok('the ten panel doors the page prints are held, numbers complete', panel.length===10 && panel.every(p=>!/-/.test(p.sku)),
   panel.map(p=>p.sku).join(' '));
ok('and none carries a glass, as the page shows none', panel.every(p=>p.glazing===null));
const cents=v=>v===null?null:Math.round(Number(v)*100); const K=['slab','singlePH','doublePH'];
ok('every one matches the sheet on all six cells', panel.every(p=>{
  const r=sheet.rows.find(x=>x.sku===p.sku); return r && K.every((k,i)=>p.prices.unfinished[k]===cents(r.u[i]) && p.prices.prefinished[k]===cents(r.f[i]));}));

const blanco=cat.woodProducts.find(p=>p.sku==='MCABLA--3068');
ok('the Blanco Center Arch is held with its placeholder, glazed Blanco', !!blanco && blanco.glazing==='Blanco');
const design=(cat.decorativeGlassDesigns||[]).find(d=>d.name==='Blanco');
ok('Blanco is a decorative design offered in Patina and Zinc, at no charge',
   !!design && design.partNumberInfix==='BLA' && design.caming.join()==='Patina,Zinc' && design.priceImpact==='none');
const cr=((cat.skuPlaceholders||{}).caming||[]).find(r=>new RegExp(r.appliesToSkuPattern).test('MCABLA--3068'));
ok('and the placeholder after BLA is listed as a caming letter, P or Z',
   !!cr && cr.codes.Patina==='P' && cr.codes.Zinc==='Z' && /MCABLAP3068/.test(cr.evidence||''));
ok('the caming pattern reaches no other row',
   cat.woodProducts.filter(p=>new RegExp(cr.appliesToSkuPattern).test(p.sku)).length===1);

const se=((cat.skuPlaceholders||{}).speakeasyGlass||[])[0];
const seRows=se?cat.woodProducts.filter(p=>new RegExp(se.appliesToSkuPattern).test(p.sku)):[];
ok('the speakeasy glass insert is listed as a C, the catalogs\' Clear IG',
   !!se && se.code==='C' && /M2PASEC3068/.test(se.evidence||'') && /KA2PASEC3068/.test(se.evidence||''));
ok('and the pattern reaches the 70 glass-insert rows and nothing else',
   seRows.length===70 && seRows.every(p=>/SE \+ Glass|Glass/.test(p.description)),
   seRows.length+' rows');
ok('the insert is named as clear insulated glass on the configurator',
   (cat.speakeasyOptions.inserts.find(i=>i.name==='Glass Insert')||{}).label==='Clear IG glass');

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
const priceShown=()=>page.$eval('#detail .font-display.text-3xl',n=>n.textContent.trim());
const orderDoc=async who=>{
  await page.$$eval('#detail button',ns=>{const x=ns.find(n=>n.textContent.trim()==='Add to quote');if(x)x.click();});
  await page.waitForTimeout(600);
  await page.fill('#job_customer',who); await page.waitForTimeout(150);
  await page.click('#printOrder'); await page.waitForTimeout(500);
  return page.evaluate(()=>document.querySelector('#printDoc').textContent);
};
const finish=async()=>{ await pick('Finish','Unfinished'); await pick('Opening','Single door');
  await pick('Handing','Left'); await pick('Swing','Inswing'); await pick('Jamb depth','4-9/16'); };

await open('6 Panel RM');
ok('a panel door is not asked its glass', !(await steps()).includes('Glass'), (await steps()).join(' > '));
await pick('Size',"3'6\" x 8'0\""); await finish();
const d1=await orderDoc('Panel Test');
ok('and the order sheet prints its number as the catalog does', /M6PRM3680/.test(d1) && !/still holds a placeholder/i.test(d1));

await open('Blanco Center Arch RM');
ok('the Blanco is asked its caming, not its glass',
   (await steps())[0]==='Caming' && !(await steps()).includes('Glass'), (await steps()).join(' > '));
ok('offered Patina and Zinc', (await optionsOf('Caming')).join('|')==='Patina|Zinc', (await optionsOf('Caming')).join('|'));
await pick('Caming','Patina'); await finish();
const pPat=await priceShown();
const d2=await orderDoc('Blanco Patina');
ok('Patina prints MCABLAP3068', /MCABLAP3068/.test(d2) && !/still holds a placeholder/i.test(d2));
ok('and says so in words', /Patina caming/.test(d2));
await open('Blanco Center Arch RM');
await pick('Caming','Zinc'); await finish();
const pZinc=await priceShown();
const d3=await orderDoc('Blanco Zinc');
ok('Zinc prints MCABLAZ3068', /MCABLAZ3068/.test(d3) && !/still holds a placeholder/i.test(d3));
ok('and the caming costs nothing, as the sheet prices one row', pPat===pZinc, pPat+' / '+pZinc);

/* a speakeasy kit with the glass insert: no glass asked, the C filled */
await open('2 Panel Arch VG');
await pick('Size',"3'0\" x 6'8\""); await pick('Speakeasy','Speakeasy kit'); await pick('Insert','Clear IG glass'); await pick('Iron mask','Standard');
ok('a speakeasy door with the glass insert is not asked its glass', !(await steps()).includes('Glass'), (await steps()).join(' > '));
await finish();
const d4=await orderDoc('Speakeasy Glass');
ok('and prints the catalog\'s number with the C', /M2PASEMC3068/.test(d4) && !/still holds a placeholder/i.test(d4),
   (d4.match(/M2PASE[A-Z-]*3068/)||['none'])[0]);

ok('no console or page errors', errs.length===0, errs.slice(0,2).join(' | '));
report();
await b.close(); srv.close();
process.exit(T.some(t=>t.startsWith('FAIL'))?1:0);
