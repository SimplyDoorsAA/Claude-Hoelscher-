/* Mahogany photography — every door, sidelite and stain in the mahogany
   catalogue shows a real catalog picture.

   The extractor files a photo only when a part number sits beside it; the
   rest of the mahogany pages were matched by eye and written into
   quoter/assets/doors/hand-filed.json. The list as data first, then the app
   driven through the catalogue and the stain step. */
import { playwright } from './playwright.mjs';
const { chromium } = await playwright();
import http from 'node:http'; import fs from 'node:fs';
import path from 'node:path'; import url from 'node:url';

const ROOT=path.resolve(url.fileURLToPath(import.meta.url),'../..');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.woff2':'font/woff2','.css':'text/css',
            '.webp':'image/webp','.png':'image/png'};
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
const doors=JSON.parse(fs.readFileSync(ROOT+'/quoter/assets/doors/manifest.json','utf8'));
const hand=JSON.parse(fs.readFileSync(ROOT+'/quoter/assets/doors/hand-filed.json','utf8'));
const stains=JSON.parse(fs.readFileSync(ROOT+'/quoter/assets/stains/manifest.json','utf8'));
const T=[]; const ok=(n,c,x='')=>T.push((c?'PASS':'FAIL')+'  '+n+(x?'  :: '+x:''));
let reported=false;
const report=()=>{ if(reported) return; reported=true;
  console.log(T.join('\n'));
  const f=T.filter(t=>t.startsWith('FAIL')).length;
  console.log('\n'+(T.length-f)+' passed, '+f+' failed'); };
process.on('uncaughtException',e=>{ report(); console.error('\nCRASHED: '+e.message); process.exit(1); });

/* ================= 1. the list as data ================================== */
const SIZE_PREFIX=/^\d{4,5}[A-Z]?\s+/;
const keyOf=p=>{const d=String(p.description||'').trim(); const c=p.size&&p.size.code;
  if(c){const rx=new RegExp('(^|\\s)'+c+'(?=\\s|$)'); if(rx.test(d)) return d.replace(rx,'$1').replace(/\s+/g,' ').trim();}
  return d.replace(SIZE_PREFIX,'').trim();};
const models=[...new Set(cat.woodProducts.filter(p=>p.line==='mahogany').map(keyOf))];
const photoDoors=hand.entries.filter(e=>!e.kind);
const grilles=hand.entries.filter(e=>e.kind==='grille');
ok('thirty-one mahogany photographs are matched by eye, each with the page, the image and why',
   photoDoors.length===31 && photoDoors.every(e=>e.pdf&&e.page&&e.image&&e.why&&e.model), String(photoDoors.length));
ok('and the twenty-six mahogany grille designs, each from its own catalog page',
   grilles.length===26 && grilles.every(e=>e.line==='mahogany'&&e.pdf&&e.page&&e.image&&e.why), String(grilles.length));
const designs=JSON.parse(fs.readFileSync(ROOT+'/quoter/assets/designs/manifest.json','utf8'));
const mg=(cat.ironGrilleDesigns||[]).filter(g=>g.line==='mahogany');
ok('every mahogany design in the catalogue now carries a mahogany photograph on disk, not its knotty alder namesake\'s',
   mg.length===26 && mg.every(g=>/^grille-mahogany-/.test(g.photo||'') && fs.existsSync(ROOT+'/quoter/assets/designs/'+g.photo)),
   mg.filter(g=>!/^grille-mahogany-/.test(g.photo||'')).map(g=>g.style+' '+g.name).join(' | '));
ok('and the designs manifest records each as hand-filed with its source page',
   mg.every(g=>{const r=designs.grilles['mahogany-'+g.style+'-'+g.name]; return r && r.handFiled && r.file===g.photo && /Joel_mahogany\.pdf p\d+/.test(r.source);}));
const whitened=photoDoors.filter(e=>e.whiten);
ok('fourteen open-for-glass and black-ground photographs are whitened, and the manifest says so',
   whitened.length===14 && whitened.every(e=>/whitened/.test(doors.source[e.model]||'')), String(whitened.length));
ok('every one names a mahogany model the catalogue holds',
   photoDoors.every(e=>models.includes(e.model)), photoDoors.filter(e=>!models.includes(e.model)).map(e=>e.model).join(' | '));
ok('and is in the manifest, marked hand-filed, with its file on disk',
   photoDoors.every(e=>doors.models[e.model] && doors.handFiled[e.model] && fs.existsSync(ROOT+'/quoter/assets/doors/'+doors.models[e.model])
     && /filed by hand/.test(doors.source[e.model]||'')));
/* a grille or decorative door shows a catalog picture of that door from another
   page; a speakeasy variant borrows the plain door's photograph, captioned */
const standsIn=m=>/Iron Grille|Decorative Glass/.test(m) || /, SE \+/.test(m);
ok('so every mahogany model has a photograph of its own, or a true stand-in, or a base door to borrow from',
   models.every(m=>doors.models[m] || standsIn(m)),
   models.filter(m=>!doors.models[m] && !standsIn(m)).join(' | '));
ok('the 3/4 Lite grille door and sidelite are cut from the page-32 photograph, and the 2/3 grille sidelite from page 37',
   /p25 .* crop/.test(doors.source['3/4 Lite Iron Grille']||'') && /p25 .* crop/.test(doors.source['3/4 Lite Sidelite Iron Grille']||'')
   && /p29 .* crop/.test(doors.source['2/3 Lite Sidelite Iron Grille']||''));
const sixStains=(cat.woodStainColors||[]).map(s=>s.name);
ok('the six wood stains each have a mahogany swatch and a knotty alder swatch on disk',
   sixStains.length===6 && ['mahogany','knotty_alder'].every(l=>sixStains.every(n=>stains.stains[l]&&stains.stains[l][n]&&fs.existsSync(ROOT+'/quoter/assets/stains/'+stains.stains[l][n]))),
   sixStains.join('|'));
ok('every swatch says which page and image it came off', Object.values(stains.source).every(s=>/p5 \/Im\d+/.test(s)));

/* ================= 2. the app, driven =================================== */
const b=await chromium.launch();
const page=await (await b.newContext({viewport:{width:1440,height:1000}})).newPage();
const errs=[];
page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
page.on('console',m=>{if(m.type()==='error'&&!/favicon|Failed to load resource/i.test(m.text()))errs.push(m.text());});
page.on('response',r=>{ if(r.status()>=400 && !/favicon/.test(r.url())) errs.push('HTTP '+r.status()+' '+r.url()); });

const steps=()=>page.$$eval('#detail .steprow',ns=>ns.map(r=>{
  const h=r.parentElement.querySelector('p');return h?h.textContent.trim():'';}).filter(Boolean));
const optionsOf=t=>page.$$eval('#detail .steprow',(ns,x)=>{
  const i=[...ns].findIndex(r=>{const h=r.parentElement.querySelector('p');
    return h&&h.textContent.trim()===x;});
  return i<0?[]:[...ns[i].querySelectorAll('.opt')].map(n=>(n.disabled?'[x] ':'')+(n.querySelector('img')?'[img] ':'')+n.textContent.trim());},t);
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
async function line(wood){
  await page.goto(BASE+'/quoter/');
  await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});
  await page.goto(BASE+'/quoter/');
  await page.waitForSelector('#lineGate:not(.hidden)',{timeout:30000});
  await page.$$eval('#lineChoices button',ns=>ns.find(n=>/^Wood/.test(n.textContent.trim())).click());
  await page.waitForTimeout(700);
  await page.$$eval('#lineChoices button',(ns,w)=>ns.find(n=>new RegExp('^'+w).test(n.textContent.trim())).click(), wood||'Mahogany');
  await page.waitForSelector('#catalog article',{timeout:30000});
  await page.click('#clearFilters').catch(()=>{});
}
async function open(name, wood){
  await line(wood);
  await page.fill('#q',name); await page.waitForTimeout(520);
  const found=await page.$$eval('#catalog article',(ns,n)=>{
    const h=[...ns].find(a=>a.querySelector('h3').textContent.trim()===n);
    if(!h) return false; h.querySelector('button').click(); return true;},name);
  if(!found) throw new Error('no card named '+name);
  await page.waitForSelector('#detail:not(.hidden)');
}
const cardArt=()=>page.$$eval('#catalog article',ns=>ns.map(a=>{
  const img=a.querySelector('img'); return {name:a.querySelector('h3').textContent.trim(),
    src:img?decodeURIComponent(img.getAttribute('src')):null, svg:!!a.querySelector('svg[role="img"]'),
    broken:!!(img&&img.complete&&img.naturalWidth===0)};}));

/* the whole mahogany catalogue, every card */
await line();
for(let y=0;y<8;y++){ await page.mouse.wheel(0,1600); await page.waitForTimeout(150); }
await page.waitForTimeout(800);
let cards=await cardArt();
ok('the mahogany catalogue lists all 68 doors and sidelites', cards.length===68, String(cards.length));
ok('every card shows a photograph — no drawn silhouette is left', cards.every(c=>c.src&&!c.svg), cards.filter(c=>!c.src||c.svg).map(c=>c.name).join(' | '));
ok('and none is broken', cards.every(c=>!c.broken), cards.filter(c=>c.broken).map(c=>c.name).join(' | '));
const own=cards.filter(c=>c.src&&c.src.startsWith('./assets/doors/'));
ok('63 of them are the model\'s own catalog photograph', own.length===63, String(own.length));
const standIns=cards.filter(c=>c.src&&!c.src.startsWith('./assets/doors/'));
ok('the five left show a mahogany grille-design picture, a true picture of that door: three grille doors and the two Full grille sidelites',
   standIns.length===5 && standIns.every(c=>/Iron Grille/.test(c.name) && /designs\/grille-mahogany-/.test(c.src)), standIns.map(c=>c.name+' -> '+c.src).join(' | '));
const byName=Object.fromEntries(cards.map(c=>[c.name,c.src]));
ok('the 3/4 Lite Iron Grille shows the mahogany door cut from page 32', /doors\/3-4-lite-iron-grille\.webp/.test(byName['3/4 Lite Iron Grille']||''), byName['3/4 Lite Iron Grille']);
ok('the Full Sidelite Iron Grille, named without "Lite", shows a grille picture like its twin', /grille-mahogany-full-lite/.test(byName['Full Sidelite Iron Grille']||'') && byName['Full Sidelite Iron Grille']===byName['Full Lite Sidelite Iron Grille'], byName['Full Sidelite Iron Grille']);
/* the black "open for glass" panes are gone: the middle of the Full Lite flat door's pane is pale */
const paneLum=await page.evaluate(async src=>{const im=new Image(); im.src=src; await im.decode(); const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight; const g=c.getContext('2d'); g.drawImage(im,0,0); const d=g.getImageData(Math.floor(c.width/2),Math.floor(c.height*0.35),1,1).data; return Math.max(d[0],d[1],d[2]);}, byName['Full Lite - Flat Glass']);
ok('the open-for-glass pane reads pale, not black', paneLum>200, String(paneLum));
ok('the Full Lite flat-glass door shows its own page-28 photograph, not the decorative door\'s', /doors\/full-lite-flat-glass\.webp/.test(byName['Full Lite - Flat Glass']||''), byName['Full Lite - Flat Glass']);
ok('the SDL door and its sidelite show page 21', /doors\/3-4-lite-1-panel-nrm\.webp/.test(byName['3/4 Lite 1 Panel NRM']||'') && /doors\/3-4-lite-1-panel-sidelite-nrm\.webp/.test(byName['3/4 Lite 1 Panel Sidelite NRM']||''));

/* the stain step */
await open('6 Panel RM');
await pick('Size',"3'0\" x 6'8\""); await pick('Finish','Prefinished');
const st=await optionsOf('Stain colour');
ok('a prefinished mahogany door offers the six stains, each with its swatch', st.length===6 && st.every(o=>/^\[img\] /.test(o)), st.join(' | '));
ok('in the catalog\'s order', st.map(o=>o.replace(/^\[img\] /,'').split('\n')[0]).join('|')==='Aged Barrel|Ebony|English Chestnut|Jacobean|Red Oak|Special Walnut', st.join('|'));
const swatchSrc=await page.$$eval('#detail .stainswatch img',ns=>ns.map(i=>decodeURIComponent(i.getAttribute('src'))));
ok('and the swatches are the mahogany chart', swatchSrc.length===6 && swatchSrc.every(s=>/stains\/mahogany-/.test(s)), swatchSrc.join(' '));
const brokenSw=await page.$$eval('#detail .stainswatch img',ns=>ns.filter(i=>i.complete&&i.naturalWidth===0).length);
ok('none broken', brokenSw===0, String(brokenSw));
await pick('Stain colour','Jacobean');
ok('a stain still costs nothing and changes no number', /no price difference/.test(await page.$eval('#detail',n=>n.textContent)));

await open('KA 6 Lite NRM','Knotty');
for(const st of ['Glass','Size']) if((await steps()).includes(st)) await pick(st,(await optionsOf(st))[0].replace(/^(\[x\] |\[img\] )+/,'').split('\n')[0].slice(0,12));
await pick('Finish','Prefinished');
const ka=await page.$$eval('#detail .stainswatch img',ns=>ns.map(i=>decodeURIComponent(i.getAttribute('src'))));
ok('a knotty alder door shows the knotty alder chart', ka.length===6 && ka.every(s=>/stains\/knotty-alder-/.test(s)), ka.join(' '));

/* a grille sidelite quoted on its own no longer dead-ends on the door sizes */
await open('Full Lite Sidelite Iron Grille');
await pick('Glass','Clear Low E');
const sd=await optionsOf('Grille design');
ok('a grille sidelite on its own is offered every design of its lite style, none greyed for size', sd.length===8 && sd.every(o=>!/^\[x\]/.test(o)), sd.join(' | '));
await pick('Grille design','Balfour'); await pick('Finish','Unfinished'); await pick('Opening','Slab only');
const slText=await page.$eval('#detail',n=>n.textContent);
ok('and goes on to a price', /\$[\d,]+\.\d\d/.test(slText) && !/Answer the questions above/.test(slText), (slText.match(/\$[\d,]+\.\d\d/)||[''])[0]);
await open('Full Sidelite Iron Grille');
await pick('Glass','Clear Low E');
ok('its twin named without "Lite" is asked the same designs', (await optionsOf('Grille design')).length===8, (await steps()).join(' > '));

ok('no console, page or request errors', errs.length===0, errs.slice(0,3).join(' | '));
report();
await b.close(); srv.close();
process.exit(T.some(t=>t.startsWith('FAIL'))?1:0);
