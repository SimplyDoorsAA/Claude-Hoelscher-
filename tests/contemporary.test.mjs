/* The Mahogany Contemporary section, walked through with the dealer on
   2026-09-11 against catalog pages 6 and 8-11 and page 1 of the Dealer Wood
   Pricing sheet (effective 7-1-2026).

   Two kinds of check live here. The first is a transcription: the sheet's own
   figures are typed in below and compared cell by cell, so a future edit to
   catalog.json that moves a Contemporary price fails here rather than on a
   purchase order. The second is behaviour: the questions the configurator asks
   about these doors, and the part numbers that come out the other end. */
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
  try{ const b=fs.readFileSync(f);
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); r.end(b);
  }catch(e){ r.writeHead(404); r.end('nf'); }
});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const BASE='http://127.0.0.1:'+srv.address().port;
const catalog=JSON.parse(fs.readFileSync(ROOT+'/data/catalog.json','utf8'));

const T=[]; const ok=(n,c,x='')=>T.push((c?'PASS':'FAIL')+'  '+n+(x?'  :: '+x:''));
let reported=false;
const report=()=>{ if(reported) return; reported=true;
  console.log(T.join('\n'));
  const f=T.filter(t=>t.startsWith('FAIL')).length;
  console.log('\n'+(T.length-f)+' passed, '+f+' failed'); };
process.on('uncaughtException',e=>{ report(); console.error('\nCRASHED: '+e.message); process.exit(1); });

/* ---------------- 1. the price sheet, transcribed ----------------
   [ part number, catalog page, unf slab, unf 1PH, unf 2PH, pre slab, pre 1PH, pre 2PH ]
   in whole dollars exactly as Hoelscher prints them. */
const SHEET=[
  ['M1LV--3080','8',1372,2160,3768,1889,3343,6134],
  ['M1LV--3680','8',1544,2375,4155,2148,3722,6849],
  ['M3GPW--2880','8',1346,2134,3716,1863,3317,6082],
  ['M3GPW--3068','8',1198,1917,3317,1629,2861,5205],
  ['M3GPW--3080','8',1346,2134,3716,1863,3317,6082],
  ['M3GPW--3680','8',1613,2444,4293,2217,3791,6987],
  ['M4GPW--3068','8',1201,1920,3323,1632,2864,5211],
  ['M5GPW--2880','8',1346,2134,3716,1863,3317,6082],
  ['M5GPW--3080','8',1346,2134,3716,1863,3317,6082],
  ['M5GPW--3680','8',1613,2444,4293,2217,3791,6987],
  ['M5HG--3068','9',1191,1910,3303,1622,2854,5191],
  ['M6HG--3080','9',1379,2167,3782,1896,3350,6148],
  ['M7P3080','9',846,1634,2716,1363,2817,5082],
  ['M7P3680','9',1018,1849,3103,1622,3196,5797],
  ['M1LCSL--1268','9',858,1361,1361,1160,2022,2022],
  ['M1LCSL--1280','9',962,1514,1514,1324,2342,2342],
  ['M3GPWN--2880--','10',1346,2134,3716,1863,3317,6082],
  ['M3GPWN--3080--','10',1346,2134,3716,1863,3317,6082],
  ['M4GPWN--2880--','10',1346,2134,3716,1863,3317,6082],
  ['M4GPWN--3080--','10',1346,2134,3716,1863,3317,6082],
  ['M5GPWN--2880--','11',1346,2134,3716,1863,3317,6082],
  ['M5GPWN--3080--','11',1346,2134,3716,1863,3317,6082]
];
const COLS=[['unfinished','slab'],['unfinished','singlePH'],['unfinished','doublePH'],
            ['prefinished','slab'],['prefinished','singlePH'],['prefinished','doublePH']];
const wood=catalog.woodProducts;
let cells=0, wrong=[];
for(const [sku,page,...vals] of SHEET){
  const p=wood.find(x=>x.sku===sku);
  if(!p){ wrong.push(sku+' missing'); continue; }
  if(String(p.catalogPage)!==page) wrong.push(sku+' page '+p.catalogPage+'!='+page);
  if(p.priceSheetPage!=='P.6')     wrong.push(sku+' glass '+p.priceSheetPage);
  COLS.forEach(([f,c],i)=>{ cells++;
    if(p.prices[f][c]!==vals[i]*100) wrong.push(sku+' '+f+'.'+c+' '+p.prices[f][c]+'!='+vals[i]*100); });
}
ok('every Contemporary price matches the dealer sheet, cell for cell',
   !wrong.length, cells+' cells across '+SHEET.length+' rows'+(wrong.length?' — '+wrong.slice(0,4).join('; '):''));
ok('the sheet\'s 0.48 is now confirmed by Hoelscher in print',
   JSON.parse(fs.readFileSync(ROOT+'/data/pricing-rules.json','utf8')).netMultiplierScope.vendorConfirmed===true);

/* ---------------- 2. the glass menu and its codes ---------------- */
const p6=(catalog.glassRules||[]).find(r=>r.appliesToPriceSheetPage==='P.6');
const WANT=['Clear Low E','Sandblast','Flemish','Digital','Rain','Reeded','Small Reeded','Satin'];
ok('page 6 carries a glass rule',!!p6);
ok('and it lists the eight glasses the dealer read off the page',
   !!p6 && p6.options.length===8 && WANT.every(g=>p6.options.includes(g)),
   p6?p6.options.join(', '):'none');
ok('every one of them has a code in the sheet\'s legend',
   !!p6 && p6.options.every(g=>(catalog.glassCodes||[]).some(c=>c.name===g)),
   (p6?p6.options.filter(g=>!(catalog.glassCodes||[]).some(c=>c.name===g)):[]).join(', ')||'all eight');
/* The dealer's legend governs wood: stem + code, never the CLE/R letters the
   marketing pages borrowed from the fiberglass range. */
ok('the wood codes are the legend\'s, not the fiberglass letters',
   !wood.some(p=>/^M.*(CLE|[^A-Z]R)\d{4}/.test(p.sku||'')));

/* ---------------- 3. one sidelite, not eleven ---------------- */
const slRule=(catalog.sideliteRules||[]).find(r=>r.appliesToPriceSheetPage==='P.6');
ok('the catalogue records which sidelite belongs beside a Contemporary door',!!slRule);
const p6Sidelites=wood.filter(p=>p.type==='sidelite'&&p.priceSheetPage==='P.6');
ok('and it is the Contemporary Full Lite, in two heights',
   p6Sidelites.length===2 && p6Sidelites.every(p=>/^M1LCSL/.test(p.sku)),
   p6Sidelites.map(p=>p.sku).join(', '));

/* ---------------- 4. the wood stains ---------------- */
const stains=catalog.woodStainColors||[];
ok('the six wood stains are in the catalogue',stains.length===6,stains.map(s=>s.name).join(', '));
ok('none of them moves the price or the part number',
   stains.every(s=>s.priceImpact==='none'&&s.code===null));

/* ---------------- 5. the app, driven ---------------- */
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
const optionsNow=()=>page.$$eval('#detail .steprow',ns=>
  [...ns[ns.length-1].querySelectorAll('.opt')].map(x=>x.textContent.trim()));
async function open(name,want){
  await page.click('#clearFilters').catch(()=>{});
  await page.fill('#q',name); await page.waitForTimeout(520);
  const found=await page.$$eval('#catalog article',(ns,n)=>{
    const h=ns.find(a=>a.querySelector('h3').textContent.trim()===n);
    if(!h) return false; h.querySelector('button').click(); return true;},name);
  if(!found) return false;
  await page.waitForSelector('#detail:not(.hidden)');
  for(let g=0;g<20;g++){
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
async function toMahogany(){
  await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});
  await page.goto(BASE+'/quoter/');
  await page.waitForSelector('#lineGate:not(.hidden)',{timeout:30000});
  await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/^Wood/.test(n.textContent.trim())).click();});
  await page.waitForTimeout(700);
  await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/^Mahogany/.test(n.textContent.trim())).click();});
  await page.waitForSelector('#catalog article',{timeout:30000});
}
const orderDoc=async who=>{
  await page.$$eval('#detail button',ns=>{const x=ns.find(n=>n.textContent.trim()==='Add to quote');if(x)x.click();});
  await page.waitForTimeout(600);
  await page.fill('#job_customer',who); await page.waitForTimeout(150);
  await page.click('#printOrder'); await page.waitForTimeout(500);
  return page.evaluate(()=>document.querySelector('#printDoc').textContent);
};

/* 5a. a glazed Contemporary door is asked about glass, and offered all eight */
await toMahogany();
await page.click('#clearFilters').catch(()=>{});
await page.fill('#q','3 Lite'); await page.waitForTimeout(520);
await page.$$eval('#catalog article',ns=>{
  const h=ns.find(a=>a.querySelector('h3').textContent.trim()==='3 Lite'); h.querySelector('button').click();});
await page.waitForSelector('#detail:not(.hidden)');
const firstStep=(await steps())[0];
const glassOpts=await optionsNow();
ok('the first question about a 3 Lite is now its glass',firstStep==='Glass',firstStep);
ok('and all eight glasses are offered',
   WANT.every(g=>glassOpts.some(o=>o.startsWith(g))) && glassOpts.length===8,
   glassOpts.length+' offered');

/* 5b. the glass reaches the part number through the legend */
await toMahogany();
await open('3 Lite',{Glass:'Reeded',Size:"3'0\" x 8'0\"",Finish:'Unfinished',
  Opening:'Single door',Handing:'Left hand',Swing:'Inswing','Jamb depth':'4-9/16'});
const reeded=await orderDoc('Glass Code Test');
ok('Reeded fills the (--) with the legend\'s RD',
   /M3GPWRD3080/.test(reeded),(reeded.match(/M3GPW\S*/)||['none'])[0]);
ok('and nothing on that order is flagged as unfinished business',!/placeholder/i.test(reeded));

/* 5c. a Contemporary door is offered one sidelite, not the whole wood range */
await toMahogany();
await open('1 Lite Vertical',{Glass:'Clear Low E',Size:"3'0\" x 8'0\"",Finish:'Unfinished',
  Opening:'Single + 1 sidelite'});
const st1=await steps();
ok('choosing a sidelite opening asks which sidelite',st1.includes('Sidelite'),st1.join(' > '));
const slOpts=await page.$$eval('#detail .steprow',ns=>{
  const i=ns.findIndex(r=>{const h=r.parentElement.querySelector('p');
    return h&&h.textContent.trim()==='Sidelite';});
  return i<0?[]:[...ns[i].querySelectorAll('.opt')].map(x=>x.textContent.trim());});
ok('and offers exactly the one the catalog pairs with it',slOpts.length===1,
   slOpts.join(' | ')||'none');
ok('which is the Contemporary Full Lite at the door\'s height',
   /Full Lite Sidelite/.test(slOpts[0]||'')&&/1'2" x 8'1"/.test(slOpts[0]||''),slOpts[0]||'none');

/* 5d. the sidelite is glazed like its door and carries its own part number */
await toMahogany();
await open('1 Lite Vertical',{Glass:'Satin',Size:"3'0\" x 8'0\"",Finish:'Unfinished',
  Opening:'Single + 1 sidelite',Handing:'Left hand',Swing:'Inswing','Jamb depth':'4-9/16'});
const withSL=await orderDoc('Sidelite Test');
ok('the sidelite reaches the order sheet as a part number, not a description',
   /M1LCSLSN1280/.test(withSL),(withSL.match(/M1LCSL\S*/)||['none'])[0]);
ok('glazed to match the door it stands beside',/M1LVSN3080/.test(withSL)&&/M1LCSLSN1280/.test(withSL));

/* 5e. a narrow-lite SLAB is still handed — the lite is offset for the handle */
await toMahogany();
await open('3 Lite Narrow LH/RH',{Glass:'Small Reeded',Size:"2'8\" x 8'0\"",
  Finish:'Unfinished',Opening:'Slab only',Handing:'Right hand'});
const slabSteps=await steps();
ok('a slab of a handed door is still asked its hand',slabSteps.includes('Handing'),slabSteps.join(' > '));
ok('and is not asked swing or jamb depth, having no frame',
   !slabSteps.includes('Swing')&&!slabSteps.includes('Jamb depth'),slabSteps.join(' > '));
const slabDoc=await orderDoc('Slab Handing Test');
ok('so the slab orders as a complete number',
   /M3GPWNSR2880R/.test(slabDoc),(slabDoc.match(/M3GPWN\S*/)||['none'])[0]);

/* 5f. a pair is two mirrored leaves, and the hand names the active one */
await toMahogany();
await open('3 Lite Narrow LH/RH',{Glass:'Small Reeded',Size:"3'0\" x 8'0\"",
  Finish:'Unfinished',Opening:'Double door',Handing:'Left hand active',
  Swing:'Outswing','Jamb depth':'4-9/16'});
const pairOpts=await page.$$eval('#detail .steprow',ns=>{
  const i=ns.findIndex(r=>{const h=r.parentElement.querySelector('p');
    return h&&h.textContent.trim()==='Handing';});
  return i<0?[]:[...ns[i].querySelectorAll('.opt')].map(x=>x.textContent.trim());});
ok('on a pair the hand is put as which leaf is active',
   pairOpts.some(o=>/Left hand active/i.test(o))&&pairOpts.some(o=>/Right hand active/i.test(o)),
   pairOpts.join(' | '));
const pairDoc=await orderDoc('Double Test');
ok('and both mirrored part numbers go on the order',
   /M3GPWNSR3080L/.test(pairDoc)&&/M3GPWNSR3080R/.test(pairDoc),
   (pairDoc.match(/M3GPWNSR3080./g)||['none']).join(' + '));
ok('said in words so nobody orders two of the same hand',/one of each hand/i.test(pairDoc));

/* 5g. the stains: required on a prefinished wood door, absent on an unfinished one */
await toMahogany();
/* A label nothing starts with, so open() stops at the stain rather than
   answering it for us — the point being what happens while it is unanswered. */
await open('7 Panel',{Size:"3'0\" x 8'0\"",Finish:'Prefinished','Stain colour':'\u0000'});
const stainSteps=await steps();
ok('a prefinished mahogany door is asked for a stain',stainSteps.includes('Stain colour'),
   stainSteps.join(' > '));
const stainOpts=await page.$$eval('#detail .steprow',ns=>{
  const i=ns.findIndex(r=>{const h=r.parentElement.querySelector('p');
    return h&&h.textContent.trim()==='Stain colour';});
  return i<0?[]:[...ns[i].querySelectorAll('.opt')].map(x=>x.textContent.trim());});
ok('and offered the six off the dealer\'s chart',stainOpts.length===6,stainOpts.join(', '));
ok('the question blocks the price until it is answered',
   !(await page.$('#detail .font-display.text-3xl')) &&
   stainSteps[stainSteps.length-1]==='Stain colour',
   stainSteps.join(' > '));
await toMahogany();
await open('7 Panel',{Size:"3'0\" x 8'0\"",Finish:'Unfinished',Opening:'Single door',
  Handing:'Left hand',Swing:'Inswing','Jamb depth':'4-9/16'});
const unfSteps=await steps();
ok('an unfinished door is never offered a stain',!unfSteps.includes('Stain colour'),unfSteps.join(' > '));

/* 5h. the solid 7 Panel skips glass but keeps its sidelite */
ok('the 7 Panel is asked no glass question, its number holding no (--)',
   !unfSteps.includes('Glass'),unfSteps.join(' > '));
await toMahogany();
await open('7 Panel',{Size:"3'0\" x 8'0\"",Finish:'Unfinished',Opening:'Single + 1 sidelite'});
ok('and is still offered the Contemporary sidelite beside it',
   (await steps()).includes('Sidelite'),(await steps()).join(' > '));

ok('no console or page errors',!errs.length,errs.slice(0,3).join(' | '));
report();
await b.close(); srv.close();
process.exit(T.filter(t=>t.startsWith('FAIL')).length?1:0);
