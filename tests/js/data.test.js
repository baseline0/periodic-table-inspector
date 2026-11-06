// Data contracts for the public element data. No DOM: these read the JSON and check the rules the page depends on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readRepo } from "./helpers.js";

const elementsText = readRepo("data/elements.json");
const elements = JSON.parse(elementsText);
const config = JSON.parse(readRepo("data/facets.config.json"));
const STATUSES = ["unaudited", "agent-extracted", "human-verified", "disputed"];

function* facetRecords() {
  for (const element of elements.elements) {
    for (const [facet, record] of Object.entries(element.facets)) {
      yield { symbol: element.symbol, facet, record };
    }
  }
}

test("every element has 118 unique symbols", () => {
  assert.equal(elements.elements.length, 118);
  assert.equal(new Set(elements.elements.map((e) => e.symbol)).size, 118);
});

test("every facet record has a valid status and no retired verified flag", () => {
  for (const { symbol, facet, record } of facetRecords()) {
    assert.ok(STATUSES.includes(record.status), `${symbol}.${facet}: status ${record.status}`);
    assert.equal("verified" in record, false, `${symbol}.${facet} still has verified`);
  }
});

test("every citation has an https URL and an ISO retrieval date", () => {
  for (const { symbol, facet, record } of facetRecords()) {
    for (const citation of record.citations ?? []) {
      assert.match(citation.url, /^https:\/\//, `${symbol}.${facet} url`);
      assert.match(citation.retrieved_at ?? citation.retrieved, /^\d{4}-\d{2}-\d{2}$/, `${symbol}.${facet} date`);
    }
  }
});

test("every lens names only registered facets, and the default lens exists", () => {
  const registered = new Set([...elements.facets.map((f) => f.key), ...config.facets.map((f) => f.id)]);
  const lensIds = config.lenses.map((lens) => lens.id);
  assert.ok(lensIds.includes(config.default_lens));
  for (const lens of config.lenses) {
    for (const facet of lens.facets) {
      assert.ok(registered.has(facet), `lens ${lens.id} names ${facet}`);
    }
  }
});

test("public data carries no economic or mining facet, lens or extraction table", () => {
  const ECONOMIC = ["mining", "economics", "supply", "geography", "trade", "tariff"];
  const LENS_ONLY_FOR_ECONOMICS = ["supply-chain", "investor", "esg"];
  assert.equal("extraction_methods" in elements, false, "extraction_methods table");
  for (const facet of ECONOMIC) {
    assert.equal(elements.facets.some((f) => f.key === facet), false, `registry still has ${facet}`);
    assert.equal(config.facets.some((f) => f.id === facet), false, `config still has ${facet}`);
  }
  for (const lens of config.lenses) {
    assert.equal(LENS_ONLY_FOR_ECONOMICS.includes(lens.id), false, `lens ${lens.id} is economic`);
  }
});

test("the public repo carries no mining or litigation data, files or code paths", () => {
  for (const file of ["data/operations.json", "data/lawsuits.json", "data/schema.sql"]) {
    assert.equal(existsSync(join(ROOT, file)), false, `${file} must not be in the public repo`);
  }
  for (const file of ["app.js", "core.js", "index.html", "methodology.html", "README.md"]) {
    const text = readRepo(file);
    assert.doesNotMatch(text, /operations\.json|lawsuits\.json|schema\.sql|OPERATIONS_URL|LAWSUITS_URL/, file);
    assert.doesNotMatch(text, /operations extracting|lawsuit|lookup|extraction method|production_route/i, file);
  }
});

test("public data carries no investment products, ticker lists or N-PORT holdings", () => {
  assert.doesNotMatch(elementsText, /\bETFs?\b/);
  assert.doesNotMatch(elementsText, /N-PORT|NPORT/i);
  assert.doesNotMatch(elementsText, /"tickers"\s*:/);
  assert.doesNotMatch(elementsText, /exposure_note|holdings/i);
});

test("public data carries no price or forecast figures", () => {
  assert.doesNotMatch(elementsText, /\$\s?\d[\d,.]*\s*\/\s*kg/i);
  assert.doesNotMatch(elementsText, /\bforecast\b/i);
});

test("every category label colour passes 4.5:1 on the dark surface once its dark rule applies", () => {
  // Pure check: the dark tint for nonmetal is set in styles.css and clears 4.5:1 against #0f172a.
  const css = readRepo("styles.css");
  assert.match(css, /data-theme="dark"\] \[data-category="nonmetal"\]/);
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const tint = "#976cf7"; // 90% #8b5cf6 with white, as written in styles.css
  assert.ok(css.includes("color-mix(in srgb, var(--c) 90%, white)"));
  assert.ok(ratio(tint, "#0f172a") >= 4.5, `ratio ${ratio(tint, "#0f172a").toFixed(2)}`);
});
