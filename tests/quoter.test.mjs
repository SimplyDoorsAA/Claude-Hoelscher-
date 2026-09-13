import { playwright } from './playwright.mjs';
const { chromium } = await playwright();
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
// Port 0: the OS picks a free one, so a killed run cannot poison the next.
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const BASE='http://127.0.0.1:'+srv.address().port;

const catalog=JSON.parse(fs.readFileSync(ROOT+'/data/catalog.json','utf8'));
const rules  =JSON.parse(fs.readFileSync(ROOT+'/data/pricing-rules.json','utf8'));
const engine =createEngine(catalog,rules);
const RETAIL={marginTier:'retail'}, BUILDER={marginTier:'builder'};

/* --- expectations recomputed here, from the catalogue, not from the app --- */
const SIZE_PREFIX=/^\d{4,5}[A-Z]?\s+/;
const keyOf=p=>{
  const d=String(p.description||'').trim(), code=p.size&&p.size.code;
  // The size code is not always first: knotty alder prints "KA 2680 4 Lite".
  if(code){ const rx=new RegExp('(^|\\s)'+String(code)+'(?=\\s|$)');
    if(rx.test(d)) return d.replace(rx,'$1').replace(/\s+/g,' ').trim(); }
  return d.replace(SIZE_PREFIX,'').trim();
};
const grilleRows=catalog.fiberglassIronGrilles||[];
const stainRows =catalog.fiberglassStainColors||[];
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
const optionOnly=new Set(grilleRows.map(g=>g.productId));
hiddenVariantIdsOf(catalog).forEach(id=>optionOnly.add(id));
/* The speakeasy programme prices a door, its kit and its mask as one part
   number. Those rows reach the customer through the door's configurator, not
   as cards of their own, so they are option-only here too. Recomputed from the
   published grammar rather than read back off the app. */
const seOpt=catalog.speakeasyOptions||null;
const seVariants=new Map();          // base product id -> its combinations
if(seOpt){
  const corr=p=>(seOpt.skuCorrections||[]).find(c=>c.productId?c.productId===p.id:c.printed===p.sku);
  const resolved=p=>{const c=corr(p); return (c&&c.resolvesAs)||p.sku;};
  const bySku=new Map(engine.products.map(p=>[resolved(p),p]));
  for(const base of engine.products){
    const code=base.size&&base.size.code, sku=resolved(base);
    if(!code||!sku.endsWith(code)) continue;
    const stem=sku.slice(0,sku.length-code.length);
    if(/SE[-MBW]*$/.test(stem)) continue;
    const combos=[];
    for(const m of seOpt.masks) for(const i of seOpt.inserts){
      const v=bySku.get(stem+'SE'+m.code+i.code+code)||null;
      combos.push({mask:m,insert:i,product:v});
      if(v) optionOnly.add(v.id);
    }
    if(combos.some(c=>c.product)) seVariants.set(base.id,combos);
  }
}
const GROUP_FIELD={fiberglass:'skin',wood:'line'};
function modelsOf(collection,group){
  const field=GROUP_FIELD[collection];
  const map=new Map();
  for(const p of engine.productsIn(collection)){
    if(optionOnly.has(p.id)) continue;
    if(group&&p[field]!==group) continue;
    const key=keyOf(p);
    if(!map.has(key)) map.set(key,{name:key,products:[]});
    map.get(key).products.push(p);
  }
  return [...map.values()].map(m=>({...m,
    sizes:[...new Set(m.products.map(p=>p.size&&p.size.code).filter(Boolean))],
    glazings:[...new Set(m.products.map(p=>p.glazing).filter(Boolean))],
    grilles:grilleRows.filter(g=>g.baseModel===m.name)}));
}
/* The app scopes to one collection inside the line, so the tests do too. */
const FG_GROUP='woodgrain', WOOD_GROUP='knotty_alder';
const FG=modelsOf('fiberglass',FG_GROUP), WOOD=modelsOf('wood',WOOD_GROUP);
/* What a gate card and the result count both say: models, and what to call
   them. Recomputed here rather than read back off the page. */
function tallyOf(rows){
  const models=new Set(), sl=new Set();
  rows.forEach(p=>{ if(optionOnly.has(p.id))return; const k=keyOf(p);
    models.add(k); if(p.type==='sidelite') sl.add(k); });
  return {count:models.size,
    noun: sl.size&&sl.size<models.size ? 'doors & sidelites' : sl.size ? 'sidelites' : 'doors'};
}
const groupRows=(c,g)=>engine.productsIn(c).filter(p=>p[GROUP_FIELD[c]]===g);
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
/* Block the Tailwind CDN outright rather than hoping it is unreachable. This
   suite's layout assertions were all written against the fallback stylesheet,
   and on a machine with internet the CDN would load and quietly test something
   else — which is exactly what happened the first time CI ran. */
await page.route('https://cdn.tailwindcss.com*', r=>r.abort());
await page.route('https://fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));

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
/** The options offered under one question, by its heading. */
const optionsOf = title=>page.$$eval('#detail .steprow',(ns,t)=>{
  const row=ns.find(r=>{const h=r.parentElement.querySelector('p');
    return h && h.textContent.trim()===t;});
  return row ? [...row.querySelectorAll('.opt')].map(n=>n.textContent.trim()) : [];},title);
const frame = async ()=>{ await pick('Left hand'); await pick('Inswing'); await pick('4-9/16'); };
const pick = async (label)=>{
  await page.$$eval('#detail .opt',(ns,l)=>{const h=ns.find(n=>n.textContent.trim().startsWith(l)&&!n.disabled); h.click();},label);
  await page.waitForTimeout(250);
};
/* Answer whichever question is open until the sheet prices, taking the first
   enabled option for anything the caller did not name. Lets a test say "any
   door, unfinished, slab" without knowing that door's question list. */
async function driveModel(want){
  for(let guard=0;guard<12;guard++){
    if(await page.$('#detail .font-display.text-3xl')) return true;
    const open=await steps();
    const title=open[open.length-1];
    if(!title) return false;
    const label=want[title];
    const hit=await page.$$eval('#detail .steprow',(ns,l)=>{
      const opts=[...ns[ns.length-1].querySelectorAll('.opt')].filter(o=>!o.disabled);
      const n=l?opts.find(o=>o.textContent.trim().startsWith(l)):opts[0];
      if(!n) return false; n.click(); return true;},label||null);
    if(!hit) return false;
    await page.waitForTimeout(220);
  }
  return false;
}
const UNFIN_SLAB={Finish:'Unfinished',Opening:'Slab only'};

const t0=Date.now();
await page.goto(BASE+'/quoter/');
await page.waitForSelector('#lineGate:not(.hidden)',{timeout:30000});
ok('asks which line before showing any product', await page.isVisible('#lineGate'));
ok('no catalog is rendered until a line is chosen',
   (await page.$$eval('#catalog article',n=>n.length))===0);
const choices=await page.$$eval('#lineChoices button',ns=>ns.map(n=>n.textContent.replace(/\s+/g,' ').trim()));
ok('offers exactly the catalogue collections', choices.length===2 &&
   choices.some(c=>/Fiberglass/.test(c)) && choices.some(c=>/Wood/.test(c)), choices.join(' | '));
const fgAll=tallyOf(engine.productsIn('fiberglass'));
ok('the gate counts what the catalogue will actually show',
   choices.some(c=>c.includes(fgAll.count+' '+fgAll.noun)),
   choices.join(' | ')+' expected '+fgAll.count+' '+fgAll.noun);

/* ---------------- step two: the collection inside the line -------------- */
/* Wait for the gate to actually re-ask rather than for a fixed moment: the
   question it moves to is what the next assertions are about, and a fixed
   sleep here failed once on a loaded machine. */
const lineQuestion=(await page.textContent('#gateTitle')).trim();
await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/Fiberglass/.test(n.textContent)).click();});
await page.waitForFunction(
  was=>{const n=document.querySelector('#gateTitle');
        return n && n.textContent.trim() && n.textContent.trim()!==was;},
  lineQuestion, {timeout:15000});
ok('choosing a line asks which collection before showing a door',
   await page.isVisible('#lineGate') &&
   (await page.$$eval('#catalog article',n=>n.length))===0,
   await page.textContent('#gateTitle'));
ok('the fiberglass question is woodgrain or smooth',
   /woodgrain or smooth/i.test(await page.textContent('#gateTitle')),
   await page.textContent('#gateTitle'));
const skins=await page.$$eval('#lineChoices button',ns=>ns.map(n=>n.textContent.replace(/\s+/g,' ').trim()));
const skinValues=[...new Set(engine.productsIn('fiberglass').map(p=>p.skin))];
ok('every skin in the catalogue is offered', skinValues.length===2 && skins.length===2 &&
   skins.some(c=>/^Woodgrain/.test(c)) && skins.some(c=>/^Smooth/.test(c)), skins.join(' | '));
const wgTally=tallyOf(groupRows('fiberglass',FG_GROUP));
ok('each collection says how much it holds',
   skins.some(c=>c.includes(wgTally.count+' '+wgTally.noun)),
   skins.join(' | ')+' expected '+wgTally.count+' '+wgTally.noun);
ok('the collection counts add up to the line count',
   skinValues.reduce((n,v)=>n+tallyOf(groupRows('fiberglass',v)).count,0)===fgAll.count,
   String(fgAll.count));
ok('a back step returns to the line question', await page.isVisible('#gateBack'));

await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/^Woodgrain/.test(n.textContent.trim())).click();});
await page.waitForSelector('#catalog article',{timeout:30000});
ok('quoter boots and renders cards', true, (Date.now()-t0)+'ms');
ok('the header names the line and the collection',
   (await page.textContent('#lineChipLabel'))==='Fiberglass' &&
   (await page.textContent('#groupChipLabel'))==='Woodgrain',
   (await page.textContent('#lineChipLabel'))+' / '+(await page.textContent('#groupChipLabel')));
const leaked=await page.$$eval('#catalog article h3',ns=>ns.map(n=>n.textContent));
ok('no smooth-skin door leaks into the woodgrain catalogue',
   leaked.every(h=>!/Smooth/i.test(h)), leaked.filter(h=>/Smooth/i.test(h)).join(' | '));
ok('imports the pricing engine module', !req404.some(u=>u==='index.js'), req404.slice(0,3).join(','));

/* The CDN is blocked above, so this suite exercises the built-in fallback
   stylesheet throughout — the state a customer lands in when the CDN is
   blocked or down. The styled path is covered separately by the screenshot
   harness, which serves a locally compiled Tailwind. */
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
ok('collapses part numbers into one card per model',
   countTxt.startsWith(FG.length+' of '+FG.length+' '), countTxt+' expected '+FG.length);
ok('the result count and the gate card agree',
   countTxt.trim()===FG.length+' of '+wgTally.count+' '+wgTally.noun, countTxt);
ok('the catalogue really is many parts per model',
   groupRows('fiberglass',FG_GROUP).length>FG.length*4,
   groupRows('fiberglass',FG_GROUP).length+' parts / '+FG.length+' models');
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

/* ---------------- photography, and the silhouette behind it -------------- */
for(let y=0;y<6;y++){ await page.mouse.wheel(0,1400); await page.waitForTimeout(200); }
await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(600);
const manifest=JSON.parse(fs.readFileSync(ROOT+'/quoter/assets/doors/manifest.json','utf8'));
/* A card shows its own photograph, or borrows the one of the door it is a
   variation of — an Impact door is the same door with different glass — and
   falls back to the drawn silhouette only when neither exists. */
const VARIANT_OF=[/\s*[-,]?\s*w\/?\s*Speakeasy\b.*$/i, /\s*,?\s*\bSE\s*[+&].*$/i,
                  /\s*-\s*Impact$/i, /\s*-\s*Flat Glass$/i];
const ABBREV=[[/v-grooved/g,'vg'],[/2 panel square/g,'2psq'],[/2 panel arch/g,'2pa'],
              [/arch top 2pa/g,'at2pa'],[/circle top 2 panel/g,'ct2p'],
              [/circle panel 2 panel/g,'cp2p'],[/\bskin\b/g,'']];
const fingerprint=n=>{let x=String(n||'').toLowerCase();
  ABBREV.forEach(([r,t])=>{x=x.replace(r,t);}); return x.replace(/[^a-z0-9]/g,'');};
const photoPrints=new Set(Object.keys(manifest.models).map(fingerprint));
const hasArt=m=>{
  if(manifest.models[m.name]) return true;
  return VARIANT_OF.some(rx=>{const b=m.name.replace(rx,'').trim().replace(/[,\-]$/,'').trim();
    return b && b!==m.name && photoPrints.has(fingerprint(b));});
};
const withPhoto=FG.filter(hasArt).length;
const svgCount=await page.$$eval('#catalog article svg[role="img"]',n=>n.length);
const imgCount=await page.$$eval('#catalog article img',n=>n.length);
const broken=await page.$$eval('#catalog article img',ns=>ns.filter(i=>i.complete&&i.naturalWidth===0).length);
ok('the catalogue shows the real door photography',
   withPhoto>0 && imgCount===withPhoto, imgCount+' photos for '+withPhoto+' models with one');
ok('a borrowed photograph says whose it is',
   (await page.$$eval('#catalog article .borrowed',ns=>ns.length))
     === FG.filter(m=>!manifest.models[m.name]&&hasArt(m)).length,
   String(FG.filter(m=>!manifest.models[m.name]&&hasArt(m)).length)+' borrowed');
ok('no photograph is broken', broken===0, String(broken));
ok('no drawn silhouette carries a borrowed caption',
   (await page.$$eval('#catalog article',
      ns => ns.filter(a => a.querySelector('.borrowed') && !a.querySelector('img')).length)) === 0);
ok('a model with no photograph and nothing to borrow draws a silhouette',
   svgCount===FG.length-withPhoto, 'svg='+svgCount+' of '+(FG.length-withPhoto)+' without a photo');
ok('every photo the manifest names is actually on disk',
   Object.values(manifest.models).every(f=>fs.existsSync(ROOT+'/quoter/assets/doors/'+f)),
   Object.values(manifest.models).filter(f=>!fs.existsSync(ROOT+'/quoter/assets/doors/'+f)).slice(0,3).join(', '));
ok('the manifest names only models that exist in the catalog',
   Object.keys(manifest.models).every(k=>engine.products.some(p=>keyOf(p)===k)),
   Object.keys(manifest.models).filter(k=>!engine.products.some(p=>keyOf(p)===k)).slice(0,3).join(' | '));

/* ---------------- filters still scope the model list -------------------- */
await page.selectOption('#fType','sidelite'); await page.waitForTimeout(400);
const slExp=FG.filter(m=>m.products.some(p=>p.type==='sidelite')).length;
ok('the line facet hides itself when the collection settles it',
   await page.isHidden('#fLine'));
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

/* --- the glass swatches off the catalog's own glass page ---------------- */
const glassMan=JSON.parse(fs.readFileSync(ROOT+'/quoter/assets/glass/manifest.json','utf8'));
const gkey=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const gnames=Object.keys(glassMan.glass);
const swatchFor=v=>{const w=gkey(v);
  let h=gnames.find(n=>gkey(n)===w);
  if(!h){const st=gnames.filter(n=>gkey(n).startsWith(w)); if(st.length===1) h=st[0];}
  return h||null;};
const expectSwatch=iron.glazings.filter(swatchFor).length;
const swatchImgs=await page.$$eval('#detail .steprow .opt img',ns=>ns.map(n=>n.getAttribute('src')));
ok('the glass options carry the catalog swatch',
   expectSwatch>0 && swatchImgs.length===expectSwatch,
   swatchImgs.length+' swatches for '+expectSwatch+' glasses that have one');
ok('every swatch file the manifest names is on disk',
   Object.values(glassMan.glass).every(f=>fs.existsSync(ROOT+'/quoter/assets/glass/'+f)),
   Object.values(glassMan.glass).filter(f=>!fs.existsSync(ROOT+'/quoter/assets/glass/'+f)).join(', '));
ok('no swatch is broken',
   (await page.$$eval('#detail .steprow .opt img',ns=>ns.filter(i=>i.complete&&i.naturalWidth===0).length))===0);
// "Clear Low E" on the sheet is "Clear Low-E" on the swatch page; the match has
// to survive that, and Sandblast against "Sandblast w/1” Clear Border".
ok('a glass named differently on the two sheets still finds its swatch',
   swatchFor('Clear Low E')==='Clear Low-E' && swatchFor('Sandblast')!==null,
   String(swatchFor('Clear Low E'))+' / '+String(swatchFor('Sandblast')));
ok('the vendor privacy rating is shown beside the glass',
   /privacy \d/.test(await page.textContent('#detail')) &&
   /privacy rated 0-9 by Hoelscher/.test(await page.textContent('#detail')));
const ratedGlass=iron.glazings.map(swatchFor).filter(Boolean);
ok('every rated glass on this door has a rating in the manifest',
   ratedGlass.every(n=>Number.isInteger(glassMan.privacy[n])),
   ratedGlass.map(n=>n+'='+glassMan.privacy[n]).join(', '));

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
ok('two sidelites makes the app ask which sidelite', s.includes('Sidelite'), s.join(' > '));
const slOpts=await optionsOf('Sidelite');
const doorH=prod.size.heightIn, doorSkin=prod.skin;
const slAll=engine.productsIn('fiberglass').filter(p=>p.type==='sidelite');
const slFit=slAll.filter(p=>Math.abs(p.size.heightIn-doorH)<=2&&p.skin===doorSkin);
const fitLabels =[...new Set(slFit.map(p=>p.size.label))];
const missLabels=[...new Set(slAll.filter(p=>Math.abs(p.size.heightIn-doorH)>2).map(p=>p.size.label))];
ok('only sidelites that match the door height are offered',
   slOpts.length>0 && missLabels.length>0 &&
   slOpts.every(o=>fitLabels.some(l=>o.includes(l))) &&
   slOpts.every(o=>!missLabels.some(l=>o.includes(l))),
   'door '+doorH+'in, offered '+slOpts.length+' of '+slAll.length+
   ', fit='+fitLabels.join(',')+' excluded='+missLabels.join(','));

// A woodgrain door must not be offered a smooth-skin sidelite, and vice versa.
const otherSkin=slAll.filter(p=>p.skin!==doorSkin);
ok('a sidelite of another skin is never offered',
   doorSkin && otherSkin.length>0 &&
   slOpts.every(o=>!otherSkin.some(p=>o.startsWith(keyOf(p)))) &&
   slOpts.every(o=>slFit.some(p=>o.startsWith(keyOf(p)))),
   doorSkin+' door · offered '+slOpts.length+' · '+otherSkin.length+' in the other skin');

ok('one option per sidelite model and width, not per part number',
   new Set(slOpts.map(o=>o.split('$')[0])).size===slOpts.length, slOpts.join(' | '));

const chosenSL=slFit.find(p=>engine.availableOptions(p.id).isOffered('unfinished','singlePH'));
ok('a single possible sidelite is settled without asking',
   slOpts.length>1 || (await page.textContent('#detail')).includes(keyOf(chosenSL)),
   slOpts.length+' choice(s)');
const clicked=await page.$$eval('#detail .steprow',(ns,n)=>{
  const row=ns.find(r=>{const h=r.parentElement.querySelector('p');
    return h && h.textContent.trim()==='Sidelite';});
  if(!row) return false;
  const hit=[...row.querySelectorAll('.opt')].find(x=>x.textContent.trim().startsWith(n));
  if(!hit) return false; hit.click(); return true;}, keyOf(chosenSL));
ok('the sidelite step accepts the choice', clicked, keyOf(chosenSL));
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
const simple=FG.find(m=>!m.grilles.length&&
  m.products.some(p=>engine.availableOptions(p.id).isOffered('unfinished','slab')));
await openModel(simple.name);
ok('a question with one possible answer is settled without asking',
   (await steps()).every(t=>{
     if(t==='Glass') return simple.glazings.length>1;
     if(t==='Size')  return simple.sizes.length>1;
     return true;}), simple.name+' :: '+(await steps()).join(' > '));
ok('any model can be driven to a price', await driveModel(UNFIN_SLAB), simple.name);
const spTxt=await page.textContent('#detail');
// Longest match first: one part number can be a prefix of another.
const sp=simple.products.slice().sort((a,b)=>b.sku.length-a.sku.length)
  .find(p=>spTxt.includes(p.sku));
ok('the priced part is one of the model\'s own', !!sp,
   simple.products.map(p=>p.sku).slice(0,3).join(','));
await page.click('#detail button:has-text("Add to quote")'); await page.waitForTimeout(500);
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
await driveModel(UNFIN_SLAB);
const accOptions=await page.$$eval('#detail select option',ns=>ns.map(n=>n.textContent.trim()));
ok('accessory picker is populated', accOptions.length>5, String(accOptions.length));
// A sidelite belongs to the opening. Offering it here too puts a second one
// on the line at full price.
const slNames=[...new Set(engine.products.filter(p=>p.type==='sidelite').map(p=>p.description))];
ok('no sidelite is offered in the accessory picker',
   accOptions.every(o=>!slNames.includes(o)) && !/sidelite/i.test(accOptions[0]),
   accOptions.filter(o=>slNames.includes(o)).slice(0,2).join(' | ')||accOptions[0]);
ok('the picker says sidelites live in the opening',
   /Sidelites are part of the opening/.test(await page.textContent('#detail')));
// Barn hardware hangs a sliding slab, never a fiberglass entry door.
const barnHw=(catalog.hardware||[]).filter(h=>h.category==='Barn Door Hardware').map(h=>h.description);
ok('barn hardware is not offered on a fiberglass door',
   barnHw.length>0 && accOptions.every(o=>!barnHw.some(b=>o.startsWith(b))),
   accOptions.filter(o=>barnHw.some(b=>o.startsWith(b))).slice(0,2).join(' | '));
ok('an iron mask is not offered on a fiberglass door',
   accOptions.every(o=>!/Iron Mask/i.test(o)), accOptions.filter(o=>/Iron Mask/i.test(o)).join(' | '));
ok('the picker says how many items it is hiding',
   /are not offered on this door/.test(await page.textContent('#detail')));
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

/* ---------------- the wood line, and its three woods -------------------- */
await page.setViewportSize({width:1440,height:900}); await page.waitForTimeout(300);
await page.click('#lineChip'); await page.waitForTimeout(500);
// The quote still holds fiberglass lines, so the switch asks about them first.
ok('switching lines with a quote in progress asks about the quote',
   await page.isVisible('text=Start fresh'));
await page.click('button:has-text("Start fresh")');
await page.waitForTimeout(700);
ok('switching to wood asks which wood before showing anything',
   await page.isVisible('#lineGate') && /which wood/i.test(await page.textContent('#gateTitle')),
   await page.textContent('#gateTitle'));
const woods=await page.$$eval('#lineChoices button',ns=>ns.map(n=>n.textContent.replace(/\s+/g,' ').trim()));
const woodValues=[...new Set(engine.productsIn('wood').map(p=>p.line))];
ok('the three woods are offered by name',
   woodValues.length===3 &&
   ['Mahogany','Knotty Alder','Barn Doors'].every(l=>woods.some(c=>c.startsWith(l))),
   woods.map(c=>c.split(' ')[0]).join(' | '));
const kaTally=tallyOf(groupRows('wood',WOOD_GROUP));
ok('each wood says how much it holds',
   woods.some(c=>c.includes(kaTally.count+' '+kaTally.noun)),
   woods.join(' | ')+' expected '+kaTally.count+' '+kaTally.noun);
await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/^Knotty Alder/.test(n.textContent.trim())).click();});
await page.waitForSelector('#catalog article',{timeout:30000});
ok('knotty alder collapses to one card per model',
   (await page.textContent('#resultCount')).startsWith(String(WOOD.length)),
   (await page.textContent('#resultCount'))+' expected '+WOOD.length);
ok('the knotty alder catalogue holds far more parts than cards',
   groupRows('wood',WOOD_GROUP).length>WOOD.length,
   groupRows('wood',WOOD_GROUP).length+' parts / '+WOOD.length+' cards');
const woodHeads=await page.$$eval('#catalog article h3',ns=>ns.map(n=>n.textContent.trim()));
ok('no knotty alder card still carries its size code',
   woodHeads.every(h=>!/\b\d{4,5}\b/.test(h)), woodHeads.filter(h=>/\b\d{4,5}\b/.test(h)).join(' | '));
const woodLines=await page.$$eval('#catalog article',ns=>ns.map(a=>a.querySelector('p').textContent.trim()));
ok('no mahogany door leaks into the knotty alder catalogue',
   woodLines.length>0 && woodLines.every(l=>/Knotty/i.test(l)),
   [...new Set(woodLines)].join(' | '));
ok('switching lines clears the search box', (await page.inputValue('#q'))==='');

/* --- which accessories a wood door may take ----------------------------- */
const accRules=catalog.accessoryRules||[];
ok('the catalogue carries accessory rules', accRules.length>0, String(accRules.length));
await page.click('#groupChip'); await page.waitForTimeout(500);
await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/^Mahogany/.test(n.textContent.trim())).click();});
await page.waitForSelector('#catalog article',{timeout:30000});

const pickerFor=async(model,want)=>{
  await page.click('#clearFilters').catch(()=>{});
  await page.fill('#q',model); await page.waitForTimeout(500);
  await page.$$eval('#catalog article',(ns,n)=>{
    const hit=ns.find(a=>a.querySelector('h3').textContent.trim()===n);
    hit.querySelector('button').click();},model);
  await page.waitForSelector('#detail:not(.hidden)');
  await driveModel(want);
  const o=await page.$$eval('#detail select option',ns=>ns.map(n=>n.textContent.trim()));
  return o;
};
const SINGLE={Finish:'Unfinished',Opening:'Single door',Handing:'Left hand',Swing:'Inswing','Jamb depth':'4-9/16'};
const DOUBLE=Object.assign({},SINGLE,{Opening:'Double door'});

const twoPanel=await pickerFor('2 Panel Square VG',SINGLE);
ok('a two-panel mahogany door offers no iron mask in the picker',
   twoPanel.every(o=>!/Iron Mask/i.test(o)), twoPanel.filter(o=>/Iron Mask/i.test(o)).join(' | '));
ok('nor the speakeasy kit, which is asked for on the door itself',
   twoPanel.every(o=>!/Speakeasy/i.test(o)), twoPanel.filter(o=>/Speakeasy/i.test(o)).join(' | '));
ok('barn hardware is never offered on a hinged wood door',
   twoPanel.every(o=>!barnHw.some(b=>o.startsWith(b))));
ok('a T-astragal is not offered on a single opening',
   twoPanel.every(o=>!/T-Astragal/i.test(o)), twoPanel.filter(o=>/Astragal/i.test(o)).join(' | '));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

/* The programme is not a knotty alder one: mahogany carries it too, and the
   catalog marks the same two-panel doors in both lines. */
await page.click('#clearFilters').catch(()=>{});
await page.fill('#q','2 Panel Square VG'); await page.waitForTimeout(500);
await openModel('2 Panel Square VG');
ok('the mahogany two-panel door asks about the speakeasy on the door',
   (await steps()).includes('Speakeasy'), (await steps()).join(' | '));
await pick('Speakeasy kit'); await pick('Wood panel');
const mMasks=await optionsOf('Iron mask');
ok('and offers the same three masks, priced into the part number',
   mMasks.length===4 && ['Standard','Balfour','Windsor'].every(m=>mMasks.some(o=>o.startsWith(m))),
   mMasks.join(' | '));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.click('#clearFilters').catch(()=>{});
await page.waitForTimeout(300);

const plain=await pickerFor('1 Lite Vertical',SINGLE);
ok('a door outside the two-panel family gets no iron mask',
   plain.every(o=>!/Iron Mask/i.test(o)), plain.filter(o=>/Iron Mask/i.test(o)).join(' | '));
ok('and no speakeasy kit', plain.every(o=>!/Speakeasy/i.test(o)),
   plain.filter(o=>/Speakeasy/i.test(o)).join(' | '));
/* A Contemporary unit ships prehung with its jamb, so the dealer closed its
   picker to everything but the construction door on 2026-09-11. The rules the
   next two checks are really about — trim on a wood door, and the astragal
   that closes a pair — are read off a door the restriction does not cover. */
ok('a Contemporary opening is sold no loose jamb, casing or bead',
   plain.every(o=>!/Jamb Leg|Casing|Glass Bead|Subsill/i.test(o)),
   plain.filter(o=>/Jamb Leg|Casing|Glass Bead|Subsill/i.test(o)).join(' | ')||'none offered');
ok('but it is still sold the construction-door adder',
   plain.some(o=>/Construction Door/i.test(o)), plain.slice(1,4).join(' | '));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

const trimmed=await pickerFor('3 Lite 1 Panel RM',SINGLE);
ok('a wood door outside that collection still gets the trim',
   trimmed.some(o=>/Jamb Leg/i.test(o)) && trimmed.some(o=>/Casing/i.test(o)),
   trimmed.slice(1,4).join(' | '));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

const dblPicker=await pickerFor('3 Lite 1 Panel RM',DOUBLE);
ok('a double opening is offered the T-astragal that closes it',
   dblPicker.some(o=>/T-Astragal/i.test(o)), dblPicker.filter(o=>/Astragal/i.test(o)).join(' | '));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

/* --- the glass filter holds glass, not page numbers --------------------- */
await page.click('#clearFilters').catch(()=>{});
await page.waitForTimeout(300);
const glassOpts2=await page.$$eval('#fGlazing option',ns=>ns.map(n=>n.textContent.trim()));
ok('the glass filter offers no page references',
   glassOpts2.every(g=>!/^P\.?\s*\d/i.test(g)), glassOpts2.filter(g=>/^P\.?\s*\d/i.test(g)).join(' | '));
ok('no product carries a page reference as its glass',
   engine.products.every(p=>!/^P\.?\s*\d/i.test(String(p.glazing||''))),
   engine.products.filter(p=>/^P\.?\s*\d/i.test(String(p.glazing||''))).length+' rows');
ok('the page reference was kept, in its own field',
   catalog.woodProducts.filter(p=>p.priceSheetPage).length===208,
   String(catalog.woodProducts.filter(p=>p.priceSheetPage).length));

/* --- the knotty alder deep dive: grille designs, caming, glass lists ----- */
const designs=JSON.parse(fs.readFileSync(ROOT+'/quoter/assets/designs/manifest.json','utf8'));
const grilleDesigns=catalog.ironGrilleDesigns||[];

ok('every iron grille design in the catalogue has a photo',
   grilleDesigns.every(g=>g.photo && fs.existsSync(ROOT+'/quoter/assets/designs/'+g.photo)),
   grilleDesigns.filter(g=>!g.photo).map(g=>g.name).join(' | ')||grilleDesigns.length+' designs');
ok('every decorative glass the catalogue names has a photo',
   [...new Set((catalog.decorativeGlassDesigns||[]).map(d=>d.name))]
     .every(n=>designs.decorativeGlass[n]),
   Object.keys(designs.decorativeGlass).join(' | '));

/* The wood sheet prices one generic iron-grille row, so the design is a free
   choice; the catalog page restricts which sizes each design is made in. */
await page.click('#groupChip'); await page.waitForTimeout(500);
await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/^Knotty Alder/.test(n.textContent.trim())).click();});
await page.waitForSelector('#catalog article',{timeout:30000});
await openModel('KA 3/4 Lite Iron Grille');
const grilleGlass=await optionsOf('Glass');
const ruleOpts=(catalog.glassRules||[]).find(r=>/Iron Grille/i.test(r.appliesToModelPattern)).options;
ok('a grille door offers exactly the five glasses the grille page lists',
   grilleGlass.length===ruleOpts.length &&
   ruleOpts.every(o=>grilleGlass.some(g=>g.startsWith(o))),
   grilleGlass.join(' | '));
ok('and not the wider Legacy list',
   !grilleGlass.some(g=>/Baroque|Small Reeded|Satin|Bevel/i.test(g)), grilleGlass.join(' | '));
await pick(ruleOpts[0]);
const grilleSizes=await optionsOf('Size');
ok('the grille door is offered its four sizes', grilleSizes.length===4, grilleSizes.join(' | '));
await pick('3\'6"');
const designOpts=await page.$$eval('#detail .steprow',ns=>{
  const row=ns.find(r=>{const h=r.parentElement.querySelector('p');
    return h&&h.textContent.trim()==='Grille design';});
  return row?[...row.querySelectorAll('.opt')].map(n=>({t:n.textContent.trim(),off:n.disabled})):[];});
ok('all eleven grille designs are shown', designOpts.length===11, String(designOpts.length));
const madeIn3680=grilleDesigns.filter(g=>g.line==='knotty_alder'&&g.sizeCodes.includes('3680')).map(g=>g.name);
ok('and the ones not made in 3\'6" are shown but disabled',
   designOpts.filter(o=>!o.off).length===madeIn3680.length,
   designOpts.filter(o=>!o.off).map(o=>o.t.split('\n')[0]).join(' | '));
ok('a disabled design is one the catalogue does not list in that size',
   designOpts.filter(o=>o.off).every(o=>!madeIn3680.some(n=>o.t.startsWith(n))),
   designOpts.filter(o=>o.off).map(o=>o.t.split('\n')[0]).join(' | '));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

/* A glazing field that lists several glasses is a list of choices, not one
   option called "Columbia, Medina, Pecos, San Jacinto". */
await openModel('KA 3/4 Lite RM - Decorative Glass');
const decOpts=await optionsOf('Glass');
ok('a decorative-glass door offers each glass separately',
   decOpts.length>=4 && decOpts.some(o=>o.startsWith('Columbia')) &&
   decOpts.some(o=>o.startsWith('Medina')), decOpts.join(' | '));
ok('and never offers a comma-separated list as one option',
   decOpts.every(o=>!/,/.test(o.split('\n')[0])), decOpts.join(' | '));
await pick('Columbia');
const caming=await optionsOf('Caming');
ok('a glass made in both lead finishes asks which',
   caming.length===2 && caming.some(c=>/Patina/.test(c)) && caming.some(c=>/Zinc/.test(c)),
   caming.join(' | '));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

await openModel('KA Arch Top Arch 1/2 Lite NRM Decorative Glass');
const bowieGlass=await optionsOf('Glass');
ok('the arch-top decorative door offers Bowie, Kerrville and Mason',
   ['Bowie','Kerrville','Mason'].every(n=>bowieGlass.some(g=>g.startsWith(n))),
   bowieGlass.join(' | '));
await pick('Bowie');
ok('and asks no caming question where only patina is made',
   (await optionsOf('Caming')).length===0);
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

/* --- the page-50 add-ons belong to the doors on pages 50-53 ------------- */
const PAGE_ADDONS=['Speakeasy Kit','Iron Mask','Clavos','Straps'];
async function addonsOffered(model){
  await page.click('#clearFilters').catch(()=>{});
  await page.fill('#q',model); await page.waitForTimeout(500);
  const found=await page.$$eval('#catalog article',(ns,n)=>{
    const h=ns.find(a=>a.querySelector('h3').textContent.trim()===n);
    if(!h) return false; h.querySelector('button').click(); return true;},model);
  if(!found) return null;
  await page.waitForSelector('#detail:not(.hidden)');
  for(let g=0;g<12;g++){
    if(await page.$('#detail select')) break;
    const stop=await page.$$eval('#detail .steprow',ns=>{
      if(!ns.length) return true;
      const opts=[...ns[ns.length-1].querySelectorAll('.opt')].filter(o=>!o.disabled);
      if(!opts.length) return true; opts[0].click(); return false;});
    if(stop) break;
    await page.waitForTimeout(200);
  }
  const opts=await page.$$eval('#detail select option',ns=>ns.map(n=>n.textContent.trim()));
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  const out={};
  PAGE_ADDONS.forEach(a=>{ out[a]=opts.some(o=>new RegExp(a,'i').test(o)); });
  return out;
}
/* the page a door is printed on, straight from the catalogue */
const pageOfModel=name=>{
  const p=catalog.woodProducts.find(x=>x.line==='knotty_alder'&&keyOf(x)===name);
  return p?String(p.catalogPage||''):'';
};
/* The kit, the masks, clavos and straps are asked for on the door itself now,
   so the general "Add to this opening" picker offers none of them, on any
   door — including the doors whose catalog page prints them. */
ok('the catalogue names the four the configurator owns',
   PAGE_ADDONS.every(a=>(seOpt.hideFromPicker||[]).includes(a)),
   (seOpt.hideFromPicker||[]).join(' | '));
const on5053=await addonsOffered('KA 2 Panel Square VG');
ok('the speakeasy door offers none of the four in the picker',
   on5053 && PAGE_ADDONS.every(a=>!on5053[a]), JSON.stringify(on5053)+' page '+pageOfModel('KA 2 Panel Square VG'));
const onPlank=await addonsOffered('KA Square Top Plank VG');
ok('nor does another door on the same pages',
   onPlank && PAGE_ADDONS.every(a=>!onPlank[a]), JSON.stringify(onPlank)+' page '+pageOfModel('KA Square Top Plank VG'));
const on44=await addonsOffered('KA 6 Lite NRM');
ok('nor a door on page 44',
   on44 && PAGE_ADDONS.every(a=>!on44[a]), JSON.stringify(on44)+' page '+pageOfModel('KA 6 Lite NRM'));
const onGrille=await addonsOffered('KA 3/4 Lite Iron Grille');
ok('nor the iron grille door on page 55',
   onGrille && PAGE_ADDONS.every(a=>!onGrille[a]), JSON.stringify(onGrille)+' page '+pageOfModel('KA 3/4 Lite Iron Grille'));
ok('and no variant of a speakeasy door is a card of its own',
   (await page.$$eval('#catalog article h3',ns=>ns.map(n=>n.textContent)))
     .every(t=>!/\bSE\s*[+&]/.test(t)));
const kit=engine.hardwareList().find(h=>/Speakeasy Kit.*Knotty/i.test(h.description||''));
const mask=engine.hardwareList().find(h=>/Iron Mask - Standard/i.test(h.description||''));
const slabOf=sku=>{const p=catalog.woodProducts.find(x=>x.sku===sku); return p&&p.prices.unfinished.slab;};
ok('and the sheet agrees: SE door = plain door + kit',
   slabOf('KA2PSQSE--3068')-slabOf('KA2PSQ3068')===kit.priceCents,
   (slabOf('KA2PSQSE--3068')-slabOf('KA2PSQ3068'))+' vs '+kit.priceCents);
ok('and SE + mask = SE door + mask',
   slabOf('KA2PSQSEM--3068')-slabOf('KA2PSQSE--3068')===mask.priceCents,
   (slabOf('KA2PSQSEM--3068')-slabOf('KA2PSQSE--3068'))+' vs '+mask.priceCents);

/* --- the speakeasy programme, asked on the door ------------------------- */
const seBase=[...seVariants.keys()].map(id=>engine.productById(id));
const seModels=new Set(seBase.map(keyOf));
ok('nine doors carry the catalog\'s speakeasy note',
   seModels.size===9, [...seModels].sort().join(' | '));
const seVariantCount=[...seVariants.values()]
  .reduce((n,combos)=>n+combos.filter(c=>c.product).length,0);
ok('and between them the sheet prices 140 variant part numbers',
   seVariantCount===140, String(seVariantCount));

await page.click('#clearFilters').catch(()=>{});
await page.fill('#q','2 Panel Square'); await page.waitForTimeout(600);
await openModel('KA 2 Panel Square VG');
await pick('3\'0" x 6\'8"');
ok('the speakeasy door asks whether to fit the kit',
   (await steps()).includes('Speakeasy'), (await steps()).join(' | '));
await pick('Speakeasy kit');
const inserts=await optionsOf('Insert');
ok('then which insert goes behind the grille',
   inserts.length===2 && inserts.some(o=>/glass/i.test(o)) && inserts.some(o=>/Wood/.test(o)),
   inserts.join(' | '));
await pick('Wood panel');
const masks=await optionsOf('Iron mask');
ok('then which iron mask, the catalog\'s three and none',
   masks.length===4 && ['No iron mask','Standard','Balfour','Windsor']
     .every(m=>masks.some(o=>o.startsWith(m))), masks.join(' | '));
ok('and each mask shows its photograph',
   (await page.$$eval('#detail .steprow img',ns=>ns.length))>=3);
await pick('Balfour');
await driveModel(UNFIN_SLAB);
const seProd=catalog.woodProducts.find(x=>x.sku==='KA2PSQSEBW3068');
const seLine=engine.priceLine({productId:seProd.id,finish:'unfinished',config:'slab',qty:1},
                              engine.marginFor('retail'));
const seText=await page.textContent('#detail');
ok('the answers resolve to the part number Hoelscher prices',
   seText.includes('KA2PSQSEBW3068'), 'KA2PSQSEBW3068');
ok('and the door is priced at that part number\'s price',
   (await page.$eval('#detail .font-display.text-3xl',n=>n.textContent))===formatCents(seLine.unitSellCents),
   formatCents(seLine.unitSellCents));
const plainProd=catalog.woodProducts.find(x=>x.sku==='KA2PSQ3068');
ok('which is dearer than the plain door, by the kit and the mask',
   seProd.prices.unfinished.slab>plainProd.prices.unfinished.slab,
   formatCents(seProd.prices.unfinished.slab-plainProd.prices.unfinished.slab)+' list');

/* Clavos and straps are per-piece extras on the same doors, asked here now. */
const extraNames=(seOpt.extras||[]).map(e=>e.name);
ok('the same door offers clavos and straps on the door itself',
   extraNames.length===2 && seText.includes('Clavos & straps'), extraNames.join(' | '));
const shapes=await page.$$eval('#detail .shapeopt',ns=>ns.map(n=>n.textContent.trim()));
ok('and clavos are offered round or square, at one price',
   shapes.includes('Round') && shapes.includes('Square'), shapes.join(' | '));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

/* A combination the vendor never priced is shown, disabled, with the reason —
   Circle Top is printed without a Balfour row in any size. */
await page.click('#clearFilters').catch(()=>{});
await page.fill('#q','Circle Top 2 Panel'); await page.waitForTimeout(600);
await openModel('KA Circle Top 2 Panel VG');
await pick('3\'0" x 8\'0"');
await pick('Speakeasy kit');
await pick('Wood panel');
const ctMasks=await page.$$eval('#detail .steprow',ns=>{
  const row=ns.find(r=>{const h=r.parentElement.querySelector('p');
    return h && h.textContent.trim()==='Iron mask';});
  return row?[...row.querySelectorAll('.opt')].map(n=>({t:n.textContent.trim(),off:n.disabled})):[];});
ok('the Balfour mask Hoelscher never priced is shown but cannot be chosen',
   ctMasks.some(m=>m.t.startsWith('Balfour')&&m.off),
   ctMasks.map(m=>m.t+(m.off?' (disabled)':'')).join(' | '));
ok('while the masks it did price stay choosable',
   ['Standard','Windsor'].every(n=>ctMasks.some(m=>m.t.startsWith(n)&&!m.off)));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.click('#clearFilters').catch(()=>{});
await page.waitForTimeout(300);

/* --- sidelites are add-ons, so they sort below the doors ---------------- */
await page.click('#clearFilters').catch(()=>{});
await page.fill('#q','3/4'); await page.waitForTimeout(600);
const order=await page.$$eval('#catalog article h3',ns=>ns.map(n=>n.textContent.trim()));
const lastDoor=order.map(t=>/Sidelite/i.test(t)).lastIndexOf(false);
const firstSide=order.map(t=>/Sidelite/i.test(t)).indexOf(true);
ok('sidelites sort below every door in the catalogue',
   firstSide===-1 || lastDoor===-1 || firstSide>lastDoor, order.join(' | '));
await page.click('#clearFilters').catch(()=>{});
await page.waitForTimeout(300);

/* --- every add-on the vendor photographs has its picture ---------------- */
const accArt=designs.accessories||{};
ok('the catalogue photographs all three iron masks',
   ['Standard','Balfour','Windsor'].every(n=>accArt[n]), Object.keys(accArt).join(' | '));
ok('and the clavos, straps and speakeasy inserts',
   ['Round Clavos','Square Clavos','Straps','Wood Insert','Glass Insert'].every(n=>accArt[n]),
   Object.keys(accArt).join(' | '));
ok('every add-on picture file is on disk',
   Object.values(accArt).every(v=>fs.existsSync(ROOT+'/quoter/assets/designs/'+v.file)),
   String(Object.keys(accArt).length)+' files');

/* --- models the door pages never photograph, but the catalog does --------- */
const artOf=async model=>{
  await page.click('#clearFilters').catch(()=>{});
  await page.fill('#q',model); await page.waitForTimeout(500);
  return page.$$eval('#catalog article',(ns,n)=>{
    const h=ns.find(a=>a.querySelector('h3').textContent.trim()===n);
    if(!h) return 'no card';
    const img=h.querySelector('img');
    return img?img.getAttribute('src'):'silhouette';},model);
};
const grilleArt=await artOf('KA 3/4 Lite Iron Grille');
ok('the iron grille door shows a grille photograph, not a silhouette',
   /assets\/designs\/grille-/.test(grilleArt), grilleArt);
const decArt=await artOf('KA 3/4 Lite RM - Decorative Glass');
ok('the decorative-glass door shows the door glazed with one of its glasses',
   /assets\/designs\/glass-/.test(decArt), decArt);
const flatArt=await artOf('KA 3/4 Lite RM - Flat Glass');
ok('a door with neither keeps its drawn silhouette rather than borrowing one',
   flatArt==='silhouette', flatArt);
await page.click('#clearFilters').catch(()=>{});
await page.waitForTimeout(300);

/* --- the (--) in a part number is filled from the glass code legend ------ */
ok('the catalogue carries the glass code legend',
   (catalog.glassCodes||[]).length===12, String((catalog.glassCodes||[]).length));
await page.click('#clearFilters').catch(()=>{});
await openModel('KA 3/4 Lite RM - Flat Glass');
const glassOffered=await optionsOf('Glass');
ok('a row whose glass column is a page reference still asks which glass',
   glassOffered.length===10, glassOffered.join(' | '));
await driveModel({Glass:'Clear Low E', ...UNFIN_SLAB});
const skuLine=await page.$$eval('#detail p',ns=>{
  const n=ns.find(p=>/KA34/.test(p.textContent)); return n?n.textContent.trim():'';});
ok('a quote names the part the customer orders, not the (--) template',
   /KA34LE\d{4}/.test(skuLine) && !skuLine.includes('--'), skuLine);
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

ok('no console or page errors', errs.length===0, errs.slice(0,2).join(' | '));
console.log(T.join('\n'));
console.log('\n'+T.filter(t=>t.startsWith('PASS')).length+' passed, '+T.filter(t=>t.startsWith('FAIL')).length+' failed');
await b.close(); srv.close();
process.exit(T.some(t=>t.startsWith('FAIL'))?1:0);
