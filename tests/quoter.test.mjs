// Playwright is resolved at run time so the suite is not tied to one machine's
// install path: set PLAYWRIGHT_MODULE to override.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ||
  '/opt/node22/lib/node_modules/playwright/index.mjs');
import http from 'node:http'; import fs from 'node:fs';
import path from 'node:path'; import url from 'node:url';
import { createEngine, applyMargin, formatCents } from '../packages/pricing-engine/index.js';

const ROOT=path.resolve(url.fileURLToPath(import.meta.url),'../..');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.webp':'image/webp'};
const srv=http.createServer((q,r)=>{
  const p=decodeURIComponent(q.url.split('?')[0]);
  const f=ROOT+(p.endsWith('/')?p+'index.html':p);
  try{ const b=fs.readFileSync(f);
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); r.end(b);
  }catch(e){ r.writeHead(404,{'Content-Type':'text/plain'}); r.end('nf'); }
});
await new Promise(r=>srv.listen(8097,r));

const catalog=JSON.parse(fs.readFileSync(ROOT+'/data/catalog.json','utf8'));
const rules  =JSON.parse(fs.readFileSync(ROOT+'/data/pricing-rules.json','utf8'));
const engine =createEngine(catalog,rules);
const RETAIL={marginTier:'retail'}, BUILDER={marginTier:'builder'};

/* --- expectations recomputed here, from the catalogue, not from the app --- */
const SIZE_PREFIX=/^\d{4,5}[A-Z]?\s+/;
const keyOf=p=>{
  const d=String(p.description||'').trim(), code=p.size&&p.size.code;
  if(code&&d.startsWith(code)&&/^\s/.test(d.slice(String(code).length))) return d.slice(String(code).length).trim();
  return d.replace(SIZE_PREFIX,'').trim();
};
const grilleRows=catalog.fiberglassIronGrilles||[];
const stainRows =catalog.fiberglassStainColors||[];
const optionOnly=new Set(grilleRows.map(g=>g.productId));
function modelsOf(collection){
  const map=new Map();
  for(const p of engine.productsIn(collection)){
    if(optionOnly.has(p.id)) continue;
    const key=keyOf(p);
    if(!map.has(key)) map.set(key,{name:key,products:[]});
    map.get(key).products.push(p);
  }
  return [...map.values()].map(m=>({...m,
    sizes:[...new Set(m.products.map(p=>p.size&&p.size.code).filter(Boolean))],
    glazings:[...new Set(m.products.map(p=>p.glazing).filter(Boolean))],
    grilles:grilleRows.filter(g=>g.baseModel===m.name)}));
}
const FG=modelsOf('fiberglass'), WOOD=modelsOf('wood');
const unitSell=(id,f,c)=>engine.priceLine({productId:id,finish:f,config:c,qty:1},engine.marginFor('retail')).unitSellCents;
function fromOf(p){
  let best=null;
  for(const f of ['unfinished','prefinished']) for(const c of ['slab','singlePH','doublePH']){
    if(!engine.availableOptions(p.id).isOffered(f,c)) continue;
    const v=unitSell(p.id,f,c); if(v!==null&&(best===null||v<best)) best=v;
  }
  return best;
}
const modelFrom=m=>m.products.map(fromOf).filter(v=>v!==null).reduce((a,b)=>Math.min(a,b),Infinity);

const T=[]; const ok=(n,c,x='')=>T.push((c?'PASS':'FAIL')+'  '+n+(x?'  :: '+x:''));
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const page=await ctx.newPage();
const errs=[]; const req404=[];
page.on('console',m=>{if(m.type()==='error'&&!/favicon|404|Failed to load resource/i.test(m.text()))errs.push(m.text());});
page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
page.on('response',r=>{ if(r.status()===404) req404.push(r.url().split('/').pop()); });

const openModel=async name=>{
  await page.click('#clearFilters'); await page.waitForTimeout(200);
  await page.fill('#q',name); await page.waitForTimeout(450);
  await page.$$eval('#catalog article',(ns,n)=>{
    const hit=ns.find(a=>a.querySelector('h3').textContent.trim()===n);
    hit.querySelector('button').click();
  },name);
  await page.waitForSelector('#detail:not(.hidden)');
};
const steps = ()=>page.$$eval('#detail .steprow',ns=>ns.map(r=>{
  const h=r.parentElement.querySelector('p'); return h?h.textContent.trim():'';
}).filter(Boolean));
const frame = async ()=>{ await pick('Left hand'); await pick('Inswing'); await pick('4-9/16'); };
const pick = async (label)=>{
  await page.$$eval('#detail .opt',(ns,l)=>{const h=ns.find(n=>n.textContent.trim().startsWith(l)&&!n.disabled); h.click();},label);
  await page.waitForTimeout(250);
};

const t0=Date.now();
await page.goto('http://127.0.0.1:8097/quoter/');
await page.waitForSelector('#lineGate:not(.hidden)',{timeout:30000});
ok('asks which line before showing any product', await page.isVisible('#lineGate'));
ok('no catalog is rendered until a line is chosen',
   (await page.$$eval('#catalog article',n=>n.length))===0);
const choices=await page.$$eval('#lineChoices button',ns=>ns.map(n=>n.textContent.replace(/\s+/g,' ').trim()));
ok('offers exactly the catalogue collections', choices.length===2 &&
   choices.some(c=>/Fiberglass/.test(c)) && choices.some(c=>/Wood/.test(c)), choices.join(' | '));
const fgDoorModels=new Set(engine.productsIn('fiberglass')
  .filter(p=>p.type!=='sidelite'&&!optionOnly.has(p.id)).map(keyOf)).size;
ok('the gate counts the doors the catalogue will actually show',
   choices.some(c=>c.includes(fgDoorModels+' doors')), choices.join(' | ')+' expected '+fgDoorModels);
await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/Fiberglass/.test(n.textContent)).click();});
await page.waitForSelector('#catalog article',{timeout:30000});
ok('quoter boots and renders cards', true, (Date.now()-t0)+'ms');
ok('imports the pricing engine module', !req404.some(u=>u==='index.js'), req404.slice(0,3).join(','));

/* This suite runs with cdn.tailwindcss.com unreachable, so it exercises the
   built-in fallback stylesheet — the state a customer lands in when the CDN
   is blocked or down. */
ok('runs against the no-Tailwind fallback stylesheet',
   await page.evaluate(()=>document.documentElement.classList.contains('no-tw')));
const fat=await page.$$eval('svg',ns=>ns.map(n=>{const r=n.getBoundingClientRect();
  return {w:Math.round(r.width),h:Math.round(r.height),c:n.getAttribute('class')||''};})
  .filter(x=>x.w>320||x.h>420));
ok('no icon balloons to fill the page without Tailwind', fat.length===0, JSON.stringify(fat.slice(0,3)));
ok('the fallback never scrolls the page sideways',
   await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));

/* ---------------- one card per door model, not per part number ----------- */
const countTxt=await page.textContent('#resultCount');
ok('collapses part numbers into one card per model', new RegExp('^'+FG.length+' of '+FG.length+' doors').test(countTxt),
   countTxt+' expected '+FG.length);
ok('the catalogue really is many parts per model', engine.productsIn('fiberglass').length>FG.length*4,
   engine.productsIn('fiberglass').length+' parts / '+FG.length+' models');
const headings=await page.$$eval('#catalog article h3',ns=>ns.map(n=>n.textContent.trim()));
ok('no card heading repeats a size code',
   headings.every(h=>!/^\d{4}/.test(h)), headings.filter(h=>/^\d{4}/.test(h)).join(' | '));
ok('card headings are unique', new Set(headings).size===headings.length);
const iron=FG.find(m=>m.grilles.length);
const ironCard=await page.$$eval('#catalog article',(ns,n)=>{
  const a=ns.find(x=>x.querySelector('h3').textContent.trim()===n);
  return a?a.querySelector('p.text-xs').textContent:null;},iron.name);
ok('a card says when a door can take an iron grille', /iron grille available/.test(ironCard||''), String(ironCard));
ok('a card counts its glass options', /\d+ glass options/.test(ironCard||''), String(ironCard));
const cardPrice=await page.$$eval('#catalog article',(ns,n)=>{
  const a=ns.find(x=>x.querySelector('h3').textContent.trim()===n);
  return a.querySelector('.font-display.text-xl').textContent;},iron.name);
ok('card "from" price is the cheapest variant, per the engine',
   cardPrice===formatCents(modelFrom(iron)), cardPrice+' vs '+formatCents(modelFrom(iron)));

/* ---------------- image fallback ---------------------------------------- */
for(let y=0;y<6;y++){ await page.mouse.wheel(0,1400); await page.waitForTimeout(200); }
await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(400);
const svgCount=await page.$$eval('#catalog article svg[role="img"]',n=>n.length);
const broken=await page.$$eval('#catalog article img',ns=>ns.filter(i=>i.complete&&i.naturalWidth===0).length);
ok('every attempted photo falls back to a drawn silhouette', broken===0&&svgCount>=FG.length,
   'svg='+svgCount+' broken='+broken);

/* ---------------- filters still scope the model list -------------------- */
await page.selectOption('#fType','sidelite'); await page.waitForTimeout(400);
const slExp=FG.filter(m=>m.products.some(p=>p.type==='sidelite')).length;
ok('type filter scopes to models holding a match',
   (await page.textContent('#resultCount')).startsWith(String(slExp)), 'expected '+slExp);
await page.click('#clearFilters'); await page.waitForTimeout(300);

/* ---------------- the guided configurator ------------------------------- */
await openModel(iron.name);
ok('the configurator opens on the model, not a part number',
   (await page.textContent('#detailTitle')).trim()===iron.name);
let s=await steps();
ok('it asks for the glass first', s[0]==='Glass', s.join(' > '));
ok('it asks nothing else until the glass is answered', s.length===1, s.join(' > '));
ok('no price is shown before the questions are answered',
   /Answer the questions above/.test(await page.textContent('#detail')));
const glassOpts=await page.$$eval('#detail .opt',ns=>ns.map(n=>n.textContent.trim()));
ok('every glass the model is offered in is listed',
   iron.glazings.every(g=>glassOpts.some(o=>o.startsWith(g))), glassOpts.join(' | '));

await pick(iron.glazings[0]);
s=await steps();
ok('answering the glass reveals the size question', s[1]==='Size', s.join(' > '));
ok('and still nothing beyond it', s.length===2, s.join(' > '));

const gsize=iron.grilles[0].sizeCode;
const sizeLabel=iron.products.find(p=>p.size&&p.size.code===gsize).size.label;
await pick(sizeLabel);
s=await steps();
ok('answering the size reveals the iron grille question', s[2]==='Iron grille', s.join(' > '));
const grilleOpts=await page.$$eval('#detail .opt',ns=>ns.map(n=>n.textContent.trim()));
ok('the grille styles for that size are offered',
   iron.grilles[0].styles.every(st=>grilleOpts.includes(st)),
   iron.grilles[0].styles.join(',')+' vs '+grilleOpts.join('|'));
ok('declining a grille is an explicit choice', grilleOpts.includes('No grille'));

await pick('No grille');
s=await steps();
ok('then it asks for the finish', s[3]==='Finish', s.join(' > '));
ok('the stain question is not asked yet', !s.includes('Stain colour'), s.join(' > '));

await pick('Unfinished');
s=await steps();
ok('unfinished never asks for a stain colour', !s.includes('Stain colour'), s.join(' > '));
ok('unfinished goes straight to the opening', s[4]==='Opening', s.join(' > '));

await pick('Prefinished');
s=await steps();
ok('prefinished asks for the stain colour', s[4]==='Stain colour', s.join(' > '));
const stainOpts=await page.$$eval('#detail .opt',ns=>ns.map(n=>n.textContent.trim()));
ok('every published stain colour is offered',
   stainRows.every(sc=>stainOpts.some(o=>o.startsWith(sc.name))), stainRows.map(x=>x.name).join(','));
ok('the opening question waits for the stain', !s.includes('Opening'), s.join(' > '));
await pick(stainRows[0].name);
s=await steps();
ok('answering the stain reveals the opening', s.includes('Opening'), s.join(' > '));

/* --- the opening, then the frame spec, then the price ------------------- */
await pick('Single door');
s=await steps();
ok('choosing a prehung opening asks the handing next',
   s[s.length-1]==='Handing', s.join(' > '));
ok('no price until the frame is specified',
   /Answer the questions above/.test(await page.textContent('#detail')));
const handOpts=await page.$$eval('#detail .steprow .opt',ns=>ns.map(n=>n.textContent.trim()));
ok('handing is asked as left or right',
   handOpts.includes('Left hand')&&handOpts.includes('Right hand'), handOpts.slice(-8).join(' | '));
await pick('Left hand');
s=await steps();
ok('answering the handing asks the swing', s[s.length-1]==='Swing', s.join(' > '));
const swingOpts=await page.$$eval('#detail .steprow .opt',ns=>ns.map(n=>n.textContent.trim()));
ok('swing is asked as inswing or outswing',
   swingOpts.includes('Inswing')&&swingOpts.includes('Outswing'), swingOpts.slice(-6).join(' | '));
await pick('Inswing');
s=await steps();
ok('answering the swing asks the jamb depth', s[s.length-1]==='Jamb depth', s.join(' > '));
const jambOpts=await page.$$eval('#detail .steprow .opt',ns=>ns.map(n=>n.textContent.trim()));
ok('both catalogued jamb depths are offered',
   rules.openingSpec.jambDepths.options.every(d=>jambOpts.includes(d+'"')), jambOpts.slice(-4).join(' | '));
ok('the jamb depth is not charged', /no price difference/.test(await page.textContent('#detail')));
await pick('4-9/16');
const prod=iron.products.find(p=>(p.size&&p.size.code)===gsize && p.glazing===iron.glazings[0]);
const expLine=engine.priceLine({productId:prod.id,finish:'prefinished',config:'singlePH',qty:1},engine.marginFor('retail'));
const shown=await page.$eval('#detail .font-display.text-3xl',n=>n.textContent);
ok('unit price equals the engine, for the exact part the answers resolve to',
   shown===formatCents(expLine.unitSellCents), shown+' vs '+formatCents(expLine.unitSellCents)+' ('+prod.sku+')');
ok('the resolved part number is disclosed', (await page.textContent('#detail')).includes(prod.sku));
ok('the answers are echoed back', (await page.textContent('#detail')).includes(stainRows[0].name));
ok('prehang charge is disclosed', /prehang charge per opening/.test(await page.textContent('#detail')));

/* --- the progress rail shows where you are, and takes an answer back ---- */
const rail=()=>page.$$eval('#detail .flex.flex-wrap.gap-1\\.5 > *',ns=>ns.map(n=>n.textContent.trim()));
const railNow=await rail();
ok('the rail records every answer given',
   [iron.glazings[0], sizeLabel, 'No grille', 'Prefinished', stainRows[0].name, 'Single door',
    'Left hand', 'Inswing', '4-9/16"']
     .every(v=>railNow.includes(v)), railNow.join(' | '));
ok('the rail says the configurator is finished',
   /ALL SET/i.test(await page.textContent('#detail')), (await rail()).join(' | '));
await page.$$eval('#detail .flex.flex-wrap.gap-1\\.5 button',ns=>{
  ns.find(n=>/Prefinished/.test(n.textContent)).click();});
await page.waitForTimeout(300);
s=await steps();
ok('taking back the finish takes back what depended on it',
   s[s.length-1]==='Finish', s.join(' > '));
ok('and the price goes away with it',
   /Answer the questions above/.test(await page.textContent('#detail')));
await pick('Prefinished'); await pick(stainRows[0].name); await pick('Single door'); await frame();
ok('re-answering restores the price', !!(await page.$('#detail .font-display.text-3xl')));

/* --- the opening: slab, sidelites and a double door --------------------- */
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await openModel(iron.name);
await pick(iron.glazings[0]); await pick(sizeLabel); await pick('No grille'); await pick('Unfinished');
await pick('Slab only');
s=await steps();
ok('a slab has no frame, so it is never asked about handing or jamb',
   !s.includes('Handing')&&!s.includes('Swing')&&!s.includes('Jamb depth'), s.join(' > '));
ok('a slab prices straight away', !!(await page.$('#detail .font-display.text-3xl')));

// back to the opening and take the two-sidelite route
await page.$$eval('#detail .steprow .opt',ns=>{ns.find(n=>n.textContent.trim().startsWith('Single + 2 sidelites')).click();});
await page.waitForTimeout(300);
s=await steps();
ok('two sidelites makes the app ask which sidelite', s[s.length-1]==='Sidelite', s.join(' > '));
const slOpts=await page.$$eval('#detail .steprow',ns=>{
  const last=ns[ns.length-1]; return [...last.querySelectorAll('.opt')].map(n=>n.textContent.trim());});
const doorH=prod.size.heightIn;
const slAll=engine.productsIn('fiberglass').filter(p=>p.type==='sidelite');
const slFit=slAll.filter(p=>Math.abs(p.size.heightIn-doorH)<=2);
const fitLabels =[...new Set(slFit.map(p=>p.size.label))];
const missLabels=[...new Set(slAll.filter(p=>Math.abs(p.size.heightIn-doorH)>2).map(p=>p.size.label))];
ok('only sidelites that match the door height are offered',
   slOpts.length>0 && missLabels.length>0 &&
   slOpts.every(o=>fitLabels.some(l=>o.includes(l))) &&
   slOpts.every(o=>!missLabels.some(l=>o.includes(l))),
   'door '+doorH+'in, offered '+slOpts.length+' of '+slAll.length+
   ', fit='+fitLabels.join(',')+' excluded='+missLabels.join(','));

ok('one option per sidelite model and width, not per part number',
   new Set(slOpts.map(o=>o.split('$')[0])).size===slOpts.length, slOpts.join(' | '));

const chosenSL=slAll.find(p=>Math.abs(p.size.heightIn-doorH)<=2 &&
  engine.availableOptions(p.id).isOffered('unfinished','singlePH'));
await page.$$eval('#detail .steprow .opt',(ns,n)=>{
  const hit=[...ns].reverse().find(x=>x.textContent.trim().startsWith(n)); hit.click();},
  chosenSL.description.replace(/^\d{4,5}\s+/,''));
await page.waitForTimeout(300);
await frame();
const slLine=engine.priceLine({productId:prod.id,finish:'unfinished',config:'singlePH',qty:1,
  accessories:[{kind:'product',id:chosenSL.id,qty:2,finish:'unfinished',config:'singlePH'}]},
  engine.marginFor('retail'));
ok('a door with two sidelites prices as one opening through the engine',
   (await page.$eval('#detail .font-display.text-3xl',n=>n.textContent))===formatCents(slLine.unitSellCents),
   formatCents(slLine.unitSellCents));
ok('and carries exactly one prehang charge',
   slLine.prehungOpenings===1 && slLine.freightCents===engine.prehangChargeCents,
   slLine.prehungOpenings+' opening / '+slLine.freightCents);
ok('the sidelites count half a freight unit each', slLine.freightUnits===2, String(slLine.freightUnits));
await page.click('#detail button:has-text("Add to quote")'); await page.waitForTimeout(500);
const slText=await page.textContent('#quoteLines');
ok('the quote line names the opening, not the raw configuration',
   /Single \+ 2 sidelites/.test(slText) && !/Single prehung/.test(slText), slText.slice(0,200));
ok('the quote line carries the handing, swing and jamb',
   /Left hand/.test(slText) && /Inswing/.test(slText) && /4-9\/16" jamb/.test(slText), slText.slice(0,260));
ok('the quote line counts both sidelites', /2 × /.test(slText), slText.slice(0,260));
await page.click('#quoteTotals button:has-text("Clear")').catch(()=>{});
await page.waitForTimeout(400);
await page.click('#closeQuote').catch(()=>{}); await page.waitForTimeout(300);

/* --- a double door is two leaves ---------------------------------------- */
const dbl=FG.find(m=>m.products.some(p=>engine.availableOptions(p.id).isOffered('unfinished','doublePH')));
await openModel(dbl.name);
const dblSteps=async()=>await steps();
for(const g of [dbl.glazings[0]]) if(dbl.glazings.length>1) await pick(g);
if(dbl.sizes.length>1) await pick((dbl.products.find(p=>p.size)||{}).size.label);
if(dbl.grilles.length) await pick('No grille');
await pick('Unfinished'); await pick('Double door'); await frame();
const dblProd=await page.textContent('#detail');
const dp=dbl.products.find(p=>engine.availableOptions(p.id).isOffered('unfinished','doublePH')&&
                              dblProd.includes(p.sku));
ok('a double door resolves to the doublePH price', !!dp, 'looked for a doublePH part in the sheet');
if(dp){
  const dExp=engine.priceLine({productId:dp.id,finish:'unfinished',config:'doublePH',qty:1},engine.marginFor('retail'));
  ok('double door unit price equals the engine',
     (await page.$eval('#detail .font-display.text-3xl',n=>n.textContent))===formatCents(dExp.unitSellCents),
     formatCents(dExp.unitSellCents));
  ok('a double door counts two freight units', dExp.freightUnits===2, String(dExp.freightUnits));
  ok('but still only one prehang charge', dExp.prehungOpenings===1);
}
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

/* --- a row the price list prints without a part number ------------------ */
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await openModel(iron.name);
await pick(iron.glazings[0]); await pick(sizeLabel);
await pick(iron.grilles[0].styles[0]); await pick('Unfinished'); await pick('Slab only'); 
const cfgText=await page.textContent('#detail');
ok('an iron-grille door is priced as its own configured item',
   /configured item/i.test(cfgText) && !/CFG-00/.test(cfgText),
   cfgText.slice(cfgText.indexOf('Quantity')-160, cfgText.indexOf('Quantity')));
const gp=engine.productById(iron.grilles[0].productId);
const gExp=engine.priceLine({productId:gp.id,finish:'unfinished',config:'slab',qty:1},engine.marginFor('retail'));
ok('the grille price is the grille row, not the plain door',
   (await page.$eval('#detail .font-display.text-3xl',n=>n.textContent))===formatCents(gExp.unitSellCents),
   formatCents(gExp.unitSellCents));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

/* --- a glass that costs more shows the difference up front -------------- */
const priced=FG.find(m=>{
  if(m.glazings.length<2) return 1===0;
  const size=m.sizes[0];
  const vals=m.glazings.map(g=>{
    const ps=m.products.filter(p=>p.glazing===g&&(p.size&&p.size.code)===size).map(fromOf).filter(v=>v!==null);
    return ps.length?Math.min(...ps):null;}).filter(v=>v!==null);
  return new Set(vals).size>1;
});
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await openModel(priced.name);
const deltas=await page.$$eval('#detail .opt span.text-\\[10px\\]',ns=>ns.map(n=>n.textContent.trim()));
ok('a dearer glass shows what it adds', deltas.some(d=>/^\+\$/.test(d)), priced.name+' :: '+deltas.join(','));

/* ---------------- add to quote, totals, tiers --------------------------- */
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
const simple=FG.find(m=>m.glazings.length<=1&&m.sizes.length===1&&!m.grilles.length&&
  m.products.some(p=>engine.availableOptions(p.id).isOffered('unfinished','slab')));
await openModel(simple.name);
s=await steps();
ok('a model with one glass and one size never asks about them',
   !s.includes('Glass')&&!s.includes('Size'), simple.name+' :: '+s.join(' > '));
await pick('Unfinished'); await pick('Slab only'); 
await page.click('#detail button:has-text("Add to quote")'); await page.waitForTimeout(500);
const sp=simple.products[0];
const expQuote=engine.priceQuote({lines:[{productId:sp.id,finish:'unfinished',config:'slab',qty:1}],...RETAIL});
const qTotal=await page.$eval('#quoteTotals .font-display.text-2xl',n=>n.textContent);
ok('quote total equals the engine grandTotalSellCents', qTotal===formatCents(expQuote.grandTotalSellCents),
   qTotal+' vs '+formatCents(expQuote.grandTotalSellCents));

await page.click('#drawerMode'); await page.waitForTimeout(400);
ok('cost mode shows totalCostCents',
   (await page.$eval('#quoteTotals .font-display.text-2xl',n=>n.textContent))===formatCents(expQuote.totalCostCents));
ok('cost mode is visually flagged', await page.isVisible('#costBanner'));
await page.click('#drawerMode'); await page.waitForTimeout(400);

await page.click('#quoteLines button[data-qty=inc]'); await page.waitForTimeout(400);
const exp2=engine.priceQuote({lines:[{productId:sp.id,finish:'unfinished',config:'slab',qty:2}],...RETAIL});
ok('quantity change re-prices through the engine',
   (await page.$eval('#quoteTotals .font-display.text-2xl',n=>n.textContent))===formatCents(exp2.grandTotalSellCents));
ok('crate & shipping is charged on the order', exp2.crateShippingCents>0, 'crate='+exp2.crateShippingCents);
ok('the shipping band is disclosed', /Shipping band/.test(await page.textContent('#quoteTotals')));

await page.click('#drawerTier'); await page.waitForTimeout(500);
const expB=engine.priceQuote({lines:[{productId:sp.id,finish:'unfinished',config:'slab',qty:2}],...BUILDER});
ok('builder tier prices via the engine',
   (await page.$eval('#quoteTotals .font-display.text-2xl',n=>n.textContent))===formatCents(expB.grandTotalSellCents));
ok('totals name the tier and its margin',
   /Builder pricing at 30% margin/.test(await page.textContent('#quoteTotals')));
await page.click('#drawerTier'); await page.waitForTimeout(400);

/* --- the stain and grille chosen survive onto the quote ----------------- */
await page.click('#closeQuote'); await page.waitForTimeout(300);
await openModel(iron.name);
await pick(iron.glazings[0]); await pick(sizeLabel);
await pick(iron.grilles[0].styles[0]);
await pick('Prefinished'); await pick(stainRows[0].name); await pick('Single door'); await frame();
await page.click('#detail button:has-text("Add to quote")'); await page.waitForTimeout(500);
const qText=await page.textContent('#quoteLines');
ok('the quote line records the stain colour', qText.includes(stainRows[0].name+' stain'), qText.slice(0,240));
ok('the quote line records the iron grille style',
   qText.includes(iron.grilles[0].styles[0]+' grille'), qText.slice(0,240));

/* --- accessories -------------------------------------------------------- */
await page.click('#closeQuote'); await page.waitForTimeout(300);
await openModel(simple.name);
await pick('Unfinished'); await pick('Slab only'); 
const accOptions=await page.$$eval('#detail select option',ns=>ns.length);
ok('accessory picker is populated', accOptions>20, String(accOptions));
await page.selectOption('#detail select',{index:1});
await page.click('#detail button:has-text("Add")'); await page.waitForTimeout(400);
const accRows=await page.$$eval('#detail .flex.items-center.gap-2.rounded-lg',n=>n.length);
ok('accessory is attached to the line', accRows>=1, String(accRows));

/* ---------------- responsive -------------------------------------------- */
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
ok('Escape closes the detail sheet', await page.isHidden('#detail'));
await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(600);
ok('mobile sticky quote bar appears', await page.isVisible('#mobileBar'));
const noHScroll=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);
ok('no horizontal page scroll on mobile', noHScroll);
await openModel(iron.name);
ok('the configurator is usable on a phone',
   await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
await pick(iron.glazings[0]); await pick(sizeLabel);
ok('the option rows wrap instead of scrolling the sheet sideways',
   await page.$eval('#detail',n=>n.scrollWidth<=n.clientWidth+1),
   await page.$eval('#detail',n=>n.scrollWidth+' vs '+n.clientWidth));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.setViewportSize({width:820,height:1180}); await page.waitForTimeout(500);
ok('tablet keeps the page from scrolling sideways',
   await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));

/* ---------------- the wood line still groups too ------------------------ */
await page.setViewportSize({width:1440,height:900}); await page.waitForTimeout(300);
await page.click('#lineChip'); await page.waitForTimeout(400);
await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/Wood/.test(n.textContent)).click();});
await page.waitForSelector('#catalog article',{timeout:30000});
ok('the wood line groups into models too',
   (await page.textContent('#resultCount')).startsWith(String(WOOD.length)),
   (await page.textContent('#resultCount'))+' expected '+WOOD.length);
ok('switching lines clears the search box', (await page.inputValue('#q'))==='');

ok('no console or page errors', errs.length===0, errs.slice(0,2).join(' | '));
console.log(T.join('\n'));
console.log('\n'+T.filter(t=>t.startsWith('PASS')).length+' passed, '+T.filter(t=>t.startsWith('FAIL')).length+' failed');
await b.close(); srv.close();
process.exit(T.some(t=>t.startsWith('FAIL'))?1:0);
