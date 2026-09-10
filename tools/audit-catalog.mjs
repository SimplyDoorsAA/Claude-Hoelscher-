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
if (dupSku.length) {
  // Two rows sharing a (--) glass template is expected; two rows sharing a
  // real number is the vendor's misprint, and speakeasyOptions says which.
  const explained = new Set(((cat.speakeasyOptions || {}).skuCorrections || []).map(c => c.printed));
  WARN('data', 'the same part number appears on more than one row',
       dupSku.slice(0, 8).map(k => k + (explained.has(k) ? '  (misprint, explained in speakeasyOptions)' : '')));
}

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

/* ---- the speakeasy programme ------------------------------------------ */
/* Nine doors are priced with a speakeasy kit and an iron mask as one part
   number each. The app reads that from the part-number grammar published here,
   so the grammar has to reach real rows, and every choice it offers has to
   have a picture and a price or an explicit reason it has neither. */
const se = cat.speakeasyOptions;
if (!se) {
  WARN('functionality', 'no speakeasyOptions: the kit and masks cannot be offered on any door');
} else {
  const corrOf = p => (se.skuCorrections || []).find(c => c.productId ? c.productId === p.id : c.printed === p.sku);
  const res = p => { const c = corrOf(p); return (c && c.resolvesAs) || p.sku; };
  const bySku = new Map(allProducts.map(p => [res(p), p]));
  const bases = new Map(), variants = new Set(), gaps = [];
  allProducts.forEach(base => {
    const code = base.size && base.size.code, sku = res(base);
    if (!code || !sku.endsWith(code)) return;
    const stem = sku.slice(0, sku.length - code.length);
    if (/SE[-MBW]*$/.test(stem)) return;
    const combos = [];
    se.masks.forEach(m => se.inserts.forEach(i => {
      const v = bySku.get(stem + 'SE' + m.code + i.code + code) || null;
      combos.push({ m, i, v });
      if (v) variants.add(v.id);
    }));
    if (combos.some(c => c.v)) {
      bases.set(base.id, base);
      combos.filter(c => !c.v).forEach(c =>
        gaps.push(base.sku + ' ' + (c.m.name || 'no mask') + ' + ' + c.i.name));
    }
  });
  bases.size
    ? NOTE('functionality', bases.size + ' door rows carry the speakeasy programme, ' +
           variants.size + ' variant rows fold into them')
    : ERR('functionality', 'the speakeasy grammar reaches no priced row');
  gaps.length && NOTE('data', gaps.length +
    ' speakeasy combinations the sheet never priced, shown disabled', gaps.slice(0, 8));

  // every choice the configurator draws has to have its picture on disk
  const dm = JSON.parse(fs.readFileSync(ROOT + '/quoter/assets/designs/manifest.json', 'utf8'));
  const art = dm.accessories || {};
  const wantArt = se.masks.map(m => m.name).concat(se.inserts.map(i => i.name))
    .concat((se.extras || []).flatMap(e => e.shapes.length ? e.shapes : [e.name])).filter(Boolean);
  const noArt = wantArt.filter(n => !art[n] ||
    !fs.existsSync(ROOT + '/quoter/assets/designs/' + art[n].file));
  noArt.length ? WARN('functionality', 'a speakeasy choice the app draws has no picture', noArt)
               : NOTE('functionality', wantArt.length + ' speakeasy choices, every one photographed');

  // the four the configurator owns must not also sit in the general picker
  const owned = se.hideFromPicker || [];
  const stillRuled = (cat.accessoryRules || []).filter(r =>
    r.matchDescription && owned.some(o => new RegExp(o, 'i').test(r.matchDescription)));
  stillRuled.length
    ? WARN('functionality', 'an accessory rule still governs something the configurator owns',
           stillRuled.map(r => r.id + ' ' + r.matchDescription))
    : NOTE('functionality', 'the ' + owned.length + ' add-ons the configurator owns are out of the picker');

  // a correction that points nowhere would silently drop a door
  (se.skuCorrections || []).forEach(c => {
    const row = c.productId ? allProducts.find(p => p.id === c.productId)
                            : allProducts.find(p => p.sku === c.printed);
    if (!row) ERR('data', 'a sku correction names a row that is not in the catalog',
                  c.productId || c.printed);
    else if (row.sku !== c.printed)
      ERR('data', 'a sku correction disagrees with the row it names',
          c.productId + ' prints ' + row.sku + ', correction says ' + c.printed);
  });
  (se.skuCorrections || []).length &&
    NOTE('data', (se.skuCorrections || []).length +
      ' misprinted part numbers, each placed by the description beside it');
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
