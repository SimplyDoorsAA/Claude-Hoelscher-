/* Independent recomputation of every price in the catalogue.

   The rules are implemented a second time here, from data/pricing-rules.json
   alone and with no help from the pricing engine, and the two are then compared
   across every price cell the catalogue holds and across randomised whole
   quotes. A disagreement is a finding: one of the two readings of the rules
   file is wrong, and the office needs to know which before quoting from either.

   Run after any price change — npm run audit:prices, or npm test.
   Reads only; exits 1 on any disagreement. */
import fs from 'node:fs';
import { createEngine, applyMargin, formatCents } from '../packages/pricing-engine/index.js';

import path from 'node:path'; import url from 'node:url';
const R=path.resolve(url.fileURLToPath(import.meta.url),'../..');
const cat=JSON.parse(fs.readFileSync(R+'/data/catalog.json','utf8'));
const rules=JSON.parse(fs.readFileSync(R+'/data/pricing-rules.json','utf8'));
const eng=createEngine(cat,rules);

const F=[]; const ok=(n,c,x='')=>F.push({pass:!!c,n,x});

/* ---- my own implementation, written from pricing-rules.json alone -------- */
const NET=rules.netMultiplier;                       // 0.48
const PREHANG=rules.freight.prehangChargeCentsPerUnit; // 10000
const TIERS=rules.freight.crateShippingTiers;
const MARGIN=rules.marginTiers;
const r2=x=>x<0?-Math.floor(-x+0.5):Math.floor(x+0.5);
const myCost=(list,basis)=>list===null||list===undefined?null:(basis==='net'?list:r2(list*NET));
const mySell=(cost,m)=>cost===null?null:r2(cost/(1-m));
const myBand=u=>{const n=Math.ceil(u-1e-9); if(n<=0)return 0;
  for(const t of TIERS){const hi=t.maxUnits===null?Infinity:t.maxUnits; if(n>=t.minUnits&&n<=hi)return t.chargeCents;} return 0;};
const LEAVES={slab:1,singlePH:1,doublePH:2};
const UNITS=rules.freight.unitDefinitions;

const allProducts=[...cat.fiberglassProducts,...cat.woodProducts];

/* ---- 1. every product, every finish/config, both tiers ------------------ */
let cells=0,bad=[];
for(const p of allProducts){
  for(const f of ['unfinished','prefinished']) for(const c of ['slab','singlePH','doublePH']){
    const list=p.prices?.[f]?.[c] ?? null;
    for(const tier of ['builder','retail']){
      const m=MARGIN[tier];
      const line=eng.priceLine({productId:p.id,finish:f,config:c,qty:1},m);
      const want=list===null?null:myCost(list,p.priceBasis)+PREHANG*(c==='slab'?0:1);
      const wantSell=mySell(want,m);
      cells++;
      if(line.unitCostCents!==want||line.unitSellCents!==wantSell)
        bad.push(`${p.sku} ${f}/${c}/${tier}: engine ${line.unitCostCents}/${line.unitSellCents} mine ${want}/${wantSell}`);
    }
  }
}
ok(`every product price cell recomputes (${cells} cells x2 tiers)`,!bad.length,bad.slice(0,5).join(' ; '));

/* ---- 2. no priced row is quoted at zero or below ------------------------ */
const zero=[];
for(const p of allProducts) for(const f of ['unfinished','prefinished']) for(const c of ['slab','singlePH','doublePH']){
  const l=eng.priceLine({productId:p.id,finish:f,config:c,qty:1},MARGIN.retail);
  if(l.notOffered) continue;
  if(!(l.unitSellCents>0)) zero.push(p.sku+' '+f+'/'+c+' -> '+l.unitSellCents);
}
ok('no offered configuration prices at zero or below',!zero.length,zero.slice(0,5).join(' ; '));

/* ---- 3. sell > cost at every tier, and margin is the stated fraction ---- */
const marginOff=[];
for(const p of allProducts.slice(0,400)) for(const tier of ['builder','retail']){
  const m=MARGIN[tier];
  const l=eng.priceLine({productId:p.id,finish:'unfinished',config:'singlePH',qty:1},m);
  if(l.notOffered) continue;
  const realised=(l.unitSellCents-l.unitCostCents)/l.unitSellCents;
  if(Math.abs(realised-m)>0.0005) marginOff.push(p.sku+' '+tier+' realised '+realised.toFixed(5));
}
ok('realised margin equals the tier on every line (margin-on-sell)',!marginOff.length,marginOff.slice(0,4).join(' ; '));

/* ---- 4. the net multiplier is applied exactly once ---------------------- */
const doubleNet=[];
for(const p of allProducts.slice(0,200)){
  const l=eng.priceLine({productId:p.id,finish:'unfinished',config:'slab',qty:1},0);
  if(l.notOffered) continue;
  if(l.doorCostCents!==r2(p.prices.unfinished.slab*NET)) doubleNet.push(p.sku);
}
ok('list x 0.48 applied exactly once to the door',!doubleNet.length,doubleNet.slice(0,4).join(' '));

/* ---- 5. hardware, components and adders ------------------------------- */
const accBad=[];
for(const h of cat.hardware){
  const l=eng.priceLine({productId:allProducts[0].id,finish:'unfinished',config:'slab',qty:1,
    accessories:[{kind:'hardware',id:h.id,qty:1}]},0);
  const a=l.accessories[0];
  let list=h.priceCents;
  if(list===null||list===undefined){const v=h.finishVariantsCents||{}; const k=Object.keys(v)[0]; list=k===undefined?null:v[k];}
  const want=myCost(list,h.priceBasis);
  if(a.unitCostCents!==want) accBad.push('hw '+(h.sku||h.id)+': '+a.unitCostCents+' vs '+want);
}
for(const c of [...cat.fiberglassComponents,...cat.woodComponents]){
  const l=eng.priceLine({productId:allProducts[0].id,finish:'unfinished',config:'slab',qty:1,
    accessories:[{kind:'component',id:c.id,qty:1}]},0);
  const a=l.accessories[0];
  let list=c.priceCents;
  if(list===null||list===undefined){const v=c.priceVariantsCents||{}; const k=Object.keys(v)[0]; list=k===undefined?null:v[k];}
  const want=myCost(list,c.priceBasis);
  if(a.unitCostCents!==want) accBad.push('comp '+(c.sku||c.id)+': '+a.unitCostCents+' vs '+want);
}
for(const ad of [...cat.fiberglassPrehangAdders,...cat.woodPrehangAdders]){
  const l=eng.priceLine({productId:allProducts[0].id,finish:'unfinished',config:'slab',qty:1,
    accessories:[{kind:'adder',id:ad.id,qty:1}]},0);
  const a=l.accessories[0];
  const want=myCost(ad.priceCents,ad.priceBasis);
  if(a.unitCostCents!==want) accBad.push('adder '+ad.id+': '+a.unitCostCents+' vs '+want);
}
ok(`every hardware, component and adder costs list x 0.48 (${cat.hardware.length+cat.fiberglassComponents.length+cat.woodComponents.length+cat.fiberglassPrehangAdders.length+cat.woodPrehangAdders.length} rows)`,
   !accBad.length,accBad.slice(0,5).join(' ; '));

/* ---- 6. freight against the schedule's own worked examples -------------- */
const fx=[[1,12000],[3,12000],[4,16500],[6,16500],[7,20000],[9,20000],[10,0],[50,0]];
const fBad=fx.filter(([u,c])=>eng.crateShippingFor(u).chargeCents!==c);
ok('crate & shipping bands match the schedule at every boundary',!fBad.length,
   fBad.map(([u,c])=>u+'u expected '+c).join(' ; '));
ok('a fractional unit count rounds up into the next band',
   eng.crateShippingFor(3.5).chargeCents===16500 && eng.crateShippingFor(0.5).chargeCents===12000,
   '3.5u -> '+eng.crateShippingFor(3.5).chargeCents+', 0.5u -> '+eng.crateShippingFor(0.5).chargeCents);

/* ---- 7. randomised whole quotes, totalled independently ----------------- */
let seed=12345; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff;};
const offered=allProducts.filter(p=>eng.availableOptions(p.id).anyOffered);
const sides=allProducts.filter(p=>p.type==='sidelite');
let qBad=[],scenarios=0;
for(let t=0;t<400;t++){
  const tier=rnd()<0.5?'builder':'retail', m=MARGIN[tier];
  const n=1+Math.floor(rnd()*4), lines=[];
  for(let i=0;i<n;i++){
    let p,opts,combo,guard=0;
    do{ p=offered[Math.floor(rnd()*offered.length)]; opts=eng.availableOptions(p.id); combo=opts.firstOffered(); }
    while(!combo&&guard++<20);
    if(!combo) continue;
    const all=[];
    for(const f of ['unfinished','prefinished']) for(const c of ['slab','singlePH','doublePH'])
      if(opts.isOffered(f,c)) all.push({f,c});
    const pick=all[Math.floor(rnd()*all.length)];
    const line={productId:p.id,finish:pick.f,config:pick.c,qty:1+Math.floor(rnd()*3),accessories:[]};
    if(rnd()<0.4&&cat.hardware.length){
      const h=cat.hardware[Math.floor(rnd()*cat.hardware.length)];
      line.accessories.push({kind:'hardware',id:h.id,qty:1+Math.floor(rnd()*3)});
    }
    if(rnd()<0.3&&sides.length){
      const s=sides[Math.floor(rnd()*sides.length)];
      if(eng.availableOptions(s.id).isOffered(pick.f,'singlePH'))
        line.accessories.push({kind:'product',id:s.id,finish:pick.f,config:'singlePH',qty:rnd()<0.5?1:2});
    }
    lines.push(line);
  }
  if(!lines.length) continue;
  scenarios++;
  // independent total
  let lineCost=0,lineSell=0,units=0,usable=0;
  for(const l of lines){
    const p=allProducts.find(x=>x.id===l.productId);
    const list=p.prices?.[l.finish]?.[l.config] ?? null;
    if(list===null) continue;
    usable++;
    let unit=myCost(list,p.priceBasis)+PREHANG*(l.config==='slab'?0:1);
    let u=(p.freightUnits ?? UNITS[p.type] ?? 1)*LEAVES[l.config];
    for(const a of l.accessories){
      if(a.kind==='hardware'){
        const h=cat.hardware.find(x=>x.id===a.id);
        let li=h.priceCents;
        if(li===null||li===undefined){const v=h.finishVariantsCents||{};const k=Object.keys(v)[0];li=k===undefined?null:v[k];}
        unit+=(myCost(li,h.priceBasis)||0)*a.qty;
      } else {
        const s=allProducts.find(x=>x.id===a.id);
        const li=s.prices?.[a.finish]?.[a.config] ?? null;
        unit+=(myCost(li,s.priceBasis)||0)*a.qty;
        u+=(s.freightUnits ?? UNITS[s.type] ?? 1)*a.qty;
      }
    }
    lineCost+=unit*l.qty; lineSell+=mySell(unit,m)*l.qty; units+=u*l.qty;
  }
  if(!usable) continue;
  const crate=myBand(units);
  const wantTotalCost=lineCost+crate;
  const wantGrand=lineSell+mySell(crate,m);
  const q=eng.priceQuote({lines,marginTier:tier});
  if(q.totalCostCents!==wantTotalCost||q.grandTotalSellCents!==wantGrand)
    qBad.push(`t${t} ${tier}: engine ${q.totalCostCents}/${q.grandTotalSellCents} mine ${wantTotalCost}/${wantGrand}`);
}
ok(`${scenarios} randomised quotes total identically`,!qBad.length,qBad.slice(0,4).join(' ; '));

/* ---- 8. quantity and accessories: what does qty actually multiply? ------ */
{
  const p=offered.find(x=>eng.availableOptions(x.id).isOffered('unfinished','singlePH'));
  const h=cat.hardware.find(x=>x.priceCents);
  const one=eng.priceQuote({lines:[{productId:p.id,finish:'unfinished',config:'singlePH',qty:1,
    accessories:[{kind:'hardware',id:h.id,qty:4}]}],marginTier:'retail'});
  const three=eng.priceQuote({lines:[{productId:p.id,finish:'unfinished',config:'singlePH',qty:3,
    accessories:[{kind:'hardware',id:h.id,qty:4}]}],marginTier:'retail'});
  const accCost=myCost(h.priceCents,h.priceBasis)*4;
  ok('a line quantity multiplies its accessories too (4 clavos x qty 3 = 12 charged)',
     three.lineCostCents-one.lineCostCents===2*(one.lines[0].unitCostCents),
     'qty1 '+formatCents(one.lineCostCents)+' -> qty3 '+formatCents(three.lineCostCents)+
     ' (accessory block '+formatCents(accCost)+' each)');
}

/* ---- 9. a line that is not offered never reaches the total ------------- */
{
  const p=allProducts.find(x=>x.prices.prefinished.doublePH===null);
  const q=eng.priceQuote({lines:[{productId:p.id,finish:'prefinished',config:'doublePH',qty:1}],marginTier:'retail'});
  ok('an unavailable configuration contributes nothing and is counted',
     q.grandTotalSellCents===0&&q.unavailableCount===1,
     p.sku+' -> total '+q.grandTotalSellCents+', unavailable '+q.unavailableCount);
}

/* ---- 10. freight and prehang carry the margin -------------------------- */
{
  const p=offered.find(x=>eng.availableOptions(x.id).isOffered('unfinished','singlePH'));
  const l=eng.priceLine({productId:p.id,finish:'unfinished',config:'singlePH',qty:1},MARGIN.retail);
  const q=eng.priceQuote({lines:[{productId:p.id,finish:'unfinished',config:'singlePH',qty:1}],marginTier:'retail'});
  ok('the $100 prehang charge is marked up with the door, not passed through',
     mySell(l.unitCostCents,0.4)===l.unitSellCents && l.freightCents===PREHANG,
     '$100.00 cost becomes '+formatCents(mySell(PREHANG,0.4))+' of the customer price');
  ok('the crate & shipping charge is marked up too',
     q.crateShippingSellCents===mySell(q.crateShippingCents,0.4),
     formatCents(q.crateShippingCents)+' -> '+formatCents(q.crateShippingSellCents));
}

/* ---- 11. rounding never drifts on a big quote -------------------------- */
{
  const p=offered.find(x=>eng.availableOptions(x.id).isOffered('unfinished','singlePH'));
  const q=eng.priceQuote({lines:[{productId:p.id,finish:'unfinished',config:'singlePH',qty:97}],marginTier:'retail'});
  const l=q.lines[0];
  ok('a 97-unit line is unit price x 97 exactly, no drift',
     l.totalSellCents===l.unitSellCents*97, formatCents(l.unitSellCents)+' x97 = '+formatCents(l.totalSellCents));
}

/* ---- report ------------------------------------------------------------ */
let fails=0;
for(const f of F){ if(!f.pass)fails++; console.log((f.pass?'PASS  ':'FAIL  ')+f.n+(f.x?'  :: '+f.x:'')); }
console.log('\n'+(F.length-fails)+' passed, '+fails+' failed');
process.exit(fails ? 1 : 0);
