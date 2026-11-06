# Periodic Table & Mining Inspector

A static, work-in-progress periodic table. Each element links to its extraction methods, uses and
economic notes, and to the mining operations and legal disputes linked to it.

**Work in progress. Not investment advice.** Nothing here is a statement of who owns, holds or has
rights to any mine. Read the [methodology](methodology.html) before relying on any claim.


## Run it locally

The page loads JSON, so open it over HTTP rather than from the file system:

    python3 -m http.server 8000

Then visit http://127.0.0.1:8000/.

## Report an issue

Found an error or a missing source? [Open an issue](https://github.com/baseline0/periodic-table-inspector/issues/new/choose). Include the element or page, the
claim, and a source URL where you can.

## Data

| File | Holds |
|---|---|
| `data/elements.json` | 118 element records, extraction methods, categories and the facet registry |
| `data/schema.sql` | PostgreSQL model for the reverse lookup: elements, operations, junction table, lawsuits |
| `data/operations.json` | Mining operations. Empty until each row has a source URL |
| `data/lawsuits.json` | Lawsuits and rights disputes. Empty until each row has a source URL |

Company and producer lists are withheld from this release until each entry is sourced. The
[methodology](methodology.html) explains what a sourced entry must contain.

## Contributing data

Every row needs a `source_url` pointing at the filing, docket or government record it came from.
Each facet has a `status`: `unaudited`, `agent-extracted`, `human-verified` or `disputed`. Facets that have no citations stay `unaudited`. Run `just validate` before opening a pull request.

## Licence

Released under the [MIT licence](LICENSE). The data is covered by the same licence, but the facts in it are only as good as their cited sources.
