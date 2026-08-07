# fintech-algorithms — reference site

The documentation site for [`fintech-algorithms`](https://www.npmjs.com/package/fintech-algorithms),
published at **[docs.thefintechbuilder.com](https://docs.thefintechbuilder.com)**.

## How it works

The site has exactly one input: the `docs.json` payload that ships inside the
package's npm tarball.

```
fintech-algorithms@0.4.0/docs.json   →   unpkg   →   build.mjs   →   dist/
```

That single decision is what keeps everything else simple:

- **No access to the algorithm catalog.** The catalog is private; this repository
  never touches it. It reads a public artefact.
- **No cross-repository push.** A release does not have to deliver anything here.
- **Every version is addressable.** `unpkg.com/fintech-algorithms@x.y.z/docs.json`
  exists permanently for every release ever published, so building the docs for
  an older version is a flag, not an archaeology project.

```bash
node build.mjs                        # latest release
node build.mjs --version 0.4.0        # a specific release
node build.mjs --payload ../Fintech-Algorithms-Library/docs.json   # local, unpublished
node serve.mjs                        # preview dist/ at :4321
```

## No dependencies

There is no framework, no `node_modules`, and no lockfile. A few hundred
near-identical documents generated from one JSON file do not need a build system,
and a documentation site for a zero-dependency library should not carry a
toolchain heavier than the library itself.

| File | Role |
|---|---|
| `build.mjs` | The whole generator — fetch payload, render pages, emit `sitemap.xml`, `llms.txt`, `robots.txt` |
| `content/*.md` | The hand-written guides, one file each |
| `assets/style.css` | One stylesheet, light and dark |
| `assets/search.js` | Client-side search over an index embedded in the home page |
| `serve.mjs` | Local preview only |

## Guides

A guide is two edits: a file in `content/`, and one entry in the `GUIDES` array
in `build.mjs`. The guide index, `sitemap.xml` and `llms.txt` all derive from
that array, so none of them is edited by hand.

`SKILL_INSTALL` in `build.mjs` is the only place the `npx skills add` command is
written. It reaches the bar under the header on every page, the home hero, the
root and per-domain `llms.txt`, and each topic's markdown twin — one constant, so
a drifted copy is not possible.

Guides are prose, but they should never type out a number the payload already
knows. Write `{{topics}}`, `{{domains}}`, `{{families}}`, `{{verified}}`,
`{{contract}}`, `{{withExample}}` or an archetype name such as
`{{series-transform}}`, and the build substitutes the figure from the payload it
is building against. An unknown token fails the build. That is the mechanism that
stops a sentence like "79 of 187 topics are verified" from surviving two
releases, which is exactly what it did before the tokens existed.

## URLs mirror import paths

This is the library's central idea, and the site is its third instance:

| Surface | URL |
|---|---|
| Article | `thefintechbuilder.com/technical-indicators/trend-smoothing/sma/` |
| Docs | `docs.thefintechbuilder.com/technical-indicators/trend-smoothing/sma/` |
| Import | `fintech-algorithms/technical-indicators/trend-smoothing/sma` |

Anyone who knows one can derive the other two.

## What belongs here, and what does not

Docs pages state the **contract** — how to call the algorithm correctly:
signature, worked example, verification tier, links to source. The **concept** —
why it works, where it breaks — lives in the article, and is linked rather than
repeated. Duplicating that prose would create two pages competing for the same
search query.

Every worked example on the site comes from a fixture the package's test suite
asserts. Nothing here is hand-written, so nothing here can quietly go stale.

## Deployment

GitHub Pages, built by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
on push, on a daily schedule, and on demand. The daily rebuild is what picks up a
new package release — use **Run workflow** if you want it immediately.

The build refuses to deploy if fewer than 100 topic pages were produced: a
partial site is worse than a stale one.
