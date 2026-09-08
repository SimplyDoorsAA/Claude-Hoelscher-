/* Independent stress test. Expected values are recomputed here from the raw
   catalogue and the printed shipping schedule — never from the engine — so a
   shared bug cannot make both sides agree. */
import { readFileSync } from 'node:fs';
import { createEngine, formatCents } from './index.js';
const cat=JSON.parse(readFileSync(new URL('../../data/catalog.json', import.meta.url)));
const rules=JSON.parse(readFileSync(new URL('../../data/pricing-rules.json', import.meta.url)));
const E=createEngine(cat,rules);

const NET=0.48, TIER={builder:0.30,retail:0.40};
const BANDS=[[1,3,12000],[4,6,16500],[7,9,20000],[10,Infinity,0]];
const PREHANG=10000;
const r2=x=>x<0?-Math.floor(-x+0.5):Math.floor(x+0.5);
const cost=c=>c===null?null:r2(c*NET);
const sell=(c,m)=>c===null?null:r2(c/(1-m));
const units=(p,cfg)=>({door:1,sidelite:0.5,barn_slab:1}[p.type]??1)*(cfg==='doublePH'?2:1);
const band=u=>{const n=Math.ceil(u-1e-9); if(n<=0)return 0;
  for(const[a,b,c]of BANDS) if(n>=a&&n<=b) return c; return 0;};

const all=[...cat.fiberglassProducts,...cat.woodProducts];
const bySku=s=>all.find(p=>p.sku===s);
let pass=0; const fails=[];
const T=(name,fn)=>{try{fn();pass++;}catch(e){fails.push(name+' :: '+e.message);}};
const eq=(a,b,what)=>{ if(a!==b) throw new Error(`${what}: got ${formatCents(a)} expected ${formatCents(b)}`); };

/* ---------- hand-computed scenarios ---------- */
function expect(lines,margin){
  let lineCost=0,lineSell=0,u=0,prehang=0;
  for(const L of lines){
    const p=L.p, list=p.prices[L.f][L.c];
    let unit=cost(list);
    for(const a of (L.acc||[])){
      if(a.kind==='product') unit+=cost(a.p.prices[a.f||'unfinished'][a.c||'slab']);
      if(a.kind==='hardware') unit+=cost(a.cents);
      u+=units(a.p||{type:'door'},a.c||'slab')*(a.qty||1);
    }
    const ph=(L.c==='singlePH'||L.c==='doublePH')?PREHANG:0;
    prehang+=ph*L.q; unit+=ph;
    lineCost+=unit*L.q; lineSell+=sell(unit,margin)*L.q;
    u+=units(p,L.c)*L.q;
  }
  const crate=band(u);
  return {u,prehang,crate,totalCost:lineCost+crate,
          grand:lineSell+sell(crate,margin)};
}
function actual(lines,tier){
  return E.priceQuote({marginTier:tier,lines:lines.map(L=>({
    productId:L.p.id,finish:L.f,config:L.c,qty:L.q,
    accessories:(L.acc||[]).map(a=>a.kind==='hardware'
      ?{kind:'hardware',id:a.id,qty:a.qty||1,variant:a.variant}
      :{kind:'product',id:a.p.id,finish:a.f||'unfinished',config:a.c||'slab',qty:a.qty||1})}))});
}
function check(name,lines,tier='retail'){
  T(name,()=>{
    const e=expect(lines,TIER[tier]), a=actual(lines,tier);
    eq(a.freightUnitCount,e.u,'freight units');
    eq(a.totalPrehangCents,e.prehang,'prehang');
    eq(a.crateShippingCents,e.crate,'crate');
    eq(a.totalCostCents,e.totalCost,'total cost');
    eq(a.grandTotalSellCents,e.grand,'grand total');
  });
}

/* fiberglass, several styles and configurations */
const fg1=bySku('FG1LVCLE3080'), fg3=bySku('FG3GPWCLE3068'), fg5=bySku('FG5GPWCLE3080');
const fgSL=cat.fiberglassProducts.find(p=>p.type==='sidelite'&&p.prices.unfinished.slab!==null);
check('FG single prehung, 1 unit',            [{p:fg1,f:'unfinished',c:'singlePH',q:1}]);
check('FG slab only, 1 unit',                 [{p:fg1,f:'unfinished',c:'slab',q:1}]);
check('FG double prehung, counts 2 units',    [{p:fg3,f:'unfinished',c:'doublePH',q:1}]);
check('FG prefinished single prehung',        [{p:fg5,f:'prefinished',c:'singlePH',q:1}]);
check('FG mixed styles, 3 lines',             [{p:fg1,f:'unfinished',c:'singlePH',q:1},
                                               {p:fg3,f:'unfinished',c:'slab',q:2},
                                               {p:fg5,f:'prefinished',c:'doublePH',q:1}]);
check('FG door + 2 sidelites in one opening', [{p:fg1,f:'unfinished',c:'singlePH',q:1,
   acc:[{kind:'product',p:fgSL,c:'slab'},{kind:'product',p:fgSL,c:'slab'}]}]);

/* mahogany, several styles and configurations */
const m1=bySku('M1LV--3080'), m3=bySku('M3GPW--3068'), m7=bySku('M7P3080');
const mSL=cat.woodProducts.find(p=>p.type==='sidelite'&&p.line==='mahogany'&&p.prices.unfinished.slab!==null);
check('MAH single prehung',                   [{p:m1,f:'unfinished',c:'singlePH',q:1}]);
check('MAH double prehung, prefinished',      [{p:m3,f:'prefinished',c:'doublePH',q:1}]);
check('MAH panel door slab x4',               [{p:m7,f:'unfinished',c:'slab',q:4}]);
check('MAH door + sidelite, builder tier',    [{p:m1,f:'unfinished',c:'singlePH',q:1,
   acc:[{kind:'product',p:mSL,c:'slab'}]}],'builder');
check('MAH + FG mixed on one quote',          [{p:m1,f:'unfinished',c:'singlePH',q:1},
                                               {p:fg1,f:'unfinished',c:'slab',q:1}]);

/* freight band boundaries, walked one unit at a time */
for(const q of [1,3,4,6,7,9,10,11,20]){
  check(`slabs x${q} lands in the right band`, [{p:fg1,f:'unfinished',c:'slab',q}]);
}
/* the schedule's own example #3: five double prehung = 10 units, prepaid */
T('schedule example #3 rebuilt from a real quote',()=>{
  const a=actual([{p:fg3,f:'unfinished',c:'doublePH',q:5}],'retail');
  eq(a.freightUnitCount,10,'units'); eq(a.crateShippingCents,0,'crate'); eq(a.totalPrehangCents,50000,'prehang');
});
/* both tiers on the same basket */
for(const t of ['builder','retail']) check(`tier ${t} on a mixed basket`,
  [{p:fg1,f:'unfinished',c:'singlePH',q:2},{p:m3,f:'prefinished',c:'slab',q:1}],t);

/* every offered combination of every product prices sanely */
T('whole catalogue: 2,988 combinations price to positive integers',()=>{
  let n=0;
  for(const p of all) for(const f of ['unfinished','prefinished']) for(const c of ['slab','singlePH','doublePH']){
    if(p.prices[f][c]===null) continue;
    const q=E.priceQuote({lines:[{productId:p.id,finish:f,config:c,qty:1}]});
    if(!Number.isInteger(q.grandTotalSellCents)) throw new Error(p.sku+' non-integer');
    if(q.grandTotalSellCents<=q.totalCostCents) throw new Error(p.sku+' sell <= cost');
    if(q.crateShippingCents===0) throw new Error(p.sku+' single item should pay crate');
    n++;
  }
  if(n!==2988) throw new Error('expected 2988 combinations, priced '+n);
});
console.log(pass+' passed, '+fails.length+' failed');
fails.forEach(f=>console.log('  FAIL '+f));
process.exit(fails.length?1:0);
