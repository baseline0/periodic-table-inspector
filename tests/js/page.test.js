import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, tile, wait } from "./helpers.js";

test("draws all 118 elements and logs no errors", async () => {
  const { document, errors } = await loadPage();
  assert.equal(document.querySelectorAll("#ptable button.tile").length, 118);
  assert.deepEqual(errors, []);
});

test("the default Core lens shows mining and uses, each with a status badge", async () => {
  const { document } = await loadPage();
  tile(document, "Si").click();
  await wait();
  const headings = [...document.querySelectorAll("#facetSections section h3")].map((h) => h.textContent);
  assert.ok(headings.some((h) => h.includes("Mining & rights")), headings.join(" | "));
  assert.ok(headings.some((h) => h.includes("Commercial & industrial uses")), headings.join(" | "));
  assert.ok(headings.every((h) => /Verified|Sourced, not yet checked|Unaudited|Disputed/.test(h)), headings.join(" | "));
});

test("the Supply Chain lens shows the sourced facets with their status", async () => {
  const { document } = await loadPage({ url: "http://127.0.0.1:8000/?lens=supply-chain" });
  tile(document, "Si").click();
  await wait();
  const headings = [...document.querySelectorAll("#facetSections section h3")].map((h) => h.textContent);
  assert.ok(headings.some((h) => h.includes("Where it is produced")), headings.join(" | "));
  assert.ok(headings.some((h) => h.includes("Sourced, not yet checked")), headings.join(" | "));
});

test("every facet panel has a Flag link pointing at a pre-filled GitHub issue", async () => {
  const { document } = await loadPage({ url: "http://127.0.0.1:8000/?lens=supply-chain" });
  tile(document, "U").click();
  await wait();
  const flags = [...document.querySelectorAll("#facetSections a")].filter((a) => a.textContent === "Flag this fact");
  assert.ok(flags.length >= 5, `flags: ${flags.length}`);
  for (const flag of flags) {
    const url = new URL(flag.href);
    assert.equal(url.origin, "https://github.com");
    assert.match(url.pathname, /\/issues\/new$/);
    assert.match(url.searchParams.get("title"), /^Dispute: U /);
  }
});

test("lens buttons change the facets shown and the URL", async () => {
  const { window, document } = await loadPage();
  tile(document, "Si").click();
  await wait();
  const supply = [...document.querySelectorAll("#lensControls button")].find(
    (b) => b.textContent === "Supply Chain & Geopolitics",
  );
  supply.click();
  await wait();
  assert.match(window.location.search, /lens=supply-chain/);
  assert.match(window.location.search, /facets=mining%2Csupply%2Cgeography%2Ctrade%2Ctariff/);
});

test("the theme toggle switches data-theme and remembers the choice", async () => {
  const first = await loadPage();
  const toggle = first.document.getElementById("themeToggle");
  assert.ok(toggle, "theme toggle exists");
  const before = first.document.documentElement.dataset.theme;
  toggle.click();
  await wait();
  const after = first.document.documentElement.dataset.theme;
  assert.notEqual(before, after);
  assert.equal(first.window.localStorage.getItem("pti_theme"), after);
});

test("the page still works when storage is blocked", async () => {
  const { document, errors } = await loadPage({ storage: false });
  assert.equal(document.querySelectorAll("#ptable button.tile").length, 118);
  assert.deepEqual(errors, []);
});

test("a saved dark choice is applied at startup, before the table draws", async () => {
  const { document } = await loadPage({ savedTheme: "dark" });
  assert.equal(document.documentElement.dataset.theme, "dark");
  assert.equal(document.getElementById("themeToggle").getAttribute("aria-pressed"), "true");
});

test("the toggle label is stable and aria-pressed carries the state", async () => {
  const { document } = await loadPage({ savedTheme: "light" });
  const toggle = document.getElementById("themeToggle");
  assert.equal(document.getElementById("themeLabel").textContent, "Dark mode");
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  toggle.click();
  assert.equal(document.documentElement.dataset.theme, "dark");
  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  assert.equal(document.getElementById("themeLabel").textContent, "Dark mode");
});
