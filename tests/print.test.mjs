/* The printed documents. A quote is a page a customer signs, so the figures on
   it are checked against the catalogue rather than against the app: the tax,
   the deposit and the job total are all recomputed here from data/estimate.json
   and the pricing engine, and compared to what the page actually prints. */
import { playwright } from './playwright.mjs';
const { chromium } = await playwright();
import http from 'node:http'; import fs from 'node:fs';
import path from 'node:path'; import url from 'node:url';
import { createEngine, formatCents, roundCents } from '../packages/pricing-engine/index.js';

const ROOT=path.resolve(url.fileURLToPath(import.meta.url),'../..');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json',
            '.webp':'image/webp','.png':'image/png','.css':'text/css'};
const srv=http.createServer((q,r)=>{
  const p=decodeURIComponent(q.url.split('?')[0]);
  const f=ROOT+(p.endsWith('/')?p+'index.html':p);
  try{ const b=fs.readFileSync(f);
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); r.end(b);
  }catch(e){ r.writeHead(404,{'Content-Type':'text/plain'}); r.end('nf'); }
});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const BASE='http://127.0.0.1:'+srv.address().port;

const catalog=JSON.parse(fs.readFileSync(ROOT+'/data/catalog.json','utf8'));
const rules  =JSON.parse(fs.readFileSync(ROOT+'/data/pricing-rules.json','utf8'));
const est    =JSON.parse(fs.readFileSync(ROOT+'/data/estimate.json','utf8'));
const engine =createEngine(catalog,rules);

const T=[]; const ok=(n,c,x='')=>T.push((c?'PASS':'FAIL')+'  '+n+(x?'  :: '+x:''));
const b=await chromium.launch();
const page=await (await b.newContext({viewport:{width:1440,height:1000}})).newPage();
const errs=[];
page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
page.on('console',m=>{if(m.type()==='error'&&!/favicon|Failed to load resource/i.test(m.text()))errs.push(m.text());});
// The fallback stylesheet is what a print looks like when the CDN is down, and
// the document must be identical either way, so the CDN is blocked outright.
await page.route('https://cdn.tailwindcss.com*',r=>r.abort());
await page.route('https://fonts.googleapis.com/**',r=>r.abort());
// window.print() would block the run; count the calls instead.
await page.addInitScript(()=>{window.__printed=0;window.print=()=>{window.__printed++;};});

const steps=()=>page.$$eval('#detail .steprow',ns=>ns.map(r=>{
  const h=r.parentElement.querySelector('p'); return h?h.textContent.trim():''; }).filter(Boolean));
async function addDoor(name,want){
  await page.click('#clearFilters').catch(()=>{});
  await page.fill('#q',name); await page.waitForTimeout(520);
  const found=await page.$$eval('#catalog article',(ns,n)=>{
    const h=ns.find(a=>a.querySelector('h3').textContent.trim()===n);
    if(!h) return false; h.querySelector('button').click(); return true;},name);
  if(!found) return false;
  await page.waitForSelector('#detail:not(.hidden)');
  for(let g=0;g<18;g++){
    if(await page.$('#detail .font-display.text-3xl')) break;
    const st=await steps(); const last=st[st.length-1];
    const hit=await page.$$eval('#detail .steprow',(ns,l)=>{
      const o=[...ns[ns.length-1].querySelectorAll('.opt')].filter(x=>!x.disabled);
      const n=l?o.find(x=>x.textContent.trim().startsWith(l)):o[0];
      if(!n) return false; n.click(); return true;},want[last]||null);
    if(!hit) break;
    await page.waitForTimeout(180);
  }
  await page.$$eval('#detail button',ns=>{const x=ns.find(n=>n.textContent.trim()==='Add to quote');if(x)x.click();});
  await page.waitForTimeout(520);
  return true;
}

await page.goto(BASE+'/quoter/');
await page.waitForSelector('#lineGate:not(.hidden)',{timeout:30000});
await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/^Wood/.test(n.textContent.trim())).click();});
await page.waitForTimeout(700);
await page.$$eval('#lineChoices button',ns=>{ns.find(n=>/^Knotty Alder/.test(n.textContent.trim())).click();});
await page.waitForSelector('#catalog article',{timeout:30000});

ok('the drawer asks who the quote is for', (await page.$$eval('#jobPanel input',ns=>ns.length))===6,
   String(await page.$$eval('#jobPanel input',ns=>ns.length))+' fields');

await addDoor('KA 2 Panel Square VG',{Size:"3'0\" x 6'8\"",Speakeasy:'Speakeasy kit',
  Insert:'Wood panel','Iron mask':'Balfour',Finish:'Unfinished',Opening:'Single door',
  Handing:'Left hand',Swing:'Inswing','Jamb depth':'4-9/16'});
await addDoor('KA 4 Lite 1 Panel RM',{Finish:'Unfinished',Opening:'Single + 2 sidelites',
  Handing:'Right hand',Swing:'Inswing','Jamb depth':'6-9/16'});

const LABOR='1850.00';
for(const [k,v] of [['customer','Test Customer'],['location','1 Example St, Schertz TX'],
                    ['phone','210-555-0100'],['email','test@example.com'],
                    ['description','Front entry'],['labor',LABOR]]){
  await page.fill('#job_'+k,v); await page.waitForTimeout(60);
}
await page.waitForTimeout(300);

/* what the quote SHOULD come to, recomputed here */
const spec=await page.evaluate(()=>JSON.parse(localStorage.getItem('simplydoors.quote.v1')||'{}'));
const lines=(spec.lines||spec||[]).lines||spec.lines||[];
const q=engine.priceQuote({lines,marginTier:spec.marginTier||'retail'});
const rate=est.estimate.salesTaxRate;
const materials=q.grandTotalSellCents;
const tax=roundCents(materials*rate);
const labor=185000;
const deposit=materials+tax;
const jobTotal=deposit+labor;

ok('the quote carries two lines', q.lineCount===2, String(q.lineCount));

await page.click('#printQuote'); await page.waitForTimeout(500);
ok('Print quote calls the browser print dialog once',
   (await page.evaluate(()=>window.__printed))===1);

const pd=await page.evaluate(()=>{
  const doc=document.querySelector('#printDoc');
  const pages=[...doc.querySelectorAll('.pd-page')];
  const rows=[...doc.querySelectorAll('table.pd-t tbody tr')].map(tr=>
    [...tr.querySelectorAll('td')].map(td=>td.textContent.trim()));
  const lines=[...doc.querySelectorAll('.pd-line')].map(l=>
    [...l.children].map(c=>c.textContent.trim()));
  return {pages:pages.length, rows, lines, text:doc.textContent,
          terms:doc.querySelectorAll('.pd-terms section').length,
          mark:!!doc.querySelector('.pd-mark')};
});
ok('the estimate prints with its terms behind it', pd.pages===2, pd.pages+' pages');
ok('and carries the letterhead', pd.mark);
ok('every terms section prints', pd.terms===est.terms.sections.length,
   pd.terms+' of '+est.terms.sections.length);

/* the money on the page */
const find=(label)=>{ const r=pd.lines.find(l=>l[0].startsWith(label)); return r?r[1]:null; };
ok('materials on the estimate is the quote total',
   find('Materials')===formatCents(materials), find('Materials')+' vs '+formatCents(materials));
ok('sales tax is materials x '+(rate*100).toFixed(2)+'%',
   find('Sales tax')===formatCents(tax), find('Sales tax')+' vs '+formatCents(tax));
ok('labor is the figure the office typed, to the cent',
   find('Labor')===formatCents(labor), find('Labor')+' vs '+formatCents(labor));
ok('the deposit is materials plus tax, and excludes labor',
   find('Total deposit required')===formatCents(deposit),
   find('Total deposit required')+' vs '+formatCents(deposit));
ok('the job total is materials plus tax plus labor',
   find('Job total')===formatCents(jobTotal), find('Job total')+' vs '+formatCents(jobTotal));

/* the column a customer adds up */
const money=s=>{const m=/^\$([\d,]+)\.(\d\d)$/.exec(s); return m?parseInt(m[1].replace(/,/g,''),10)*100+parseInt(m[2],10):null;};
const listed=pd.rows.map(r=>money(r[3])).filter(v=>v!==null);
const listedSum=listed.reduce((a,c)=>a+c,0);
ok('the Product and Services column adds up to materials',
   listedSum===materials, formatCents(listedSum)+' vs '+formatCents(materials));
ok('the banded crate charge is a line of its own, not hidden in a door',
   pd.rows.some(r=>/Crating/i.test(r[0])), pd.rows.map(r=>r[0].split('\n')[0]).join(' | '));

ok('the estimate carries no credit card fee', !/credit card processing/i.test(pd.text));
ok('and no freight line a customer would read as delivery to their house',
   !/^\s*freight\s*$/im.test(pd.text));
ok('the signature block is on the page',
   /Customer Signature/.test(pd.text) && /Customer Approval/.test(pd.text));
ok('the customer is named in the approval clause',
   pd.text.includes('I, Test Customer, have thoroughly reviewed'));
ok('a quote number was spent and printed',
   /SD-\d{4,}/.test(pd.text), (pd.text.match(/SD-\d+/)||['none'])[0]);

/* nothing but the document prints */
await page.emulateMedia({media:'print'}); await page.waitForTimeout(220);
const vis=await page.evaluate(()=>{
  const shown=e=>!!e&&e.getClientRects().length>0;
  return {header:shown(document.querySelector('header')),
          catalog:shown(document.querySelector('#catalog')),
          drawer:shown(document.querySelector('#drawer')),
          doc:shown(document.querySelector('#printDoc')),
          buttons:[...document.querySelectorAll('button')].filter(shown).length,
          inputs:[...document.querySelectorAll('input')].filter(shown).length};
});
ok('printing shows the document and nothing else',
   vis.doc && !vis.header && !vis.catalog && !vis.drawer, JSON.stringify(vis));
ok('no button or form field reaches the paper',
   vis.buttons===0 && vis.inputs===0, vis.buttons+' buttons, '+vis.inputs+' inputs');
await page.emulateMedia({media:'screen'}); await page.waitForTimeout(160);

/* the order sheet */
await page.click('#printOrder'); await page.waitForTimeout(450);
const od=await page.evaluate(()=>{
  const doc=document.querySelector('#printDoc');
  return {pages:doc.querySelectorAll('.pd-page').length,
          rows:[...doc.querySelectorAll('table.pd-t tbody tr')].map(tr=>
            [...tr.querySelectorAll('td')].map(td=>td.textContent.trim())),
          lines:[...doc.querySelectorAll('.pd-line')].map(l=>
            [...l.children].map(c=>c.textContent.trim())),
          text:doc.textContent};
});
ok('the order sheet is one page, with no terms', od.pages===1, od.pages+' pages');
const ofind=l=>{const r=od.lines.find(x=>x[0].startsWith(l)); return r?r[1]:null;};
ok('order sheet doors and accessories equal the engine line cost',
   ofind('Doors & accessories')===formatCents(q.lineCostCents),
   ofind('Doors & accessories')+' vs '+formatCents(q.lineCostCents));
ok('and the total net cost is that plus the crate charge',
   ofind('Total net cost')===formatCents(q.totalCostCents),
   ofind('Total net cost')+' vs '+formatCents(q.totalCostCents));
ok('the prehang charge is named as included, never added twice',
   /incl\..*prehang/i.test(od.text) &&
   money(ofind('Doors & accessories'))+money(ofind('Crate & shipping'))===money(ofind('Total net cost')),
   ofind('Doors & accessories')+' + '+ofind('Crate & shipping')+' = '+ofind('Total net cost'));
ok('every ordered line carries a part number and its description',
   od.rows.length>0 && od.rows.every(r=>/[A-Z]{2,}[0-9]/.test(r[0])),
   od.rows.map(r=>r[0].split('\n')[0]).join(' | '));
ok('the order sheet shows cost, not customer pricing',
   /SimplyDoors net, not customer pricing/i.test(od.text));
ok('it names the vendor it is ordered from',
   od.text.includes(est.orderSheet.vendor), est.orderSheet.vendor);

/* a misprinted part number is flagged where it is ordered */
const mis=est.speakeasy||catalog.speakeasyOptions;
const bad=mis.skuCorrections.find(c=>c.printed==='KA2PASEBW2880');
ok('the catalogue still records the misprinted part numbers',
   !!bad && mis.skuCorrections.length===4, String(mis.skuCorrections.length));

/* the number advances */
await page.click('#printQuote'); await page.waitForTimeout(300);
const first=(pd.text.match(/SD-(\d+)/)||[])[1];
await page.evaluate(()=>{document.querySelector('#printDoc').textContent='';});
await page.click('#printQuote'); await page.waitForTimeout(300);
const again=await page.evaluate(()=>(document.querySelector('#printDoc').textContent.match(/SD-(\d+)/)||[])[1]);
ok('a quote keeps its number until the quote is cleared', again===first,
   'SD-'+first+' then SD-'+again);

ok('no console or page errors', !errs.length, errs.slice(0,3).join(' | '));

console.log(T.join('\n'));
const fails=T.filter(t=>t.startsWith('FAIL')).length;
console.log('\n'+(T.length-fails)+' passed, '+fails+' failed');
await b.close(); srv.close();
process.exit(fails?1:0);
