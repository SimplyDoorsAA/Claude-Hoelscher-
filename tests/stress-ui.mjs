/* Front-facing app stress test: build real quotes through the UI and check the
   figures on screen against values recomputed here from the raw catalogue. */
import { playwright } from './playwright.mjs';
const { chromium } = await playwright();
import http from 'node:http'; import fs from 'node:fs';
import path from 'node:path'; import url from 'node:url';
const ROOT=path.resolve(url.fileURLToPath(import.meta.url),'../..');
const OUT=process.env.SHOT_DIR||path.join(ROOT,'.test-output');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.woff2':'font/woff2','.css':'text/css','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2','.png':'image/png'};
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]);
  const f=ROOT+(p.endsWith('/')?p+'index.html':p);
  let b=null; try{b=fs.readFileSync(f);}catch(e){r.writeHead(404);r.end('');return;}
  r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});
// Port 0: the OS picks a free one, so a killed run cannot poison the next.
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const BASE='http://127.0.0.1:'+srv.address().port;

const cat=JSON.parse(fs.readFileSync(ROOT+'/data/catalog.json','utf8'));
const all=[...cat.fiberglassProducts,...cat.woodProducts];
const bySku=s=>all.find(p=>p.sku===s);
const NET=0.48,PREHANG=10000,BANDS=[[1,3,12000],[4,6,16500],[7,9,20000],[10,Infinity,0]];
const r2=x=>Math.floor(x+0.5);
const cost=c=>r2(c*NET), sell=(c,m)=>r2(c/(1-m));
const units=(p,cfg)=>({door:1,sidelite:0.5,barn_slab:1}[p.type]??1)*(cfg==='doublePH'?2:1);
const band=u=>{const n=Math.ceil(u-1e-9); for(const[a,b,c]of BANDS) if(n>=a&&n<=b) return c; return 0;};
const fmt=c=>{const n=Math.abs(c);return (c<0?'-$':'$')+Math.floor(n/100).toLocaleString('en-US')+'.'+String(n%100).padStart(2,'0');};

const T=[]; const ok=(n,c,x='')=>{T.push((c?'PASS':'FAIL')+'  '+n+(x?'  :: '+x:''));};
const b=await chromium.launch();
const page=await (await b.newContext({viewport:{width:1500,height:1000}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text());});

const total=async()=>(await page.$eval('#quoteTotals .font-display.text-2xl',n=>n.textContent)).trim();
const totalsText=async()=>(await page.textContent('#quoteTotals'));
const SIZE_PREFIX=/^\d{4,5}[A-Z]?\s+/;
const keyOf=p=>{
  const d=String(p.description||'').trim(), code=p.size&&p.size.code;
  // The size code is not always first: knotty alder prints "KA 2680 4 Lite".
  if(code){ const rx=new RegExp('(^|\\s)'+String(code)+'(?=\\s|$)');
    if(rx.test(d)) return d.replace(rx,'$1').replace(/\s+/g,' ').trim(); }
  return d.replace(SIZE_PREFIX,'').trim();
};
/* Rows the dealer does not sell are in the catalogue but are not cards anybody
   can quote from, so they do not count towards what the browser shows. */
function hiddenVariantIdsOf(cat){
  const h=(cat.speakeasyOptions||{}).hiddenVariants, out=new Set();
  if(!h) return out;
  const of={fiberglass:cat.fiberglassProducts||[],wood:cat.woodProducts||[]};
  const rows=h.matchCollection?(of[h.matchCollection]||[]):[...(cat.fiberglassProducts||[]),...(cat.woodProducts||[])];
  const rx=new RegExp(h.matchDescription,'i');
  rows.forEach(p=>{ if(rx.test(p.description||'')) out.add(p.id); });
  return out;
}
const hiddenIds=hiddenVariantIdsOf(cat);
/* A speakeasy door, its kit and its mask are one part number, and those rows
   are reached through the door's configurator rather than as cards, so they
   are not counted here either. Read from the grammar the catalogue publishes. */
const seVariantIds=(()=>{
  const o=cat.speakeasyOptions, out=new Set();
  if(!o) return out;
  const all=[...(cat.woodProducts||[]),...(cat.fiberglassProducts||[])];
  const corr=p=>(o.skuCorrections||[]).find(c=>c.productId?c.productId===p.id:c.printed===p.sku);
  const res=p=>{const c=corr(p); return (c&&c.resolvesAs)||p.sku;};
  const bySku=new Map(all.map(p=>[res(p),p]));
  for(const base of all){
    const code=base.size&&base.size.code, sku=res(base);
    if(!code||!sku.endsWith(code)) continue;
    const stem=sku.slice(0,sku.length-code.length);
    if(/SE[-MBW]*$/.test(stem)) continue;
    for(const m of o.masks) for(const i of o.inserts){
      const v=bySku.get(stem+'SE'+m.code+i.code+code);
      if(v) out.add(v.id);
    }
  }
  hiddenIds.forEach(id=>out.add(id));
  return out;
})();
/* Some questions have no one right answer for a load test — which stain, and
   which glass on a row the sheet prices once for a whole catalog page. ANY
   takes the first thing offered and moves on. */
const ANY='\u0000any';
/* Answer whichever question the configurator is asking, until it prices. */
async function answer(product,finish,config){
  const want={
    'Glass': product.glazing||ANY,
    'Size': product.size&&product.size.label,
    'Iron grille': 'No grille',
    'Finish': finish==='unfinished'?'Unfinished':'Prefinished',
    'Stain colour': ANY,
    'Opening': {slab:'Slab only',singlePH:'Single door',doublePH:'Double door'}[config],
    'Sidelite': null,
    'Sidelite glass': ANY,
    'Handing': 'Left hand',
    'Swing': 'Inswing',
    'Jamb depth': '4-9/16'
  };
  for(let guard=0;guard<10;guard++){
    if(await page.$('#detail .font-display.text-3xl')) return;
    const open=await page.$$eval('#detail .steprow',ns=>ns.map(r=>{
      const h=r.parentElement.querySelector('p'); return h?h.textContent.trim():'';}).filter(Boolean));
    const next=open.find(t=>want[t]!==undefined&&want[t]!==null);
    if(!next) throw new Error('configurator asks something unexpected: '+open.join(' > '));
    const label=want[next];
    /* Scoped to the step being answered: "first option offered" has to mean
       first within this question, not the first one anywhere on the pane. */
    const hit=await page.$$eval('#detail .steprow',(ns,a)=>{
      const row=[...ns].find(r=>{
        const h=r.parentElement.querySelector('p');
        return h&&h.textContent.trim()===a.step; });
      if(!row) return false;
      const live=[...row.querySelectorAll('.opt')].filter(x=>!x.disabled);
      const n=a.label==='\u0000any'?live[0]:live.find(x=>x.textContent.trim().startsWith(a.label));
      if(!n) return false; n.click(); return true;},{step:next,label});
    if(!hit) throw new Error('no enabled option "'+label+'" for step '+next);
    await page.waitForTimeout(250);
    delete want[next];
  }
  throw new Error('configurator never reached a price');
}
async function addDoor(sku,finish,config,qty=1,accSkus=[]){
  await page.click('#closeQuote').catch(()=>{});
  await page.waitForTimeout(200);
  const product=bySku(sku), model=keyOf(product);
  await page.fill('#q',''); await page.waitForTimeout(200);
  await page.fill('#q',model); await page.waitForTimeout(500);
  await page.$$eval('#catalog article',(ns,m)=>{
    const hit=ns.find(a=>a.querySelector('h3').textContent.trim()===m);
    if(!hit) throw new Error('no card for model '+m);
    hit.querySelector('button').click();},model);
  await page.waitForSelector('#detail:not(.hidden)');
  await answer(product,finish,config);
  /* The detail pane prints the part number as it will be ordered, so a row the
     sheet writes with placeholders — M1LV--3080 — shows up with the glass code
     filled in. Match the shape rather than the raw string. */
  const resolved=await page.textContent('#detail');
  const shape=new RegExp(sku.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
    .replace(/--/g,'\u0001').replace(/-/g,'\u0002')
    .replace(/\u0001/g,'[A-Z]{0,4}').replace(/\u0002/g,'[A-Z]?'));
  if(!shape.test(resolved)) throw new Error('answers resolved to the wrong part, wanted '+sku);
  for(const a of accSkus){
    await page.selectOption('#detail select',{label:(all.find(p=>p.sku===a)||{}).description});
    await page.click('#detail button:has-text("Add")'); await page.waitForTimeout(300);
  }
  for(let i=1;i<qty;i++){ await page.click('#detail button[data-qty=inc]'); await page.waitForTimeout(120); }
  await page.click('#detail button:has-text("Add to quote")'); await page.waitForTimeout(700);
}

/* The gate runs in two steps now: the line, then the collection inside it. */
async function enter(...labels){
  for(const l of labels){
    if(!(await page.isVisible('#lineGate'))) break;
    const hit=await page.$$eval('#lineChoices button',(ns,x)=>{
      const n=ns.find(y=>y.textContent.trim().startsWith(x));
      if(!n) return false; n.click(); return true;},l);
    if(hit) await page.waitForTimeout(500);
  }
  await page.waitForSelector('#catalog article',{timeout:30000});
}

await page.goto(BASE+'/quoter/');
await page.waitForSelector('#lineGate:not(.hidden)',{timeout:30000});
await enter('Fiberglass','Woodgrain');

/* ---------------- fiberglass, several styles and configurations ---------------- */
const fg1=bySku('FG1LVCLE3080'), fg3=bySku('FG3GPWCLE3068'), fg5=bySku('FG5GPWCLE3080');
await addDoor('FG1LVCLE3080','unfinished','singlePH',1);
let unitCost=cost(fg1.prices.unfinished.singlePH)+PREHANG;
let exp=sell(unitCost,0.40)+sell(band(1),0.40);
ok('1 fiberglass single prehung', await total()===fmt(exp), await total()+' vs '+fmt(exp));
ok('band 1-3 disclosed', /1-3 units/.test(await totalsText()));

await addDoor('FG3GPWCLE3068','unfinished','doublePH',1);
let u=1+2, c2=cost(fg3.prices.unfinished.doublePH)+PREHANG;
exp=sell(unitCost,0.40)+sell(c2,0.40)+sell(band(u),0.40);
ok('+ double prehung (2 freight units)', await total()===fmt(exp), await total()+' vs '+fmt(exp));
ok('band still 1-3 at 3 units', /1-3 units/.test(await totalsText()), (await totalsText()).slice(-90));
ok('unit count shown is 3', /3 freight units/.test(await totalsText()));

await addDoor('FG5GPWCLE3080','prefinished','slab',3);
u+=3; const c3=cost(fg5.prices.prefinished.slab);
exp=sell(unitCost,0.40)+sell(c2,0.40)+sell(c3,0.40)*3+sell(band(u),0.40);
ok('+ 3 prefinished slabs', await total()===fmt(exp), await total()+' vs '+fmt(exp));
ok('band moved to 4-6 at 6 units', /4-6 units/.test(await totalsText()), (await totalsText()).slice(-90));

/* prepaid boundary */
await addDoor('FG1LVCLE3080','unfinished','slab',4);
u+=4; const c4=cost(fg1.prices.unfinished.slab);
exp=sell(unitCost,0.40)+sell(c2,0.40)+sell(c3,0.40)*3+sell(c4,0.40)*4+sell(0,0.40);
ok('10+ units ships prepaid', await total()===fmt(exp), await total()+' vs '+fmt(exp));
ok('prepaid is stated', /prepaid/i.test(await totalsText()), (await totalsText()).slice(-110));

/* cost view on the same basket */
await page.click('#drawerMode'); await page.waitForTimeout(500);
const costExp=unitCost+c2+c3*3+c4*4+0;
ok('cost view totals the same basket', await total()===fmt(costExp), await total()+' vs '+fmt(costExp));
ok('cost view separates prehang from crate',
   /Prehang charge/.test(await totalsText()) && /Crate & shipping/.test(await totalsText()));
await page.click('#drawerMode'); await page.waitForTimeout(400);

/* builder tier on the same basket */
await page.click('#drawerTier'); await page.waitForTimeout(600);
const bExp=sell(unitCost,0.30)+sell(c2,0.30)+sell(c3,0.30)*3+sell(c4,0.30)*4+sell(0,0.30);
ok('builder tier reprices the whole basket', await total()===fmt(bExp), await total()+' vs '+fmt(bExp));
ok('builder is cheaper than retail', bExp<exp, fmt(bExp)+' < '+fmt(exp));
await page.click('#drawerTier'); await page.waitForTimeout(500);

await page.screenshot({path:OUT+'/s1-fiberglass.png'});

/* ---------------- switch to wood, keep the quote ---------------- */
await page.click('#closeQuote'); await page.waitForTimeout(300);
await page.click('#lineChip'); await page.waitForTimeout(600);
ok('switching lines with a quote asks first', await page.isVisible('text=Start fresh'));
await page.click('button:has-text("Keep them")'); await page.waitForTimeout(800);
ok('the wood line then asks which wood',
   await page.isVisible('#lineGate') && /which wood/i.test(await page.textContent('#gateTitle')),
   await page.textContent('#gateTitle'));
await page.$$eval('#lineChoices button',ns=>{
  const n=ns.find(x=>x.textContent.trim().startsWith('Mahogany')); n&&n.click();});
await page.waitForSelector('#catalog article',{timeout:30000});
ok('now showing the wood line', /Wood/.test(await page.textContent('#lineChip')));
ok('and the collection within it', /Mahogany/.test(await page.textContent('#groupChipLabel')));
const woodCount=await page.textContent('#resultCount');
const woodModels=new Set(cat.woodProducts
  .filter(p=>p.line==='mahogany'&&!seVariantIds.has(p.id)).map(keyOf)).size;
ok('catalog switched to mahogany only, filters cleared',
   woodCount.startsWith(woodModels+' of '+woodModels), woodCount+' expected '+woodModels);
ok('no knotty alder card is in the mahogany catalogue',
   (await page.$$eval('#catalog article',ns=>ns.map(a=>a.querySelector('p').textContent.trim())))
     .every(l=>/Mahogany/i.test(l)));
ok('the search box was cleared on switch', (await page.inputValue('#q'))==='', await page.inputValue('#q'));

const m1=bySku('M1LV--3080'), m3=bySku('M3GPW--3068');
await addDoor('M1LV--3080','unfinished','singlePH',1);
const cm1=cost(m1.prices.unfinished.singlePH)+PREHANG;
u+=1;
exp=sell(unitCost,0.40)+sell(c2,0.40)+sell(c3,0.40)*3+sell(c4,0.40)*4+sell(cm1,0.40)+sell(band(u),0.40);
ok('mahogany added to a fiberglass quote', await total()===fmt(exp), await total()+' vs '+fmt(exp));

await addDoor('M3GPW--3068','prefinished','doublePH',1);
const cm2=cost(m3.prices.prefinished.doublePH)+PREHANG; u+=2;
exp=sell(unitCost,0.40)+sell(c2,0.40)+sell(c3,0.40)*3+sell(c4,0.40)*4+sell(cm1,0.40)+sell(cm2,0.40)+sell(band(u),0.40);
ok('mahogany double prehung', await total()===fmt(exp), await total()+' vs '+fmt(exp));
const lineCount=await page.$$eval('#quoteLines > div',n=>n.length);
ok('six lines on the quote', lineCount===6, String(lineCount));
await page.screenshot({path:OUT+'/s2-mixed.png'});

/* ---------------- a mahogany opening with two sidelites -------------------
   Sidelites belong to the opening, so they are chosen there and not in the
   accessory picker. The figures are recomputed here from the raw sheet. */
await page.click('#quoteTotals button:has-text("Clear")'); await page.waitForTimeout(600);
await page.click('#closeQuote').catch(()=>{}); await page.waitForTimeout(300);
const m1080=bySku('M1LV--3080');
/* Height and line alone used to decide this. The catalogue now says which
   sidelite belongs beside a door, so the expectation is recomputed the same
   way: the rule for the door's price-sheet page picks, height breaks the tie. */
const slRule=(cat.sideliteRules||[]).find(r=>r.appliesToPriceSheetPage===m1080.priceSheetPage);
const slAllows=p=>!slRule||!slRule.allowSkuPattern||new RegExp(slRule.allowSkuPattern).test(p.sku||'');
const mSL=cat.woodProducts.find(p=>p.type==='sidelite'&&p.line==='mahogany'&&slAllows(p)&&
  Math.abs(p.size.heightIn-m1080.size.heightIn)<=2&&p.prices.unfinished.singlePH!==null);
ok('a mahogany door has the sidelite its catalog page pairs with it', !!mSL,
   m1080.size.heightIn+'in door -> '+(mSL?mSL.sku:'none'));
await page.fill('#q',keyOf(m1080)); await page.waitForTimeout(600);
await page.$$eval('#catalog article',(ns,m)=>{
  ns.find(a=>a.querySelector('h3').textContent.trim()===m).querySelector('button').click();},keyOf(m1080));
await page.waitForSelector('#detail:not(.hidden)');
const pk2=async l=>{const h=await page.$$eval('#detail .steprow .opt',(ns,x)=>{
  const n=[...ns].reverse().find(m=>m.textContent.trim().startsWith(x)&&!m.disabled);
  if(!n)return false; n.click(); return true;},l);
  if(!h) throw new Error('cannot pick '+l); await page.waitForTimeout(250);};
/* Page 6 doors are asked their glass first now — the sheet prices one row per
   door and the code goes into the (--) at order time. */
const asks=async t=>(await page.$$eval('#detail .steprow',ns=>ns.map(r=>{
  const h=r.parentElement.querySelector('p'); return h?h.textContent.trim():'';}))).includes(t);
if(await asks('Glass')) await pk2('Clear Low E');
if(new Set(cat.woodProducts.filter(p=>keyOf(p)===keyOf(m1080)).map(p=>p.size.code)).size>1)
  await pk2(m1080.size.label);
await pk2('Unfinished'); await pk2('Single + 2 sidelites');
const slPicked=await page.$$eval('#detail .steprow',ns=>{
  const row=ns.find(r=>{const h=r.parentElement.querySelector('p');
    return h && h.textContent.trim()==='Sidelite';});
  return row ? [...row.querySelectorAll('.opt')].map(n=>n.textContent.trim()) : [];});
ok('only mahogany sidelites are offered beside a mahogany door',
   slPicked.length>0 && slPicked.every(o=>!/Knotty|KA /.test(o)), slPicked.slice(0,2).join(' | '));
await pk2(keyOf(mSL));
if(await asks('Sidelite glass')) await pk2('Clear Low E');
await pk2('Left hand'); await pk2('Inswing'); await pk2('4-9/16');
const withSL=cost(m1080.prices.unfinished.singlePH)+cost(mSL.prices.unfinished.singlePH)*2+PREHANG;
ok('door + 2 sidelites is ONE prehang charge',
   (await page.$eval('#detail .font-display.text-3xl',n=>n.textContent))===fmt(sell(withSL,0.40)),
   fmt(sell(withSL,0.40)));
await page.click('#detail button:has-text("Add to quote")'); await page.waitForTimeout(700);
const uSL=1+0.5+0.5;
exp=sell(withSL,0.40)+sell(band(uSL),0.40);
ok('and totals with its own crate band', await total()===fmt(exp), await total()+' vs '+fmt(exp));
ok('and counts 2 freight units', /2 freight units/.test(await totalsText()), (await totalsText()).slice(-90));

await page.click('#closeQuote').catch(()=>{}); await page.waitForTimeout(300);

/* --- a real opening built through the configurator ----------------------
   Door + 2 sidelites picked as an opening, with every figure recomputed here
   from the raw catalogue rather than asked of the engine. */
await page.click('#quoteTotals button:has-text("Clear")').catch(()=>{});
await page.waitForTimeout(500);
await page.click('#closeQuote').catch(()=>{}); await page.waitForTimeout(300);
await page.click('#lineChip'); await page.waitForTimeout(500);
await page.click('button:has-text("Start fresh")').catch(()=>{});
await page.waitForTimeout(400);
await enter('Fiberglass','Woodgrain');

const door=bySku('FG34LE1P3068RN')||cat.fiberglassProducts.find(p=>p.type==='door'&&
  p.prices.unfinished.singlePH!==null&&/3068/.test(p.description));
await page.fill('#q',keyOf(door)); await page.waitForTimeout(600);
await page.$$eval('#catalog article',(ns,m)=>{
  ns.find(a=>a.querySelector('h3').textContent.trim()===m).querySelector('button').click();},keyOf(door));
await page.waitForSelector('#detail:not(.hidden)');
const pk=async l=>{const h=await page.$$eval('#detail .steprow .opt',(ns,x)=>{
  const n=[...ns].reverse().find(m=>m.textContent.trim().startsWith(x)&&!m.disabled);
  if(!n)return false; n.click(); return true;},l);
  if(!h) throw new Error('cannot pick '+l); await page.waitForTimeout(250);};
if(new Set(cat.fiberglassProducts.filter(p=>keyOf(p)===keyOf(door)).map(p=>p.glazing)).size>1) await pk(door.glazing);
if(new Set(cat.fiberglassProducts.filter(p=>keyOf(p)===keyOf(door)).map(p=>p.size.code)).size>1) await pk(door.size.label);
await pk('No grille').catch(()=>{});
await pk('Unfinished');
await pk('Single + 2 sidelites');
const slOffered=await page.$$eval('#detail .steprow',ns=>{
  const row=ns.find(r=>{const h=r.parentElement.querySelector('p');
    return h && h.textContent.trim()==='Sidelite';});
  return row ? [...row.querySelectorAll('.opt')].map(n=>n.textContent.trim()) : [];});
ok('a 6-8 door is offered only 6-9 sidelites',
   slOffered.length>0 && slOffered.every(o=>/6'9"/.test(o)) && !slOffered.some(o=>/8'1"/.test(o)),
   slOffered.join(' | '));
const otherSkinNames=[...new Set(cat.fiberglassProducts
  .filter(p=>p.type==='sidelite'&&p.skin!==door.skin).map(keyOf))];
ok('and none from the other skin',
   otherSkinNames.length>0 && slOffered.every(o=>!otherSkinNames.some(n=>o.startsWith(n))),
   slOffered.join(' | '));
// The sidelite has to share the door's skin — a woodgrain door never takes a
// smooth-skin sidelite — as well as its height.
const sl=cat.fiberglassProducts.find(p=>p.type==='sidelite'&&p.size.heightIn===81&&
  p.skin===door.skin&&p.prices.unfinished.singlePH!==null);
ok('a sidelite of the door\'s own skin is offered', !!sl, door.skin);
await pk(keyOf(sl));
await pk('Left hand'); await pk('Inswing'); await pk('4-9/16');
const openingCost=cost(door.prices.unfinished.singlePH)+cost(sl.prices.unfinished.singlePH)*2+PREHANG;
const shownUnit=await page.$eval('#detail .font-display.text-3xl',n=>n.textContent);
ok('door + 2 sidelites is one prehang charge, recomputed from the sheet',
   shownUnit===fmt(sell(openingCost,0.40)), shownUnit+' vs '+fmt(sell(openingCost,0.40)));
await page.click('#detail button:has-text("Add to quote")'); await page.waitForTimeout(700);
const uOpen=1+0.5+0.5;
ok('the opening totals with its own crate band',
   await total()===fmt(sell(openingCost,0.40)+sell(band(uOpen),0.40)),
   await total()+' vs '+fmt(sell(openingCost,0.40)+sell(band(uOpen),0.40)));
ok('two sidelites read as two freight units', /2 freight units/.test(await totalsText()),
   (await totalsText()).slice(-90));
const openTxt=await page.textContent('#quoteLines');
ok('the quote records the whole opening spec',
   /Single \+ 2 sidelites/.test(openTxt) && /Left hand/.test(openTxt) &&
   /Inswing/.test(openTxt) && /4-9\/16" jamb/.test(openTxt), openTxt.replace(/\s+/g,' ').slice(0,220));
await page.screenshot({path:OUT+'/s4-opening.png'});
await page.click('#quoteTotals button:has-text("Clear")').catch(()=>{}); await page.waitForTimeout(500);
await page.click('#closeQuote').catch(()=>{}); await page.waitForTimeout(300);

/* --- the configurator on a phone, with the real stylesheet loaded ------- */
await page.click('#closeQuote').catch(()=>{});
await page.waitForTimeout(300);
await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(600);
// Both scope chips are visible here, and they are what last pushed the header
// past the viewport, so name the offender rather than only the symptom.
const overflow=await page.evaluate(()=>[...document.querySelectorAll('header *')]
  .filter(n=>n.getBoundingClientRect().right>window.innerWidth+1)
  .map(n=>n.tagName+(n.id?'#'+n.id:'')));
ok('the header fits a phone with both scope chips showing',
   overflow.length===0 &&
   (await page.isVisible('#lineChip')) && (await page.isVisible('#groupChip')),
   overflow.join(', ')||'chips visible');
await page.fill('#q','3/4 Lite 1 Panel - Mahogany'); await page.waitForTimeout(600);
await page.$$eval('#catalog article',ns=>ns.find(a=>
  a.querySelector('h3').textContent.trim()==='3/4 Lite 1 Panel - Mahogany Grain Skin').querySelector('button').click());
await page.waitForSelector('#detail:not(.hidden)'); await page.waitForTimeout(400);
const pick2=async l=>{await page.$$eval('#detail .opt',(ns,x)=>{
  const n=ns.find(m=>m.textContent.trim().startsWith(x)&&!m.disabled); n.click();},l); await page.waitForTimeout(300);};
await pick2('Clear Low E'); await pick2("3'0\" x 6'8\"");
const sheet=await page.$eval('#detail',n=>({s:n.scrollWidth,c:n.clientWidth}));
ok('the ten iron-grille styles wrap instead of scrolling the sheet sideways',
   sheet.s<=sheet.c+1, sheet.s+' vs '+sheet.c);
ok('the page itself never scrolls sideways on a phone',
   await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
await page.screenshot({path:OUT+'/s3-mobile-config.png'});

/* --- the price and the Add button stay under the thumb on a phone -------
   The questions run well past the fold, so reaching Add used to mean
   scrolling the whole sheet. The bar is pinned to the foot of the sheet
   while the answers scroll behind it. */
const finish=async()=>{
  for(let i=0;i<24;i++){
    const can=await page.$$eval('#detail button',
      ns=>!!ns.find(x=>x.textContent.trim()==='Add to quote'&&!x.disabled)).catch(()=>false);
    if(can) return true;
    const picked=await page.$$eval('#detail .steprow',rows=>{
      for(let i=rows.length-1;i>=0;i--){
        const b=rows[i].querySelector('button.opt:not([disabled])[aria-pressed="false"]');
        if(b){b.click();return true;} } return false;}).catch(()=>false);
    if(!picked) return false;
    await page.waitForTimeout(240);
  }
  return false;
};
ok('the phone sheet can be answered through to a price', await finish());
const pinned=async()=>page.evaluate(()=>{
  const bar=document.querySelector('#detail .addbar');
  if(!bar) return null;
  const r=bar.getBoundingClientRect();
  return {h:Math.round(r.height), bottom:Math.round(r.bottom), vh:window.innerHeight,
          onScreen:r.top<window.innerHeight&&r.bottom>0,
          price:/\$[\d,]+\.\d\d/.test(bar.textContent),
          add:!!bar.querySelector('#addBarBtn')};
});
const atFoot=await pinned();
ok('a price and an Add button are pinned to the foot of the phone sheet',
   !!atFoot && atFoot.onScreen && atFoot.price && atFoot.add, JSON.stringify(atFoot));
ok('and the bar sits at the bottom edge of the viewport',
   atFoot.bottom<=atFoot.vh+2 && atFoot.bottom>=atFoot.vh-2, atFoot.bottom+' vs '+atFoot.vh);
// Scroll the sheet back to its first question: the bar must not go with it.
await page.$eval('#detail',n=>{n.scrollTop=0;}); await page.waitForTimeout(300);
const atTop=await pinned();
ok('and it stays there when the answers scroll behind it',
   atTop.onScreen && atTop.bottom<=atTop.vh+2, JSON.stringify(atTop));
// The pinned button and the one in the block below must do the same thing.
const before=Number(await page.textContent('#quoteCount'));
await page.click('#addBarBtn'); await page.waitForTimeout(800);
ok('tapping the pinned button puts the door on the quote',
   Number(await page.textContent('#quoteCount'))>before,
   before+' -> '+(await page.textContent('#quoteCount')));
ok('the desktop quote strip stays off a phone, which has its own bar',
   !(await page.isVisible('#quoteStrip')) && (await page.isVisible('#mobileBar')));
await page.screenshot({path:OUT+'/s5-phone-addbar.png'});

/* --- the running quote, above the catalogue on a desktop ---------------- */
await page.click('#closeQuote').catch(()=>{}); await page.waitForTimeout(300);
await page.setViewportSize({width:1440,height:900}); await page.waitForTimeout(700);
ok('the pinned phone bar is not shown on a desktop, where the sheet fits',
   !(await page.isVisible('#detail .addbar')));
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
ok('the quote strip is shown once the quote has lines', await page.isVisible('#quoteStrip'));
const stripTxt=(await page.textContent('#quoteStrip')).replace(/\s+/g,' ').trim();
const drawerTotal=(await page.$eval('#quoteTotals .font-display.text-2xl',n=>n.textContent)).trim();
ok('and its total is the drawer total, to the cent',
   stripTxt.includes(drawerTotal), stripTxt+'  vs drawer '+drawerTotal);
ok('it names the tier the prices are at',
   /Retail pricing|Builder pricing|your cost/.test(stripTxt), stripTxt);
// It rides inside the sticky filter bar, so it survives scrolling the catalogue.
await page.evaluate(()=>window.scrollTo(0,1200)); await page.waitForTimeout(400);
ok('and it stays on screen as the catalogue scrolls', await page.evaluate(()=>{
  const r=document.querySelector('#quoteStrip').getBoundingClientRect();
  return r.top>=0 && r.bottom<=window.innerHeight;}));
await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(300);
await page.click('#stripOpen'); await page.waitForTimeout(500);
ok('Open quote on the strip opens the drawer',
   (await page.getAttribute('#drawer','data-open'))==='true');
await page.click('#closeQuote'); await page.waitForTimeout(400);

/* The job details live in the drawer, and the strip can be reached without
   ever opening it. An unnamed quote must not print an estimate addressed to
   nobody — and spend a quote number doing it. */
await page.fill('#job_customer',''); await page.waitForTimeout(300);
ok('an unnamed quote offers to name itself rather than to print',
   (await page.textContent('#stripPrint')).trim()==='Name this quote',
   (await page.textContent('#stripPrint')).trim());
await page.evaluate(()=>{document.querySelector('#printDoc').textContent='';});
await page.click('#stripPrint'); await page.waitForTimeout(500);
ok('and pressing it opens the drawer at the customer field, printing nothing',
   (await page.getAttribute('#drawer','data-open'))==='true' &&
   (await page.evaluate(()=>document.activeElement.id))==='job_customer' &&
   (await page.evaluate(()=>document.querySelector('#printDoc').textContent.trim()))==='',
   await page.evaluate(()=>document.activeElement.id));
await page.fill('#job_customer','Strip Test'); await page.waitForTimeout(400);
await page.click('#closeQuote'); await page.waitForTimeout(400);
ok('once it is named the button prints',
   (await page.textContent('#stripPrint')).trim()==='Print quote',
   (await page.textContent('#stripPrint')).trim());
await page.click('#stripPrint'); await page.waitForTimeout(900);
ok('and printing from the strip produces the same estimate the drawer does',
   await page.evaluate(()=>/SD-\d+/.test(document.querySelector('#printDoc').textContent) &&
                           /Customer Signature/.test(document.querySelector('#printDoc').textContent)));
await page.screenshot({path:OUT+'/s6-quote-strip.png'});
await page.click('#quoteTotals button:has-text("Clear")').catch(()=>{});
await page.click('#openQuote').catch(()=>{}); await page.waitForTimeout(300);
await page.click('#quoteTotals button:has-text("Clear")').catch(()=>{}); await page.waitForTimeout(500);
await page.click('#closeQuote').catch(()=>{}); await page.waitForTimeout(400);
ok('and it goes away again when the quote is cleared', !(await page.isVisible('#quoteStrip')));

/* ------------------- a third line, and the header chip -------------------
   With two lines the chip means "the other one" and goes straight there. The
   catalogue is split by vendor price sheet, so a third sheet makes a third
   line on its own — and then there is no "the other one" to go to. The chip
   used to jump to whichever the catalogue listed first, silently. It should
   ask instead, the same way the app asked on the first screen. */
const three = JSON.parse(JSON.stringify(cat));
three.steelProducts = cat.woodProducts.filter(p => p.type === 'door').slice(0, 6)
  .map((p, i) => Object.assign({}, p, {
    id: 'steeltest' + i, sku: 'ST' + i + (p.sku || ''), line: 'steel',
    description: p.description.replace(/^(\d{4,5}[A-Z]?\s+)?/, '$1Steel ')
  }));
const p3 = await (await b.newContext({viewport:{width:1500,height:1000}})).newPage();
const errs3 = [];
p3.on('pageerror', e => errs3.push(e.message));
p3.on('console', m => { if (m.type()==='error' && !/Failed to load resource/.test(m.text())) errs3.push(m.text()); });
await p3.route('**/data/catalog.json', r =>
  r.fulfill({status:200, contentType:'application/json', body: JSON.stringify(three)}));
await p3.goto(BASE + '/quoter/');
await p3.waitForSelector('#lineGate:not(.hidden)', {timeout:30000});
const gateTitles = () => p3.$$eval('#lineChoices h3', ns => ns.map(n => n.textContent.trim()));
ok('a third price sheet becomes a third line on the opening screen',
   (await gateTitles()).length === 3, (await gateTitles()).join(' | '));

await p3.click('#lineChoices button:has-text("Wood")'); await p3.waitForTimeout(500);
await p3.click('#lineChoices button:has-text("Mahogany")'); await p3.waitForTimeout(900);
await p3.waitForSelector('#catalog article', {timeout:30000});
await p3.$eval('#catalog article button', n => n.click()); await p3.waitForTimeout(600);
/* Answer whatever this door happens to ask — which door it is does not matter
   here, only that the quote ends up holding one from the wood line. */
for (let i = 0; i < 20; i++) {
  const add = await p3.$$eval('#detail button',
    ns => { const b = ns.find(x => x.textContent.trim() === 'Add to quote' && !x.disabled);
            if (!b) return false; b.click(); return true; }).catch(() => false);
  if (add) break;
  // The answered steps stay on the sheet, so it is the LAST block that holds
  // the question still open.
  const picked = await p3.$$eval('#detail .steprow',
    rows => { for (let i = rows.length - 1; i >= 0; i--) {
      const b = rows[i].querySelector('button.opt:not([disabled])[aria-pressed="false"]');
      if (b) { b.click(); return true; } } return false; }).catch(() => false);
  if (!picked) break;
  await p3.waitForTimeout(260);
}
await p3.waitForTimeout(600);
// Whatever happened above, nothing modal may be left over the header.
await p3.keyboard.press('Escape'); await p3.waitForTimeout(250);
await p3.keyboard.press('Escape'); await p3.waitForTimeout(350);
const held = await p3.textContent('#quoteCount');
ok('a wood door is on the quote', Number(held) > 0, held);

await p3.click('#lineChip'); await p3.waitForTimeout(500);
ok('the chip still asks about the quote before leaving the line',
   await p3.isVisible('text=Start fresh'));
ok('and does not name a line it cannot know the dealer wants',
   await p3.isVisible('text=Switch line?'),
   (await p3.textContent('[role="dialog"] h3').catch(()=>'')) || '');
await p3.click('button:has-text("Keep them")'); await p3.waitForTimeout(700);
ok('it puts the three choices back up rather than jumping to the first',
   (await p3.isVisible('#lineGate')) && (await gateTitles()).length === 3,
   (await gateTitles()).join(' | '));
await p3.click('#lineChoices button:has-text("Fiberglass")'); await p3.waitForTimeout(1200);
const chipNow = (await p3.textContent('#lineChipLabel')).trim();
ok('and the line the dealer picked is the one shown', chipNow === 'Fiberglass', chipNow || '(blank)');
const heldNow = await p3.textContent('#quoteCount');
ok('with the wood door still on the quote', heldNow === held, heldNow + ' vs ' + held);
ok('no console or page errors on the three-line catalogue', errs3.length === 0, errs3.slice(0,2).join(' | '));

ok('no console or page errors', errs.length===0, errs.slice(0,2).join(' | '));
console.log(T.join('\n'));
console.log('\n'+T.filter(t=>t.startsWith('PASS')).length+' passed, '+T.filter(t=>t.startsWith('FAIL')).length+' failed');
await b.close(); srv.close();
process.exit(T.some(t=>t.startsWith('FAIL'))?1:0);
