// Pure-function tests. These import core.js directly, the same file the browser loads, and need no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../../core.js";
import { readRepo } from "./helpers.js";

const lenses = [
  { id: "core", facets: ["uses", "mining"] },
  { id: "supply-chain", facets: ["mining", "supply", "geography"] },
];
const known = new Set(["uses", "mining", "supply", "geography"]);

test("core.js has no DOM, storage, network or global references", () => {
  const source = readRepo("core.js");
  assert.doesNotMatch(source, /\b(document|window|localStorage|sessionStorage|globalThis|fetch)\b/);
});

test("statusInfo maps the four statuses and treats anything else as unaudited", () => {
  assert.equal(core.statusInfo("human-verified").label, "Verified");
  assert.equal(core.statusInfo("agent-extracted").label, "Sourced, not yet checked");
  assert.equal(core.statusInfo("disputed").label, "Disputed");
  assert.equal(core.statusInfo("made-up-status").label, "Unaudited");
  assert.equal(core.statusInfo(undefined).label, "Unaudited");
});

test("buildSearchText lower-cases and includes the core fields, facet values and method labels", () => {
  const element = {
    name: "Silicon", symbol: "Si", number: 14, state: "Solid", category: "metalloid",
    facets: {
      mining: { extraction: [{ method: "ore-dedicated", source: "quartz" }] },
      supply: { net_import_reliance: ">50% (USGS, 2025)" },
    },
  };
  const facets = [
    { key: "mining", fields: [{ key: "extraction", type: "methods" }] },
    { key: "supply", fields: [{ key: "net_import_reliance", type: "text" }] },
  ];
  const text = core.buildSearchText(element, {
    facets,
    categoryLabel: () => "Metalloid",
    methodLabel: (id) => (id === "ore-dedicated" ? "Dedicated ore" : undefined),
  });
  assert.equal(text, text.toLowerCase());
  for (const term of ["silicon", "si", "14", "metalloid", "dedicated ore", "quartz", ">50%"]) {
    assert.ok(text.includes(term), `missing ${term} in ${text}`);
  }
});

test("matchesFilters applies category, state, method and text filters together", () => {
  const element = { category: "metalloid", state: "Solid", facets: { mining: { extraction: [{ method: "ore-dedicated" }] } } };
  const all = { category: "all", stateFilter: "all", method: "all", query: "" };
  assert.equal(core.matchesFilters(element, all, "x"), true);
  assert.equal(core.matchesFilters(element, { ...all, category: "halogen" }, "x"), false);
  assert.equal(core.matchesFilters(element, { ...all, stateFilter: "Gas" }, "x"), false);
  assert.equal(core.matchesFilters(element, { ...all, method: "ore-dedicated" }, "x"), true);
  assert.equal(core.matchesFilters(element, { ...all, method: "byproduct-smelting" }, "x"), false);
  assert.equal(core.matchesFilters(element, { ...all, query: "silicon" }, "silicon | si"), true);
  assert.equal(core.matchesFilters(element, { ...all, query: "gold" }, "silicon | si"), false);
});

test("flagUrl builds a pre-filled GitHub issue for the given repo", () => {
  const element = { name: "Iron", symbol: "Fe" };
  const facet = { key: "supply", label: "US supply reliance" };
  const record = { status: "agent-extracted", citations: [{ source: "usgs", url: "https://doi.org/x", retrieved_at: "2026-11-05" }] };
  const url = new URL(core.flagUrl(element, facet, record, "owner/repo"));
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.pathname, "/owner/repo/issues/new");
  assert.equal(url.searchParams.get("title"), "Dispute: Fe supply");
  assert.equal(url.searchParams.get("labels"), "data-dispute");
  assert.match(url.searchParams.get("body"), /usgs: https:\/\/doi\.org\/x \(retrieved 2026-11-05\)/);
});

test("flagUrl says so when a record has no citations", () => {
  const url = new URL(core.flagUrl({ name: "Iron", symbol: "Fe" }, { key: "uses", label: "Uses" }, { status: "unaudited" }, "o/r"));
  assert.match(url.searchParams.get("body"), /none recorded/);
});

test("resolveLensState: URL beats saved choice, which beats the default lens", () => {
  const base = { lenses, defaultLens: "core", knownFacetIds: known };
  const fromUrl = core.resolveLensState({ ...base, lensParam: "supply-chain", facetsParam: null, saved: { lens: "core" } });
  assert.equal(fromUrl.lens, "supply-chain");
  assert.deepEqual([...fromUrl.facetIds].sort(), ["geography", "mining", "supply"]);
  const fromSaved = core.resolveLensState({ ...base, lensParam: null, facetsParam: null, saved: { lens: "supply-chain" } });
  assert.equal(fromSaved.lens, "supply-chain");
  const fallback = core.resolveLensState({ ...base, lensParam: null, facetsParam: null, saved: null });
  assert.equal(fallback.lens, "core");
});

test("resolveLensState: an explicit facets parameter wins and unknown ids are dropped", () => {
  const next = core.resolveLensState({
    lenses, defaultLens: "core", knownFacetIds: known,
    lensParam: "core", facetsParam: "mining,bogus,geography", saved: null,
  });
  assert.equal(next.lens, "core");
  assert.deepEqual([...next.facetIds].sort(), ["geography", "mining"]);
});

test("setLensState drops unregistered facets and rejects unknown lenses", () => {
  const next = core.setLensState("supply-chain", { lenses, knownFacetIds: new Set(["mining", "supply"]) });
  assert.deepEqual([...next.facetIds].sort(), ["mining", "supply"]);
  assert.equal(core.setLensState("nope", { lenses, knownFacetIds: known }), null);
});

test("toggleFacetState keeps the lens name only while its facets match exactly", () => {
  const start = { lens: "core", facetIds: new Set(["uses", "mining"]) };
  const added = core.toggleFacetState(start, "supply", lenses);
  assert.equal(added.lens, "custom");
  const removed = core.toggleFacetState(added, "supply", lenses);
  assert.equal(removed.lens, "core");
  assert.deepEqual([...removed.facetIds].sort(), ["mining", "uses"]);
  assert.equal(start.facetIds.size, 2, "the input state is not mutated");
});
