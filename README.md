# Periodic Table Inspector

A static, work-in-progress periodic table. Each element links to its cited science facts.

**Work in progress. Not investment advice.** Read the [methodology](methodology.html) before relying on any claim.


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
| `data/elements.json` | 118 element records, categories and the facet registry |

## Contributing data

Every citation needs a URL pointing at the document, table or record it came from, and a retrieval date.
Each facet has a `status`: `unaudited`, `agent-extracted`, `human-verified` or `disputed`. Facets that have no citations stay `unaudited`. Run `just validate` before opening a pull request.

## Licence

- **Code** (HTML, CSS, JavaScript, tests, build scripts): [MIT licence](LICENSE).
- **Data and written content** (`data/`, `SOURCES.md`, `WORK_IN_PROGRESS.md`): [CC BY 4.0](LICENSE-DATA). Credit the sources listed in [SOURCES.md](SOURCES.md) for each fact you reuse.
- **Third-party components** (Lucide icons, Inter and JetBrains Mono fonts): their own licences, reproduced in [THIRD_PARTY.md](THIRD_PARTY.md).

Facts are not copyrightable, but the cited sources keep their own terms. The facts are only as good as their citations.
