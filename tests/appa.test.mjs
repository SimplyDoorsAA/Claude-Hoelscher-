/* App A smoke test: the Price Manager must still load and edit the catalog and
   the rules file after openingSpec was added to pricing-rules.json. */
import { playwright } from './playwright.mjs';
const { chromium } = await playwright();
import http from 'node:http'; import fs from 'node:fs';
import path from 'node:path'; import url from 'node:url';
const ROOT=path.resolve(url.fileURLToPath(import.meta.url),'../..');
const OUT=process.env.SHOT_DIR||path.join(ROOT,'.test-output');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]);
  const f=ROOT+(p.endsWith('/')?p+'index.html':p); let b=null;
  try{b=fs.readFileSync(f);}catch(e){r.writeHead(404);r.end('');return;}
  r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});
// Port 0: the OS picks a free one, so a killed run cannot poison the next.
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const BASE='http://127.0.0.1:'+srv.address().port;

const catalog=fs.readFileSync(ROOT+'/data/catalog.json','utf8');
const rules  =fs.readFileSync(ROOT+'/data/pricing-rules.json','utf8');
const T=[]; const ok=(n,c,x='')=>T.push((c?'PASS':'FAIL')+'  '+n+(x?'  :: '+x:''));
const b=await chromium.launch();
const page=await (await b.newContext({viewport:{width:1600,height:1000}})).newPage();
const errs=[];
page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text());});

const b64=s=>Buffer.from(s,'utf8').toString('base64');
await page.route('https://api.github.com/**',route=>{
  const u=route.request().url();
  const body=/catalog\.json/.test(u)
    ? {content:b64(catalog),sha:'SHA-CATALOG',encoding:'base64'}
    : {content:b64(rules),  sha:'SHA-RULES',  encoding:'base64'};
  route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
});

await page.goto(BASE+'/');
await page.waitForSelector('#gate',{timeout:20000});
await page.fill('#fTok','ghp_test_not_a_real_token');
await page.fill('#fOwner','SimplyDoorsAA');
await page.fill('#fRepo','Claude-Hoelscher-');
await page.click('#btnConnect');
await page.waitForSelector('#gate',{state:'hidden',timeout:30000});
await page.waitForTimeout(1500);
ok('App A loads the published catalog and rules', errs.length===0, errs.slice(0,2).join(' | '));

// open the Pricing Rules tab
await page.click('#tabs button:has-text("Rules"), button:has-text("Pricing Rules")').catch(()=>{});
await page.waitForTimeout(800);
const rulesText=await page.textContent('#rulesBody').catch(()=>'');
ok('the rules tab renders', rulesText.length>200, String(rulesText.length));
ok('openingSpec is editable in App A', /openingSpec\.handing/.test(rulesText), rulesText.slice(0,120));
ok('the jamb depths are editable', /openingSpec\.jambDepths\.options/.test(rulesText));
ok('the jamb charge switch is editable', /openingSpec\.jambDepths\.chargeUpgrade/.test(rulesText));
const handVal=await page.$eval('#rulesBody tr:has-text("openingSpec.handing") input',n=>n.value).catch(()=>null);
ok('a string array reads back as a comma list', handVal==='left, right', String(handVal));

/* The publish check must name the duplicate part numbers rather than let them
   through silently, and must refuse a page reference in the glass column. */
await page.click('#tabs button:has-text("Rules"), button:has-text("Pricing Rules")').catch(()=>{});
const issues=await page.evaluate(()=>{
  const v=validate();
  return {errors:v.errors.length, warnings:v.warnings.length,
          dupWarn:v.warnings.filter(w=>/part number/.test(w)).length,
          glassErr:v.errors.filter(e=>/page reference/.test(e)).length,
          sample:v.warnings.filter(w=>/part number/.test(w))[0]||''};
});
ok('publishing warns about part numbers shared by two doors',
   issues.dupWarn>0, JSON.stringify(issues.sample).slice(0,110));
ok('the published catalog has no page reference left in a glass field',
   issues.glassErr===0, String(issues.glassErr));
ok('and otherwise validates clean', issues.errors===0, String(issues.errors));

// nothing may look modified on a clean load
const dirty=await page.textContent('body');
ok('a clean load reports no unsaved changes', !/unsaved|modified/i.test(
   (await page.textContent('#statusBar, header, .status').catch(()=>''))||''), '');
await page.screenshot({path:OUT+'/a1-rules.png',fullPage:false});
ok('no console or page errors', errs.length===0, errs.slice(0,2).join(' | '));
console.log(T.join('\n'));
console.log('\n'+T.filter(t=>t.startsWith('PASS')).length+' passed, '+T.filter(t=>t.startsWith('FAIL')).length+' failed');
await b.close(); srv.close();
process.exit(T.some(t=>t.startsWith('FAIL'))?1:0);
