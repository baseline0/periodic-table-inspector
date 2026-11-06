import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, readRepo, tile, wait } from "./helpers.js";

test("draws all 118 elements and logs no errors", async () => {
  const { document, errors } = await loadPage();
  assert.equal(document.querySelectorAll("#ptable button.tile").length, 118);
  assert.deepEqual(errors, []);
});

test("the default Core lens shows uses, with a status badge", async () => {
  const { document } = await loadPage();
  tile(document, "Si").click();
  await wait();
  const headings = [...document.querySelectorAll("#facetSections section h3")].map((h) => h.textContent);
  assert.equal(headings.length, 1, headings.join(" | "));
  assert.ok(headings.some((h) => h.includes("Commercial & industrial uses")), headings.join(" | "));
  assert.ok(headings.every((h) => /Verified|Sourced, not yet checked|Unaudited|Disputed/.test(h)), headings.join(" | "));
});

test("the Medical & Life Sciences lens shows the medical facets with their status", async () => {
  const { document } = await loadPage({ url: "http://127.0.0.1:8000/?lens=healthcare" });
  tile(document, "Ta").click();
  await wait();
  const headings = [...document.querySelectorAll("#facetSections section h3")].map((h) => h.textContent);
  assert.ok(headings.some((h) => h.includes("Medical imaging & implants")), headings.join(" | "));
  assert.ok(headings.some((h) => h.includes("Pharmaceutical use")), headings.join(" | "));
  assert.ok(headings.some((h) => h.includes("Sourced, not yet checked")), headings.join(" | "));
});

test("every facet panel has a Flag link pointing at a pre-filled GitHub issue", async () => {
  const { document } = await loadPage({ url: "http://127.0.0.1:8000/?facets=uses,pharma,medical-devices,states" });
  tile(document, "U").click();
  await wait();
  const flags = [...document.querySelectorAll("#facetSections a")].filter((a) => a.textContent === "Flag this fact");
  assert.equal(flags.length, 4, `flags: ${flags.length}`);
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
  const healthcare = [...document.querySelectorAll("#lensControls button")].find(
    (b) => b.textContent === "Medical & Life Sciences",
  );
  healthcare.click();
  await wait();
  assert.match(window.location.search, /lens=healthcare/);
  assert.match(window.location.search, /facets=pharma%2Cmedical-devices/);
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

// A stand-in for a host page: it records every message the table posts to its parent.
function recordingParent() {
  const messages = [];
  return { messages, postMessage(message, targetOrigin) { messages.push({ message, targetOrigin }); } };
}

test("embedded with ?embed=1: marks the page, posts ready and height, and posts lens changes", async () => {
  const parent = recordingParent();
  const { window, document } = await loadPage({ url: "http://127.0.0.1:8000/?embed=1", parent });
  assert.ok(document.documentElement.classList.contains("is-embed"));
  const types = parent.messages.map((m) => m.message.type);
  assert.ok(types.includes("pti:ready"), types.join(","));
  assert.ok(types.includes("pti:height"), types.join(","));
  assert.ok(parent.messages.every((m) => m.message.source === "periodic-table-inspector"));
  const before = parent.messages.length;
  const healthcare = [...document.querySelectorAll("#lensControls button")].find((b) => b.textContent === "Medical & Life Sciences");
  healthcare.click();
  await wait();
  const lensMessages = parent.messages.slice(before).filter((m) => m.message.type === "pti:lens");
  assert.equal(lensMessages.length, 1);
  assert.equal(lensMessages[0].message.lens, "healthcare");
  assert.equal(window.location.search.includes("embed=1"), true, "the embed flag is kept in the URL after a lens change");
});

test("standalone page posts nothing to a parent and is not marked as embedded", async () => {
  const parent = recordingParent();
  const { document } = await loadPage({ parent });
  assert.equal(document.documentElement.classList.contains("is-embed"), false);
  assert.equal(parent.messages.length, 0);
});

test("the disclaimer stays on the page in embed mode", async () => {
  const { document } = await loadPage({ url: "http://127.0.0.1:8000/?embed=1" });
  assert.match(document.querySelector("footer").textContent, /Not investment advice/);
});

test("Tailwind's dark strategy matches the attribute the toggle sets", async () => {
  const { readRepo } = await import("./helpers.js");
  const app = readRepo("app.js");
  assert.match(app, /document\.documentElement\.dataset\.theme = next/, "toggle sets data-theme on <html>");
  const config = readRepo("tailwind.config.js");
  assert.match(config, /darkMode: \["class", '\[data-theme="dark"\]'\]/, "tailwind.config.js");
});

test("page titles, headings and meta descriptions carry no mining term", () => {
  for (const file of ["index.html", "methodology.html"]) {
    const html = readRepo(file);
    assert.doesNotMatch(html, /mining/i, `${file}: no mining term`);
  }
});

test("pages load compiled Tailwind CSS, not the Play CDN", async () => {
  const { readRepo, ROOT } = await import("./helpers.js");
  const { existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  assert.ok(existsSync(join(ROOT, "dist", "tailwind.css")), "dist/tailwind.css is built (npm run build:css)");
  for (const file of ["index.html", "methodology.html"]) {
    const html = readRepo(file);
    assert.doesNotMatch(html, /cdn\.tailwindcss\.com|tailwind\.config/, `${file}: no Play CDN`);
    assert.match(html, /<link rel="stylesheet" href="dist\/tailwind\.css">/, `${file}: links compiled CSS`);
    assert.ok(html.indexOf("dist/tailwind.css") < html.indexOf("styles.css"), `${file}: utilities load before styles.css`);
  }
});
