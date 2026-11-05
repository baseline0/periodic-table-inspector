// Periodic table renderer. Everything shown comes from data/elements.json: the categories, the element records and the
// facet registry that decides which metadata appears in the side panel and in search. Nothing here is specific to a
// particular element, so new elements, categories or facets are data changes only (see README.md).

const DATA_URL = "data/elements.json";
const OPERATIONS_URL = "data/operations.json";
const LAWSUITS_URL = "data/lawsuits.json";

// Where each row of the table sits. Periods 1-7 are rows 1-7, row 8 is a gap, and the f-block series hang off rows 9-10.
const SERIES_ROW = { lanthanide: 9, actinide: 10 };
const SERIES_FIRST_COLUMN = 3;

const state = {
    category: "all",
    stateFilter: "all",
    method: "all",
    query: "",
    selected: null,
};

// Elements in one place, keyed by atomic number.
let elements = [];
let operations = [];
let lawsuits = [];
let categories = new Map();
let extractionMethods = {};
let facets = [];
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
    node.style.gridRow = row;
    node.style.gridColumn = SERIES_FIRST_COLUMN;
    node.append(el("span", "text-[8px] opacity-75", text));
    return node;
}

function rowLabel(text, row, categoryId) {
    const node = el("div", "row-label", text);
    node.style.setProperty("--c", categoryColor(categoryId));
    node.style.gridRow = row;
    node.style.gridColumn = "1 / 3";
    return node;
}

function renderChips() {
    const container = document.getElementById("categoryChips");
    container.replaceChildren();

    const all = chipButton("all", "All categories", "#94a3b8", elements.length);
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
        row.append(el("dt", "inline text-slate-500", `${term}: `), el("dd", "inline text-slate-200", value));
        coreProps.append(row);
    }

    const sections = document.getElementById("facetSections");
    sections.replaceChildren(...facets.map((facet) => facetSection(facet, element)));
    renderLookup(element);
    refreshIcons();
}

function facetSection(facet, element) {
    const data = element.facets?.[facet.key] ?? {};
    const section = el("section", "rounded-xl border border-slate-800 bg-slate-900 p-4");

    const heading = el("h3", "mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400");
    heading.append(icon(facet.icon, "h-4 w-4 text-[var(--c)]"), el("span", "", facet.label));
    if (data.verified === true) {
        heading.append(el("span", "ml-auto rounded border border-emerald-500/40 px-1.5 py-0.5 text-[9px] text-emerald-300", "Verified"));
    } else {
        heading.append(el("span", "ml-auto rounded border border-amber-500/40 px-1.5 py-0.5 text-[9px] text-amber-300", "Unverified"));
    }
    section.append(heading);

    for (const field of facet.fields) {
        const wrapper = el("div", "mt-3 first:mt-0");
        wrapper.append(el("h4", "mb-1 text-[11px] font-medium text-slate-400", field.label));
        wrapper.append(fieldValue(field, data[field.key]));
        section.append(wrapper);
    }

    // Citations stay visible whether or not the facet is verified: each one links to its source with its retrieval date.
    if (Array.isArray(data.citations) && data.citations.length) {
        const list = el("ul", "mt-3 space-y-1 border-t border-slate-800 pt-2 text-[11px] text-slate-500");
        for (const c of data.citations) {
            const item = el("li", "");
            const link = el("a", "underline hover:text-blue-300", c.source);
            link.href = c.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            item.append(link, ` · retrieved ${c.retrieved}`);
            list.append(item);
        }
        section.append(el("h4", "mt-3 mb-1 text-[11px] font-medium text-slate-400", "Sources"), list);
    }
    return section;
}

function fieldValue(field, value) {
    if (isEmpty(value)) {
        const message = field.type === "methods" ? "No commercial extraction recorded." : "No data recorded.";
        return el("p", "placeholder-text text-xs", message);
    }

    if (field.type === "country_values") {
        const wrapper = el("div", "space-y-2");
        wrapper.append(el("p", "text-[11px] text-slate-500", `${value.basis} · ${value.year} · ${value.unit}`));
        const list = el("ul", "space-y-1 text-xs text-slate-300");
        for (const row of value.countries) {
            const share = row.share_percent === undefined ? "" : ` (${row.share_percent}%)`;
            list.append(el("li", "leading-relaxed", `${row.country}: ${row.value.toLocaleString("en-US")}${share}`));
        }
        wrapper.append(list);
        if (value.world_total !== undefined) {
            wrapper.append(el("p", "text-[11px] text-slate-500", `World total: ${value.world_total.toLocaleString("en-US")} ${value.unit}`));
        }
        return wrapper;
    }

    if (field.type === "methods") {
        const list = el("ul", "space-y-2");
        for (const entry of value) {
            const method = extractionMethods[entry.method] ?? {};
            const item = el("li", "text-xs leading-relaxed text-slate-300");
            item.title = method.definition ?? "";
            item.append(el("span", "font-medium text-slate-100", method.label ?? entry.method));
            const detail = [entry.source, entry.production_route].filter(Boolean).join(" · ");
            if (detail) item.append(el("span", "text-slate-500", ` — ${detail}`));
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
        const list = el("ul", "list-inside list-disc space-y-1 text-xs text-slate-300");
        for (const item of value) list.append(el("li", "leading-relaxed", item));
        return list;
    }
    return el("p", "text-xs leading-relaxed text-slate-300", String(value));
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
    const [catalogue, operations, lawsuits] = await Promise.all([
        fetchJson(DATA_URL),
        fetchJson(OPERATIONS_URL),
        fetchJson(LAWSUITS_URL),
    ]);
    return { catalogue, operations, lawsuits };
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

    const operationsColumn = el("section", "rounded-xl border border-slate-800 bg-slate-900 p-4");
    operationsColumn.append(el("h3", "mb-3 text-xs font-bold uppercase tracking-wider text-slate-400", "Operations extracting " + element.symbol));
    if (matched.length === 0) {
        operationsColumn.append(el("p", "placeholder-text text-xs", "No mining operations recorded for this element."));
    }
    for (const op of matched) {
        const card = el("div", "mt-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3");
        card.append(el("p", "text-sm font-semibold text-white", op.name));
        card.append(el("p", "text-xs text-slate-400", `${op.operator} · ${[op.region, op.country].filter(Boolean).join(", ")} · ${op.status.replace(/_/g, " ")}`));
        operationsColumn.append(card);
    }
    container.append(operationsColumn);

    const feed = el("section", "rounded-xl border border-slate-800 bg-slate-900 p-4");
    feed.append(el("h3", "mb-3 text-xs font-bold uppercase tracking-wider text-slate-400", "Lawsuits & rights disputes"));
    if (cases.length === 0) {
        feed.append(el("p", "placeholder-text text-xs", matched.length ? "No lawsuits recorded against these operations." : "No linked lawsuits."));
    }
    for (const suit of cases) {
        const card = el("div", "mt-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3");
        card.append(el("p", "text-sm font-semibold text-white", suit.case_name));
        card.append(el("p", "text-xs text-slate-400", `${suit.court}${suit.docket_number ? " · " + suit.docket_number : ""}`));
        card.append(el("p", "mt-1 text-[11px] text-slate-300", `${suit.dispute_type.replace(/_/g, " ")} · ${suit.status}${suit.filed_on ? " · filed " + suit.filed_on : ""}`));
        feed.append(card);
    }
    container.append(feed);
}

async function init() {
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
    for (const element of elements) searchIndex.set(element.number, buildSearchText(element));

    populateMethodFilter();
    renderChips();
    renderTable();
    applyFilters();
    bindControls();
    refreshIcons();
}

init();
