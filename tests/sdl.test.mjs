/* Mahogany Simulated Divided Lite Doors — catalog page 21.

   The one door on the page, the 3/4 Lite 1 Panel for SDL, with its own
   sidelite and the factory-applied grid the sheet prices per lite by bar
   width. First the rules as data, then the app driven through the page. */
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
const rules=JSON.parse(fs.readFileSync(ROOT+'/data/pricing-rules.json','utf8'));
const NET=rules.netMultiplier, RETAIL=rules.marginTiers.retail;
const r2=x=>Math.round(x), cost=c=>r2(c*NET), sell=(c,m)=>r2(c/(1-m));
const formatCents=c=>'$'+(c/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const T=[]; const ok=(n,c,x='')=>T.push((c?'PASS':'FAIL')+'  '+n+(x?'  :: '+x:''));
let reported=false;
const report=()=>{ if(reported) return; reported=true;
  console.log(T.join('\n'));
  const f=T.filter(t=>t.startsWith('FAIL')).length;
  console.log('\n'+(T.length-f)+' passed, '+f+' failed'); };
process.on('uncaughtException',e=>{ report(); console.error('\nCRASHED: '+e.message); process.exit(1); });

/* ================= 1. the rules as data ================================= */
const doors=cat.woodProducts.filter(p=>/^M34--1P\d{4}NRM$/.test(p.sku));
ok('the seven SDL doors are held, one per catalog size', doors.length===7 &&
   ['2668','2868','3068','2680','2880','3080','3680'].every(s=>doors.some(d=>d.size.code===s)),
   doors.map(d=>d.size.code).join(' '));
ok('and every one is Clear Low E only, as the page and the sheet print',
   doors.every(d=>d.glazing==='Clear Low E'));
const sls=cat.woodProducts.filter(p=>/^M34SL--1P\d{4}$/.test(p.sku));
ok('both SDL sidelites are held', sls.length===2, sls.map(s=>s.sku).join(' '));

const pair=(cat.sideliteRules||[]).find(r=>r.appliesToModelPattern==='^3/4 Lite 1 Panel NRM$');
ok('the SDL door is paired with its own sidelite by rule',
   !!pair && pair.allowSkuPattern==='^M34SL--1P\\d+$' && pair.appliesToCollection==='wood',
   pair?pair.allowSkuPattern:'no rule');
ok('and that pattern admits exactly the two SDL sidelites',
   !!pair && cat.woodProducts.filter(p=>new RegExp(pair.allowSkuPattern).test(p.sku)).length===2);

const sdl=cat.sdlRule||{};
const per=(cat.woodComponents||[]).filter(c=>/Simulated Divided Lite, per lite/.test(c.description||''));
ok('two per-lite rows, one per bar, priced as the sheet prints them',
   per.length===2 && per.some(c=>/7\/8/.test(c.description)&&c.priceCents===3500&&c.priceBasis==='list')
                  && per.some(c=>/1-1\/4/.test(c.description)&&c.priceCents===4000&&c.priceBasis==='list'),
   per.map(c=>c.description.replace(/ — .*/,'')+' $'+(c.priceCents/100)).join(' | '));
ok('neither carries freight or a stray variant table',
   per.every(c=>c.freightUnitsPerPiece===0 && c.priceVariantsCents===null));
ok('the rule names both bars and each resolves to one per-lite row',
   Array.isArray(sdl.bars) && sdl.bars.length===2 &&
   sdl.bars.every(b=>per.filter(c=>new RegExp(b.matchDescription).test(c.description)).length===1),
   (sdl.bars||[]).map(b=>b.label).join(' | '));
ok('and each bar names the lineal bar the sheet prints the per-lite price on',
   (sdl.bars||[]).every(b=>(cat.woodComponents||[]).some(c=>c.partNumber===b.barPartNumber)),
   (sdl.bars||[]).map(b=>b.barPartNumber).join(' '));
ok('on wood the grid is offered on the SDL door and nowhere else',
   sdl.appliesToModelPattern && sdl.appliesToModelPattern.wood==='^3/4 Lite 1 Panel NRM$');
ok('the per-lite rows are our own numbers and say so',
   per.every(c=>/^SDL-LITE-/.test(c.partNumber) && /our own number/.test(c.notes||'')));

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
const money=s=>{const m=/^\$([\d,]+)\.(\d\d)$/.exec(s); return m?parseInt(m[1].replace(/,/g,''),10)*100+parseInt(m[2],10):null;};
const detailText=()=>page.textContent('#detail');
const orderDoc=async who=>{
  await page.$$eval('#detail button',ns=>{const x=ns.find(n=>n.textContent.trim()==='Add to quote');if(x)x.click();});
  await page.waitForTimeout(600);
  await page.fill('#job_customer',who); await page.waitForTimeout(150);
  await page.click('#printOrder'); await page.waitForTimeout(500);
  return page.evaluate(()=>document.querySelector('#printDoc').textContent);
};

await open('3/4 Lite 1 Panel NRM');
ok('the SDL door is not asked its glass — it only comes in Clear Low E',
   !(await steps()).includes('Glass'), (await steps()).join(' > '));
await pick('Size',"3'0\" x 6'8\""); await pick('Finish','Unfinished'); await pick('Opening','Single + 1 sidelite');
const slOpts=await optionsOf('Sidelite');
ok('with a sidelite, exactly one is offered: its own',
   slOpts.length===1 && /^3\/4 Lite 1 Panel Sidelite NRM/.test(slOpts[0]), slOpts.join(' | ')||'none');
if(slOpts.length) await pick('Sidelite',slOpts[0].slice(0,20));
await pick('Handing','Left'); await pick('Swing','Inswing'); await pick('Jamb depth','4-9/16');

const barOpts=await optionsOf('Simulated divided lites');
ok('the factory grid asks which bar, 7/8" or 1-1/4"',
   barOpts.length===2 && /^7\/8" bar/.test(barOpts[0]) && /^1-1\/4" bar/.test(barOpts[1]), barOpts.join(' | '));
const p78=per.find(c=>/7\/8/.test(c.description)), p114=per.find(c=>/1-1\/4/.test(c.description));
ok('each bar shows the sheet\'s per-lite price after cost and margin',
   barOpts[0].includes(formatCents(sell(cost(p78.priceCents),RETAIL))) &&
   barOpts[1].includes(formatCents(sell(cost(p114.priceCents),RETAIL))),
   barOpts.join(' | '));

const barArt=await page.$$eval('#detail .steprow img',ns=>ns.map(i=>({src:i.getAttribute('src')||'',ok:i.complete&&i.naturalWidth>0})));
ok('each bar button carries its profile drawing, and both load',
   barArt.length===2 && barArt.every(a=>/acc-sdlbar-/.test(a.src)&&a.ok), JSON.stringify(barArt));

const before=money(await priceShown());
for(let i=0;i<6;i++){
  await page.$$eval('#detail button',ns=>{const x=ns.find(n=>n.getAttribute('aria-label')==='One more lite'); if(x)x.click();});
  await page.waitForTimeout(120);
}
const with78=money(await priceShown());
ok('six lites on the 7/8" bar cost six times $35 list',
   with78-before===6*sell(cost(p78.priceCents),RETAIL),
   formatCents(with78-before)+' vs '+formatCents(6*sell(cost(p78.priceCents),RETAIL)));
await pick('Simulated divided lites','1-1/4" bar');
const with114=money(await priceShown());
ok('switching to the 1-1/4" bar keeps the six and reprices them at $40 list',
   with114-before===6*sell(cost(p114.priceCents),RETAIL) && /6 simulated|for 6/.test(await detailText()),
   formatCents(with114-before)+' vs '+formatCents(6*sell(cost(p114.priceCents),RETAIL)));

const doc=await orderDoc('SDL Test');
ok('the order sheet prints the catalog\'s door number, glass code filled', /M34LE1P3068NRM/.test(doc));
ok('and the catalog\'s sidelite number', /M34SLLE1P1068/.test(doc));
ok('and the grid line names the bar', /per lite, 1-1\/4" bar/.test(doc));
ok('nothing on it is still a placeholder', !/still holds a placeholder/i.test(doc));
await page.click('#printQuote'); await page.waitForTimeout(500);
const est=await page.evaluate(()=>document.querySelector('#printDoc').textContent);
ok('the estimate describes the lites in words', /6 simulated divided lites/i.test(est),
   (est.match(/\d+ simulated divided lites/i)||['not found'])[0]);

/* the grid is the SDL door's alone on wood */
await open('4 Lite 1 Panel RM');
await pick('Glass','Clear Low E'); await pick('Size',"3'0\" x 6'8\""); await pick('Finish','Unfinished'); await pick('Opening','Single door');
await pick('Handing','Left'); await pick('Swing','Inswing'); await pick('Jamb depth','4-9/16');
ok('a TDL door is not offered the factory grid',
   !(await steps()).includes('Simulated divided lites') && !/Grid applied at the factory/.test(await detailText()));

ok('no console or page errors', errs.length===0, errs.slice(0,2).join(' | '));
report();
await b.close(); srv.close();
process.exit(T.some(t=>t.startsWith('FAIL'))?1:0);
