/* The design gallery, walked with the dealer 2026-09-13.

   A grille door is one price row and eight photographs; a decorative-glass
   door one row and four. The design is the whole decision, so the catalogue
   card shows the door with plain glass (with a count and three designs
   small), and the sheet opens on the gallery, full width, three across on a
   tablet and two on a phone, each picture about the size of the sheet's own
   preview. A magnifier shows one full size. Once a design is chosen the
   two-column sheet returns with the design in the preview, and the size
   question greys the sizes that design is not made in. */
import { playwright } from './playwright.mjs';
const { chromium } = await playwright();
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';

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
const T=[]; const ok=(n,c,x='')=>T.push((c?'PASS':'FAIL')+'  '+n+(x?'  :: '+x:''));
let reported=false;
const report=()=>{ if(reported) return; reported=true;
  console.log(T.join('\n'));
  const f=T.filter(t=>t.startsWith('FAIL')).length;
  console.log('\n'+(T.length-f)+' passed, '+f+' failed'); };
process.on('uncaughtException',e=>{ report(); console.error('\nCRASHED: '+e.message); process.exit(1); });

/* ================= 1. the pictures the gallery needs ==================== */
const grille=cat.ironGrilleDesigns||[];
ok('every grille design has a photograph on disk for its tile',
   grille.every(g=>g.photo && fs.existsSync(ROOT+'/quoter/assets/designs/'+g.photo)), grille.filter(g=>!g.photo).map(g=>g.name).join('|'));
const flat=['3/4 Lite - Flat Glass','2/3 Lite - Flat Glass','2/3 Arch Lite - Flat Glass','Full Lite - Flat Glass',
            '3/4 Sidelite - Flat Glass','2/3 Sidelite - Flat Glass','Full Sidelite - Flat Glass'];
ok('the mahogany grille and decorative doors each have a plain-glass twin photographed for the card',
   flat.every(n=>doors.models[n] && fs.existsSync(ROOT+'/quoter/assets/doors/'+doors.models[n])), flat.filter(n=>!doors.models[n]).join('|'));

/* ================= 2. the app, driven =================================== */
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1024,height:1100}});
const page=await ctx.newPage();
const errs=[];
page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
page.on('console',m=>{if(m.type()==='error'&&!/favicon|Failed to load resource/i.test(m.text()))errs.push(m.text());});
page.on('requestfailed',q=>{ if(!/ERR_ABORTED/.test((q.failure()||{}).errorText||'')) errs.push('REQFAIL '+q.url()); });
page.on('response',r=>{ if(r.status()>=400) errs.push(r.status()+' '+r.url()); });

await page.goto(BASE+'/quoter/'); await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});
await page.goto(BASE+'/quoter/');
await page.waitForSelector('#lineGate:not(.hidden)',{timeout:30000});
await page.$$eval('#lineChoices button',ns=>ns.find(n=>/^Wood/.test(n.textContent.trim())).click()); await page.waitForTimeout(600);
await page.$$eval('#lineChoices button',ns=>ns.find(n=>/^Mahogany/.test(n.textContent.trim())).click());
await page.waitForSelector('#catalog article',{timeout:30000});
await page.click('#clearFilters').catch(()=>{});

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
  await page.waitForTimeout(250);
}
async function open(name){
  await page.fill('#q',name); await page.waitForTimeout(500);
  const hit=await page.$$eval('#catalog article',(ns,n)=>{const a=ns.find(a=>a.querySelector('h3').textContent.trim()===n);
    if(!a) return 'no card '+n; a.querySelector('button').click(); return true;},name);
  if(hit!==true) throw new Error(hit);
  await page.waitForSelector('#detail:not(.hidden)'); await page.waitForTimeout(600);
}
const card=name=>page.$$eval('#catalog article',(ns,n)=>{const a=ns.find(a=>a.querySelector('h3').textContent.trim()===n); if(!a) return null;
  const im=a.querySelector('.door-frame > img'); const badge=a.querySelector('.designbadge');
  return {src:im?decodeURIComponent(im.getAttribute('src')):null, badge:badge?badge.textContent.trim():null,
          strip:[...a.querySelectorAll('.designstrip img')].map(i=>decodeURIComponent(i.getAttribute('src'))),
          borrowed:!!a.querySelector('.borrowed')};},name);

/* --- the cards ------------------------------------------------------------ */
await page.fill('#q','Iron Grille'); await page.waitForTimeout(600);
const c34=await card('3/4 Lite Iron Grille');
ok('a grille door\'s card shows the door with plain glass, not one of its designs',
   c34 && /doors\/3-4-lite-flat-glass\.webp$/.test(c34.src) && !c34.borrowed, JSON.stringify(c34));
ok('with a badge counting its designs', c34 && c34.badge==='8 grille designs', c34&&c34.badge);
ok('and three of them small in the corner, from the design photographs', c34 && c34.strip.length===3 && c34.strip.every(s=>/designs\/grille-mahogany-3-4-lite-/.test(s)), c34&&c34.strip.join(' '));
const cArch=await card('2/3 Arch Lite Iron Grille');
ok('the arch grille door likewise, four designs', cArch && /2-3-arch-lite-flat-glass/.test(cArch.src) && cArch.badge==='4 grille designs', JSON.stringify(cArch));
const cSl=await card('Full Lite Sidelite Iron Grille');
ok('a grille sidelite shows the flat sidelite, since the sheet names them differently', cSl && /full-sidelite-flat-glass/.test(cSl.src) && cSl.badge==='8 grille designs', JSON.stringify(cSl));
await page.fill('#q','Decorative'); await page.waitForTimeout(600);
const cDec=await card('3/4 Lite - Decorative Glass');
ok('a decorative-glass door\'s card shows the flat door with a count of its glasses',
   cDec && /3-4-lite-flat-glass/.test(cDec.src) && cDec.badge==='4 decorative glasses' && cDec.strip.length===3, JSON.stringify(cDec));
await page.fill('#q','Flat Glass'); await page.waitForTimeout(600);
const cFlat=await card('3/4 Lite - Flat Glass');
ok('a flat-glass door carries no badge and no strip', cFlat && !cFlat.badge && cFlat.strip.length===0, JSON.stringify(cFlat));

/* --- the gallery ---------------------------------------------------------- */
await open('3/4 Lite Iron Grille');
ok('a grille door opens on its design, and nothing else is asked yet', (await steps()).join()==='Grille design', (await steps()).join(' > '));
const lay=await page.$eval('#detail',n=>({cols:n.firstElementChild.className, preview:!!n.querySelector('.preview'),
  thumb:!!n.querySelector('h2')&&!!n.querySelector('.door-frame img'), tiles:n.querySelectorAll('.gallery .tile').length,
  btns:n.querySelectorAll('.gallery .opt.tile-btn').length, pics:n.querySelectorAll('.gallery .tile .ph img').length,
  zooms:n.querySelectorAll('.gallery .tile .zoombtn').length,
  grid:getComputedStyle(n.querySelector('.gallery')).gridTemplateColumns.split(' ').length,
  tileH:n.querySelector('.gallery .tile .ph').getBoundingClientRect().height,
  tileW:n.querySelector('.gallery .tile .ph').getBoundingClientRect().width}));
ok('the gallery takes the whole sheet: the preview column is put away', !lay.preview && !/md:grid-cols-\[minmax\(0,320px\)/.test(lay.cols), lay.cols);
ok('with the plain-glass door small beside the title', lay.thumb);
ok('eight tiles, each a photograph with a magnifier', lay.tiles===8 && lay.btns===8 && lay.pics===8 && lay.zooms===8, JSON.stringify(lay));
ok('three across on a tablet', lay.grid===3, String(lay.grid));
ok('each picture about the size of the sheet\'s preview, not a thumbnail', lay.tileH>=400 && lay.tileW>=240, Math.round(lay.tileW)+'x'+Math.round(lay.tileH));
const tiles=await optionsOf('Grille design');
ok('the name and the sizes it is made in sit under each', tiles.length===8 && tiles.every(t=>/(All 4 sizes|8'0")$/.test(t)) && tiles.some(t=>/^Saltillo2'8" x 8'0" · 3'0" x 8'0"$/.test(t)), tiles.join(' | '));
ok('none greyed before a size is chosen', !tiles.some(t=>/^\[x\] /.test(t)));
const bigSrc=await page.$eval('#detail .gallery .tile .ph img',n=>decodeURIComponent(n.getAttribute('src')));
ok('the tile is the catalog\'s photograph of that door with that grille', /designs\/grille-mahogany-3-4-lite-avignon\.webp$/.test(bigSrc), bigSrc);

/* --- the magnifier -------------------------------------------------------- */
await page.$eval('#detail .gallery .tile .zoombtn',n=>n.click()); await page.waitForTimeout(400);
const lb=await page.$eval('#lightbox',n=>({shown:!n.classList.contains('hidden'), src:decodeURIComponent(n.querySelector('img').getAttribute('src')||''),
  cap:n.querySelector('#lightboxCap').textContent, choose:!n.querySelector('#lightboxChoose').classList.contains('hidden'),
  h:n.querySelector('img').getBoundingClientRect().height}));
ok('the magnifier opens the picture full size, named', lb.shown && lb.src===bigSrc && lb.cap==='Avignon · 3/4 Lite Iron Grille', JSON.stringify(lb));
ok('taller than the tile', lb.h>lay.tileH, Math.round(lb.h)+' vs '+Math.round(lay.tileH));
ok('and offers to choose it', lb.choose);
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
ok('Escape closes the picture and leaves the sheet open', await page.$eval('#lightbox',n=>n.classList.contains('hidden')) && await page.$eval('#detail',n=>!n.classList.contains('hidden')));
await page.$eval('#detail .gallery .tile .zoombtn',n=>n.click()); await page.waitForTimeout(300);
await page.click('#lightboxChoose'); await page.waitForTimeout(400);
ok('Choose in the picture chooses the design', (await steps()).join()==='Size' && await page.$eval('#detail .railchip',n=>n.textContent.trim()==='Avignon'), (await steps()).join(' > '));

/* --- after the choice ----------------------------------------------------- */
const after=await page.$eval('#detail',n=>({cols:n.firstElementChild.className, preview:n.querySelector('.preview img')?decodeURIComponent(n.querySelector('.preview img').getAttribute('src')):null,
  zoom:!!n.querySelector('.preview .zoombtn'), gallery:!!n.querySelector('.gallery')}));
ok('the two-column sheet returns, the gallery put away', /md:grid-cols-\[minmax\(0,320px\)/.test(after.cols) && !after.gallery, after.cols);
ok('and the preview shows the chosen design, with its own magnifier', /grille-mahogany-3-4-lite-avignon\.webp$/.test(after.preview||'') && after.zoom, String(after.preview));
const sizes=await optionsOf('Size');
ok('Avignon is made in all four sizes, so none is greyed', sizes.length===4 && !sizes.some(s=>/^\[x\] /.test(s)), sizes.join('|'));
await pick('Size',"3'0\" x 8'0\"");
const glass=await optionsOf('Glass');
const swatch=await page.$eval('#detail .glassswatch',n=>n.getBoundingClientRect().width);
ok('then the glass behind the grille, five of them, with larger swatches', glass.length===5 && swatch>=52, glass.join('|')+' @'+swatch+'px');
ok('the rail reads design, size, glass, finish, opening', await page.$$eval('#detail .railchip, #detail .railstep',ns=>ns.map(n=>n.textContent.trim()).join(' > '))==="Avignon > 3'0\" x 8'0\" > Glass > Finish > Opening",
   await page.$$eval('#detail .railchip, #detail .railstep',ns=>ns.map(n=>n.textContent.trim()).join(' > ')));

/* taking the design back brings the gallery back and clears what followed */
await page.$eval('#detail .railchip',n=>n.click()); await page.waitForTimeout(400);
ok('taking the design back on the rail reopens the gallery and forgets the size', (await steps()).join()==='Grille design' && await page.$eval('#detail',n=>!!n.querySelector('.gallery') && !n.querySelector('.preview')), (await steps()).join(' > '));

/* a design made in fewer sizes greys the others, with the reason */
await pick('Grille design','Southampton');
const sz=await optionsOf('Size');
ok('Southampton is 8\'0" only, so the 6\'8" sizes are greyed and say why', sz.filter(s=>/^\[x\] /.test(s)).length===2 && sz.filter(s=>/^\[x\] /.test(s)).every(s=>/6'8".*not this design$/.test(s)), sz.join('|'));
ok('and the size question says how many', (await page.$$eval('#detail .steprow',ns=>ns.map(r=>[...r.parentElement.querySelectorAll('p')].map(p=>p.textContent).join(' ')).join(' | '))).includes('2 not made with Southampton'));
await pick('Size',"3'0\" x 8'0\""); await pick('Glass','Clear Low E'); await pick('Finish','Unfinished'); await pick('Opening','Single door');
await pick('Handing','Left'); await pick('Swing','Inswing'); await pick('Jamb depth','4-9/16');
const priced=await page.$eval('#detail',n=>n.textContent);
ok('and the door prices', /\$[\d,]+\.\d\d/.test(priced) && !/Answer the questions above/.test(priced));
await page.$eval('#detail button.bg-forest',n=>n.click()); await page.waitForTimeout(500);
const drawer=await page.$eval('#quoteLines',n=>({src:decodeURIComponent((n.querySelector('img')||{}).getAttribute?.('src')||''), text:n.textContent}));
ok('on the quote the line shows the Southampton door', /grille-mahogany-3-4-lite-southampton\.webp$/.test(drawer.src) && /Southampton/.test(drawer.text), drawer.src);
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

/* --- a decorative-glass door gets the same gallery ------------------------ */
await open('3/4 Lite - Decorative Glass');
ok('a decorative-glass door opens on its glass as a gallery', (await steps()).join()==='Glass' && await page.$eval('#detail',n=>n.querySelectorAll('.gallery .tile').length===4 && !n.querySelector('.preview')));
const dec=await optionsOf('Glass');
ok('Columbia, Medina, Pecos and San Jacinto, with the sizes each is made in', dec.length===4 && dec.some(t=>/^Medina2'8" x 6'8" · 3'0" x 6'8"$/.test(t)) && dec.some(t=>/^ColumbiaAll 4 sizes$/.test(t)), dec.join(' | '));
await pick('Glass','Medina');
const decAfter=await page.$eval('#detail',n=>({preview:decodeURIComponent((n.querySelector('.preview img')||{}).getAttribute?.('src')||''), steps:[...n.querySelectorAll('.steprow')].map(r=>r.parentElement.querySelector('p').textContent.trim())}));
ok('then the preview shows Medina and the caming is asked, the glass not asked twice', /designs\/glass-medina\.webp$/.test(decAfter.preview) && decAfter.steps.join()==='Caming', JSON.stringify(decAfter));
await pick('Caming','Patina');
const decSizes=await optionsOf('Size');
ok('and the sizes Medina is not offered in stay greyed as before', decSizes.length===4 && decSizes.filter(s=>/^\[x\] /.test(s)).length===2, decSizes.join('|'));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

/* --- a door with neither is untouched ------------------------------------- */
await open('3/4 Lite - Flat Glass');
ok('a flat-glass door still asks its glass as a row of swatches, preview beside it', (await steps())[0]==='Glass' && await page.$eval('#detail',n=>!n.querySelector('.gallery') && !!n.querySelector('.preview') && n.querySelectorAll('.glassswatch').length>0));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

/* --- on a phone ----------------------------------------------------------- */
await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(300);
await open('Full Lite Iron Grille');
const ph=await page.$eval('#detail .gallery',n=>({cols:getComputedStyle(n).gridTemplateColumns.split(' ').length, w:n.querySelector('.tile .ph').getBoundingClientRect().width, h:n.querySelector('.tile .ph').getBoundingClientRect().height, over:document.documentElement.scrollWidth>window.innerWidth}));
ok('two across on a phone, and no sideways scroll', ph.cols===2 && !ph.over, JSON.stringify(ph));
ok('each still a real picture, not a thumbnail', ph.w>=150 && ph.h>=250, Math.round(ph.w)+'x'+Math.round(ph.h));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

ok('no console, page or request errors', errs.length===0, errs.slice(0,3).join(' | '));
report();
await b.close(); srv.close();
process.exit(T.some(t=>t.startsWith('FAIL'))?1:0);
