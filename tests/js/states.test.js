// The states facet (Bose-Einstein condensates and plasma) reaches the page through the modular loader.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, tile, wait } from "./helpers.js";

const BEC = ["Li", "Cr", "Sr", "Dy", "Er"];
const PLASMA = ["H", "He", "Ne", "Ar", "N", "O"];

test("the Quantum & Exotic States lens shows the states facet for BEC and plasma elements", async () => {
  const { document, errors } = await loadPage({ url: "http://127.0.0.1:8000/?lens=quantum-exotic" });
  assert.deepEqual(errors, []);
  for (const symbol of [...BEC, ...PLASMA]) {
    tile(document, symbol).click();
    await wait();
    const headings = [...document.querySelectorAll("#facetSections section h3")].map((h) => h.textContent);
    assert.ok(headings.some((h) => h.includes("States of matter")), `${symbol}: ${headings.join(" | ")}`);
  }
});

test("a BEC element shows its condensed isotope and first-realised year", async () => {
  const { document } = await loadPage({ url: "http://127.0.0.1:8000/?lens=quantum-exotic" });
  tile(document, "Er").click();
  await wait();
  const text = document.getElementById("facetSections").textContent;
  assert.match(text, /Condensed isotope: 168Er/);
  assert.match(text, /First realised: 2012/);
});

test("strontium shows both condensed isotopes, 84Sr and 88Sr", async () => {
  const { document } = await loadPage({ url: "http://127.0.0.1:8000/?lens=quantum-exotic" });
  tile(document, "Sr").click();
  await wait();
  const text = document.getElementById("facetSections").textContent;
  assert.match(text, /84Sr/);
  assert.match(text, /88Sr/);
});

test("a plasma element shows its sourced statement and its citation", async () => {
  const { document } = await loadPage({ url: "http://127.0.0.1:8000/?lens=quantum-exotic" });
  tile(document, "Ne").click();
  await wait();
  const text = document.getElementById("facetSections").textContent;
  assert.match(text, /Neon is used in gas-discharge tubes/);
  assert.match(text, /Luminous Script Signs/);
});

test("krypton, xenon and K-39 have no states record, so their panel says no data is recorded", async () => {
  const { document } = await loadPage({ url: "http://127.0.0.1:8000/?lens=quantum-exotic" });
  for (const symbol of ["Kr", "Xe", "K"]) {
    tile(document, symbol).click();
    await wait();
    const text = document.getElementById("facetSections").textContent;
    assert.match(text, /No data recorded\./, `${symbol} should have no states record`);
    assert.doesNotMatch(text, /Condensed isotope|First realised/, `${symbol} should not show BEC values`);
  }
});
