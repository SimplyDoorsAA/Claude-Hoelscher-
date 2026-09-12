/* Mahogany iron grilles — catalog pages 34–36 (2/3 Arch Lite and 2/3 Lite).

   The sheet prices one generic row per size; the catalog prints a number per
   design, stem + grille infix + C, every one shown with Clear Low-E. The rules
   as data first, then the app driven through both pages and a knotty alder
   grille door, which prints by the same grammar. */
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
const T=[]; const ok=(n,c,x='')=>T.push((c?'PASS':'FAIL')+'  '+n+(x?'  :: '+x:''));
let reported=false;
const report=()=>{ if(reported) return; reported=true;
  console.log(T.join('\n'));
  const f=T.filter(t=>t.startsWith('FAIL')).length;
  console.log('\n'+(T.length-f)+' passed, '+f+' failed'); };
process.on('uncaughtException',e=>{ report(); console.error('\nCRASHED: '+e.message); process.exit(1); });

/* ================= 1. the rules as data ================================= */
const mg=(cat.ironGrilleDesigns||[]).filter(g=>g.line==='mahogany');
const arch=mg.filter(g=>g.style==='2/3 Arch Lite'), lite=mg.filter(g=>g.style==='2/3 Lite');
ok('page 35 offers four designs on the 2/3 Arch Lite, 3068 only',
   arch.length===4 && ['Cordoba','Santiago','Sienna','Whitney'].every(n=>arch.some(g=>g.name===n)) && arch.every(g=>g.sizeCodes.join()==='3068'),
   arch.map(g=>g.name).join('|'));
ok('page 36 offers four designs on the 2/3 Lite, 2880 and 3080',
   lite.length===4 && ['Avignon','Barcelona','Cordoba','Santiago'].every(n=>lite.some(g=>g.name===n)) && lite.every(g=>g.sizeCodes.join()==='2880,3080'),
   lite.map(g=>g.name).join('|'));
ok('every mahogany design carries the infix the catalog prints and a photograph on disk',
   mg.every(g=>/^[A-Z]{3}$/.test(g.code) && g.photo && fs.existsSync(ROOT+'/quoter/assets/designs/'+g.photo)));
ok('and the same infix as its knotty alder namesake',
   mg.every(g=>(cat.ironGrilleDesigns.find(k=>k.name===g.name&&k.line==='knotty_alder')||{}).code===g.code));
const ig=(cat.skuPlaceholders||{}).ironGrille;
ok('the grille grammar is recorded: infix + C for Clear Low-E, with both catalogs\' numbers as evidence',
   !!ig && ig.clearCode==='C' && /M23ACRDC3068/.test(ig.evidence) && /KA34AVIC3068/.test(ig.evidence));
const corr=(cat.skuCorrections||[]).filter(c=>/^M23A--\d{4}$/.test(c.printed));
ok('the sheet\'s M23A stem on the 2/3 Lite grille rows is corrected to M23, written into the number',
   corr.length===2 && corr.every(c=>c.appliesToNumber && /^M23--\d{4}$/.test(c.resolvesAs) &&
     (cat.woodProducts.find(p=>p.id===c.productId)||{}).description.endsWith('2/3 Lite Iron Grille')),
   corr.map(c=>c.printed+' -> '+c.resolvesAs).join('  '));
const archRow=cat.woodProducts.find(p=>p.sku==='M23A--3068'&&/Arch Lite Iron Grille/.test(p.description));
ok('while the arch door keeps its A', !!archRow && !(cat.skuCorrections||[]).some(c=>c.productId===archRow.id));
const gp=(cat.sideliteRules||[]).filter(r=>/Iron Grille\$$/.test(r.appliesToModelPattern||''));
ok('both 2/3 grille doors pair with the 2/3 grille sidelite', gp.length===2 && gp.every(r=>r.allowModelPattern==='^2/3 Lite Sidelite Iron Grille$'),
   gp.map(r=>r.appliesToModelPattern).join('  '));

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
  return i<0?[]:[...ns[i].querySelectorAll('.opt')].map(n=>(n.disabled?'[x] ':'')+n.textContent.trim());},t);
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
async function open(name, wood){
  await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});
  await page.goto(BASE+'/quoter/');
  await page.waitForSelector('#lineGate:not(.hidden)',{timeout:30000});
  await page.$$eval('#lineChoices button',ns=>ns.find(n=>/^Wood/.test(n.textContent.trim())).click());
  await page.waitForTimeout(700);
  await page.$$eval('#lineChoices button',(ns,w)=>ns.find(n=>new RegExp('^'+w).test(n.textContent.trim())).click(), wood||'Mahogany');
  await page.waitForSelector('#catalog article',{timeout:30000});
  await page.click('#clearFilters').catch(()=>{});
  await page.fill('#q',name); await page.waitForTimeout(520);
  const found=await page.$$eval('#catalog article',(ns,n)=>{
    const h=[...ns].find(a=>a.querySelector('h3').textContent.trim()===n);
    if(!h) return false; h.querySelector('button').click(); return true;},name);
  if(!found) throw new Error('no card named '+name);
  await page.waitForSelector('#detail:not(.hidden)');
}
const orderDoc=async who=>{
  await page.$$eval('#detail button',ns=>{const x=ns.find(n=>n.textContent.trim()==='Add to quote');if(x)x.click();});
  await page.waitForTimeout(600);
  await page.fill('#job_customer',who); await page.waitForTimeout(150);
  await page.click('#printOrder'); await page.waitForTimeout(500);
  return page.evaluate(()=>document.querySelector('#printDoc').textContent);
};
const finishSingle=async()=>{ await pick('Finish','Unfinished'); await pick('Opening','Single door');
  await pick('Handing','Left'); await pick('Swing','Inswing'); await pick('Jamb depth','4-9/16'); };
const numbers=doc=>[...new Set(doc.match(/(?:KA|M)(?:34|FULL|23A|23)(?:SL)?[A-Z-]*\d{4}/g)||[])];

/* the 2/3 Arch Lite, page 35 */
await open('2/3 Arch Lite Iron Grille');
const g5=await optionsOf('Glass');
ok('a grille door offers the five grille glasses', g5.length===5, g5.join('|'));
await pick('Glass','Clear Low E');
const designs=await optionsOf('Grille design');
ok('the arch door offers Cordoba, Santiago, Sienna and Whitney', designs.length===4 && ['Cordoba','Santiago','Sienna','Whitney'].every(n=>designs.some(o=>o.startsWith(n))), designs.join('|'));
await pick('Grille design','Cordoba'); await finishSingle();
const d1=await orderDoc('Arch Cordoba');
ok('and prints M23ACRDC3068 exactly as the page does', /M23ACRDC3068/.test(d1) && !/still holds a placeholder/i.test(d1), numbers(d1).join(', '));
ok('with the design in words beside it', /Cordoba grille/.test(d1));

await open('2/3 Arch Lite Iron Grille');
await pick('Glass','Flemish'); await pick('Grille design','Whitney'); await finishSingle();
const d2=await orderDoc('Arch Whitney Flemish');
ok('another glass takes the legend\'s code after the infix: M23AWHIF3068', /M23AWHIF3068/.test(d2), numbers(d2).join(', '));

/* the 2/3 Lite, page 36: the sheet's A comes off the stem */
await open('2/3 Lite Iron Grille');
await pick('Glass','Clear Low E'); await pick('Size',"3'0\" x 8'0\"");
const ld=await optionsOf('Grille design');
ok('the 2/3 Lite offers Avignon, Barcelona, Cordoba and Santiago', ld.length===4 && ['Avignon','Barcelona','Cordoba','Santiago'].every(n=>ld.some(o=>o.startsWith(n))), ld.join('|'));
await pick('Size',"2'8\" x 8'0\""); await pick('Grille design','Avignon'); await pick('Finish','Unfinished'); await pick('Opening','Single + 1 sidelite');
const sl=await optionsOf('Sidelite');
ok('and is offered the 2/3 grille sidelite only', sl.length>0 && sl.every(o=>/^2\/3 Lite Sidelite Iron Grille/.test(o)), sl.join(' | '));
await pick('Sidelite','2/3 Lite Sidelite Iron Grille');
await pick('Handing','Left'); await pick('Swing','Inswing'); await pick('Jamb depth','4-9/16');
const d3=await orderDoc('Lite Avignon');
ok('the door prints M23AVIC2880 — no A, as page 36 prints it', /M23AVIC2880/.test(d3) && !/M23AAVIC/.test(d3), numbers(d3).join(', '));
ok('and the matching sidelite by the same grammar, M23SLAVIC1280', /M23SLAVIC1280/.test(d3) && !/still holds a placeholder/i.test(d3), numbers(d3).join(', '));

/* a mahogany grille door whose page is not yet walked keeps its gap */
await open('3/4 Lite Iron Grille');
await pick('Glass','Clear Low E');
ok('the 3/4 Lite grille, its page not yet walked, offers no design', !(await steps()).includes('Grille design'), (await steps()).join(' > '));
await pick('Size',"3'0\" x 6'8\""); await finishSingle();
const d4=await orderDoc('3/4 grille');
ok('and its number stays flagged rather than guessed', /M34--3068/.test(d4) && /still holds a placeholder/i.test(d4), numbers(d4).join(', '));

/* knotty alder prints the same grammar, pages 55-57 */
await open('KA 3/4 Lite Iron Grille','Knotty');
await pick('Glass','Clear Low E'); await pick('Size',"3'0\" x 6'8\""); await pick('Grille design','Avignon'); await finishSingle();
const d5=await orderDoc('KA Avignon');
ok('a knotty alder grille door prints KA34AVIC3068', /KA34AVIC3068/.test(d5) && !/still holds a placeholder/i.test(d5), numbers(d5).join(', '));

ok('no console or page errors', errs.length===0, errs.slice(0,2).join(' | '));
report();
await b.close(); srv.close();
process.exit(T.some(t=>t.startsWith('FAIL'))?1:0);
