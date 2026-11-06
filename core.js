// Pure logic for the periodic table page: search text, filters, status meaning, the Flag link, and lens and facet state.
// No DOM, no storage, no network, and no side effects on import. app.js binds this logic to the page; the tests in
// tests/js load this same file natively.

export const STATUS = {
    "human-verified": { label: "Verified", cls: "status-human-verified", meaning: "A person has checked the value against its cited source." },
    "agent-extracted": { label: "Sourced, not yet checked", cls: "status-agent-extracted", meaning: "Taken from a cited source. No person has checked it yet." },
    unaudited: { label: "Unaudited", cls: "status-unaudited", meaning: "No check has been made. Treat the value as unverified." },
    disputed: { label: "Disputed", cls: "status-disputed", meaning: "Under review. The panel links to the open dispute." },
};

// The status entry for a record. Anything unknown is treated as unaudited, never as verified.
export function statusInfo(status) {
    return STATUS[status] ?? STATUS.unaudited;
}

export function isEmpty(value) {
    return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

export function valueToText(value) {
    return Array.isArray(value) ? value.join(" | ") : String(value ?? "");
}

// One extraction entry as text: the method label, the source and the production route, when there is one.
export function methodText(entry, methodLabel) {
    return [methodLabel(entry.method) ?? entry.method, entry.source, entry.production_route].filter(Boolean).join(" ");
}

// Every searchable string on an element: the core fields plus every facet field the registry declares.
export function buildSearchText(element, { facets, categoryLabel, methodLabel }) {
    const parts = [
        element.name,
        element.symbol,
        String(element.number),
        element.state,
        categoryLabel(element.category) ?? element.category,
    ];
    for (const facet of facets) {
        const data = element.facets?.[facet.key] ?? {};
        for (const field of facet.fields) {
            if (field.type === "methods") {
                for (const entry of data[field.key] ?? []) parts.push(methodText(entry, methodLabel));
            } else if (field.type === "country_values") {
                if (data[field.key]) parts.push(data[field.key].countries.map((row) => row.country).join(" "));
            } else if (!isEmpty(data[field.key])) {
                parts.push(valueToText(data[field.key]));
            }
        }
    }
    return parts.join(" | ").toLowerCase();
}

// Whether an element passes the category, state, extraction-method and text filters.
export function matchesFilters(element, filters, searchText) {
    if (filters.category !== "all" && element.category !== filters.category) return false;
    if (filters.stateFilter !== "all" && element.state !== filters.stateFilter) return false;
    if (filters.method !== "all") {
        const methodIds = (element.facets?.mining?.extraction ?? []).map((entry) => entry.method);
        if (!methodIds.includes(filters.method)) return false;
    }
    return !filters.query || searchText.includes(filters.query);
}

// The body of a pre-filled GitHub issue for a correction. The reader adds the counter-source before submitting.
export function flagUrl(element, facet, record, repo) {
    const sources = (record.citations ?? []).map(
        (c) => `- ${c.source ?? c.title ?? "source"}: ${c.url} (retrieved ${c.retrieved_at ?? c.retrieved})`,
    );
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
    return `https://github.com/${repo}/issues/new?${params.toString()}`;
}

export function lensById(lenses, id) {
    return lenses.find((lens) => lens.id === id) ?? null;
}

// Which lens and facets to show on load. Precedence: the URL, then the saved choice, then the default lens.
// The facets parameter, when present, wins over the lens's own list. Unknown facet ids are dropped.
export function resolveLensState({ lensParam, facetsParam, saved, lenses, defaultLens, knownFacetIds }) {
    const urlLens = lensById(lenses, lensParam);
    const savedLens = lensById(lenses, saved?.lens);
    const lens = urlLens ?? savedLens ?? lensById(lenses, defaultLens);

    let ids;
    if (facetsParam !== null && facetsParam !== undefined) ids = facetsParam.split(",");
    else if (urlLens) ids = urlLens.facets;
    else if (Array.isArray(saved?.facetIds)) ids = saved.facetIds;
    else ids = lens.facets;

    return { lens: lens.id, facetIds: new Set(ids.filter((id) => knownFacetIds.has(id))) };
}

// Selecting a lens shows exactly that lens's facets, dropping any that are not registered.
export function setLensState(lensId, { lenses, knownFacetIds }) {
    const lens = lensById(lenses, lensId);
    if (!lens) return null;
    return { lens: lens.id, facetIds: new Set(lens.facets.filter((fid) => knownFacetIds.has(fid))) };
}

// Toggling one facet. A lens is named while its facets are exactly the ones shown; otherwise the state is "custom".
export function toggleFacetState(current, facetId, lenses) {
    const facetIds = new Set(current.facetIds);
    if (facetIds.has(facetId)) facetIds.delete(facetId);
    else facetIds.add(facetId);
    // Name the lens whose facets are exactly the ones shown, so removing a facet restores the name too.
    const match = lenses.find((lens) => lens.facets.length === facetIds.size && lens.facets.every((f) => facetIds.has(f)));
    return { lens: match ? match.id : "custom", facetIds };
}

// Embed mode is requested with ?embed=1. Nothing about it is specific to any host page.
export function isEmbedRequested(search) {
    return new URLSearchParams(search).get("embed") === "1";
}

// The messages an embedding page receives. Each carries a fixed source tag so a host can ignore other messages.
// pti:ready once on load; pti:height after each change of layout; pti:lens after each change of lens or facets.
export function embedMessage(type, payload = {}) {
    return { source: "periodic-table-inspector", type, ...payload };
}
