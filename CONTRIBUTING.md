# Contributing

Thanks for checking a value. This site is a reference for the 118 elements, their extraction methods and their
uses. It is not a market tool, so the rules below are strict on purpose.

## What counts as a source

A value needs a primary source. Accepted:

- a government agency or public geological, statistical or health body (for example USGS, NIST, DOE, NASA, EIA, NLM);
- a standards body (for example IUPAC or ISO);
- a peer-reviewed paper.

Not accepted as a source for a value: Wikipedia, other wikis, blogs, news articles, video, and social media. Use them to
find a primary source, then cite that source instead.

## Every value needs a URL and a retrieval date

Each fact on the site carries:

- a URL that points at the document, table or record the value came from;
- the date you retrieved it, in ISO form (`2026-11-06`).

A value without both is not accepted. Facets with no citation stay `unaudited`. Text on the site is written in our own
words. Quote a source only when you copy it word for word, and mark the quotation.

Record the source list in `SOURCES.md` when you add a new source type. It states each source's terms and whether it meets
the bar above.

## What is out of scope

The site does not accept, and will not publish, content that is:

- financial, ETF, stock or fund information;
- prices, price forecasts or market values;
- rankings of companies, mines or producers;
- commercial content, such as product listings, vendor lists or advertising.

This is the public boundary. Company and producer lists are withheld until each entry has a primary source and falls
within scope.

## Checks before you open a pull request

Run both commands from the repository root:

```sh
just validate   # facet registry, lenses, status values and citations; runs the browser-side tests first
npm test        # browser-side tests (Node test runner and jsdom): node --test tests/js/*.test.js
```

Install dependencies once with `npm install`. `just validate` also runs `npm test`, so you only need `just validate` for
a full check.

## Flagging a disputed value

If you think a value is wrong, use the **Flag this fact** link on the element's panel. It opens a GitHub issue with the
element, the facet, the value shown and the sources recorded, pre-filled with the `data-dispute` label. Add:

1. the line you dispute, as shown on the page;
2. a counter-source: URL, table or page, and retrieval date;
3. a short quote from that source, if you have one.

The maintainer reviews the issue. A disputed facet is shown as `disputed` and links to the open issue until it is
resolved. You can also report an error or a missing source with the "Report an issue or a correction" link on the
home page.

## Making a change

1. Fork the repository and create a branch from `main`.
2. Make the change and run the two checks above.
3. Open a pull request that names the element or page, and lists each new source with its URL and retrieval date.
