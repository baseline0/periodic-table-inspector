// Periodic table renderer. Everything shown comes from data/elements.json: the categories, the element records and the
// facet registry that decides which metadata appears in the side panel and in search. Nothing here is specific to a
// particular element, so new elements, categories or facets are data changes only (see README.md).

const DATA_URL = "data/elements.json";
const OPERATIONS_URL = "data/operations.json";
const LAWSUITS_URL = "data/lawsuits.json";
const CONFIG_URL = "data/facets.config.json";
const STORAGE_KEY = "pti_facet_state";
const THEME_KEY = "pti_theme";

// Where each row of the table sits. Periods 1-7 are rows 1-7, row 8 is a gap, and the f-block series hang off rows 9-10.
const SERIES_ROW = { lanthanide: 9, actinide: 10 };
const SERIES_FIRST_COLUMN = 3;

const state = {
    category: "all",
    stateFilter: "all",
    method: "all",
    query: "",
    selected: null,
    lens: null,
    facetIds: new Set(),
};

// Elements in one place, keyed by atomic number.
let elements = [];
let operations = [];
let lawsuits = [];
let categories = new Map();
let extractionMethods = {};
let facets = [];
let facetConfig = { lenses: [], facets: [], repo: "", default_lens: "" };
let searchIndex = new Map();
const tiles = new Map();
const chips = new Map();

const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
};

const icon = (name, className = "h-3.5 w-3.5") => {
    const node = el("i", className);
    node.dataset.lucide = name;
    return node;
};

const refreshIcons = () => {
    if (window.lucide) window.lucide.createIcons();
};

// A field counts as empty when it has no value, or an empty list or string.
const isEmpty = (value) =>
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0);

const valueToText = (value) => (Array.isArray(value) ? value.join(" | ") : String(value ?? ""));

// Every searchable string on an element: the core fields plus every facet field the registry declares.
function buildSearchText(element) {
    const parts = [
        element.name,
        element.symbol,
        String(element.number),
        element.state,
        categories.get(element.category)?.label ?? element.category,
    ];
    for (const facet of facets) {
        const data = element.facets?.[facet.key] ?? {};
        for (const field of facet.fields) {
            if (field.type === "methods") {
                for (const entry of data[field.key] ?? []) parts.push(methodText(entry));
            } else if (field.type === "country_values") {
                if (data[field.key]) parts.push(data[field.key].countries.map((row) => row.country).join(" "));
            } else if (!isEmpty(data[field.key])) {
                parts.push(valueToText(data[field.key]));
            }
        }
    }
    return parts.join(" | ").toLowerCase();
}

// One extraction entry as text: the method label, the source and the production route, when there is one.
const methodText = (entry) =>
    [extractionMethods[entry.method]?.label ?? entry.method, entry.source, entry.production_route].filter(Boolean).join(" ");

const methodIds = (element) => (element.facets?.mining?.extraction ?? []).map((entry) => entry.method);

function isVisible(element) {
    if (state.category !== "all" && element.category !== state.category) return false;
    if (state.stateFilter !== "all" && element.state !== state.stateFilter) return false;
    if (state.method !== "all" && !methodIds(element).includes(state.method)) return false;
    return !state.query || searchIndex.get(element.number).includes(state.query);
}

function placement(element) {
    if (SERIES_ROW[element.category]) {
        const series = elements.filter((e) => e.category === element.category);
        return { row: SERIES_ROW[element.category], column: SERIES_FIRST_COLUMN + series.indexOf(element) };
    }
    return { row: element.period, column: element.group };
}

function categoryColor(id) {
    return categories.get(id)?.color ?? "#64748b";
}

function renderTable() {
    const table = document.getElementById("ptable");
    table.replaceChildren();

    for (const element of elements) {
        const { row, column } = placement(element);
        const label = categories.get(element.category)?.label ?? element.category;

        const tile = el("button", "tile");
        tile.type = "button";
        tile.style.setProperty("--c", categoryColor(element.category));
        tile.dataset.category = element.category;
        tile.style.gridRow = row;
        tile.style.gridColumn = column;
        tile.setAttribute("aria-label", `${element.name}, atomic number ${element.number}, ${label}`);
        tile.append(
            el("span", "tile-number", element.number),
            el("span", "tile-symbol", element.symbol),
            el("span", "tile-name", element.name),
        );
        tile.addEventListener("click", () => select(element));
        tiles.set(element.number, tile);
        table.append(tile);
    }

    // Layout labels: the placeholder cells in the main table, and the row labels for the two series.
    table.append(seriesNote("57–71", "Lanthanides", 6, "lanthanide"), seriesNote("89–103", "Actinides", 7, "actinide"));
    table.append(rowLabel("Lanthanides", SERIES_ROW.lanthanide, "lanthanide"), rowLabel("Actinides", SERIES_ROW.actinide, "actinide"));
}

function seriesNote(range, text, row, categoryId) {
    const node = el("div", "series-note", range);
    node.style.setProperty("--c", categoryColor(categoryId));
    node.dataset.category = categoryId;
    node.style.gridRow = row;
    node.style.gridColumn = SERIES_FIRST_COLUMN;
    node.append(el("span", "text-[8px] opacity-75", text));
    return node;
}

function rowLabel(text, row, categoryId) {
    const node = el("div", "row-label", text);
    node.style.setProperty("--c", categoryColor(categoryId));
    node.dataset.category = categoryId;
    node.style.gridRow = row;
    node.style.gridColumn = "1 / 3";
    return node;
}

function renderChips() {
    const container = document.getElementById("categoryChips");
    container.replaceChildren();

    const all = chipButton("all", "All categories", "var(--ink-muted)", elements.length);
    container.append(all);
    for (const category of categories.values()) {
        const count = elements.filter((e) => e.category === category.id).length;
        container.append(chipButton(category.id, category.label, category.color, count));
    }
}

function chipButton(id, label, color, count) {
    const button = el("button", "chip");
    button.type = "button";
    button.style.setProperty("--c", color);
    if (id !== "all") button.dataset.category = id;
    button.setAttribute("aria-pressed", String(id === state.category));
    button.append(el("span", "chip-dot"), el("span", "", label), el("span", "chip-count", count));
    button.addEventListener("click", () => {
        state.category = id;
        for (const [key, node] of chips) node.setAttribute("aria-pressed", String(key === id));
        applyFilters();
    });
    chips.set(id, button);
    return button;
}

function applyFilters() {
    let visible = 0;
    for (const element of elements) {
        const shown = isVisible(element);
        if (shown) visible += 1;
        tiles.get(element.number).classList.toggle("is-dim", !shown);
    }
    const status = document.getElementById("status");
    status.textContent =
        visible === 0 ? "No elements match these filters." : `Showing ${visible} of ${elements.length} elements.`;
}

function select(element) {
    state.selected = element;
    for (const [number, tile] of tiles) {
        tile.setAttribute("aria-pressed", String(number === element.number));
    }
    renderPanel(element);
}

function renderPanel(element) {
    const label = categories.get(element.category)?.label ?? element.category;
    const detail = document.getElementById("detail");
    detail.style.setProperty("--c", categoryColor(element.category));
    detail.dataset.category = element.category;
    document.getElementById("emptyState").classList.add("hidden");
    detail.classList.remove("hidden");

    document.getElementById("heroNumber").textContent = element.number;
    document.getElementById("heroSymbol").textContent = element.symbol;
    document.getElementById("heroMass").textContent = element.mass;
    document.getElementById("heroName").textContent = element.name;
    document.getElementById("heroCategory").textContent = label;

    const core = [
        ["Group / period", `${element.group} / ${element.period}`],
        ["Block", `${element.block}-block`],
        ["State (STP)", element.state],
        ["Crust abundance", element.abundance ?? "Not recorded"],
    ];
    const coreProps = document.getElementById("coreProps");
    coreProps.replaceChildren();
    for (const [term, value] of core) {
        const row = el("div");
        row.append(el("dt", "inline text-subtle", `${term}: `), el("dd", "inline text-value", value));
        coreProps.append(row);
    }

    const sections = document.getElementById("facetSections");
    const shown = visibleFacets();
    sections.replaceChildren(
        ...(shown.length
            ? shown.map((facet) => facetSection(facet, element))
            : [el("p", "placeholder-text text-xs", "No facets selected. Choose a lens or toggle facets above.")]),
    );
    renderLookup(element);
    refreshIcons();
}

const STATUS = {
    "human-verified": { label: "Verified", cls: "status-human-verified" },
    "agent-extracted": { label: "Sourced, not yet checked", cls: "status-agent-extracted" },
    unaudited: { label: "Unaudited", cls: "status-unaudited" },
    disputed: { label: "Disputed", cls: "status-disputed" },
};

function facetSection(facet, element) {
    const data = element.facets?.[facet.key] ?? {};
    const status = STATUS[data.status] ?? STATUS.unaudited;
    const section = el("section", "surface-panel line rounded-xl border p-4");

    const heading = el("h3", "text-muted mb-3 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider");
    heading.append(icon(facet.icon, "h-4 w-4 text-[var(--c-ink)]"), el("span", "", facet.label));
    heading.append(el("span", `ml-auto rounded border px-1.5 py-0.5 text-[9px] normal-case tracking-normal ${status.cls}`, status.label));
    section.append(heading);

    if (data.status === "disputed" && data.dispute_url) {
        const notice = el("p", "surface-notice line-notice text-notice mb-3 rounded border p-2 text-[11px]", "Under review: ");
        const link = el("a", "text-link underline", "view the open dispute");
        link.href = data.dispute_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        notice.append(link);
        section.append(notice);
    }

    if (facet.modular) section.append(modularBody(data));

    for (const field of facet.fields) {
        const wrapper = el("div", "mt-3 first:mt-0");
        wrapper.append(el("h4", "text-muted mb-1 text-[11px] font-medium", field.label));
        wrapper.append(fieldValue(field, data[field.key]));
        section.append(wrapper);
    }

    const methodology = methodologyFor(facet.key);
    if (methodology) {
        const drawer = el("details", "text-muted mt-3 text-[11px]");
        drawer.append(el("summary", "text-body cursor-pointer", "How this is calculated"), el("p", "mt-1 leading-relaxed", methodology));
        section.append(drawer);
    }

    if (Array.isArray(data.citations) && data.citations.length) {
        section.append(el("h4", "text-muted mt-3 mb-1 text-[11px] font-medium", "Sources"));
        const list = el("ul", "text-subtle line space-y-2 border-t pt-2 text-[11px]");
        for (const c of data.citations) {
            const item = el("li", "");
            const link = el("a", "text-link underline", c.source ?? c.title ?? c.url);
            link.href = c.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            item.append(link, ` · retrieved ${c.retrieved_at ?? c.retrieved}`);
            if (c.locator) item.append(` · ${c.locator}`);
            if (c.quote) item.append(el("blockquote", "text-muted line-strong mt-1 border-l pl-2 italic", `"${c.quote}"`));
            list.append(item);
        }
        section.append(list);
    }

    const flag = el("a", "text-link mt-3 inline-block text-[11px] underline", "Flag this fact");
    flag.href = flagUrl(element, facet, data);
    flag.target = "_blank";
    flag.rel = "noopener noreferrer";
    section.append(flag);
    return section;
}

const SEVERITY_CLASS = { info: "text-body", watch: "text-watch", high: "text-high" };

// Body of a modular facet: the summary as a paragraph, then the metrics as "label: value" lines.
function modularBody(data) {
    const metrics = Array.isArray(data.metrics) ? data.metrics : [];
    const wrapper = el("div", "space-y-2");
    if (!data.summary && metrics.length === 0) {
        wrapper.append(el("p", "placeholder-text text-xs", "No data recorded."));
        return wrapper;
    }
    if (data.summary) wrapper.append(el("p", "text-body text-xs leading-relaxed", data.summary));
    if (metrics.length) {
        const list = el("ul", "mt-2 space-y-1 text-xs");
        for (const metric of metrics) {
            list.append(el("li", `leading-relaxed ${SEVERITY_CLASS[metric.severity] ?? SEVERITY_CLASS.info}`, `${metric.label}: ${metric.value}`));
        }
        wrapper.append(list);
    }
    return wrapper;
}

// Pre-filled GitHub issue for a correction. The reader adds the counter-source; nothing is sent until they submit it.
function flagUrl(element, facet, record) {
    const sources = (record.citations ?? []).map((c) => `- ${c.source ?? c.title ?? "source"}: ${c.url} (retrieved ${c.retrieved_at ?? c.retrieved})`);
    const body = [
        `Element: ${element.name} (${element.symbol})`,
        `Facet: ${facet.key} (${facet.label})`,
        `Status shown: ${record.status ?? "unaudited"}`,
        "",
        "Value shown (paste the line you dispute):",
        "",
        "Current sources:",
        ...(sources.length ? sources : ["- none recorded"]),
        "",
        "Counter-source (URL, table or page, retrieval date):",
        "",
        "Quote from the source, if short:",
        "",
    ].join("\n");
    const params = new URLSearchParams({ title: `Dispute: ${element.symbol} ${facet.key}`, body, labels: "data-dispute" });
    return `https://github.com/${facetConfig.repo}/issues/new?${params.toString()}`;
}

function methodologyFor(facetId) {
    return facetConfig.facets.find((f) => f.id === facetId)?.methodology ?? "";
}

// Lenses and facet toggles. The URL (?lens=&facets=) is the shareable state; localStorage remembers it per browser.
function readStoredState() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
        return null;
    }
}

function writeStoredState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ lens: state.lens, facetIds: [...state.facetIds] }));
    } catch {
        // Storage can be blocked or full; the URL still carries the state.
    }
}

function syncState() {
    try {
        const url = new URL(window.location.href);
        url.searchParams.set("lens", state.lens);
        url.searchParams.set("facets", [...state.facetIds].join(","));
        window.history.replaceState({}, "", url);
    } catch {
        // Some file:// contexts refuse history updates; the page still works.
    }
    writeStoredState();
}

function lensById(id) {
    return facetConfig.lenses.find((lens) => lens.id === id) ?? null;
}

function initLensState() {
    const params = new URLSearchParams(window.location.search);
    const saved = readStoredState();
    const known = new Set(facets.map((f) => f.key));
    const urlLens = lensById(params.get("lens"));
    const savedLens = lensById(saved?.lens);
    const lens = urlLens ?? savedLens ?? lensById(facetConfig.default_lens);

    let ids;
    if (params.has("facets")) ids = params.get("facets").split(",");
    else if (urlLens) ids = urlLens.facets;
    else if (Array.isArray(saved?.facetIds)) ids = saved.facetIds;
    else ids = lens.facets;

    state.lens = lens.id;
    state.facetIds = new Set(ids.filter((id) => known.has(id)));
    syncState();
}

function visibleFacets() {
    return facets.filter((facet) => state.facetIds.has(facet.key));
}

function setLens(id) {
    const lens = lensById(id);
    if (!lens) return;
    state.lens = id;
    state.facetIds = new Set(lens.facets.filter((fid) => facets.some((f) => f.key === fid)));
    afterStateChange();
}

function toggleFacet(id) {
    if (state.facetIds.has(id)) state.facetIds.delete(id);
    else state.facetIds.add(id);
    const current = lensById(state.lens);
    const matches = current && current.facets.length === state.facetIds.size && current.facets.every((f) => state.facetIds.has(f));
    if (!matches) state.lens = "custom";
    afterStateChange();
}

function afterStateChange() {
    syncState();
    renderLensControls();
    if (state.selected) renderPanel(state.selected);
}

function renderLensControls() {
    const container = document.getElementById("lensControls");
    if (!container) return;
    container.replaceChildren();

    const lensRow = el("div", "flex flex-wrap gap-1.5");
    for (const lens of facetConfig.lenses) {
        const button = el("button", "chip", lens.label);
        button.type = "button";
        button.title = lens.description;
        button.setAttribute("aria-pressed", String(state.lens === lens.id));
        button.addEventListener("click", () => setLens(lens.id));
        lensRow.append(button);
    }
    container.append(lensRow);

    const pillRow = el("div", "flex flex-wrap gap-1.5");
    for (const facet of facets) {
        const button = el("button", "chip", facet.label);
        button.type = "button";
        button.setAttribute("aria-pressed", String(state.facetIds.has(facet.key)));
        button.addEventListener("click", () => toggleFacet(facet.key));
        pillRow.append(button);
    }
    container.append(pillRow);
    const note = lensById(state.lens)?.description ?? "Custom selection of facets.";
    container.append(el("p", "text-subtle text-[11px]", note));
}

function fieldValue(field, value) {
    if (isEmpty(value)) {
        const message = field.type === "methods" ? "No commercial extraction recorded." : "No data recorded.";
        return el("p", "placeholder-text text-xs", message);
    }

    if (field.type === "country_values") {
        const wrapper = el("div", "space-y-2");
        wrapper.append(el("p", "text-subtle text-[11px]", `${value.basis} · ${value.year} · ${value.unit}`));
        const list = el("ul", "text-body space-y-1 text-xs");
        for (const row of value.countries) {
            const share = row.share_percent === undefined ? "" : ` (${row.share_percent}%)`;
            list.append(el("li", "leading-relaxed", `${row.country}: ${row.value.toLocaleString("en-US")}${share}`));
        }
        wrapper.append(list);
        if (value.world_total !== undefined) {
            wrapper.append(el("p", "text-subtle text-[11px]", `World total: ${value.world_total.toLocaleString("en-US")} ${value.unit}`));
        }
        return wrapper;
    }

    if (field.type === "methods") {
        const list = el("ul", "space-y-2");
        for (const entry of value) {
            const method = extractionMethods[entry.method] ?? {};
            const item = el("li", "text-body text-xs leading-relaxed");
            item.title = method.definition ?? "";
            item.append(el("span", "text-main font-medium", method.label ?? entry.method));
            const detail = [entry.source, entry.production_route].filter(Boolean).join(" · ");
            if (detail) item.append(el("span", "text-subtle", ` — ${detail}`));
            list.append(item);
        }
        return list;
    }
    if (field.type === "tags") {
        const list = el("div", "flex flex-wrap gap-1.5");
        for (const item of value) list.append(el("span", "tag", item));
        return list;
    }
    if (field.type === "list") {
        const list = el("ul", "text-body list-inside list-disc space-y-1 text-xs");
        for (const item of value) list.append(el("li", "leading-relaxed", item));
        return list;
    }
    return el("p", "text-body text-xs leading-relaxed", String(value));
}

function bindControls() {
    const search = document.getElementById("search");
    search.addEventListener("input", () => {
        state.query = search.value.toLowerCase().trim();
        applyFilters();
    });
    search.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            search.value = "";
            state.query = "";
            applyFilters();
        }
    });

    document.getElementById("stateFilter").addEventListener("change", (event) => {
        state.stateFilter = event.target.value;
        applyFilters();
    });

    document.getElementById("methodFilter").addEventListener("change", (event) => {
        state.method = event.target.value;
        applyFilters();
    });
}

function populateMethodFilter() {
    const select = document.getElementById("methodFilter");
    for (const [id, method] of Object.entries(extractionMethods)) {
        const option = el("option", "", method.label);
        option.value = id;
        option.title = method.definition;
        select.append(option);
    }
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.json();
}

async function load() {
    const [catalogue, operations, lawsuits, config] = await Promise.all([
        fetchJson(DATA_URL),
        fetchJson(OPERATIONS_URL),
        fetchJson(LAWSUITS_URL),
        fetchJson(CONFIG_URL),
    ]);
    return { catalogue, operations, lawsuits, config };
}

// Reverse lookup join: element -> operations that extract it -> lawsuits filed against those operations.
function lookupFor(element) {
    const operationIds = new Set(
        operations.filter((op) => op.elements.some((link) => link.atomic_number === element.number)).map((op) => op.id),
    );
    const matched = operations.filter((op) => operationIds.has(op.id));
    const cases = lawsuits.filter((suit) => operationIds.has(suit.operation_id));
    return { operations: matched, lawsuits: cases };
}

function renderLookup(element) {
    const { operations: matched, lawsuits: cases } = lookupFor(element);
    const container = document.getElementById("lookup");
    container.replaceChildren();

    const operationsColumn = el("section", "surface-panel line rounded-xl border p-4");
    operationsColumn.append(el("h3", "text-muted mb-3 text-xs font-bold uppercase tracking-wider", "Operations extracting " + element.symbol));
    if (matched.length === 0) {
        operationsColumn.append(el("p", "placeholder-text text-xs", "No mining operations recorded for this element."));
    }
    for (const op of matched) {
        const card = el("div", "surface-inset line mt-2 rounded-lg border p-3");
        card.append(el("p", "text-strong text-sm font-semibold", op.name));
        card.append(el("p", "text-muted text-xs", `${op.operator} · ${[op.region, op.country].filter(Boolean).join(", ")} · ${op.status.replace(/_/g, " ")}`));
        operationsColumn.append(card);
    }
    container.append(operationsColumn);

    const feed = el("section", "surface-panel line rounded-xl border p-4");
    feed.append(el("h3", "text-muted mb-3 text-xs font-bold uppercase tracking-wider", "Lawsuits & rights disputes"));
    if (cases.length === 0) {
        feed.append(el("p", "placeholder-text text-xs", matched.length ? "No lawsuits recorded against these operations." : "No linked lawsuits."));
    }
    for (const suit of cases) {
        const card = el("div", "surface-inset line mt-2 rounded-lg border p-3");
        card.append(el("p", "text-strong text-sm font-semibold", suit.case_name));
        card.append(el("p", "text-muted text-xs", `${suit.court}${suit.docket_number ? " · " + suit.docket_number : ""}`));
        card.append(el("p", "text-body mt-1 text-[11px]", `${suit.dispute_type.replace(/_/g, " ")} · ${suit.status}${suit.filed_on ? " · filed " + suit.filed_on : ""}`));
        feed.append(card);
    }
    container.append(feed);
}

// Modular facets (config entries with a "source") keep their records in their own JSON file. Each record is merged
// onto its element, and a facet with no fields is added to the facet list so it can be shown like any other.
async function loadModularFacets() {
    for (const config of facetConfig.facets) {
        if (!config.source) continue;
        let file;
        try {
            file = await fetchJson(config.source);
        } catch (error) {
            console.error(error);
            continue;
        }
        for (const [symbol, record] of Object.entries(file.records ?? {})) {
            const element = elements.find((e) => e.symbol === symbol);
            if (!element) continue;
            element.facets = element.facets ?? {};
            element.facets[config.id] = record;
        }
        facets.push({ key: config.id, label: config.label, icon: config.icon, fields: [], modular: true });
    }
}

// Light or dark. The page follows the OS until the reader picks one; the choice is stored as pti_theme (see the inline
// script in index.html, which applies it before first paint).
function currentTheme() {
    const explicit = document.documentElement.dataset.theme;
    if (explicit === "light" || explicit === "dark") return explicit;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function paintThemeButton() {
    const dark = currentTheme() === "dark";
    document.getElementById("themeToggle").setAttribute("aria-pressed", String(dark));
    document.getElementById("themeLabel").textContent = dark ? "Dark mode" : "Light mode";
}

function bindTheme() {
    paintThemeButton();
    document.getElementById("themeToggle").addEventListener("click", () => {
        const next = currentTheme() === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
            localStorage.setItem(THEME_KEY, next);
        } catch {
            // Storage blocked: the choice still applies for this page view.
        }
        paintThemeButton();
    });
}

async function init() {
    bindTheme();
    let loaded;
    try {
        loaded = await load();
    } catch (error) {
        console.error(error);
        document.getElementById("loadError").classList.remove("hidden");
        document.getElementById("status").textContent = "";
        return;
    }

    const data = loaded.catalogue;
    operations = loaded.operations;
    lawsuits = loaded.lawsuits;
    elements = data.elements;
    categories = new Map(data.categories.map((c) => [c.id, c]));
    extractionMethods = data.extraction_methods;
    facets = data.facets;
    facetConfig = loaded.config;
    await loadModularFacets();
    initLensState();
    renderLensControls();
    for (const element of elements) searchIndex.set(element.number, buildSearchText(element));

    populateMethodFilter();
    renderChips();
    renderTable();
    applyFilters();
    bindControls();
    refreshIcons();
}

init();
