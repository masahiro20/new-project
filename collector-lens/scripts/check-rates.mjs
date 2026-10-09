// Schema gate for the landed-cost rate tables (design docs/v1.1-total-cost-design.md §4, §7).
// Checks data/rates/ (the real tables) and test/fixtures/rates/ (fictional numbers for tests/demo).
// meta.status:
//   "placeholder" every value must still be null.
//   "partial"     some values are filled from official sources, the rest stay null.
//   "verified"    all reviewed (design §11.3).
// Whatever the status, a filled value needs checked_at, source and effective_from,
// and a null value needs a note. In data/rates a filled value's source must be an
// https URL and a null note must say "要確認"; partial/verified need meta.last_reviewed.
// Rule shapes (design §13): tax_base (parts of the import-tax base), duty keyed by
// subgenre (camera/lens/watch required; digital_camera/film_camera optional),
// duty_rules (rows with applies_when { max_value, currency, of } and effective_until),
// subdivisions (user-selectable regional tax), notices (English messages with a source).
//   node scripts/check-rates.mjs
// Also importable: validateRates(tables, { today, label }) -> string[] of errors.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const CURRENCIES = new Set(["JPY", "USD", "GBP", "EUR", "AUD", "CAD"]);
export const DESTINATIONS = { US: "USD", GB: "GBP", DE: "EUR", AU: "AUD", CA: "CAD" };
const KINDS = new Set(["fixed", "rate", "rate_with_min", "rate_with_min_max", "per_unit", "tiered"]);
const DUTY_KINDS = new Set(["rate", "per_unit", "rate_with_min_max"]);
const RULE_KINDS = new Set(["fixed", "per_unit", "rate", "rate_with_min_max"]);
const TAX_BASE_PARTS = new Set(["goods", "international_shipping", "insurance", "duty", "customs_value"]);
const APPLIES_OF = new Set(["goods", "customs_value"]);
const ROUNDING = new Set(["ceil", "floor", "round"]);
const STAGES = new Set(["service", "payment"]);
const SERVICE_BASES = new Set(["item_price", "domestic_shipping", "goods_total"]);
const PAYMENT_BASES = new Set([...SERVICE_BASES, "proxy_charges", "international_shipping", "proxy_charges_plus_shipping"]);
const DUTY_CATEGORIES = ["camera", "lens", "watch"];
const OPTIONAL_DUTY_CATEGORIES = ["digital_camera", "film_camera"];
const SUBDIVISION_ID = /^[A-Z0-9_]{1,10}$/;
const NOTICE_WHEN = new Set(["carriers", "methods", "destinations"]);
const CJK = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/;
const WEIGHT_KEYS = ["lens", "film_camera", "digital_camera", "watch"];
const STATUSES = new Set(["placeholder", "partial", "verified", "fixture"]);
const VALUE_FIELDS = ["value", "amount", "rate", "min", "max", "tiers"];
const ID = /^[a-z0-9_]+$/;

const isDate = (s) => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
};
const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const numOrNull = (x) => x === null || isNum(x);
const nonEmpty = (s) => typeof s === "string" && s.trim().length > 0;

export function validateRates(tables, { today = new Date().toISOString().slice(0, 10), label = "rates" } = {}) {
  const errors = [];
  const err = (where, msg) => errors.push(`${label}: ${where}: ${msg}`);
  const meta = tables.meta || {};
  const placeholder = meta.status === "placeholder";
  let rowCount = 0;

  // Common rules for every dated row.
  function checkRow(where, r, rowKind) {
    rowCount++;
    if (!r || typeof r !== "object" || Array.isArray(r)) return err(where, "row must be an object");
    const hasValue = VALUE_FIELDS.some((f) => r[f] !== undefined && r[f] !== null);
    for (const f of ["effective_from", "checked_at", "effective_until"]) {
      if (r[f] !== null && r[f] !== undefined && !isDate(r[f])) err(where, `${f} must be an ISO date (YYYY-MM-DD) or null`);
    }
    if (isDate(r.checked_at) && r.checked_at > today) err(where, `checked_at ${r.checked_at} is in the future`);
    if (isDate(r.effective_until) && isDate(r.effective_from) && r.effective_until <= r.effective_from) err(where, "effective_until must be after effective_from");
    if (r.applies_when !== undefined) {
      const w = r.applies_when;
      if (!w || typeof w !== "object" || Array.isArray(w)) err(where, "applies_when must be an object");
      else {
        for (const k of Object.keys(w)) if (!["max_value", "currency", "of", "note"].includes(k)) err(where, `applies_when: unknown key ${k}`);
        if (!(w.max_value === null || (isNum(w.max_value) && w.max_value > 0))) err(where, "applies_when.max_value must be a positive number or null");
        if (!CURRENCIES.has(w.currency)) err(where, "applies_when needs a currency");
        if (!(w.of === null || APPLIES_OF.has(w.of))) err(where, 'applies_when.of must be "goods", "customs_value" or null');
        if (w.of === null || w.max_value === null) {
          if (!nonEmpty(r.note)) err(where, "applies_when with a null part needs a note");
          else if (label === "data/rates" && !r.note.includes("要確認")) err(where, 'applies_when with a null part: note must contain "要確認"');
        }
      }
    }
    if (r.source !== null && r.source !== undefined && !nonEmpty(r.source)) err(where, "source must be a non-empty string or null");
    if (hasValue) {
      if (!isDate(r.checked_at)) err(where, "a non-null value needs checked_at");
      if (!nonEmpty(r.source)) err(where, "a non-null value needs source");
      if (!isDate(r.effective_from)) err(where, "a non-null value needs effective_from");
      if (placeholder) err(where, 'meta.status is "placeholder": every value must stay null until a person verifies it');
      if (label === "data/rates" && nonEmpty(r.source) && !/^https:\/\//.test(r.source)) err(where, "source must be the official page's https URL");
    } else {
      if (!nonEmpty(r.note)) err(where, "a null row needs a note explaining what must be checked");
      else if (label === "data/rates" && !r.note.includes("要確認")) err(where, 'a null row\'s note must contain "要確認"');
    }
    if (r.currency !== undefined && r.currency !== null && !CURRENCIES.has(r.currency)) err(where, `unknown currency ${r.currency}`);

    if (rowKind === "fee") {
      if (!KINDS.has(r.kind)) return err(where, `kind must be one of ${[...KINDS].join("/")}`);
      if (r.rounding !== undefined && r.rounding !== null && !ROUNDING.has(r.rounding)) err(where, `rounding must be ceil/floor/round`);
      if (r.rounding_unit !== undefined && !(isNum(r.rounding_unit) && r.rounding_unit > 0)) err(where, "rounding_unit must be a positive number");
      const needsCurrency = r.kind !== "rate";
      if (needsCurrency && !CURRENCIES.has(r.currency)) err(where, `${r.kind} row needs a currency`);
      const rateOk = (x) => x === null || (isNum(x) && x >= 0 && x <= 1);
      switch (r.kind) {
        case "fixed":
          if (!("amount" in r) || !(r.amount === null || (isNum(r.amount) && r.amount >= 0))) err(where, "fixed needs amount (number >= 0 or null)");
          break;
        case "rate":
          if (!("rate" in r) || !rateOk(r.rate)) err(where, "rate needs rate (0..1 or null)");
          break;
        case "per_unit":
          if (!("amount" in r) || !(r.amount === null || (isNum(r.amount) && r.amount >= 0))) err(where, "per_unit needs amount per unit (number >= 0 or null)");
          break;
        case "rate_with_min_max": {
          const n = ["rate", "min", "max"].filter((f) => r[f] === null).length;
          if (!("rate" in r) || !rateOk(r.rate)) err(where, "rate_with_min_max needs rate (0..1 or null)");
          for (const f of ["min", "max"]) if (!(f in r) || !(r[f] === null || (isNum(r[f]) && r[f] >= 0))) err(where, `rate_with_min_max needs ${f} (number >= 0 or null)`);
          if (n !== 0 && n !== 3) err(where, "rate, min and max must all be set or all be null");
          if (isNum(r.min) && isNum(r.max) && r.min > r.max) err(where, "min must not exceed max");
          if (r.per !== undefined && r.per !== "unit" && r.per !== "line") err(where, 'per must be "unit" or "line"');
          break;
        }
        case "rate_with_min":
          if (!("rate" in r) || !rateOk(r.rate)) err(where, "rate_with_min needs rate (0..1 or null)");
          if (!("min" in r) || !(r.min === null || (isNum(r.min) && r.min >= 0))) err(where, "rate_with_min needs min (number >= 0 or null)");
          if ((r.rate === null) !== (r.min === null)) err(where, "rate and min must both be set or both be null");
          break;
        case "tiered":
          if (!("tiers" in r)) { err(where, "tiered needs tiers (array or null)"); break; }
          if (r.tiers === null) break;
          if (!Array.isArray(r.tiers) || !r.tiers.length) { err(where, "tiers must be a non-empty array"); break; }
          r.tiers.forEach((t, i) => {
            const tw = `${where} tier ${i}`;
            if (!t || typeof t !== "object") return err(tw, "tier must be an object");
            if (t.up_to === null) { if (i !== r.tiers.length - 1) err(tw, "only the last tier may have up_to null"); }
            else if (!isNum(t.up_to) || t.up_to <= 0) err(tw, "up_to must be a positive number or null");
            else if (i > 0 && isNum(r.tiers[i - 1].up_to) && t.up_to <= r.tiers[i - 1].up_to) err(tw, "up_to must increase");
            const hasA = isNum(t.amount), hasR = isNum(t.rate);
            if (hasA === hasR) err(tw, "tier needs exactly one of amount / rate");
            if (hasA && t.amount < 0) err(tw, "amount must be >= 0");
            if (hasR && !rateOk(t.rate)) err(tw, "rate must be 0..1");
          });
          break;
      }
    } else if (rowKind === "fx") {
      if (!numOrNull(r.value) || (isNum(r.value) && r.value <= 0)) err(where, "value must be a positive number (yen per 1 unit) or null");
    } else if (rowKind === "divisor") {
      if (!numOrNull(r.value) || (isNum(r.value) && r.value <= 0)) err(where, "value must be a positive number or null");
    } else if (rowKind === "tax_base") {
      const v = r.value;
      if (v !== null) {
        if (!Array.isArray(v) || !v.length) err(where, "value must be a non-empty list of parts or null");
        else {
          if (!v.every((x) => TAX_BASE_PARTS.has(x))) err(where, `parts must be among ${[...TAX_BASE_PARTS].join("/")}`);
          if (new Set(v).size !== v.length) err(where, "parts must not repeat");
          if (v.includes("customs_value") && v.some((x) => ["goods", "international_shipping", "insurance"].includes(x))) {
            err(where, "customs_value already contains goods (and shipping/insurance under CIF); do not list both");
          }
        }
      }
    } else if (rowKind === "duty_basis") {
      if (!(r.value === null || r.value === "FOB" || r.value === "CIF")) err(where, 'value must be "FOB", "CIF" or null');
    } else if (rowKind === "de_minimis") {
      if (!(r.value === null || (isNum(r.value) && r.value >= 0))) err(where, "value must be a number >= 0 or null");
      if (!CURRENCIES.has(r.currency)) err(where, "de_minimis needs a currency");
      if (!Array.isArray(r.applies_to) || !r.applies_to.length || !r.applies_to.every((x) => x === "duty" || x === "import_tax")) {
        err(where, 'applies_to must list "duty" and/or "import_tax"');
      }
    }
  }

  function checkComp(where, c, rowKind) {
    if (!c || typeof c !== "object") return err(where, "missing");
    if (!Array.isArray(c.rows) || !c.rows.length) return err(where, "rows must be a non-empty array");
    const seen = new Set();
    c.rows.forEach((r, i) => {
      checkRow(`${where} row ${i}`, r, rowKind);
      const k = r && r.effective_from === undefined ? null : r && r.effective_from;
      if (seen.has(k)) err(where, `two rows share effective_from ${k}`);
      seen.add(k);
    });
  }

  // Notices: English message shown to users, with a dated official source.
  function checkNotices(where, list, whenKeys) {
    if (list === undefined) return;
    if (!Array.isArray(list)) return err(`${where} notices`, "must be an array");
    const ids = new Set();
    for (const n of list) {
      const nw = `${where} notice ${n?.id}`;
      if (!ID.test(n?.id ?? "")) err(nw, "id must match [a-z0-9_]+");
      if (ids.has(n?.id)) err(nw, "duplicate id");
      ids.add(n?.id);
      if (!nonEmpty(n?.message)) err(nw, "message (English, shown to users) is required");
      else if (CJK.test(n.message)) err(nw, "message must be English (UI text)");
      if (!isDate(n?.checked_at)) err(nw, "needs checked_at");
      else if (n.checked_at > today) err(nw, `checked_at ${n.checked_at} is in the future`);
      if (!nonEmpty(n?.source)) err(nw, "needs source");
      else if (label === "data/rates" && !/^https:\/\//.test(n.source)) err(nw, "source must be the official page's https URL");
      for (const f of ["effective_from", "effective_until"]) if (n?.[f] !== undefined && n[f] !== null && !isDate(n[f])) err(nw, `${f} must be an ISO date or null`);
      if (n?.when !== undefined) {
        if (!n.when || typeof n.when !== "object") err(nw, "when must be an object");
        else for (const [k, v] of Object.entries(n.when)) {
          if (!whenKeys.includes(k)) err(nw, `when.${k} not allowed here (use ${whenKeys.join("/")})`);
          if (!Array.isArray(v) || !v.length || !v.every((x) => typeof x === "string" && x)) err(nw, `when.${k} must be a non-empty list of ids`);
        }
      }
    }
  }

  function checkFee(where, c, bases) {
    if (!ID.test(c?.id ?? "")) err(where, "id must match [a-z0-9_]+");
    if (!nonEmpty(c?.label)) err(where, "label (English, shown to users) is required");
    if (!STAGES.has(c?.stage)) err(where, "stage must be service or payment");
    const allowed = bases || (c?.stage === "payment" ? PAYMENT_BASES : SERVICE_BASES);
    if (c?.base !== undefined && !allowed.has(c.base)) err(where, `base "${c.base}" not allowed here`);
    if (c?.counts_as !== undefined && c.counts_as !== "insurance") err(where, 'counts_as may only be "insurance"');
    checkComp(where, c, "fee");
  }

  // ---- meta ----
  if (meta.schema_version !== 1) err("meta", "schema_version must be 1");
  if (!STATUSES.has(meta.status)) err("meta", `status must be one of ${[...STATUSES].join("/")}`);
  if (!Number.isInteger(meta.stale_after_days) || !Number.isInteger(meta.expire_after_days) || meta.stale_after_days <= 0 || meta.stale_after_days >= meta.expire_after_days) {
    err("meta", "stale_after_days / expire_after_days must be integers with 0 < stale < expire");
  }
  if (meta.last_reviewed !== null && !isDate(meta.last_reviewed)) err("meta", "last_reviewed must be an ISO date or null");
  if ((meta.status === "partial" || meta.status === "verified") && !isDate(meta.last_reviewed)) err("meta", `status "${meta.status}" needs last_reviewed`);
  const fx = meta.fx_reference || {};
  for (const cur of Object.values(DESTINATIONS)) if (!fx[cur]) err("meta.fx_reference", `missing ${cur}`);
  for (const [cur, c] of Object.entries(fx)) {
    if (!CURRENCIES.has(cur) || cur === "JPY") err("meta.fx_reference", `bad currency ${cur}`);
    checkComp(`meta.fx_reference.${cur}`, c, "fx");
  }

  // ---- proxies ----
  const proxies = tables.proxies?.proxies;
  if (tables.proxies?.schema_version !== 1) err("proxies", "schema_version must be 1");
  if (!Array.isArray(proxies) || !proxies.length) err("proxies", "proxies must be a non-empty array");
  const proxyIds = new Set();
  for (const p of proxies || []) {
    const pw = `proxy ${p?.id}`;
    if (!ID.test(p?.id ?? "")) err(pw, "bad id");
    if (proxyIds.has(p.id)) err(pw, "duplicate id");
    proxyIds.add(p.id);
    if (!nonEmpty(p.display_name)) err(pw, "display_name required");
    if (!Array.isArray(p.plans) || !p.plans.length) err(pw, "plans must be a non-empty array");
    const planIds = new Set();
    for (const plan of p.plans || []) {
      const plw = `${pw} plan ${plan?.id}`;
      if (!ID.test(plan?.id ?? "")) err(plw, "bad id");
      if (planIds.has(plan.id)) err(plw, "duplicate id");
      planIds.add(plan.id);
      if (!nonEmpty(plan.label)) err(plw, "label required");
      const compIds = new Set();
      for (const c of plan.components || []) {
        if (compIds.has(c?.id)) err(plw, `duplicate component ${c?.id}`);
        compIds.add(c?.id);
        checkFee(`${plw} ${c?.id}`, c);
      }
    }
    if (!Array.isArray(p.options)) err(pw, "options must be an array");
    const optIds = new Set();
    for (const o of p.options || []) {
      if (optIds.has(o?.id)) err(pw, `duplicate option ${o?.id}`);
      optIds.add(o?.id);
      checkFee(`${pw} option ${o?.id}`, o);
    }
  }

  // ---- shipping ----
  const ship = tables.shipping || {};
  if (ship.schema_version !== 1) err("shipping", "schema_version must be 1");
  const wd = ship.weight_defaults;
  if (!wd || !wd.values_kg) err("shipping.weight_defaults", "missing");
  else {
    for (const k of WEIGHT_KEYS) if (!(isNum(wd.values_kg[k]) && wd.values_kg[k] > 0)) err("shipping.weight_defaults", `${k} must be a positive number (kg)`);
    if (!nonEmpty(wd.source) || !isDate(wd.checked_at)) err("shipping.weight_defaults", "needs source and checked_at");
  }
  if (!Array.isArray(ship.methods) || !ship.methods.length) err("shipping", "methods must be a non-empty array");
  const methodIds = new Set();
  for (const m of ship.methods || []) {
    const mw = `shipping method ${m?.id}`;
    if (!ID.test(m?.id ?? "")) err(mw, "bad id");
    if (methodIds.has(m.id)) err(mw, "duplicate id");
    methodIds.add(m.id);
    if (!nonEmpty(m.label)) err(mw, "label required");
    if (m.carrier !== undefined && !ID.test(m.carrier ?? "")) err(mw, "carrier must match [a-z0-9_]+");
    checkNotices(mw, m.notices, ["destinations"]);
    checkComp(`${mw} volumetric_divisor`, m.volumetric_divisor, "divisor");
    for (const cc of Object.keys(DESTINATIONS)) {
      const c = m.destinations?.[cc];
      if (!c) { err(mw, `missing destination ${cc}`); continue; }
      if (c.base !== "chargeable_weight_kg") err(`${mw} ${cc}`, 'base must be "chargeable_weight_kg"');
      checkComp(`${mw} ${cc}`, c, "fee");
    }
    for (const cc of Object.keys(m.destinations || {})) if (!DESTINATIONS[cc]) err(mw, `unknown destination ${cc}`);
  }

  // ---- destinations ----
  const dests = tables.destinations?.destinations;
  if (tables.destinations?.schema_version !== 1) err("destinations", "schema_version must be 1");
  if (!Array.isArray(dests)) err("destinations", "destinations must be an array");
  const found = new Set();
  for (const d of dests || []) {
    const dw = `destination ${d?.country}`;
    if (!DESTINATIONS[d?.country]) { err(dw, "country must be one of " + Object.keys(DESTINATIONS).join("/")); continue; }
    if (found.has(d.country)) err(dw, "duplicate");
    found.add(d.country);
    if (d.currency !== DESTINATIONS[d.country]) err(dw, `currency must be ${DESTINATIONS[d.country]}`);
    if (!nonEmpty(d.label)) err(dw, "label required");
    checkComp(`${dw} duty_basis`, d.duty_basis, "duty_basis");
    checkComp(`${dw} de_minimis`, d.de_minimis, "de_minimis");
    for (const cat of Object.keys(d.duty || {})) {
      if (!DUTY_CATEGORIES.includes(cat) && !OPTIONAL_DUTY_CATEGORIES.includes(cat)) err(`${dw} duty`, `unknown category ${cat}`);
    }
    for (const cat of [...DUTY_CATEGORIES, ...OPTIONAL_DUTY_CATEGORIES]) {
      const c = d.duty?.[cat];
      if (!c && OPTIONAL_DUTY_CATEGORIES.includes(cat)) continue;
      checkComp(`${dw} duty.${cat}`, c, "fee");
      for (const r of c?.rows || []) if (!DUTY_KINDS.has(r?.kind)) err(`${dw} duty.${cat}`, `duty rows must be kind ${[...DUTY_KINDS].join("/")}`);
      for (const r of c?.rows || []) if (r?.applies_when !== undefined) err(`${dw} duty.${cat}`, "applies_when belongs on duty_rules rows");
    }
    if (d.duty_rules !== undefined) {
      if (!Array.isArray(d.duty_rules)) err(`${dw} duty_rules`, "must be an array");
      const ruleIds = new Set();
      for (const rule of Array.isArray(d.duty_rules) ? d.duty_rules : []) {
        const rw = `${dw} duty_rule ${rule?.id}`;
        if (!ID.test(rule?.id ?? "")) err(rw, "id must match [a-z0-9_]+");
        if (ruleIds.has(rule?.id)) err(rw, "duplicate id");
        ruleIds.add(rule?.id);
        if (!nonEmpty(rule?.label)) err(rw, "label (English, shown to users) is required");
        if (rule?.replaces !== undefined && rule.replaces !== "duty") err(rw, 'replaces may only be "duty"');
        if (rule?.categories !== undefined && !(Array.isArray(rule.categories) && rule.categories.length && rule.categories.every((c) => DUTY_CATEGORIES.includes(c) || OPTIONAL_DUTY_CATEGORIES.includes(c)))) {
          err(rw, "categories must be a non-empty list of duty categories");
        }
        checkComp(rw, rule, "fee");
        for (const r of rule?.rows || []) if (!RULE_KINDS.has(r?.kind)) err(rw, `rule rows must be kind ${[...RULE_KINDS].join("/")}`);
      }
    }
    if (d.tax_base !== undefined) checkComp(`${dw} tax_base`, d.tax_base, "tax_base");
    else if (label === "data/rates" && d.import_tax) err(`${dw}`, "tax_base is required when import_tax is set (null value + 要確認 if not confirmed)");
    if (d.subdivisions !== undefined) {
      const sd = d.subdivisions;
      const sw = `${dw} subdivisions`;
      if (!sd || typeof sd !== "object") err(sw, "must be an object");
      else {
        if (!nonEmpty(sd.label) || CJK.test(sd.label)) err(sw, "label (English, shown to users) is required");
        if (sd.tax_label !== undefined && (!nonEmpty(sd.tax_label) || CJK.test(sd.tax_label))) err(sw, "tax_label must be English text");
        if (!Array.isArray(sd.options) || !sd.options.length) err(sw, "options must be a non-empty array");
        const subIds = new Set();
        for (const o of sd.options || []) {
          const ow = `${sw} ${o?.id}`;
          if (!SUBDIVISION_ID.test(o?.id ?? "")) err(ow, "id must match [A-Z0-9_]{1,10}");
          if (subIds.has(o?.id)) err(ow, "duplicate id");
          subIds.add(o?.id);
          if (!nonEmpty(o?.label) || CJK.test(o.label)) err(ow, "label (English) required");
          checkComp(`${ow} tax`, o?.tax, "fee");
          for (const r of o?.tax?.rows || []) if (r?.kind !== "rate") err(`${ow} tax`, "regional tax rows must be kind rate");
        }
      }
    }
    checkNotices(dw, d.notices, ["carriers", "methods"]);
    if (d.extra_tariff) {
      if (d.extra_tariff.base !== "customs_value") err(`${dw} extra_tariff`, 'base must be "customs_value"');
      checkComp(`${dw} extra_tariff`, d.extra_tariff, "fee");
    }
    if (d.import_tax) {
      if (!["customs_value", "customs_value_plus_duty"].includes(d.import_tax.base)) err(`${dw} import_tax`, "base must be customs_value or customs_value_plus_duty");
      checkComp(`${dw} import_tax`, d.import_tax, "fee");
    }
    if (d.broker_fee) checkComp(`${dw} broker_fee`, d.broker_fee, "fee");
  }
  for (const cc of Object.keys(DESTINATIONS)) if (!found.has(cc)) err("destinations", `missing ${cc}`);

  return { errors, rowCount, placeholder, status: meta.status };
}

export function loadTables(dir) {
  const read = (n) => JSON.parse(readFileSync(join(dir, n + ".json"), "utf8"));
  return { meta: read("meta"), proxies: read("proxies"), shipping: read("shipping"), destinations: read("destinations") };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let failed = false;
  for (const [label, dir] of [["data/rates", "data/rates"], ["test/fixtures/rates", "test/fixtures/rates"]]) {
    let res;
    try {
      res = validateRates(loadTables(join(root, dir)), { label });
    } catch (e) {
      console.error(`${label}: cannot read tables: ${e.message}`);
      failed = true;
      continue;
    }
    if (res.errors.length) { console.error(res.errors.join("\n")); failed = true; continue; }
    const why = res.placeholder ? " (placeholder: all values null, 要確認)" : res.status === "partial" ? " (partial: some values null, 要確認)" : "";
    console.log(`${label} OK: ${res.rowCount} rows${why}`);
  }
  if (failed) process.exit(1);
}
