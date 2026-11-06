// Pure-function tests. These import core.js directly, the same file the browser loads, and need no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../../core.js";
import { readRepo } from "./helpers.js";

const lenses = [
  { id: "core", facets: ["states"] },
  { id: "healthcare", facets: ["pharma", "medical-devices"] },
];
const known = new Set(["pharma", "medical-devices", "states"]);

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

test("buildSearchText lower-cases and includes the core fields and facet values", () => {
  const element = {
    name: "Silicon", symbol: "Si", number: 14, state: "Solid", category: "metalloid",
    facets: {
      sample: { items: ["Dedicated semiconductor wafers"] },
      pharma: { summary: "Silicon-based drug delivery is not a labelled use." },
    },
  };
  const facets = [
    { key: "sample", fields: [{ key: "items", type: "list" }] },
    { key: "pharma", fields: [{ key: "summary", type: "text" }] },
  ];
  const text = core.buildSearchText(element, {
    facets,
    categoryLabel: () => "Metalloid",
  });
  assert.equal(text, text.toLowerCase());
  for (const term of ["silicon", "si", "14", "metalloid", "semiconductor wafers", "drug delivery"]) {
    assert.ok(text.includes(term), `missing ${term} in ${text}`);
  }
});

test("matchesFilters applies category, state and text filters together", () => {
  const element = { category: "metalloid", state: "Solid" };
  const all = { category: "all", stateFilter: "all", query: "" };
  assert.equal(core.matchesFilters(element, all, "x"), true);
  assert.equal(core.matchesFilters(element, { ...all, category: "halogen" }, "x"), false);
  assert.equal(core.matchesFilters(element, { ...all, stateFilter: "Gas" }, "x"), false);
  assert.equal(core.matchesFilters(element, { ...all, query: "silicon" }, "silicon | si"), true);
  assert.equal(core.matchesFilters(element, { ...all, query: "gold" }, "silicon | si"), false);
});

test("flagUrl builds a pre-filled GitHub issue for the given repo", () => {
  const element = { name: "Iron", symbol: "Fe" };
  const facet = { key: "pharma", label: "Pharmaceutical use" };
  const record = { status: "agent-extracted", citations: [{ source: "usgs", url: "https://doi.org/x", retrieved_at: "2026-11-05" }] };
  const url = new URL(core.flagUrl(element, facet, record, "owner/repo"));
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.pathname, "/owner/repo/issues/new");
  assert.equal(url.searchParams.get("title"), "Dispute: Fe pharma");
  assert.equal(url.searchParams.get("labels"), "data-dispute");
  assert.match(url.searchParams.get("body"), /usgs: https:\/\/doi\.org\/x \(retrieved 2026-11-05\)/);
});

test("flagUrl says so when a record has no citations", () => {
  const url = new URL(core.flagUrl({ name: "Iron", symbol: "Fe" }, { key: "pharma", label: "Pharmaceutical use" }, { status: "unaudited" }, "o/r"));
  assert.match(url.searchParams.get("body"), /none recorded/);
});

test("resolveLensState: URL beats saved choice, which beats the default lens", () => {
  const base = { lenses, defaultLens: "core", knownFacetIds: known };
  const fromUrl = core.resolveLensState({ ...base, lensParam: "healthcare", facetsParam: null, saved: { lens: "core" } });
  assert.equal(fromUrl.lens, "healthcare");
  assert.deepEqual([...fromUrl.facetIds].sort(), ["medical-devices", "pharma"]);
  const fromSaved = core.resolveLensState({ ...base, lensParam: null, facetsParam: null, saved: { lens: "healthcare" } });
  assert.equal(fromSaved.lens, "healthcare");
  const fallback = core.resolveLensState({ ...base, lensParam: null, facetsParam: null, saved: null });
  assert.equal(fallback.lens, "core");
});

test("resolveLensState: an explicit facets parameter wins and unknown ids are dropped", () => {
  const next = core.resolveLensState({
    lenses, defaultLens: "core", knownFacetIds: known,
    lensParam: "core", facetsParam: "states,bogus,pharma", saved: null,
  });
  assert.equal(next.lens, "core");
  assert.deepEqual([...next.facetIds].sort(), ["pharma", "states"]);
});

test("setLensState drops unregistered facets and rejects unknown lenses", () => {
  const next = core.setLensState("healthcare", { lenses, knownFacetIds: new Set(["pharma"]) });
  assert.deepEqual([...next.facetIds].sort(), ["pharma"]);
  assert.equal(core.setLensState("nope", { lenses, knownFacetIds: known }), null);
});

test("toggleFacetState keeps the lens name only while its facets match exactly", () => {
  const start = { lens: "core", facetIds: new Set(["states"]) };
  const added = core.toggleFacetState(start, "pharma", lenses);
  assert.equal(added.lens, "custom");
  const removed = core.toggleFacetState(added, "pharma", lenses);
  assert.equal(removed.lens, "core");
  assert.deepEqual([...removed.facetIds].sort(), ["states"]);
  assert.equal(start.facetIds.size, 1, "the input state is not mutated");
});

test("embed mode is requested only by ?embed=1", () => {
  assert.equal(core.isEmbedRequested("?embed=1"), true);
  assert.equal(core.isEmbedRequested("?lens=core&embed=1"), true);
  assert.equal(core.isEmbedRequested("?embed=0"), false);
  assert.equal(core.isEmbedRequested(""), false);
});

test("embed messages carry a fixed source tag and their payload", () => {
  assert.deepEqual(core.embedMessage("pti:ready"), { source: "periodic-table-inspector", type: "pti:ready" });
  assert.deepEqual(core.embedMessage("pti:height", { height: 640 }), {
    source: "periodic-table-inspector",
    type: "pti:height",
    height: 640,
  });
});

test("the embed code names no host site", () => {
  for (const file of ["core.js", "app.js", "index.html"]) {
    assert.doesNotMatch(readRepo(file), /markalexiuk/i, file);
  }
});
