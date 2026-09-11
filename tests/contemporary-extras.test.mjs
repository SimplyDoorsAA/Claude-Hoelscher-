/* What a Mahogany Contemporary opening sells beside its door, agreed with the
   dealer on 2026-09-11 from a screenshot of the live app:

     - ticking a trim adder asks which profile it is made of;
     - 2-1/4" casing is the baseline inside the $83 adder and 3-1/2" carries
       the $17 difference between the two catalogue rows on top;
     - both exterior profiles are priced the same, so that choice is a spec;
     - the component picker is closed to all but the construction-door adder,
       because a Contemporary unit ships prehung with its jamb;
     - the collection is not offered simulated divided lites;
     - jamb DEPTH is still asked, the unit being built to a wall thickness.

   Every figure is recomputed here from catalog.json and pricing-rules.json. */
import { playwright } from './playwright.mjs';
const { chromium } = await playwright();
import http from 'node:http'; import fs from 'node:fs';
import path from 'node:path'; import url from 'node:url';
import { createEngine, formatCents, applyMargin } from '../packages/pricing-engine/index.js';

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
const engine=createEngine(cat,rules);
const NET=rules.netMultiplier, RETAIL=rules.marginTiers.retail;
const r2=x=>Math.floor(x+0.5);
const cost=c=>r2(c*NET), sell=(c,m)=>r2(c/(1-m));

const T=[]; const ok=(n,c,x='')=>T.push((c?'PASS':'FAIL')+'  '+n+(x?'  :: '+x:''));
let reported=false;
const report=()=>{ if(reported) return; reported=true;
  console.log(T.join('\n'));
  const f=T.filter(t=>t.startsWith('FAIL')).length;
  console.log('\n'+(T.length-f)+' passed, '+f+' failed'); };
process.on('uncaughtException',e=>{ report(); console.error('\nCRASHED: '+e.message); process.exit(1); });

/* ---------------- the rules, as data ---------------- */
const comp=d=>cat.woodComponents.find(c=>c.description===d);
const tp=cat.trimProfileRules||[];
const intRule=tp.find(r=>r.adderType==='intCasing'), extRule=tp.find(r=>r.adderType==='1x4');
ok('the catalogue records an interior casing profile choice',!!intRule);
ok('with 2-1/4" as the baseline the adder already covers',
   !!intRule && intRule.baseline==='2-1/4" Casing', intRule?intRule.baseline:'none');
ok('and an exterior trim profile choice',!!extRule);

/* the $17 the dealer confirmed, derived from the rows rather than stored */
const gapOn=line=>comp('3-1/2" Casing').priceVariantsCents[line]-comp('2-1/4" Casing').priceVariantsCents[line];
ok('the wider casing is $17.00 more on both wood lines',
   gapOn('mahogany')===1700 && gapOn('knottyAlder')===1700,
   formatCents(gapOn('mahogany'))+' mahogany, '+formatCents(gapOn('knottyAlder'))+' knotty alder');
const extGap=comp('WM180 Brick Mould').priceVariantsCents.mahogany-comp('1x4 S4S').priceVariantsCents.mahogany;
ok('the two exterior profiles cost the same, so that choice is a spec',extGap===0,formatCents(extGap));
ok('and no upcharge is stored anywhere — it is derived',
   !JSON.stringify(tp).includes('1700'));

const xr=(cat.openingExtrasRules||[]).find(r=>r.appliesToPriceSheetPage==='P.6');
ok('the catalogue records what a Contemporary opening sells beside it',!!xr);
ok('the component picker is closed but for the construction door',
   !!xr && xr.componentPicker===false &&
   JSON.stringify(xr.allowComponentDescriptions)==='["Construction Door adder"]',
   xr?JSON.stringify(xr.allowComponentDescriptions):'none');
ok('and divided lites are withheld from the collection',!!xr && xr.simulatedDividedLites===false);
/* The allow-list is matched as a prefix, so a vendor rename would quietly
   empty the picker rather than fail. This is where that gets caught. */
const allowHits=(xr&&xr.allowComponentDescriptions||[]).map(x=>
  ({x, hits: cat.woodComponents.filter(c=>String(c.description||'').indexOf(x)===0).length}));
ok('every name on the allow-list still matches exactly one catalogue row',
   allowHits.length>0 && allowHits.every(h=>h.hits===1),
   allowHits.map(h=>h.x+' -> '+h.hits).join(', '));

/* ---------------- the engine prices an upgrade as a difference ---------- */
const door=cat.woodProducts.find(p=>p.sku==='M3GPW--3080');
const up=engine.priceLine({productId:door.id,finish:'unfinished',config:'singlePH',qty:1,
  accessories:[{kind:'componentUpgrade',id:comp('3-1/2" Casing').id,
                fromId:comp('2-1/4" Casing').id,variant:'mahogany',qty:1}]},RETAIL).accessories[0];
ok('the engine prices the upgrade as the gap, netted',up.costCents===cost(1700),
   formatCents(up.costCents)+' vs '+formatCents(cost(1700)));
ok('and never as the whole casing row',up.costCents!==cost(comp('3-1/2" Casing').priceVariantsCents.mahogany));
const noUp=engine.priceLine({productId:door.id,finish:'unfinished',config:'singlePH',qty:1,
  accessories:[{kind:'componentUpgrade',id:comp('WM180 Brick Mould').id,
                fromId:comp('1x4 S4S').id,variant:'mahogany',qty:1}]},RETAIL).accessories[0];
ok('a like-for-like profile costs nothing and is not "not offered"',
   noUp.costCents===0 && noUp.notOffered===false, formatCents(noUp.costCents));

/* ---------------- the app, driven ---------------- */
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
async function pick(step,label){
  const hit=await page.$$eval('#detail .steprow',(ns,a)=>{
    const row=[...ns].find(r=>{const h=r.parentElement.querySelector('p');
      return h&&h.textContent.trim()===a.step;});
    if(!row) return 'no step '+a.step;
    const live=[...row.querySelectorAll('.opt')].filter(x=>!x.disabled);
    const n=live.find(x=>x.textContent.trim().startsWith(a.label));
    if(!n) return 'no option '+a.label;
    n.click(); return true;},{step,label});
  if(hit!==true) throw new Error(hit);
  await page.waitForTimeout(220);
}
async function toContemporary(){
  await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});
  await page.goto(BASE+'/quoter/');
  await page.waitForSelector('#lineGate:not(.hidden)',{timeout:30000});
  await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/^Wood/.test(n.textContent.trim())).click();});
  await page.waitForTimeout(700);
  await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/^Mahogany/.test(n.textContent.trim())).click();});
  await page.waitForSelector('#catalog article',{timeout:30000});
  await page.click('#clearFilters').catch(()=>{});
  await page.fill('#q','3 Lite'); await page.waitForTimeout(520);
  await page.$$eval('#catalog article',ns=>{
    ns.find(a=>a.querySelector('h3').textContent.trim()==='3 Lite').querySelector('button').click();});
  await page.waitForSelector('#detail:not(.hidden)');
  await pick('Glass','Clear Low E'); await pick('Size',"3'0\" x 8'0\"");
  await pick('Finish','Unfinished'); await pick('Opening','Single door');
  await pick('Handing','Left hand'); await pick('Swing','Inswing'); await pick('Jamb depth','4-9/16');
}
const detail=()=>page.textContent('#detail');
const priceNow=()=>page.$eval('#detail .font-display.text-3xl',n=>n.textContent.trim());
const tickAdder=async label=>{
  const hit=await page.$$eval('#detail label',(ns,l)=>{
    const row=[...ns].find(x=>x.textContent.includes(l));
    if(!row) return false; row.querySelector('input[type=checkbox]').click(); return true;},label);
  if(!hit) throw new Error('no adder checkbox '+label);
  await page.waitForTimeout(350);
};

await toContemporary();
const txt0=await detail();
ok('the jamb depth question is still asked',(await steps()).includes('Jamb depth'),
   (await steps()).join(' > '));
ok('divided lites are gone from a Contemporary door',!/Simulated divided lites/i.test(txt0));
ok('and so is the jamb leg, the glass bead and the subsill',
   !/Exterior Jamb Leg|Glass Bead|Subsill/i.test(txt0));
ok('the picker offers the construction door and nothing else',
   /Construction Door adder/.test(txt0), (txt0.match(/Nothing else is offered[^.]*/)||[''])[0]);

const before=await priceNow();
await tickAdder('Interior casing');
ok('ticking interior casing asks which profile',
   /Interior casing profile/i.test(await detail()), '');
const withBase=await priceNow();
const adder=cat.woodPrehangAdders.find(a=>a.configuration==='3080 Single'&&a.adderType==='intCasing');
ok('and the baseline profile adds only the adder itself',
   withBase===formatCents(sell(cost(door.prices.unfinished.singlePH)+
     rules.freight.prehangChargeCentsPerUnit+cost(adder.priceCents),RETAIL)),
   before+' -> '+withBase);
await pick('Interior casing profile','3-1/2"');
const withWide=await priceNow();
ok('choosing the wider profile adds the $17 gap, netted and margined',
   withWide===formatCents(sell(cost(door.prices.unfinished.singlePH)+
     rules.freight.prehangChargeCentsPerUnit+cost(adder.priceCents)+cost(1700),RETAIL)),
   withBase+' -> '+withWide);
await pick('Interior casing profile','2-1/4"');
ok('and going back to the baseline takes it off again',(await priceNow())===withBase,
   withWide+' -> '+(await priceNow()));

await tickAdder('1×4 exterior trim');
ok('ticking the exterior trim asks its profile too',/Exterior trim profile/i.test(await detail()));
const withExt=await priceNow();
await pick('Exterior trim profile','WM180');
ok('and switching to brick mould costs nothing, as the sheet says',
   (await priceNow())===withExt, withExt+' -> '+(await priceNow()));

await page.$$eval('#detail button',ns=>{const x=ns.find(n=>n.textContent.trim()==='Add to quote');if(x)x.click();});
await page.waitForTimeout(600);
await page.fill('#job_customer','Trim Test'); await page.waitForTimeout(150);
await page.click('#printOrder'); await page.waitForTimeout(500);
const order=await page.evaluate(()=>document.querySelector('#printDoc').textContent);
ok('the order sheet names the profile the opening is trimmed in',
   /WM180 Brick Mould/.test(order), (order.match(/WM180[^+]*/)||['none'])[0].slice(0,60));
ok('and says it is an upgrade, not a second charge for trim',
   !/3-1\/2" Casing/.test(order) || /upgrade from/.test(order));

ok('no console or page errors',!errs.length,errs.slice(0,3).join(' | '));
report();
await b.close(); srv.close();
process.exit(T.filter(t=>t.startsWith('FAIL')).length?1:0);
