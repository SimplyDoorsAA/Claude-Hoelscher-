/* Front-facing app stress test: build real quotes through the UI and check the
   figures on screen against values recomputed here from the raw catalogue. */
// Playwright is resolved at run time so the suite is not tied to one machine's
// install path: set PLAYWRIGHT_MODULE to override.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ||
  '/opt/node22/lib/node_modules/playwright/index.mjs');
import http from 'node:http'; import fs from 'node:fs';
import path from 'node:path'; import url from 'node:url';
const ROOT=path.resolve(url.fileURLToPath(import.meta.url),'../..');
const OUT=process.env.SHOT_DIR||path.join(ROOT,'.test-output');
fs.mkdirSync(OUT,{recursive:true});
// A locally compiled Tailwind sheet makes the screenshots faithful. Without
// one the assertions still hold; only the pictures look unstyled.
const TWPATH=process.env.TAILWIND_CSS||path.join(OUT,'twbuild','tw.css');
const TW=fs.existsSync(TWPATH)?fs.readFileSync(TWPATH,'utf8'):'';
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'};
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]);
  const f=ROOT+(p.endsWith('/')?p+'index.html':p);
  let b=null; try{b=fs.readFileSync(f);}catch(e){r.writeHead(404);r.end('');return;}
  r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});
await new Promise(r=>srv.listen(8093,r));

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
await page.route('https://cdn.tailwindcss.com*',r=>r.fulfill({status:200,contentType:'text/javascript',
  body:'window.tailwind={config:{}};document.addEventListener("DOMContentLoaded",()=>{const s=document.createElement("style");s.textContent=window.__TW__;document.head.appendChild(s);});'}));
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await page.addInitScript(css=>{window.__TW__=css;},TW);

const total=async()=>(await page.$eval('#quoteTotals .font-display.text-2xl',n=>n.textContent)).trim();
const totalsText=async()=>(await page.textContent('#quoteTotals'));
const SIZE_PREFIX=/^\d{4,5}[A-Z]?\s+/;
const keyOf=p=>{
  const d=String(p.description||'').trim(), code=p.size&&p.size.code;
  if(code&&d.startsWith(code)&&/^\s/.test(d.slice(String(code).length))) return d.slice(String(code).length).trim();
  return d.replace(SIZE_PREFIX,'').trim();
};
const stains=(cat.fiberglassStainColors||[]).map(x=>x.name);
/* Answer whichever question the configurator is asking, until it prices. */
async function answer(product,finish,config){
  const want={
    'Glass': product.glazing,
    'Size': product.size&&product.size.label,
    'Iron grille': 'No grille',
    'Finish': finish==='unfinished'?'Unfinished':'Prefinished',
    'Stain colour': stains[0],
    'Opening': {slab:'Slab only',singlePH:'Single door',doublePH:'Double door'}[config],
    'Sidelite': null,
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
    const hit=await page.$$eval('#detail .opt',(ns,l)=>{
      const n=ns.find(x=>x.textContent.trim().startsWith(l)&&!x.disabled);
      if(!n) return false; n.click(); return true;},label);
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
  const resolved=await page.textContent('#detail');
  if(!resolved.includes(sku)) throw new Error('answers resolved to the wrong part, wanted '+sku);
  for(const a of accSkus){
    await page.selectOption('#detail select',{label:(all.find(p=>p.sku===a)||{}).description});
    await page.click('#detail button:has-text("Add")'); await page.waitForTimeout(300);
  }
  for(let i=1;i<qty;i++){ await page.click('#detail button[data-qty=inc]'); await page.waitForTimeout(120); }
  await page.click('#detail button:has-text("Add to quote")'); await page.waitForTimeout(700);
}

await page.goto('http://127.0.0.1:8093/quoter/');
await page.waitForSelector('#lineGate:not(.hidden)',{timeout:30000});
await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/Fiberglass/.test(n.textContent)).click();});
await page.waitForSelector('#catalog article',{timeout:30000});

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
ok('now showing the wood line', /Wood/.test(await page.textContent('#lineChip')));
const woodCount=await page.textContent('#resultCount');
const woodModels=new Set(cat.woodProducts.map(keyOf)).size;
ok('catalog switched to wood only, filters cleared',
   woodCount.startsWith(woodModels+' of '+woodModels), woodCount+' expected '+woodModels);
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

/* ---------------- sidelites in one opening vs separate lines ---------------- */
await page.click('#quoteTotals button:has-text("Clear")'); await page.waitForTimeout(600);
const mSL=cat.woodProducts.find(p=>p.type==='sidelite'&&p.line==='mahogany'&&p.prices.unfinished.slab!==null);
await addDoor('M1LV--3080','unfinished','singlePH',1,[mSL.sku,mSL.sku]);
const withSL=cost(m1.prices.unfinished.singlePH)+cost(mSL.prices.unfinished.slab)*2+PREHANG;
const uSL=1+0.5+0.5;
exp=sell(withSL,0.40)+sell(band(uSL),0.40);
ok('door + 2 sidelites is ONE prehang charge', await total()===fmt(exp), await total()+' vs '+fmt(exp));
ok('and counts 2 freight units', /2 freight units/.test(await totalsText()), (await totalsText()).slice(-90));

/* --- a real opening built through the configurator ----------------------
   Door + 2 sidelites picked as an opening, with every figure recomputed here
   from the raw catalogue rather than asked of the engine. */
await page.click('#quoteTotals button:has-text("Clear")').catch(()=>{});
await page.waitForTimeout(500);
await page.click('#closeQuote').catch(()=>{}); await page.waitForTimeout(300);
await page.click('#lineChip'); await page.waitForTimeout(500);
await page.$$eval('#lineChoices button',ns=>{const n=ns.find(x=>/Fiberglass/.test(x.textContent)); n&&n.click();});
await page.waitForTimeout(400);
await page.click('button:has-text("Start fresh")').catch(()=>{});
await page.waitForSelector('#catalog article',{timeout:30000});

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
  const l=ns[ns.length-1]; return [...l.querySelectorAll('.opt')].map(n=>n.textContent.trim());});
ok('an 6-8 door is offered only 6-9 sidelites',
   slOffered.length>0 && slOffered.every(o=>/6'9"/.test(o)) && !slOffered.some(o=>/8'1"/.test(o)),
   slOffered.join(' | '));
const sl=cat.fiberglassProducts.find(p=>p.type==='sidelite'&&p.size.heightIn===81&&
  p.prices.unfinished.singlePH!==null);
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
await page.click('#lineChip'); await page.waitForTimeout(500);
await page.$$eval('#lineChoices button',ns=>{const n=ns.find(x=>/Fiberglass/.test(x.textContent)); n&&n.click();});
await page.waitForTimeout(400);
await page.click('button:has-text("Start fresh")').catch(()=>{});
await page.waitForSelector('#catalog article',{timeout:30000});
await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(600);
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

ok('no console or page errors', errs.length===0, errs.slice(0,2).join(' | '));
console.log(T.join('\n'));
console.log('\n'+T.filter(t=>t.startsWith('PASS')).length+' passed, '+T.filter(t=>t.startsWith('FAIL')).length+' failed');
await b.close(); srv.close();
process.exit(T.some(t=>t.startsWith('FAIL'))?1:0);
