/* Prehang adders, simulated divided lites and a custom margin — the three
   things that put money on a quote which nothing used to offer. Each expected
   figure is recomputed here from the catalogue and the rules file, never read
   back off the app. */
import { playwright } from './playwright.mjs';
const { chromium } = await playwright();
import http from 'node:http'; import fs from 'node:fs';
import path from 'node:path'; import url from 'node:url';
import { createEngine, formatCents, applyMargin, roundCents } from '../packages/pricing-engine/index.js';

const ROOT=path.resolve(url.fileURLToPath(import.meta.url),'../..');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json',
            '.webp':'image/webp','.png':'image/png','.css':'text/css'};
const srv=http.createServer((q,r)=>{
  const p=decodeURIComponent(q.url.split('?')[0]);
  const f=ROOT+(p.endsWith('/')?p+'index.html':p);
  try{ const b=fs.readFileSync(f);
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); r.end(b);
  }catch(e){ r.writeHead(404); r.end('nf'); }
});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const BASE='http://127.0.0.1:'+srv.address().port;

const catalog=JSON.parse(fs.readFileSync(ROOT+'/data/catalog.json','utf8'));
const rules  =JSON.parse(fs.readFileSync(ROOT+'/data/pricing-rules.json','utf8'));
const est    =JSON.parse(fs.readFileSync(ROOT+'/data/estimate.json','utf8'));
const engine =createEngine(catalog,rules);
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
const b=await chromium.launch();
const page=await (await b.newContext({viewport:{width:1440,height:1000}})).newPage();
const errs=[];
page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
page.on('console',m=>{if(m.type()==='error'&&!/favicon|Failed to load resource/i.test(m.text()))errs.push(m.text());});
await page.route('https://cdn.tailwindcss.com*',r=>r.abort());
await page.route('https://fonts.googleapis.com/**',r=>r.abort());
await page.addInitScript(()=>{window.__printed=0;window.print=()=>{window.__printed++;};});

const steps=()=>page.$$eval('#detail .steprow',ns=>ns.map(r=>{
  const h=r.parentElement.querySelector('p'); return h?h.textContent.trim():''; }).filter(Boolean));
async function open(name,want){
  await page.click('#clearFilters').catch(()=>{});
  await page.fill('#q',name); await page.waitForTimeout(520);
  const found=await page.$$eval('#catalog article',(ns,n)=>{
    const h=ns.find(a=>a.querySelector('h3').textContent.trim()===n);
    if(!h) return false; h.querySelector('button').click(); return true;},name);
  if(!found) return false;
  await page.waitForSelector('#detail:not(.hidden)');
  for(let g=0;g<18;g++){
    if(await page.$('#detail .font-display.text-3xl')) break;
    const st=await steps();
    const hit=await page.$$eval('#detail .steprow',(ns,l)=>{
      const o=[...ns[ns.length-1].querySelectorAll('.opt')].filter(x=>!x.disabled);
      const n=l?o.find(x=>x.textContent.trim().startsWith(l)):o[0];
      if(!n) return false; n.click(); return true;},want[st[st.length-1]]||null);
    if(!hit) break;
    await page.waitForTimeout(180);
  }
  return true;
}
const priceShown=()=>page.$eval('#detail .font-display.text-3xl',n=>n.textContent.trim());

await page.goto(BASE+'/quoter/');
await page.waitForSelector('#lineGate:not(.hidden)',{timeout:30000});
await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/^Wood/.test(n.textContent.trim())).click();});
await page.waitForTimeout(700);
await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/^Knotty Alder/.test(n.textContent.trim())).click();});
await page.waitForSelector('#catalog article',{timeout:30000});

/* ---------------- prehang adders ---------------- */
const R=catalog.prehangAdderRules;
ok('the catalogue publishes the adder mapping', !!R && !!R.configurationPattern);
const allAdders=[...catalog.fiberglassPrehangAdders,...catalog.woodPrehangAdders];
ok('and every adder row is reachable through it',
   allAdders.every(a=>{
     const size=a.configuration.match(/^\d{4}/)[0];
     const pat=R.configurationPattern[a.topStyle];
     if(!pat) return false;
     if(pat.indexOf('{opening}')<0) return pat.replace('{size}',size)===a.configuration;
     return Object.values(R.openingWords).some(w=>
       pat.replace('{size}',size).replace('{opening}',w)===a.configuration);
   }), allAdders.length+' rows');

await open('KA 4 Lite 1 Panel RM',{Size:"3'0\" x 8'0\"",Finish:'Unfinished',Opening:'Single door',
  Handing:'Left hand',Swing:'Inswing','Jamb depth':'4-9/16'});
const adders=await page.$$eval('#detail label',ns=>ns.filter(l=>l.querySelector('input[type=checkbox]'))
  .map(l=>l.textContent.replace(/\s+/g,' ').trim()));
ok('a prehung opening is offered its casing and trim', adders.length===2, adders.join(' | '));
ok('named for a customer, not in the sheet\'s shorthand',
   adders.some(a=>/Interior casing/.test(a)) && adders.some(a=>/1×4/.test(a)),
   adders.join(' | '));
ok('and never as the raw adderType', !adders.some(a=>/intCasing/.test(a)));

/* the row the app picked must be the one the sheet keys to this opening */
const prod=catalog.woodProducts.find(p=>/4 Lite 1 Panel RM/.test(p.description||'')&&
  p.line==='knotty_alder'&&p.size.code==='3080');
const wantCfg=prod.size.code+' Single';
const expected=catalog.woodPrehangAdders.filter(a=>a.topStyle==='Square Top'&&a.configuration===wantCfg);
ok('the sheet keys two rows to this size and opening', expected.length===2,
   expected.map(a=>a.adderType+' $'+(a.priceCents/100)).join(' | '));
const shownMoney=adders.map(a=>(a.match(/\$[\d,]+\.\d\d/)||[''])[0]);
const wantMoney=expected.map(a=>formatCents(sell(cost(a.priceCents),RETAIL)));
ok('each is priced at list x 0.48, then the margin',
   wantMoney.every(m=>shownMoney.includes(m)), shownMoney.join(' | ')+' vs '+wantMoney.join(' | '));

const before=await priceShown();
await page.$$eval('#detail label',ns=>{const l=ns.find(x=>/Interior casing/.test(x.textContent));
  l.querySelector('input').click();});
await page.waitForTimeout(350);
const after=await priceShown();
const cas=expected.find(a=>a.adderType==='intCasing');
const money=s=>{const m=/^\$([\d,]+)\.(\d\d)$/.exec(s); return m?parseInt(m[1].replace(/,/g,''),10)*100+parseInt(m[2],10):null;};
ok('ticking casing adds exactly its priced amount to the door',
   money(after)-money(before)===sell(cost(cas.priceCents),RETAIL),
   before+' -> '+after+'  (+'+formatCents(money(after)-money(before))+')');

/* ---------------- simulated divided lites ---------------- */
/* The factory grid is the SDL door's alone on wood (tests/sdl.test.mjs drives
   it); a knotty alder door is offered none, so a sales person cannot add a
   per-lite charge the catalog never prints for this door. */
ok('a knotty alder door is not offered the factory grid',
   !/Grid applied at the factory/.test(await page.textContent('#detail')) &&
   !(await steps()).includes('Simulated divided lites'));

await page.$$eval('#detail button',ns=>{const b=ns.find(x=>x.textContent.trim()==='Add to quote');b.click();});
await page.waitForTimeout(600);

/* ---------------- a slab takes neither ---------------- */
await page.keyboard.press('Escape').catch(()=>{});
await open('KA 4 Lite 1 Panel RM',{Size:"3'0\" x 8'0\"",Finish:'Unfinished',Opening:'Slab only'});
const slabText=await page.textContent('#detail');
ok('a slab is told why it takes no prehang adder',
   /takes no prehang adder/i.test(slabText));
ok('and is offered no casing checkbox',
   (await page.$$eval('#detail input[type=checkbox]',ns=>ns.length))===0);
await page.keyboard.press('Escape'); await page.waitForTimeout(250);

/* ---------------- custom margin ---------------- */
const q0=await page.$eval('#quoteTotals .font-display.text-2xl',n=>n.textContent.trim());
const spec=await page.evaluate(()=>JSON.parse(localStorage.getItem('simplydoors.quote.v1')||'{}'));
const expRetail=engine.priceQuote({lines:spec.lines,marginTier:'retail'});
ok('the quote totals at the retail margin to begin with',
   q0===formatCents(expRetail.grandTotalSellCents), q0+' vs '+formatCents(expRetail.grandTotalSellCents));
await page.click('#closeQuote').catch(()=>{});
await page.waitForTimeout(300);
await page.click('#tierCustom'); await page.waitForTimeout(400);
ok('choosing Custom does not move the price by itself',
   (await page.evaluate(()=>JSON.parse(localStorage.getItem('simplydoors.custommargin.v1')))) === RETAIL,
   String(await page.evaluate(()=>localStorage.getItem('simplydoors.custommargin.v1'))));
await page.fill('#customMargin','22'); await page.waitForTimeout(450);
await page.click('#openQuote'); await page.waitForTimeout(400);
const q22=await page.$eval('#quoteTotals .font-display.text-2xl',n=>n.textContent.trim());
const exp22=engine.priceQuote({lines:spec.lines,marginTier:'custom',marginPercent:0.22});
ok('a custom margin reprices the whole quote through the engine',
   q22===formatCents(exp22.grandTotalSellCents), q22+' vs '+formatCents(exp22.grandTotalSellCents));
ok('and the drawer names it', /22% margin/.test(await page.textContent('#quoteTotals')),
   (await page.textContent('#quoteTotals')).replace(/\s+/g,' ').slice(0,90));
ok('a margin of 100% or more is refused, never divided by zero', await (async()=>{
  await page.fill('#customMargin','100'); await page.waitForTimeout(300);
  const still=await page.$eval('#quoteTotals .font-display.text-2xl',n=>n.textContent.trim());
  return still===formatCents(exp22.grandTotalSellCents);
})());

/* ---------------- what the customer's page says ---------------- */
await page.fill('#customMargin','22'); await page.waitForTimeout(350);
await page.fill('#job_customer','Test Customer'); await page.waitForTimeout(120);
await page.click('#printQuote'); await page.waitForTimeout(500);
const doc=await page.evaluate(()=>document.querySelector('#printDoc').textContent);
ok('the estimate names the casing in words',
   /Interior casing/.test(doc) && !/intCasing/.test(doc));
ok('and never prints the sheet\'s internal shorthand',
   !/Square Top · 3068 Single/.test(doc) && !/\bwood · Square Top\b/.test(doc));
ok('and no lites are described on it, since none could be added', !/simulated divided lites/i.test(doc));
const estMaterials=engine.priceQuote({lines:spec.lines,marginTier:'custom',marginPercent:0.22}).grandTotalSellCents;
ok('and the estimate totals at the custom margin too',
   doc.includes(formatCents(estMaterials)), formatCents(estMaterials));

/* ---------------- the two data corrections ---------------- */
await page.keyboard.press('Escape').catch(()=>{});
await page.click('#closeQuote').catch(()=>{});
await page.waitForTimeout(300);
await open('KA Circle Top 2 Panel VG',{Size:"3'0\" x 8'0\"",Speakeasy:'Speakeasy kit',Insert:'Wood panel'});
const masks=await page.$$eval('#detail .steprow',ns=>{
  const row=ns.find(r=>{const h=r.parentElement.querySelector('p');
    return h && h.textContent.trim()==='Iron mask';});
  return row?[...row.querySelectorAll('.opt')].map(n=>({t:n.textContent.trim(),off:n.disabled,tip:n.title})):[];});
const balfour=masks.find(m=>m.t.startsWith('Balfour'));
ok('Balfour on a circle top reads as not made, not as not priced',
   balfour && balfour.off && /not made/i.test(balfour.t) && /does not fit/i.test(balfour.tip||''),
   balfour?JSON.stringify(balfour):'missing');
await page.keyboard.press('Escape'); await page.waitForTimeout(250);

/* Start clean rather than steering the app through a line switch with a quote
   already on it: this section is about what the catalogue shows, not about the
   switch. */
await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});
await page.goto(BASE+'/quoter/');
await page.waitForSelector('#lineGate:not(.hidden)',{timeout:30000});
await page.$$eval('#lineChoices button',ns=>{
  const n=ns.find(x=>/^Fiberglass/.test(x.textContent.trim())); (n||ns[0]).click();});
await page.waitForTimeout(800);
if(await page.isVisible('#lineGate')) await page.$$eval('#lineChoices button',ns=>ns[0].click());
await page.waitForSelector('#catalog article',{timeout:30000});
await page.click('#clearFilters').catch(()=>{});
await page.fill('#q','Speakeasy'); await page.waitForTimeout(600);
const fgCards=await page.$$eval('#catalog article h3',ns=>ns.map(n=>n.textContent.trim()));
ok('the fiberglass speakeasy cards the dealer does not sell are gone',
   fgCards.length===0, fgCards.join(' | ')||'none');
ok('but the rows stay in the catalogue for reference',
   catalog.fiberglassProducts.some(p=>/w\/ ?Speakeasy/i.test(p.description||'')));

/* ---- a part number with a placeholder nobody can fill ---- */
/* The dealer's own print showed KACMCBLE3080- going onto an order sheet with a
   trailing placeholder still in it. That number reaches Hoelscher, so the sheet
   has to say it is incomplete rather than print it as though it were not. */
await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});
await page.goto(BASE+'/quoter/');
await page.waitForSelector('#lineGate:not(.hidden)',{timeout:30000});
await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/^Wood/.test(n.textContent.trim())).click();});
await page.waitForTimeout(700);
await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/^Knotty Alder/.test(n.textContent.trim())).click();});
await page.waitForSelector('#catalog article',{timeout:30000});
const craft=catalog.woodProducts.find(p=>/-$/.test(p.sku||'')&&/Craftsman/.test(p.description||''));
ok('the catalogue still prints a Craftsman number with a trailing placeholder',
   !!craft, craft?craft.sku:'none');
await open('KA Craftsman',{Size:"3'0\" x 8'0\"",Finish:'Unfinished',Opening:'Single door',
  Handing:'Left hand',Swing:'Inswing','Jamb depth':'4-9/16'});
await page.$$eval('#detail button',ns=>{const b=ns.find(x=>x.textContent.trim()==='Add to quote');if(b)b.click();});
await page.waitForTimeout(600);
await page.fill('#job_customer','Placeholder Test'); await page.waitForTimeout(150);
await page.click('#printOrder'); await page.waitForTimeout(500);
const order=await page.evaluate(()=>document.querySelector('#printDoc').textContent);
ok('the order sheet warns that the number holds a placeholder',
   /placeholder/i.test(order), (order.match(/[^.]*placeholder[^.]*\./i)||['not warned'])[0].trim().slice(0,110));
ok('and names the number it applies to',
   /KACM\w*-/.test(order), (order.match(/KACM\S*/)||['none'])[0]);

/* ---- the trailing placeholder is handing ----
   The dealer supplied catalog page 10's numbers in full: M3GPWNSR2880L and
   M3GPWNSR2880R. The app must reproduce them from the sheet's
   M3GPWN--2880-- rather than print a placeholder onto a purchase order. */
const ph=catalog.skuPlaceholders||{};
const handRule=(ph.handing||[])[0];
ok('the catalogue records what a trailing placeholder holds',
   !!handRule && handRule.codes.left==='L' && handRule.codes.right==='R',
   handRule?JSON.stringify(handRule.codes):'missing');
const handRows=[...catalog.fiberglassProducts,...catalog.woodProducts]
  .filter(p=>new RegExp(handRule.appliesToSkuPattern).test(p.sku||''));
ok('and the pattern claims exactly the six rows the dealer confirmed',
   handRows.length===6 && handRows.every(p=>/Narrow LH\/RH/.test(p.description||'')),
   handRows.map(p=>p.sku).join(' | '));
ok('it does not claim the two Craftsman rows, which are unconfirmed',
   !handRows.some(p=>/Craftsman/.test(p.description||'')));

await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});
await page.goto(BASE+'/quoter/');
await page.waitForSelector('#lineGate:not(.hidden)',{timeout:30000});
await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/^Wood/.test(n.textContent.trim())).click();});
await page.waitForTimeout(700);
await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/^Mahogany/.test(n.textContent.trim())).click();});
await page.waitForSelector('#catalog article',{timeout:30000});
await open('3 Lite Narrow LH/RH',{Size:"2'8\" x 8'0\"",Finish:'Unfinished',Opening:'Single door',
  Handing:'Left hand',Swing:'Inswing','Jamb depth':'4-9/16'});
await page.$$eval('#detail button',ns=>{const b=ns.find(x=>x.textContent.trim()==='Add to quote');if(b)b.click();});
await page.waitForTimeout(600);
await page.fill('#job_customer','Handing Test'); await page.waitForTimeout(150);
await page.click('#printOrder'); await page.waitForTimeout(500);
const handDoc=await page.evaluate(()=>document.querySelector('#printDoc').textContent);
ok('a left-hand door carries the L the dealer\'s catalog page prints',
   /M3GPWN\S*2880L/.test(handDoc), (handDoc.match(/M3GPWN\S*/)||['none'])[0]);
/* Until the page-6 glass rule existed this number went out as M3GPWN--2880L
   and the sheet flagged it. Both halves are now fillable, so the assertion is
   the other way round: complete, and no warning. */
ok('and the page-6 rule fills the glass half, so nothing is flagged',
   /M3GPWNLE2880L/.test(handDoc) && !/placeholder/i.test(handDoc),
   (handDoc.match(/M3GPWN\S*/)||['none'])[0]);

ok('no console or page errors', !errs.length, errs.slice(0,3).join(' | '));
report();
await b.close(); srv.close();
process.exit(T.filter(t=>t.startsWith('FAIL')).length?1:0);
