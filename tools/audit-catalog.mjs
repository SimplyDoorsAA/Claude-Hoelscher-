/* Structural audit of the published data. Checks the four data contracts and
   every cross-reference, and reports what the app can and cannot reach.
   Reads only; prints findings. Exit 1 if any ERROR-level finding is raised. */
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const ROOT = path.resolve(url.fileURLToPath(import.meta.url), '../..');
const cat   = JSON.parse(fs.readFileSync(ROOT + '/data/catalog.json', 'utf8'));
const rules = JSON.parse(fs.readFileSync(ROOT + '/data/pricing-rules.json', 'utf8'));

const F = []; const add = (level, area, msg, detail) => F.push({ level, area, msg, detail });
const ERR = (a, m, d) => add('ERROR', a, m, d);
const WARN = (a, m, d) => add('WARN', a, m, d);
const NOTE = (a, m, d) => add('NOTE', a, m, d);

const arrays = Object.entries(cat).filter(([, v]) => Array.isArray(v));
const productArrays = arrays.filter(([k]) => /products$/i.test(k));
const allProducts = productArrays.flatMap(([, v]) => v);
const allRows = arrays.flatMap(([, v]) => v);

/* ---- contract 1: integer cents, never a float ------------------------- */
const centsPaths = [];
(function walk(node, p) {
  if (node === null || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    const at = p + '.' + k;
    if (/Cents$/.test(k) || /^(slab|singlePH|doublePH)$/.test(k)) {
      const vals = (v && typeof v === 'object') ? Object.values(v) : [v];
      vals.forEach(x => { if (x !== null && x !== undefined && typeof x !== 'object') centsPaths.push([at, x]); });
    }
    if (typeof v === 'object') walk(v, at);
  }
})(cat, 'catalog');
const badCents = centsPaths.filter(([, v]) => !(typeof v === 'number' && Number.isInteger(v)));
badCents.length ? ERR('contract', 'money stored as something other than integer cents', badCents.slice(0, 5))
                : NOTE('contract', centsPaths.length.toLocaleString() + ' money values, all integer cents');

/* ---- contract 2: null means not offered, never 0 or "" ---------------- */
const zeroPrices = [];
allProducts.forEach(p => {
  for (const f of ['unfinished', 'prefinished'])
    for (const c of ['slab', 'singlePH', 'doublePH']) {
      const v = p.prices && p.prices[f] && p.prices[f][c];
      if (v === 0 || v === '') zeroPrices.push(p.sku + ' ' + f + '.' + c + ' = ' + JSON.stringify(v));
    }
});
zeroPrices.length ? ERR('contract', 'a not-offered price became 0 or empty', zeroPrices.slice(0, 5))
                  : NOTE('contract', 'no price cell uses 0 or "" for not offered');

/* ---- contract 3: priceBasis on every priced row ----------------------- */
const basisBad = allRows.filter(r =>
  ('priceCents' in r || 'prices' in r || 'priceVariantsCents' in r || 'finishVariantsCents' in r) &&
  r.priceBasis !== 'list' && r.priceBasis !== 'net');
basisBad.length ? ERR('contract', 'priced row without a list/net priceBasis',
                      basisBad.slice(0, 5).map(r => (r.sku || r.partNumber || r.id) + ' -> ' + JSON.stringify(r.priceBasis)))
                : NOTE('contract', 'every priced row carries priceBasis list or net');

/* ---- contract 4: ids are unique and look like content hashes ---------- */
const ids = allRows.map(r => r.id).filter(Boolean);
const dupIds = ids.filter((v, i) => ids.indexOf(v) !== i);
dupIds.length ? ERR('contract', 'duplicate id across the catalog', [...new Set(dupIds)].slice(0, 5))
              : NOTE('contract', ids.length + ' ids, all unique');
const oddIds = ids.filter(i => !/^[0-9a-f]{10}$/.test(i));
oddIds.length && WARN('contract', 'ids that are not 10 hex characters', oddIds.slice(0, 5));

/* ---- duplicate part numbers ------------------------------------------ */
const skus = allProducts.map(p => p.sku);
const dupSku = [...new Set(skus.filter((v, i) => skus.indexOf(v) !== i))];
dupSku.length && WARN('data', 'the same part number appears on more than one row', dupSku.slice(0, 8));

/* ---- rows nothing is offered on --------------------------------------- */
const dead = allProducts.filter(p => {
  const pr = p.prices || {};
  return !['unfinished', 'prefinished'].some(f => ['slab', 'singlePH', 'doublePH']
    .some(c => pr[f] && pr[f][c] !== null && pr[f][c] !== undefined));
});
dead.length && WARN('data', 'product rows with no offered price at all', dead.map(p => p.sku).slice(0, 8));

/* ---- cross references -------------------------------------------------- */
const byId = new Map(allRows.map(r => [r.id, r]));
const SP = /^\d{4,5}[A-Z]?\s+/;
const keyOf = p => {
  const d = String(p.description || '').trim(), code = p.size && p.size.code;
  if (code) { const rx = new RegExp('(^|\\s)' + String(code) + '(?=\\s|$)');
    if (rx.test(d)) return d.replace(rx, '$1').replace(/\s+/g, ' ').trim(); }
  return d.replace(SP, '').trim();
};
const modelKeys = new Set(allProducts.map(keyOf));
(cat.fiberglassIronGrilles || []).forEach(g => {
  if (!byId.has(g.productId)) ERR('xref', 'iron grille points at a product id that is not in the catalog', g.sku);
  if (!modelKeys.has(g.baseModel)) ERR('xref', 'iron grille baseModel matches no model', g.baseModel);
  if (!Array.isArray(g.styles) || !g.styles.length) ERR('xref', 'iron grille with no styles', g.sku);
});

/* ---- what the net multiplier covers ------------------------------------ */
const scope = new Set((rules.netMultiplierScope || {}).appliesTo || []);
const kindOf = k => /products?$/i.test(k) ? 'products'
  : /(?:prehang)?adders?$/i.test(k) ? 'prehangAdders'
  : /components?$/i.test(k) ? 'components'
  : /hardware$/i.test(k) ? 'hardware' : null;
arrays.forEach(([k, v]) => {
  const kind = kindOf(k);
  const priced = v.some(r => 'priceCents' in r || 'prices' in r || 'priceVariantsCents' in r || 'finishVariantsCents' in r);
  if (priced && !kind) ERR('pricing', 'priced array the engine will not merge or scale', k);
  else if (priced && !scope.has(kind)) WARN('pricing', 'priced array outside netMultiplierScope', k + ' -> ' + kind);
});
if (!(rules.netMultiplierScope || {}).vendorConfirmed)
  NOTE('pricing', 'netMultiplierScope is still unconfirmed by Hoelscher');
if (!((rules.openingSpec || {}).jambDepths || {}).vendorConfirmed)
  NOTE('pricing', 'jamb depth handling is still unconfirmed by Hoelscher');

/* ---- sanity on the price relationships --------------------------------- */
const odd = [];
allProducts.forEach(p => {
  const u = p.prices && p.prices.unfinished, f = p.prices && p.prices.prefinished;
  if (!u || !f) return;
  ['slab', 'singlePH', 'doublePH'].forEach(c => {
    if (u[c] !== null && f[c] !== null && f[c] < u[c])
      odd.push(p.sku + ' ' + c + ': prefinished ' + f[c] + ' < unfinished ' + u[c]);
  });
  if (u.slab !== null && u.singlePH !== null && u.singlePH < u.slab)
    odd.push(p.sku + ': single prehung cheaper than the slab');
  if (u.singlePH !== null && u.doublePH !== null && u.doublePH < u.singlePH)
    odd.push(p.sku + ': double prehung cheaper than single');
});
odd.length ? WARN('pricing', 'price relationships that read backwards', odd.slice(0, 8))
           : NOTE('pricing', 'prefinished >= unfinished and doublePH >= singlePH throughout');

/* ---- descriptions that look like typos --------------------------------- */
const words = new Map();
allProducts.forEach(p => String(p.description || '').split(/[\s,]+/).forEach(w => {
  const k = w.replace(/[^A-Za-z/']/g, '');
  if (k.length > 2) words.set(k, (words.get(k) || 0) + 1);
}));
const suspicious = [];
for (const [w, n] of words) {
  if (n > 3) continue;
  for (const [w2, n2] of words) {
    if (w === w2 || n2 < n * 8) continue;
    if (Math.abs(w.length - w2.length) === 1 && (w2.includes(w) || w.includes(w2)))
      suspicious.push(w + ' (' + n + ') vs ' + w2 + ' (' + n2 + ')');
  }
}
[...new Set(suspicious)].length &&
  WARN('data', 'a word that looks like a misspelling of a common one', [...new Set(suspicious)].slice(0, 8));

/* ---- page numbers ------------------------------------------------------ */
const noPage = allProducts.filter(p => !p.catalogPage);
noPage.length && NOTE('data', noPage.length + ' of ' + allProducts.length +
  ' product rows carry no catalogPage');

/* ---- a field holding something other than what it names ---------------- */
const PAGEISH = /^P\.?\s*\d/i;
const pageInGlass = allProducts.filter(p => PAGEISH.test(String(p.glazing || '')));
pageInGlass.length && ERR('data', 'a page reference is sitting in the glazing field, which the ' +
  'Quoter reads as the glass type', pageInGlass.slice(0, 5).map(p => p.sku + ' -> ' + p.glazing));

/* ---- one thing spelled two ways ---------------------------------------- */
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const glassByNorm = new Map();
allProducts.forEach(p => { if (!p.glazing) return;
  const k = norm(p.glazing);
  if (!glassByNorm.has(k)) glassByNorm.set(k, new Set());
  glassByNorm.get(k).add(p.glazing); });
const twoWays = [...glassByNorm.values()].filter(v => v.size > 1).map(v => [...v].join('  /  '));
twoWays.length ? WARN('data', 'one glass spelled more than one way, so it shows twice in the filter', twoWays)
               : NOTE('data', 'every glass name has one spelling');

/* ---- accessory reachability -------------------------------------------- */
const accRules = cat.accessoryRules || [];
if (!accRules.length) WARN('functionality', 'no accessoryRules: every accessory is offered on every door');
else {
  const kinds = { hardware: cat.hardware || [],
                  component: arrays.filter(([k]) => /components$/i.test(k)).flatMap(([, v]) => v) };
  Object.entries(kinds).forEach(([kind, rows]) => {
    accRules.filter(r => r.kind === kind).forEach(r => {
      const hit = rows.filter(a =>
        (r.matchCategory ? a.category === r.matchCategory : true) &&
        (r.matchDescription ? new RegExp(r.matchDescription, 'i').test(a.description || '') : true) &&
        (r.matchCategory || r.matchDescription));
      if (!hit.length) WARN('functionality', 'an accessory rule matches nothing in the catalog',
        r.id + ' ' + (r.matchCategory || r.matchDescription));
    });
    const constrained = new Set();
    accRules.filter(r => r.kind === kind).forEach(r => rows.forEach(a => {
      if ((r.matchCategory ? a.category === r.matchCategory : true) &&
          (r.matchDescription ? new RegExp(r.matchDescription, 'i').test(a.description || '') : true) &&
          (r.matchCategory || r.matchDescription)) constrained.add(a.id); }));
    NOTE('functionality', kind + ': ' + constrained.size + ' of ' + rows.length +
      ' items are restricted to particular doors; the rest are offered on any');
  });
  // a model pattern that names no model is a rule nobody will ever satisfy
  accRules.forEach(r => {
    if (!r.requiresModelPattern) return;
    const rx = new RegExp(r.requiresModelPattern, 'i');
    const n = [...modelKeys].filter(k => rx.test(k)).length;
    n ? NOTE('functionality', 'rule ' + r.id + ' opens on ' + n + ' model(s)')
      : ERR('functionality', 'accessory rule requires a model pattern that matches no model',
            r.id + ' -> ' + r.requiresModelPattern);
  });
}

/* ---- report ------------------------------------------------------------ */
const order = { ERROR: 0, WARN: 1, NOTE: 2 };
F.sort((a, b) => order[a.level] - order[b.level] || a.area.localeCompare(b.area));
for (const f of F) {
  console.log(f.level.padEnd(5), '[' + f.area + ']', f.msg);
  if (f.detail) (Array.isArray(f.detail) ? f.detail : [f.detail]).forEach(d => console.log('        ', d));
}
const errs = F.filter(f => f.level === 'ERROR').length;
console.log('\n' + errs + ' error(s), ' + F.filter(f => f.level === 'WARN').length + ' warning(s), ' +
            F.filter(f => f.level === 'NOTE').length + ' note(s)');
process.exit(errs ? 1 : 0);
