import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEngine, formatCents, applyMargin, roundCents, FINISHES, CONFIGS } from "./index.js";

const catalog = JSON.parse(readFileSync(new URL("../../data/catalog.json", import.meta.url)));
const rules   = JSON.parse(readFileSync(new URL("../../data/pricing-rules.json", import.meta.url)));
const engine  = createEngine(catalog, rules);

let pass = 0; const fails = [];
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fails.push(name + " :: " + e.message); } };

/* ---------- formatting ---------- */
t("formatCents formats integer cents", () => {
  assert.equal(formatCents(172800), "$1,728.00");
  assert.equal(formatCents(5), "$0.05");
  assert.equal(formatCents(0), "$0.00");
  assert.equal(formatCents(-12345), "-$123.45");
  assert.equal(formatCents(123456789), "$1,234,567.89");
});
t("formatCents never renders null as zero", () => {
  assert.equal(formatCents(null), "—");
  assert.equal(formatCents(undefined), "—");
  assert.equal(formatCents(null, { nullText: "n/a" }), "n/a");
});

/* ---------- rounding ---------- */
t("roundCents is half-up", () => {
  assert.equal(roundCents(10.4), 10);
  assert.equal(roundCents(10.5), 11);
  assert.equal(roundCents(10.6), 11);
  assert.equal(roundCents(-10.5), -11);
});
t("net multiplier avoids float residue", () => {
  // 172800 * 0.48 === 82944.00000000001 in IEEE754
  assert.equal(roundCents(172800 * 0.48), 82944);
  assert.ok(Number.isInteger(engine.toCost(172800, "list", "products")));
});

/* ---------- margin ---------- */
t("applyMargin defaults to margin-on-sell", () => {
  assert.equal(applyMargin(100000, 0.35), 153846);          // 100000 / 0.65
  assert.equal(applyMargin(0, 0.35), 0);
});
t("applyMargin supports markup mode", () => {
  assert.equal(applyMargin(100000, 0.35, "markup-on-cost"), 135000);
});
t("applyMargin propagates null, never zero", () => {
  assert.equal(applyMargin(null, 0.35), null);
});
t("margin >= 1 is rejected rather than dividing by zero", () => {
  assert.throws(() => applyMargin(1000, 1), RangeError);
});

/* ---------- rules wiring ---------- */
t("reads the multiplier and scope from the rules file", () => {
  assert.equal(engine.netMultiplier, 0.48);
  assert.equal(engine.prehangChargeCents, 10000);
  assert.equal(engine.defaultMarginPercent, 0.35);
});
t("cost = list x 0.48 for a list-basis product", () => {
  const p = engine.products.find(x => x.sku === "FG1LVCLE3080");
  assert.equal(p.prices.unfinished.slab, 172800);
  assert.equal(engine.toCost(172800, "list", "products"), 82944);
});
t("a net-basis price is not multiplied again", () => {
  assert.equal(engine.toCost(50000, "net", "products"), 50000);
});
t("a section outside netMultiplierScope is not multiplied", () => {
  const narrow = createEngine(catalog, { ...rules, netMultiplierScope: { appliesTo: ["products"] } });
  assert.equal(narrow.toCost(10000, "list", "products"), 4800);
  assert.equal(narrow.toCost(10000, "list", "hardware"), 10000);
});

/* ---------- availableOptions ---------- */
t("availableOptions mirrors the nulls in the data", () => {
  let checked = 0;
  for (const p of engine.products.slice(0, 120)) {
    const opts = engine.availableOptions(p.id);
    for (const f of FINISHES) for (const c of CONFIGS) {
      assert.equal(opts.isOffered(f, c), p.prices[f][c] !== null);
      checked++;
    }
  }
  assert.ok(checked > 700);
});
t("every product offers at least one configuration", () => {
  const none = engine.products.filter(p => !engine.availableOptions(p.id).anyOffered);
  assert.equal(none.length, 0);
});
t("firstOffered never returns an unoffered combination", () => {
  for (const p of engine.products.slice(0, 200)) {
    const o = engine.availableOptions(p.id).firstOffered();
    assert.ok(o && p.prices[o.finish][o.config] !== null);
  }
});
t("a door with no doublePH reports it unavailable", () => {
  const p = engine.products.find(x => x.prices.unfinished.doublePH === null);
  assert.equal(engine.availableOptions(p.id).isOffered("unfinished", "doublePH"), false);
});

/* ---------- line pricing ---------- */
const door = engine.products.find(x => x.sku === "FG1LVCLE3080");

t("slab line: cost = list x 0.48, no prehang freight", () => {
  const l = engine.priceLine({ productId: door.id, finish: "unfinished", config: "slab", qty: 1 });
  assert.equal(l.doorCostCents, 82944);
  assert.equal(l.freightCents, 0);
  assert.equal(l.unitCostCents, 82944);
  assert.equal(l.unitSellCents, applyMargin(82944, 0.35));
});
t("singlePH line adds exactly one prehang freight charge", () => {
  const l = engine.priceLine({ productId: door.id, finish: "unfinished", config: "singlePH", qty: 1 });
  assert.equal(l.doorCostCents, roundCents(door.prices.unfinished.singlePH * 0.48));
  assert.equal(l.freightCents, 10000);
  assert.equal(l.unitCostCents, l.doorCostCents + 10000);
});
t("quantity multiplies, and unit prices stay integers", () => {
  const l = engine.priceLine({ productId: door.id, finish: "unfinished", config: "singlePH", qty: 3 });
  assert.equal(l.totalCostCents, l.unitCostCents * 3);
  assert.ok(Number.isInteger(l.unitSellCents));
  assert.equal(l.totalSellCents, l.unitSellCents * 3);
});
t("an unoffered configuration prices as null, never zero", () => {
  const p = engine.products.find(x => x.prices.prefinished.doublePH === null);
  const l = engine.priceLine({ productId: p.id, finish: "prefinished", config: "doublePH", qty: 1 });
  assert.equal(l.notOffered, true);
  assert.equal(l.unitCostCents, null);
  assert.equal(l.unitSellCents, null);
  assert.equal(l.totalCostCents, null);
});

/* ---------- accessories ---------- */
t("a sidelite accessory adds its own discounted cost", () => {
  const sl = engine.products.find(x => x.type === "sidelite" && x.prices.unfinished.slab !== null);
  const base = engine.priceLine({ productId: door.id, finish: "unfinished", config: "singlePH", qty: 1 });
  const withSl = engine.priceLine({ productId: door.id, finish: "unfinished", config: "singlePH", qty: 1,
    accessories: [{ kind: "product", id: sl.id, finish: "unfinished", config: "slab", qty: 1 }] });
  assert.equal(withSl.accessoriesCostCents, roundCents(sl.prices.unfinished.slab * 0.48));
  assert.equal(withSl.unitCostCents, base.unitCostCents + withSl.accessoriesCostCents);
});
t("single-priced hardware resolves", () => {
  const hw = engine.hardware.find(h => h.priceCents !== null);
  const l = engine.priceLine({ productId: door.id, finish: "unfinished", config: "slab", qty: 1,
    accessories: [{ kind: "hardware", id: hw.id, qty: 1 }] });
  assert.equal(l.accessories[0].unitCostCents, roundCents(hw.priceCents * 0.48));
  assert.equal(l.accessories[0].notOffered, false);
});
t("finish-variant hardware resolves by variant key", () => {
  const hw = engine.hardware.find(h => h.finishVariantsCents && h.finishVariantsCents.stainless);
  const l = engine.priceLine({ productId: door.id, finish: "unfinished", config: "slab", qty: 1,
    accessories: [{ kind: "hardware", id: hw.id, qty: 1, variant: "stainless" }] });
  assert.equal(l.accessories[0].unitCostCents, roundCents(hw.finishVariantsCents.stainless * 0.48));
  assert.ok(/stainless/.test(l.accessories[0].label));
});
t("an unknown accessory is flagged, not silently free", () => {
  const l = engine.priceLine({ productId: door.id, finish: "unfinished", config: "slab", qty: 1,
    accessories: [{ kind: "hardware", id: "nope", qty: 1 }] });
  assert.equal(l.accessories[0].notOffered, true);
  assert.equal(l.accessories[0].costCents, null);
});

/* ---------- quote totals ---------- */
t("priceQuote sums lines and exposes the documented field names", () => {
  const q = engine.priceQuote({ lines: [
    { productId: door.id, finish: "unfinished", config: "singlePH", qty: 2 },
    { productId: door.id, finish: "prefinished", config: "slab", qty: 1 }
  ]});
  const a = engine.priceLine({ productId: door.id, finish: "unfinished", config: "singlePH", qty: 2 });
  const b = engine.priceLine({ productId: door.id, finish: "prefinished", config: "slab", qty: 1 });
  assert.equal(q.totalCostCents, a.totalCostCents + b.totalCostCents);
  assert.equal(q.grandTotalSellCents, a.totalSellCents + b.totalSellCents);
  assert.ok(Number.isInteger(q.unitCostCents) && Number.isInteger(q.unitSellCents));
  assert.equal(q.unitCount, 3);
  assert.equal(q.totalFreightCents, 20000);
});
t("unoffered lines are excluded from totals but reported", () => {
  const bad = engine.products.find(x => x.prices.prefinished.doublePH === null);
  const q = engine.priceQuote({ lines: [
    { productId: door.id, finish: "unfinished", config: "slab", qty: 1 },
    { productId: bad.id, finish: "prefinished", config: "doublePH", qty: 1 }
  ]});
  assert.equal(q.unavailableCount, 1);
  assert.equal(q.totalCostCents, engine.priceLine({ productId: door.id, finish: "unfinished", config: "slab", qty: 1 }).totalCostCents);
});
t("sell always exceeds cost at a positive margin", () => {
  const q = engine.priceQuote({ lines: [{ productId: door.id, finish: "unfinished", config: "doublePH", qty: 4 }] });
  assert.ok(q.grandTotalSellCents > q.totalCostCents);
  assert.equal(q.marginCents, q.grandTotalSellCents - q.totalCostCents);
});
t("margin of 0 makes sell equal cost", () => {
  const q = engine.priceQuote({ lines: [{ productId: door.id, finish: "unfinished", config: "slab", qty: 1 }], marginPercent: 0 });
  assert.equal(q.grandTotalSellCents, q.totalCostCents);
});
t("an empty quote totals zero, not NaN", () => {
  const q = engine.priceQuote({ lines: [] });
  assert.equal(q.totalCostCents, 0);
  assert.equal(q.grandTotalSellCents, 0);
  assert.equal(q.unitCostCents, 0);
});

/* ---------- whole-catalogue sweep ---------- */
t("every offered combination in the catalogue prices to a positive integer", () => {
  let priced = 0;
  for (const p of engine.products) {
    const o = engine.availableOptions(p.id);
    for (const f of FINISHES) for (const c of CONFIGS) {
      if (!o.isOffered(f, c)) continue;
      const l = engine.priceLine({ productId: p.id, finish: f, config: c, qty: 1 });
      assert.ok(Number.isInteger(l.unitCostCents), p.sku + " " + f + "/" + c + " cost not integer");
      assert.ok(Number.isInteger(l.unitSellCents), p.sku + " " + f + "/" + c + " sell not integer");
      assert.ok(l.unitCostCents > 0 && l.unitSellCents >= l.unitCostCents);
      priced++;
    }
  }
  assert.equal(priced, 2988);
});
t("every unoffered combination prices to null across the catalogue", () => {
  let nulls = 0;
  for (const p of engine.products) {
    const o = engine.availableOptions(p.id);
    for (const f of FINISHES) for (const c of CONFIGS) {
      if (o.isOffered(f, c)) continue;
      const l = engine.priceLine({ productId: p.id, finish: f, config: c, qty: 1 });
      assert.equal(l.unitCostCents, null);
      nulls++;
    }
  }
  assert.equal(nulls, 546);
});
t("facets expose the filters the UI needs", () => {
  const f = engine.facets();
  assert.deepEqual(f.lines, ["barn", "fiberglass", "knotty_alder", "mahogany"]);
  assert.equal(f.families.length, 5);
  assert.ok(f.glazings.length > 20);
});

console.log(pass + " passed, " + fails.length + " failed");
fails.forEach(f => console.log("  FAIL " + f));
process.exit(fails.length ? 1 : 0);
