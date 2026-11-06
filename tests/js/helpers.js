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

// app.js imports core.js as an ES module. The browser loads both natively; the jsdom loader joins them into one
// classic script: core.js with its export keywords removed, then app.js with its import line removed.
export function browserSource() {
  const core = readRepo("core.js");
  const app = readRepo("app.js");
  // Mirror the real module binding: destructure exactly the names app.js imports, honouring `as` aliases.
  const importMatch = app.match(/^import \{([\s\S]*?)\} from "\.\/core\.js";/m);
  if (!importMatch) throw new Error("app.js must import from ./core.js");
  const bindings = importMatch[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, alias] = part.split(/\s+as\s+/);
      return alias ? `${name}: ${alias}` : name;
    });
  const coreBody = core.replace(/^export /gm, "");
  const exported = [...core.matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]);
  const body = app.replace(importMatch[0], "");
  return `const CORE = (() => {\n${coreBody}\nreturn { ${exported.join(", ")} };\n})();\nconst { ${bindings.join(", ")} } = CORE;\n${body}`;
}

export const wait = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

// Loads the page and waits until the table is drawn. Returns the window, plus the errors it logged.
// The inline startup script in index.html re-applies a saved theme before first paint. Tests run it too.
export function startupScript(html) {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  return match ? match[1] : "";
}

export async function loadPage({ url = "http://127.0.0.1:8000/", storage = true, savedTheme = null, parent = null } = {}) {
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
  if (parent) Object.defineProperty(window, "parent", { value: parent, configurable: true });
  window.eval(startupScript(source));
  window.eval(browserSource());
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
