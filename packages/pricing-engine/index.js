/**
 * SimplyDoors pricing engine.
 * ES module, zero dependencies, usable from a browser or from Node.
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE — READ BEFORE TRUSTING A NUMBER
 * ---------------------------------------------------------------------------
 * This package did not exist when App B was built. Every rule below is derived
 * from data/pricing-rules.json, which is authoritative, EXCEPT for two
 * judgement calls that the rules file does not settle. Both move money and are
 * isolated in ASSUMPTIONS so they can be changed in one line:
 *
 *   1. marginMode — "margin-on-sell" (sell = cost / (1 - m)), the standard
 *      reading of "margin". If the business means markup, cost x (1 + m),
 *      switch to "markup-on-cost". On a $1,000 cost at 0.35 that is the
 *      difference between $1,538.46 and $1,350.00.
 *
 *   2. doublePrehangUnits — a doublePH opening is counted as ONE prehung unit
 *      for the freight prehang charge and for prehung labour, on the reading
 *      that the charge is per opening. If it is per door leaf, set it to 2.
 *      At the current $100.00 charge that is $100 per double opening.
 *
 * Everything else — the 0.48 net multiplier and the sections it applies to,
 * the $100.00 prehang freight charge and the fact that it always applies,
 * labour defaults, and half-up-to-cent rounding — comes straight from
 * pricing-rules.json and changes when that file changes.
 *
 * MONEY: every amount is an integer number of cents, in and out. A price of
 * null means the configuration is not offered and is never treated as zero.
 */

export const ASSUMPTIONS = Object.freeze({
  marginMode: "margin-on-sell",   // or "markup-on-cost"
  doublePrehangUnits: 1           // or 2
});

export const FINISHES = Object.freeze(["unfinished", "prefinished"]);
export const CONFIGS  = Object.freeze(["slab", "singlePH", "doublePH"]);

export const CONFIG_LABELS = Object.freeze({
  slab: "Slab only", singlePH: "Single prehung", doublePH: "Double prehung"
});
export const FINISH_LABELS = Object.freeze({
  unfinished: "Unfinished", prefinished: "Prefinished"
});

/* -------------------------------------------------------------------------- */
/* money helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Half-up to the cent. Inputs are integer cents scaled by a float rate. */
export function roundCents(value) {
  if (!isFinite(value)) return null;
  return value < 0 ? -Math.floor(-value + 0.5) : Math.floor(value + 0.5);
}

/** Integer cents -> "$1,728.00". null/undefined -> the em dash. */
export function formatCents(cents, opts = {}) {
  const { nullText = "—", withSymbol = true } = opts;
  if (cents === null || cents === undefined || typeof cents !== "number" || !isFinite(cents)) {
    return nullText;
  }
  const neg = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  return (neg ? "-" : "") + (withSymbol ? "$" : "") + whole + "." + frac;
}

/**
 * Cost -> sell. marginPercent is a fraction (0.35 = 35%).
 * See ASSUMPTIONS.marginMode for which of the two readings is in force.
 */
export function applyMargin(costCents, marginPercent, mode = ASSUMPTIONS.marginMode) {
  if (costCents === null || costCents === undefined) return null;
  const m = Number(marginPercent) || 0;
  if (mode === "markup-on-cost") return roundCents(costCents * (1 + m));
  if (m >= 1) throw new RangeError("marginPercent must be < 1 for margin-on-sell");
  return roundCents(costCents / (1 - m));
}

/* -------------------------------------------------------------------------- */
/* engine                                                                     */
/* -------------------------------------------------------------------------- */

export function createEngine(catalog, rules, overrides = {}) {
  if (!catalog || typeof catalog !== "object") throw new TypeError("catalog is required");
  if (!rules || typeof rules !== "object") throw new TypeError("pricing rules are required");

  const A = Object.assign({}, ASSUMPTIONS, overrides.assumptions || {});

  const products  = Array.isArray(catalog.products) ? catalog.products : [];
  const adders    = Array.isArray(catalog.prehangAdders) ? catalog.prehangAdders : [];
  const components= Array.isArray(catalog.components) ? catalog.components : [];
  const hardware  = Array.isArray(catalog.hardware) ? catalog.hardware : [];

  const byId = new Map();
  products.forEach(p => byId.set(p.id, p));
  const hardwareById = new Map(hardware.map(h => [h.id, h]));
  const componentById = new Map(components.map(c => [c.id, c]));
  const adderById = new Map(adders.map(a => [a.id, a]));

  const netMultiplier = Number(rules.netMultiplier);
  const scope = (rules.netMultiplierScope && Array.isArray(rules.netMultiplierScope.appliesTo))
    ? new Set(rules.netMultiplierScope.appliesTo)
    : new Set(["products", "prehangAdders", "components", "hardware"]);
  const freight = rules.freight || {};
  const defaults = rules.defaults || {};
  const prehangChargeCents = Number(freight.prehangChargeCentsPerUnit) || 0;
  const prehangChargeAlways = freight.prehangChargeAlwaysApplies !== false;
  const laborPerPrehung = Number(defaults.laborCentsPerPrehungUnit) || 0;
  const laborPerSlab = Number(defaults.laborCentsPerSlab) || 0;
  const defaultMargin = Number(defaults.marginPercent) || 0;

  /** How many prehung units a configuration represents (drives freight + labour). */
  function prehungUnits(config) {
    if (config === "singlePH") return 1;
    if (config === "doublePH") return A.doublePrehangUnits;
    return 0;
  }

  /** List cents -> cost cents, honouring priceBasis and the multiplier's scope. */
  function toCost(listCents, priceBasis, section) {
    if (listCents === null || listCents === undefined) return null;
    if (priceBasis === "net") return listCents;
    if (!scope.has(section)) return listCents;
    return roundCents(listCents * netMultiplier);
  }

  function listPriceOf(product, finish, config) {
    if (!product || !product.prices) return null;
    const bucket = product.prices[finish];
    if (!bucket) return null;
    const v = bucket[config];
    return (v === null || v === undefined) ? null : v;
  }

  /** Which finish/config combinations this product is actually offered in. */
  function availableOptions(productId) {
    const product = byId.get(productId);
    const matrix = {};
    let any = false;
    FINISHES.forEach(f => {
      matrix[f] = {};
      CONFIGS.forEach(c => {
        const offered = listPriceOf(product, f, c) !== null;
        matrix[f][c] = offered;
        if (offered) any = true;
      });
    });
    const finishes = FINISHES.filter(f => CONFIGS.some(c => matrix[f][c]));
    const configs  = CONFIGS.filter(c => FINISHES.some(f => matrix[f][c]));
    return {
      productId, product: product || null, matrix, finishes, configs, anyOffered: any,
      isOffered: (f, c) => !!(matrix[f] && matrix[f][c]),
      /** First offered combination, for sensible defaults. */
      firstOffered: () => {
        for (const f of FINISHES) for (const c of CONFIGS) if (matrix[f][c]) return { finish: f, config: c };
        return null;
      }
    };
  }

  /** Resolve an accessory reference to { label, costCents, notOffered }. */
  function priceAccessory(acc) {
    const qty = Math.max(1, Math.trunc(Number(acc.qty) || 1));
    if (acc.kind === "hardware") {
      const h = hardwareById.get(acc.id);
      if (!h) return { id: acc.id, label: "(unknown hardware)", qty, unitCostCents: null, costCents: null, notOffered: true };
      let listCents = h.priceCents;
      let label = h.description || h.sku || h.id;
      if (listCents === null || listCents === undefined) {
        const variants = h.finishVariantsCents || {};
        const key = acc.variant && variants[acc.variant] !== undefined
          ? acc.variant : Object.keys(variants)[0];
        if (key !== undefined && variants[key] !== undefined && variants[key] !== null) {
          listCents = variants[key];
          label += " (" + key + ")";
        }
      }
      const unit = toCost(listCents, h.priceBasis, "hardware");
      return { id: h.id, kind: "hardware", label, qty, unitCostCents: unit,
               costCents: unit === null ? null : unit * qty, notOffered: unit === null };
    }
    if (acc.kind === "component") {
      const c = componentById.get(acc.id);
      if (!c) return { id: acc.id, label: "(unknown component)", qty, unitCostCents: null, costCents: null, notOffered: true };
      let listCents = c.priceCents;
      let label = c.description || c.id;
      if (listCents === null || listCents === undefined) {
        const variants = c.priceVariantsCents || {};
        const key = acc.variant && variants[acc.variant] !== undefined ? acc.variant : Object.keys(variants)[0];
        if (key !== undefined && variants[key] !== null && variants[key] !== undefined) {
          listCents = variants[key];
          label += " (" + key + ")";
        }
      }
      const unit = toCost(listCents, c.priceBasis, "components");
      return { id: c.id, kind: "component", label, qty, unitCostCents: unit,
               costCents: unit === null ? null : unit * qty, notOffered: unit === null };
    }
    if (acc.kind === "adder") {
      const a = adderById.get(acc.id);
      if (!a) return { id: acc.id, label: "(unknown adder)", qty, unitCostCents: null, costCents: null, notOffered: true };
      const unit = toCost(a.priceCents, a.priceBasis, "prehangAdders");
      const label = [a.line, a.topStyle, a.configuration, a.adderType].filter(Boolean).join(" · ");
      return { id: a.id, kind: "adder", label, qty, unitCostCents: unit,
               costCents: unit === null ? null : unit * qty, notOffered: unit === null };
    }
    // default: another catalogue product (sidelite, transom, second door…)
    const p = byId.get(acc.id);
    if (!p) return { id: acc.id, label: "(unknown product)", qty, unitCostCents: null, costCents: null, notOffered: true };
    const finish = acc.finish || "unfinished";
    const config = acc.config || "slab";
    const listCents = listPriceOf(p, finish, config);
    const unit = toCost(listCents, p.priceBasis, "products");
    return { id: p.id, kind: "product", label: p.description || p.sku, sku: p.sku, finish, config, qty,
             unitCostCents: unit, costCents: unit === null ? null : unit * qty,
             notOffered: unit === null,
             prehungUnits: prehungUnits(config) * qty, slabUnits: config === "slab" ? qty : 0 };
  }

  /**
   * Price one line: a door in a finish/config, quantity, plus accessories.
   * Returns costs and, when a margin is supplied, sell prices.
   */
  function priceLine(line, marginPercent = defaultMargin) {
    const product = byId.get(line.productId);
    const qty = Math.max(1, Math.trunc(Number(line.qty) || 1));
    const finish = line.finish || "unfinished";
    const config = line.config || "slab";
    const listCents = listPriceOf(product, finish, config);
    const notOffered = listCents === null;

    const doorCostCents = toCost(listCents, product ? product.priceBasis : "list", "products");
    const accessories = (line.accessories || []).map(priceAccessory);
    const accessoriesCostCents = accessories.reduce((n, a) => n + (a.costCents || 0), 0);

    // Freight: the prehang charge, per prehung unit. prehangChargeAlwaysApplies
    // means it is not conditional on the product's freightUnits — which is just
    // as well, since the current catalogue carries none.
    let prehung = prehungUnits(config);
    let slabs = config === "slab" ? 1 : 0;
    accessories.forEach(a => { prehung += (a.prehungUnits || 0); slabs += (a.slabUnits || 0); });
    const freightCents = prehangChargeAlways || prehung > 0 ? prehung * prehangChargeCents : 0;
    const laborCents = prehung * laborPerPrehung + slabs * laborPerSlab;

    const unitCostCents = notOffered ? null
      : doorCostCents + accessoriesCostCents + freightCents + laborCents;
    const unitSellCents = unitCostCents === null ? null : applyMargin(unitCostCents, marginPercent, A.marginMode);

    return {
      productId: line.productId, product: product || null, sku: product ? product.sku : null,
      description: product ? product.description : "(unknown product)",
      finish, config, qty, notOffered,
      listCents,
      doorCostCents, accessories, accessoriesCostCents,
      freightCents, laborCents,
      unitCostCents, unitSellCents,
      totalCostCents: unitCostCents === null ? null : unitCostCents * qty,
      totalSellCents: unitSellCents === null ? null : unitSellCents * qty
    };
  }

  /**
   * Price a whole quote. `lines` is an array of line specs.
   * marginPercent defaults to defaults.marginPercent from the rules file.
   */
  function priceQuote(input) {
    const spec = Array.isArray(input) ? { lines: input } : (input || {});
    const lines = Array.isArray(spec.lines) ? spec.lines : [];
    const marginPercent = spec.marginPercent === undefined ? defaultMargin : Number(spec.marginPercent);

    const priced = lines.map(l => priceLine(l, marginPercent));
    const usable = priced.filter(l => !l.notOffered);

    const totalCostCents = usable.reduce((n, l) => n + l.totalCostCents, 0);
    const grandTotalSellCents = usable.reduce((n, l) => n + l.totalSellCents, 0);
    const totalFreightCents = usable.reduce((n, l) => n + l.freightCents * l.qty, 0);
    const totalLaborCents = usable.reduce((n, l) => n + l.laborCents * l.qty, 0);
    const unitCount = usable.reduce((n, l) => n + l.qty, 0);

    return {
      lines: priced,
      unitCount,
      lineCount: priced.length,
      unavailableCount: priced.length - usable.length,
      marginPercent,
      currency: rules.currency || "USD",
      totalCostCents,
      grandTotalSellCents,
      totalFreightCents,
      totalLaborCents,
      marginCents: grandTotalSellCents - totalCostCents,
      unitCostCents: unitCount ? roundCents(totalCostCents / unitCount) : 0,
      unitSellCents: unitCount ? roundCents(grandTotalSellCents / unitCount) : 0
    };
  }

  /** Distinct filter values present in the catalogue, for the browser UI. */
  function facets() {
    const uniq = (fn) => Array.from(new Set(products.map(fn).filter(v => v !== null && v !== undefined && v !== ""))).sort();
    return { lines: uniq(p => p.line), families: uniq(p => p.family),
             types: uniq(p => p.type), glazings: uniq(p => p.glazing) };
  }

  return {
    catalog, rules, assumptions: A,
    products, adders, components, hardware,
    productById: id => byId.get(id) || null,
    hardwareList: () => hardware,
    componentList: () => components,
    adderList: () => adders,
    defaultMarginPercent: defaultMargin,
    netMultiplier, prehangChargeCents,
    availableOptions, priceLine, priceQuote, facets,
    toCost, prehungUnits
  };
}

export default createEngine;
