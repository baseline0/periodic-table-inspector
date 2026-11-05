// Shared loader: builds the page in jsdom, serves its JSON from disk, and runs app.js.
// Browser-only libraries (Tailwind, Lucide) are stubbed; layout and styling are not tested here.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function readRepo(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

export const wait = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

// Loads the page and waits until the table is drawn. Returns the window, plus the errors it logged.
// The inline startup script in index.html re-applies a saved theme before first paint. Tests run it too.
export function startupScript(html) {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  return match ? match[1] : "";
}

export async function loadPage({ url = "http://127.0.0.1:8000/", storage = true, savedTheme = null } = {}) {
  const source = readRepo("index.html");
  const html = source
    .replace(/<script[^>]*src=[^>]*><\/script>/g, "")
    .replace(/<link[^>]*>/g, "");
  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const window = dom.window;
  const errors = [];
  window.console.error = (...args) => errors.push(args.map(String).join(" "));
  window.addEventListener("error", (event) => errors.push(event.message));
  window.lucide = { createIcons() {} };
  window.fetch = async (target) => {
    const path = new URL(target, "http://127.0.0.1:8000/").pathname;
    const body = readRepo(path.replace(/^\//, ""));
    return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
  };
  if (!storage) {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("storage blocked");
      },
    });
  }
  if (savedTheme !== null) window.localStorage.setItem("pti_theme", savedTheme);
  window.eval(startupScript(source));
  window.eval(readRepo("app.js"));
  // Wait for init() to draw the 118 tiles.
  for (let i = 0; i < 50 && window.document.querySelectorAll("#ptable button.tile").length < 118; i++) {
    await wait(20);
  }
  return { window, document: window.document, errors };
}

export function tile(document, symbol) {
  return [...document.querySelectorAll("#ptable button.tile")].find(
    (button) => button.querySelector(".tile-symbol").textContent === symbol,
  );
}
