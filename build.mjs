#!/usr/bin/env node
/**
 * Build the reference site for `fintech-algorithms`.
 *
 * Two inputs, deliberately separate:
 *
 *   docs.json     the generated reference payload, shipped inside the npm
 *                 tarball and fetched from unpkg — 187 topics, their contracts
 *                 and their executed worked examples
 *   content/*.md  hand-written guides, which are prose and belong in a file
 *                 rather than in a generator
 *
 * Because the payload travels with the package, every released version is
 * permanently addressable and this site needs no access to the private catalog.
 *
 * URLs mirror the import path exactly, which is the library's central idea:
 *
 *   article  thefintechbuilder.com/technical-indicators/trend-smoothing/sma/
 *   docs     docs.thefintechbuilder.com/technical-indicators/trend-smoothing/sma/
 *   import   fintech-algorithms/technical-indicators/trend-smoothing/sma
 *
 * Usage:
 *   node build.mjs                       # current payload from the package repo
 *   node build.mjs --version 0.9.0       # docs for a specific published release
 *   node build.mjs --payload ../path/docs.json
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { markdown, title as mdTitle } from "./lib/markdown.mjs";
import { highlight } from "./lib/highlight.mjs";
import { anchorHeadings, tableOfContents, sidebar } from "./lib/page.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, "dist");

const SITE = "https://docs.thefintechbuilder.com";
const ARTICLES = "https://thefintechbuilder.com";

/**
 * The *same* GA4 measurement id as the articles site, deliberately.
 *
 * `docs.` is a subdomain of `thefintechbuilder.com`, and GA4's default `auto`
 * cookie domain writes `_ga` on the registrable domain — so one id means one
 * client id shared across both sites, and a reader moving from an article to
 * its reference page stays in a single session with attribution intact. A
 * second data stream would mint a second cookie: double-counted users and a
 * self-referral at every hop. Split the two sites in reporting with the
 * built-in Hostname dimension instead.
 */
const GA_ID = "G-Y3LQHVFVRW";
const NPM = "https://www.npmjs.com/package/fintech-algorithms";
const GITHUB = "https://github.com/IslamBaraka90/Fintech-Algorithms-Library";

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

/**
 * Path prefix for hosts that serve below the domain root — a GitHub Pages
 * *project* URL. Empty for the real deployment, so deleting the `DOCS_BASE`
 * variable once DNS points here restores root-relative links with no code
 * change. Canonical URLs ignore it and always name the real site.
 */
const BASE = arg("--base", process.env.DOCS_BASE ?? "").replace(/\/$/, "");
const u = (p) => `${BASE}${p}`;

// ------------------------------------------------------------ load payload

/**
 * Returns the parsed payload *and* the exact bytes it was parsed from.
 *
 * The raw text is what gets republished at `/reference/payload.json`. Writing
 * `JSON.stringify(payload)` instead would be a re-serialisation — same data,
 * different bytes — and the whole point of self-hosting the payload is that the
 * copy the site serves is provably the copy the site was built from.
 */
async function loadPayload() {
  const local = arg("--payload", null);
  if (local) {
    console.log(`payload: ${local}`);
    const raw = readFileSync(resolve(local), "utf8");
    return { payload: JSON.parse(raw), raw };
  }
  const version = arg("--version", null);

  /*
   * Default source is the package repository's `main`, not npm.
   *
   * Building from `unpkg@latest` made *publishing* the delivery mechanism for
   * documentation: every doc change needed a release, which burned six version
   * numbers in a day for changes that touched no code a consumer runs. The
   * payload is committed to a public repository, so reading it there decouples
   * the two entirely — docs update on push, releases stay for actual releases.
   *
   * `--version 0.9.0` still builds the docs for a specific published release
   * from the tarball, which is the one thing that genuinely needs npm.
   */
  const sources = version
    ? [
        `https://unpkg.com/fintech-algorithms@${version}/docs.json`,
        `https://cdn.jsdelivr.net/npm/fintech-algorithms@${version}/docs.json`,
      ]
    : [
        "https://raw.githubusercontent.com/IslamBaraka90/Fintech-Algorithms-Library/main/docs.json",
        "https://cdn.jsdelivr.net/gh/IslamBaraka90/Fintech-Algorithms-Library@main/docs.json",
      ];

  const failures = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    for (const url of sources) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          console.log(`payload: ${url}`);
          const raw = await res.text();
          return { payload: JSON.parse(raw), raw };
        }
        failures.push(`${res.status} ${res.statusText} — ${url}`);
      } catch (e) {
        failures.push(`${e.message} — ${url}`);
      }
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`payload fetch failed from every source:\n  ${failures.join("\n  ")}`);
}

// ------------------------------------------------------------------ helpers

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** `</script>` inside embedded JSON would close the tag early. */
const jsonForScript = (v) => JSON.stringify(v).replace(/</g, "\\u003c");

/** Authored prose may use backtick code spans and nothing else. */
const md = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");

const write = (relPath, contents) => {
  const full = join(DIST, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents, "utf8");
};

/**
 * JSON for display: short primitive arrays stay on one line.
 *
 * `JSON.stringify(undefined)` returns undefined, not a string — which happens
 * whenever a captured call omitted an optional argument.
 */
const pretty = (v) => {
  const s = JSON.stringify(v, null, 2) ?? "undefined";
  // `\s*` rather than `\s+` before the bracket: a root-level array closes at
  // column 0, which is exactly the common case of a short numeric series.
  return s.replace(/\[\n\s+((?:[^[\]{}]|\n)*?)\n\s*\]/g, (m, body) => {
    const flat = body.split("\n").map((l) => l.trim()).join(" ");
    return flat.length <= 76 ? `[${flat}]` : m;
  });
};

const domainSlug = (t) => t.path.split("/")[0];
const familySlug = (t) => t.path.split("/")[1];

/*
 * Machine routes, advertised two ways.
 *
 * `<link rel="alternate">` is how a crawler finds them without being told —
 * it is the same mechanism that points at a feed, and it costs nothing to a
 * reader. The visible link is for the agent that is already reading the page
 * and would otherwise have to guess the URL.
 */
const domainLlmsUrl = (t) => `${SITE}/${domainSlug(t)}/llms.txt`;

const machineLinks = (t) => [
  {
    href: `${SITE}/${t.path}/index.md`,
    type: "text/markdown",
    title: "This page as markdown",
  },
  {
    href: domainLlmsUrl(t),
    type: "text/plain",
    title: `Index of every algorithm in ${t.taxonomy.domain}, for agents`,
  },
];
const families = (n) => `${n} ${n === 1 ? "family" : "families"}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * `label` names the block for the reader — a parameter name, or the language.
 * `lang` drives highlighting and is separate, because the two are usually
 * different: the input block for `values` is labelled `values` and is JSON.
 */
const codeBlock = (label, body, lang = null) =>
  `<figure class="code">${label ? `<figcaption>${esc(label)}</figcaption>` : ""}<pre><code${
    lang ? ` class="lang-${esc(lang)}"` : ""
  }>${highlight(body, lang)}</code></pre></figure>`;

// -------------------------------------------------------------- page shell

const NAV = [
  { label: "Quick start", href: "/start/" },
  { label: "Agent skill", href: "/guides/agent-skill/" },
  { label: "Concepts", href: "/concepts/" },
  { label: "Guides", href: "/guides/" },
  { label: "Reference", href: "/reference/" },
];

/*
 * The one place this command is written. It appears on every page of the site,
 * in the machine surfaces and in the guide, and a version of it that had drifted
 * in one of those places would be worse than not printing it at all.
 */
const SKILL_INSTALL = "npx skills add IslamBaraka90/Fintech-Algorithms-Library";

/** Filled once the payload is loaded; only used for the search placeholder. */
let PAYLOAD_COUNT = 0;

/**
 * gtag.js, on every page. Loaded `async` so it never blocks first paint, and
 * emitted last in `<head>` so a slow tag manager cannot delay the stylesheets.
 *
 * Cookie domain is left at its `auto` default on purpose — see `GA_ID`.
 */
const analytics = () =>
  `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');
</script>
`;

function shell({
  title,
  description,
  canonical,
  body,
  breadcrumbs = [],
  jsonLd = null,
  mermaid = false,
  wide = false,
  aside = "",
  nav = "",
  provenance = "",
  alternates = [],
}) {
  // Anchors and the contents list are derived from the finished body, so every
  // template gets them without having to register its own headings.
  const { html, headings } = anchorHeadings(body);
  const toc = tableOfContents(headings);

  /*
   * `has-rail` exists because the third column is not implied by anything else
   * in the markup. A guide has no sidebar but does have a contents list, and
   * without a class saying so the layout had no way to tell "no rail" from
   * "rail, just no nav" — so the rail fell through to the bottom of the page.
   */
  const rail = aside || toc ? `<div class="rail-col">${toc}${aside}</div>` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="fintech-algorithms documentation">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="author" content="The Fintech Builder">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="${u("/assets/style.css")}">
<link rel="stylesheet" href="${u("/assets/layout.css")}">
<script>window.__BASE__=${JSON.stringify(BASE)};</script>
${[{ href: `${SITE}/llms.txt`, type: "text/plain", title: "Index of every algorithm, for agents" }, ...alternates]
  .map((a) => `<link rel="alternate" type="${a.type}" href="${esc(a.href)}" title="${esc(a.title)}">`)
  .join("\n")}
${jsonLd ? `<script type="application/ld+json">${jsonForScript(jsonLd)}</script>` : ""}
${analytics()}</head>
<body${wide ? ' class="wide"' : ""}>
<a class="skip" href="#main">Skip to content</a>
<header class="site">
  <div class="bar">
    <a class="brand" href="${u("/")}">fintech<span>-algorithms</span></a>
    <nav class="primary">${NAV.map((n) => `<a href="${u(n.href)}">${esc(n.label)}</a>`).join("")}</nav>
    <div class="site-search">
      <input id="q" type="search" placeholder="Search ${PAYLOAD_COUNT} algorithms…" aria-label="Search algorithms"
             autocomplete="off" spellcheck="false" data-index="${u("/search-index.json")}">
      <kbd>/</kbd>
      <ul id="results" hidden></ul>
    </div>
    <nav class="external">
      <a href="${ARTICLES}">Articles</a>
      <a href="${NPM}">npm</a>
      <a href="${GITHUB}">GitHub</a>
    </nav>
  </div>
</header>
<div class="skillbar">
  <div class="inner">
    <span><strong>Using a coding agent?</strong> Give it the skill:</span>
    <code>${esc(SKILL_INSTALL)}</code>
    <a href="${u("/guides/agent-skill/")}">What it does →</a>
  </div>
</div>
${
  breadcrumbs.length
    ? `<nav class="crumbs" aria-label="Breadcrumb"><div class="inner">${breadcrumbs
        .map((c) => (c.href ? `<a href="${esc(c.href)}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`))
        .join('<i aria-hidden="true">/</i>')}</div></nav>`
    : ""
}
<div class="shell${nav ? " has-nav" : ""}${rail ? " has-rail" : ""}">
${nav}
<main id="main">
${html}
${provenance}
</main>
${rail}
</div>
<footer>
  <div class="inner">
    <p>Generated from the <code>docs.json</code> payload published with the package.
    No example on this site was written by hand — every one is the output of running the code.</p>
    <p><a href="${ARTICLES}">The Fintech Builder</a> · <a href="${u("/start/")}">Quick start</a> · <a href="${u(
      "/guides/agent-skill/",
    )}">Agent skill</a> · <a href="${u("/guides/")}">Guides</a> · <a href="${u(
      "/guides/verification/",
    )}">What “verified” means</a> · <a href="${u("/llms.txt")}">llms.txt</a></p>
  </div>
</footer>
<script src="${u("/assets/site.js")}" defer></script>
${
  mermaid
    ? `<script type="module">
// Rendered from the diagram source carried in the payload. If the CDN is
// unreachable the source stays visible in its <details>, so nothing is lost.
try {
  const { default: mermaid } = await import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs");
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "neutral", securityLevel: "strict" });
  await mermaid.run({ querySelector: ".mermaid" });
  document.querySelectorAll(".flow").forEach((d) => { d.open = true; d.classList.add("rendered"); });
} catch {}
</script>`
    : ""
}
</body>
</html>
`;
}

const badge = (t) =>
  t.verification.tier === "verified"
    ? `<span class="badge verified" title="Arithmetic asserted against the worked example published in the article">verified</span>`
    : `<span class="badge contract" title="Loads and exposes a callable entry point; its arithmetic is not asserted here">contract</span>`;

// --------------------------------------------------------------- home page

function renderHome(payload) {
  const { counts, domains } = payload;
  const body = `
<section class="hero">
  <p class="eyebrow">Reference · v${esc(payload.package.version)}</p>
  <h1>The algorithms behind market data, corporate actions, indices and breadth</h1>
  <p class="lede">${counts.topics} zero-dependency TypeScript implementations. Plain arrays
  and objects in, plain values out — no client to construct, no API key, no provider baked in.</p>
  <div class="cta-row">
    <a class="button" href="${u("/start/")}">Quick start</a>
    <a class="button" href="${u("/guides/agent-skill/")}">Install the agent skill</a>
    <a class="button ghost" href="${u("/guides/charting/")}">Plot one on a chart</a>
  </div>
  <p class="hero-install">Writing this code with an agent? One command teaches it all
  ${counts.topics} — <code>${esc(SKILL_INSTALL)}</code></p>
  <dl class="stats">
    <div><dt>Topics</dt><dd>${counts.topics}</dd></div>
    <div><dt>Domains</dt><dd>${counts.domains}</dd></div>
    <div><dt>Worked examples</dt><dd>${counts.withExample}</dd></div>
    <div><dt>Verified</dt><dd>${counts.verified}</dd></div>
  </dl>
</section>

<section id="domains">
  <h2>Browse the reference</h2>
  <p class="lede">Every algorithm has a page: signature, parameter contract, an executed worked
  example, diagrams and citations.</p>
  <div class="grid">
    ${domains
      .map((d) => {
        const first = payload.topics.find((t) => t.taxonomy.domainId === d.id);
        return `<a class="card" href="${u(`/${domainSlug(first)}/`)}">
      <span class="tag">${esc(d.id)}</span>
      <h3>${esc(d.name)}</h3>
      <p>${plural(d.topicCount, "topic")} · ${families(d.families.length)}</p>
    </a>`;
      })
      .join("\n    ")}
  </div>
</section>

<section>
  <h2>Start with a concept</h2>
  <p class="lede">Reference pages state a contract. These explain the subject — what the problem
  is, why the standard approaches exist, and where each one quietly breaks.</p>
  <div class="grid">
${CONCEPTS.map(
  (c) => `    <a class="card" href="${u(`/concepts/${c.slug}/`)}">
      <span class="tag">${esc(c.domainId)}</span>
      <h3>${esc(mdTitle(readFileSync(join(ROOT, "content", "concepts", c.file), "utf8")))}</h3>
      <p>${esc(c.blurb)}</p>
    </a>`,
).join("\n")}
  </div>
</section>

<section class="panels">
  <article class="panel">
    <h2>Every example is executed</h2>
    <p>${counts.withExample} of ${counts.topics} pages show a worked example, and not one of
    them was typed by hand. Each is either the fixture the test suite asserts, or the real
    return value captured by running the function on the input its own test provides.</p>
    <p><a href="${u("/guides/verification/")}">How far to trust each page →</a></p>
  </article>
  <article class="panel">
    <h2>Bring your own data</h2>
    <p>No HTTP client, no vendor SDK, no <code>node:fs</code>, zero runtime dependencies.
    You write one adapter from your provider's payload and own it; when the vendor changes
    their API you edit that file and the algorithms never move.</p>
    <p><a href="${u("/guides/data-providers/")}">Wiring up a provider →</a></p>
  </article>
  <article class="panel wide">
    <h2>Your coding agent can read all of it</h2>
    <p>The package ships an agent skill, so Claude Code, Codex, Cursor and the rest work from the
    real import paths, warm-up counts and verification tiers instead of guessing at them. It
    bundles a lookup script that answers from the payload you have installed, offline.</p>
    <p><code>${esc(SKILL_INSTALL)}</code></p>
    <p><a href="${u("/guides/agent-skill/")}">What the skill contains →</a></p>
  </article>
</section>

`;

  return shell({
    title: "fintech-algorithms — reference documentation",
    description: `Reference for ${counts.topics} zero-dependency TypeScript implementations of market-data, corporate-action, index, breadth and technical-indicator algorithms.`,
    canonical: `${SITE}/`,
    body,
    wide: true,
  });
}

// ------------------------------------------------------------- domain page

function renderDomain(payload, domain) {
  const topics = payload.topics.filter((t) => t.taxonomy.domainId === domain.id);
  const slug = domainSlug(topics[0]);

  const sections = domain.families
    .map((f) => {
      const inFamily = topics.filter((t) => t.taxonomy.familyId === f.id);
      return `<section class="family">
  <h2><a href="${u(`/${slug}/${esc(familySlug(inFamily[0]))}/`)}">${esc(f.name)}</a></h2>
  <ul class="topics">
    ${inFamily
      .map(
        (t) => `<li>
      <a class="name" href="${u(`/${esc(t.path)}/`)}">${esc(t.name)}</a>
      ${badge(t)}
      <code class="sig">${esc(t.import.signature)}</code>
    </li>`,
      )
      .join("\n    ")}
  </ul>
</section>`;
    })
    .join("\n");

  return shell({
    title: `${domain.name} — fintech-algorithms`,
    description: `${domain.topicCount} algorithms across ${domain.families.length} families: ${domain.families
      .map((f) => f.name)
      .join(", ")}.`,
    canonical: `${SITE}/${slug}/`,
    wide: true,
    nav: sidebar(payload, { currentPath: topics[0].path, u }),
    alternates: [
      {
        href: `${SITE}/${slug}/llms.txt`,
        type: "text/plain",
        title: `Index of every algorithm in ${domain.name}, for agents`,
      },
    ],
    breadcrumbs: [{ label: "Reference", href: u("/reference/") }, { label: domain.name }],
    body: `<h1>${esc(domain.name)}</h1>
<p class="lede">${plural(domain.topicCount, "algorithm")} · ${families(domain.families.length)} · <code>${esc(
      domain.id,
    )}</code></p>
<p class="machine-line">Reading this with a program?
<a href="${u(`/${slug}/llms.txt`)}">${esc(slug)}/llms.txt</a> lists all
${plural(domain.topicCount, "algorithm")} here — signature, shape and verification tier, one line each.
Every reference page below also exists as markdown at <code>&lt;page URL&gt;index.md</code>.</p>
${sections}`,
  });
}

// ------------------------------------------------------- example rendering

const ORIGIN = {
  fixture: {
    label: "verified",
    note: "This is the worked example published in the article, replayed by the test suite on every run. The output cannot drift.",
  },
  executed: {
    label: "executed",
    note: "Captured by running this function on the input its own test provides. Real output of real code — but not asserted against a published figure.",
  },
  derived: {
    label: "executed",
    note: "This entry is a thin wrapper its test never calls directly, so it was invoked with the arguments its shared implementation received. Real output, not asserted against a published figure.",
  },
};

function elisionNote(elided) {
  if (!elided) return "";
  return elided.kind === "array"
    ? `<p class="elision">Showing ${elided.shown} of ${elided.total} elements.</p>`
    : `<p class="elision">Showing ${elided.shown} of ${elided.total} fields.</p>`;
}

function renderExample(t) {
  const ex = t.example;
  if (!ex) {
    return `<h2>Worked example</h2>
<p class="hint">No runnable example is available for this topic yet. The article works
the calculation through by hand.</p>
<p><a class="cta" href="${esc(t.links.article)}">Read the worked example →</a></p>`;
  }

  const origin = ORIGIN[ex.origin] ?? ORIGIN.executed;
  const params = t.import.params;

  const inputs = ex.args
    .map((a, i) => {
      const name = params[i] ?? `argument ${i + 1}`;
      return `${codeBlock(name, pretty(a.value), "json")}${elisionNote(a.elided)}`;
    })
    .join("\n");

  return `<h2>Worked example</h2>
<p class="origin ${esc(ex.origin)}"><span class="badge ${
    ex.verified ? "verified" : "executed"
  }">${esc(origin.label)}</span> ${esc(origin.note)}</p>

<h3>Input</h3>
${inputs}

<h3>Call</h3>
${codeBlock(null, `${t.import.entry}(${params.join(", ")})`, "ts")}

<h3>Returns</h3>
<p class="shape">${esc(ex.outputShape)}</p>
${codeBlock(null, pretty(ex.output), "json")}
${elisionNote(ex.outputElided)}`;
}

// -------------------------------------------------------------- topic page

function renderTopic(payload, t) {
  const parts = [];

  parts.push(`<h1>${esc(t.name)}</h1>`);
  if (t.headline) parts.push(`<p class="lede">${esc(t.headline)}</p>`);

  parts.push(`<h2>Install and import</h2>
${codeBlock("bash", "npm install fintech-algorithms", "bash")}
${codeBlock("ts", `import { ${t.import.entry} } from "${t.import.subpath}";`, "ts")}`);

  parts.push(`<h2>Signature</h2>
${codeBlock(null, t.import.signature, "ts")}`);

  if (t.api) {
    if (t.api.summary) parts.push(`<p>${md(t.api.summary)}</p>`);

    if (t.api.params.length) {
      parts.push(`<h3>Parameters</h3>
<div class="table-scroll"><table class="params">
  <thead><tr><th>Name</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
${t.api.params
  .map((p) => {
    const notes = [
      p.description ? md(p.description) : "",
      p.constraints
        ? `<span class="constraint">${Object.entries(p.constraints)
            .map(([k, v]) => `${esc(k)}: ${esc(v)}`)
            .join(" · ")}</span>`
        : "",
      p.nulls ? `<span class="constraint">nulls: ${esc(p.nulls)}</span>` : "",
      p.required === false ? `<span class="constraint">optional</span>` : "",
    ]
      .filter(Boolean)
      .join("<br>");
    return `    <tr><td><code>${esc(p.name)}</code></td><td><code>${esc(
      p.type ?? "—",
    )}</code></td><td>${notes}</td></tr>`;
  })
  .join("\n")}
  </tbody>
</table></div>`);
    }

    if (t.api.returns) {
      parts.push(`<h3>Returns</h3>
<p><code>${esc(t.api.returns.type ?? "—")}</code>${
        t.api.returns.length ? ` · length ${esc(t.api.returns.length)}` : ""
      }</p>${t.api.returns.description ? `\n<p>${md(t.api.returns.description)}</p>` : ""}`);
    }

    if (t.api.warmup) {
      parts.push(`<h3>Warm-up</h3>
<p>The first <code>${esc(t.api.warmup.count)}</code> positions are <code>${esc(
        t.api.warmup.value,
      )}</code>.${t.api.warmup.note ? ` ${md(t.api.warmup.note)}` : ""}</p>`);
    }

    if (t.api.errors?.length) {
      parts.push(`<h3>Errors</h3>
<ul class="errors">
${t.api.errors.map((e) => `  <li>When ${md(e.when)} — ${md(e.behaviour)}</li>`).join("\n")}
</ul>`);
    }

    if (t.api.complexity) {
      parts.push(`<p class="hint">Complexity: time <code>${esc(t.api.complexity.time)}</code>,
      space <code>${esc(t.api.complexity.space)}</code>.</p>`);
    }
  }

  parts.push(renderExample(t));

  if (t.import.exports.length > 1) {
    parts.push(`<h2>Other exports</h2>
<p>This module also exports
${t.import.exports
  .filter((e) => e !== t.import.entry)
  .map((e) => `<code>${esc(e)}</code>`)
  .join(", ")}. Every module additionally exports <code>run</code> as an alias of its
primary function, and a <code>meta</code> object carrying its catalog id, domain, family,
shape and article URL.</p>`);
  }

  if (t.assets.diagrams.length) {
    parts.push(`<h2>Diagrams</h2>
${t.assets.diagrams
  .map(
    (d) =>
      `<figure class="diagram"><img loading="lazy" src="${esc(d.url)}" alt="${esc(t.name)} — ${esc(
        d.file.replace(/\.svg$/, "").replace(/-/g, " "),
      )}"></figure>`,
  )
  .join("\n")}`);
  }

  if (t.assets.mermaid.length) {
    parts.push(`<h2>Calculation flow</h2>
${t.assets.mermaid
  .map(
    (m) => `<details class="flow">
  <summary>${esc(m.caption ?? "Diagram")}</summary>
  <pre class="mermaid">${esc(m.source)}</pre>
</details>`,
  )
  .join("\n")}`);
  }

  parts.push(`<h2>How it works</h2>
<p>This page states the <strong>contract</strong> — how to call it correctly. The article
explains the <strong>concept</strong>: why it works, and where it breaks.</p>
<p><a class="cta" href="${esc(t.links.article)}">Read the article →</a></p>`);

  if (t.references.length) {
    parts.push(`<h2>References</h2>
<ul class="refs">
${t.references
  .map(
    (r) =>
      `  <li>${r.url ? `<a href="${esc(r.url)}">${esc(r.title)}</a>` : esc(r.title)}${
        r.author ? ` — <span>${esc(r.author)}</span>` : ""
      }</li>`,
  )
  .join("\n")}
</ul>`);
  }

  parts.push(relatedTopics(payload, t));

  const rail = `<aside class="rail">
  <dl>
    <dt>Verification</dt><dd>${badge(t)}</dd>
    <dt>Catalog id</dt><dd><code>${esc(t.id)}</code></dd>
    <dt>Domain</dt><dd><a href="${u(`/${domainSlug(t)}/`)}">${esc(t.taxonomy.domain)}</a></dd>
    <dt>Family</dt><dd><a href="${u(`/${domainSlug(t)}/#${familySlug(t)}`)}">${esc(t.taxonomy.family)}</a></dd>
    <dt>Shape</dt><dd><code>${esc(t.import.archetype)}</code></dd>
    <dt>Difficulty</dt><dd>${t.taxonomy.difficulty} / 5</dd>
  </dl>
  <ul class="links">
    <li><a href="${esc(t.links.source)}">Source on GitHub</a></li>
    ${t.links.repo ? `<li><a href="${esc(t.links.repo)}">Standalone repository</a></li>` : ""}
    <li><a href="${esc(t.links.article)}">Article</a></li>
    <li><a href="${esc(t.links.npm)}">Package on npm</a></li>
  </ul>
  <ul class="links machine">
    <li><a href="${u(`/${t.path}/index.md`)}">This page as markdown</a></li>
    <li><a href="${u(`/${domainSlug(t)}/llms.txt`)}">${esc(t.taxonomy.domain)} index (llms.txt)</a></li>
    <li><a href="${u("/guides/agent-skill/")}">Agent skill — read this from your agent</a></li>
  </ul>
</aside>`;

  return shell({
    title: `${t.name} — fintech-algorithms`,
    description: `${t.name}${t.headline ? `: ${t.headline}` : ""}. Signature, parameters, worked example and import path for ${t.import.subpath}.`,
    canonical: `${SITE}/${t.path}/`,
    mermaid: t.assets.mermaid.length > 0,
    wide: true,
    nav: sidebar(payload, { currentPath: t.path, u }),
    aside: rail,
    alternates: machineLinks(t),
    provenance: provenanceBlock(payload, t),
    breadcrumbs: [
      { label: "Reference", href: u("/reference/") },
      { label: t.taxonomy.domain, href: u(`/${domainSlug(t)}/`) },
      { label: t.taxonomy.family, href: u(`/${domainSlug(t)}/${familySlug(t)}/`) },
      { label: t.name },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: `${t.name}${t.headline ? ` — ${t.headline}` : ""}`,
      description: t.api?.summary ?? t.headline ?? t.name,
      url: `${SITE}/${t.path}/`,
      inLanguage: "en",
      author: { "@type": "Organization", name: "The Fintech Builder", url: ARTICLES },
      publisher: { "@type": "Organization", name: "The Fintech Builder", url: ARTICLES },
      about: {
        "@type": "SoftwareSourceCode",
        name: t.name,
        programmingLanguage: "TypeScript",
        codeRepository: GITHUB,
      },
      citation: t.references
        .filter((r) => r.url)
        .map((r) => ({ "@type": "CreativeWork", name: r.title, url: r.url })),
    },
    body: `<article class="doc">\n${parts.join("\n\n")}\n</article>`,
  });
}

/**
 * Siblings in the same family, in reading order, with the neighbours either
 * side. Families are ordered pedagogically — reading D01-F01 in sequence *is*
 * the bar-construction tutorial — and nothing else on the page said so.
 */
function relatedTopics(payload, t) {
  const family = payload.topics.filter((x) => x.taxonomy.familyId === t.taxonomy.familyId);
  const i = family.findIndex((x) => x.id === t.id);
  const prev = family[i - 1];
  const next = family[i + 1];
  const others = family.filter((x) => x.id !== t.id);

  const firstSentence = (x) => {
    const text = x.api?.summary ?? x.headline ?? "";
    const cut = text.split(/(?<=\.)\s/)[0] ?? text;
    return cut.length > 130 ? `${cut.slice(0, 127)}…` : cut;
  };

  const siblings = others.length
    ? `<h2>The rest of the ${esc(t.taxonomy.family)} family</h2>
<ul class="related">
${others
  .map((x) => `  <li><a href="${u(`/${x.path}/`)}">${esc(x.name)}</a><span>${md(firstSentence(x))}</span></li>`)
  .join("\n")}
</ul>`
    : "";

  const pager =
    prev || next
      ? `<nav class="pager" aria-label="Within this family">
  ${prev ? `<a class="prev" href="${u(`/${prev.path}/`)}"><span>Previous</span>${esc(prev.name)}</a>` : `<span></span>`}
  ${next ? `<a class="next" href="${u(`/${next.path}/`)}"><span>Next</span>${esc(next.name)}</a>` : `<span></span>`}
</nav>`
      : "";

  return `${siblings}\n${pager}`;
}

/**
 * How this page was produced.
 *
 * Google's helpful-content guidance asks who made a page, how, and why a reader
 * should trust it. For generated documentation that is answerable precisely
 * rather than with a boilerplate byline: the package version, where the example
 * came from, and whether an independent published source asserts it.
 */
function provenanceBlock(payload, t) {
  const origin =
    t.example?.origin === "fixture"
      ? "replayed from the worked example published in its article, and asserted by the test suite on every run"
      : t.example
        ? "captured by executing this function on the input its own test supplies"
        : "not available for this topic yet";

  return `<aside class="provenance">
  <h2>How this page was produced</h2>
  <p>Generated from the <code>docs.json</code> payload shipped inside
  <a href="${NPM}">fintech-algorithms@${esc(payload.package.version)}</a>. The signature and the
  parameter list are checked against the compiled implementation at build time, so a description
  that contradicts the code fails the build rather than reaching this page.</p>
  <p>The worked example was ${origin}. Nothing here was transcribed by hand.</p>
  <p class="meta-line"><a href="${esc(t.links.source)}">Implementation source</a> ·
  <a href="${GITHUB}/blob/main/docs.json">reference payload</a> ·
  maintained by <a href="${ARTICLES}">The Fintech Builder</a></p>
</aside>`;
}

// ------------------------------------------------- family + reference pages

/**
 * Family pages: the level that was missing.
 *
 * Domain and topic pages existed, but *family* is the unit people actually name
 * — "the McClellan family", "bar construction", "trade classification". A family
 * usually shares one implementation body and one mental model, which is worth
 * saying once rather than never.
 */
function renderFamily(payload, domain, family, topics) {
  const slug = domainSlug(topics[0]);
  const fslug = familySlug(topics[0]);
  const verified = topics.filter((t) => t.verification.tier === "verified").length;
  const shapes = [...new Set(topics.map((t) => t.import.archetype))];

  const body = `<h1>${esc(family.name)}</h1>
<p class="lede">${plural(topics.length, "algorithm")} in ${esc(domain.name)}${
    verified ? ` · ${verified} with asserted arithmetic` : ""
  }.</p>

<h2>In this family</h2>
<ol class="family-list">
${topics
  .map(
    (t) => `  <li>
    <a href="${u(`/${t.path}/`)}">${esc(t.name)}</a> ${badge(t)}
    <p>${md(t.api?.summary ?? t.headline ?? "")}</p>
    <code>${esc(t.import.signature)}</code>
  </li>`,
  )
  .join("\n")}
</ol>

<h2>What they share</h2>
<p>Every topic here is a <code>${esc(shapes.join("</code> or <code>"))}</code>, so once you have
called one the rest follow the same shape. Import paths differ only in the final segment:</p>
${codeBlock(
  "ts",
  topics
    .slice(0, 2)
    .map((t) => `import { ${t.import.entry} } from "${t.import.subpath}";`)
    .join("\n"),
  "ts",
)}
<p>Read them in the order above — the sequence is pedagogical, not alphabetical.</p>

<h2>Where this sits</h2>
<p><a href="${u(`/${slug}/`)}">${esc(domain.name)}</a> collects
${plural(domain.topicCount, "algorithm")} across ${families(domain.families.length)}. For the concept
behind this family rather than the call signatures, see the
<a href="${u("/concepts/")}">concept guides</a>.</p>`;

  return shell({
    title: `${family.name} — ${domain.name} — fintech-algorithms`,
    description: `${topics.length} algorithms in the ${family.name} family: ${topics
      .map((t) => t.name)
      .slice(0, 6)
      .join(", ")}.`,
    canonical: `${SITE}/${slug}/${fslug}/`,
    wide: true,
    nav: sidebar(payload, { currentPath: topics[0].path, u }),
    alternates: [
      {
        href: `${SITE}/${slug}/llms.txt`,
        type: "text/plain",
        title: `Index of every algorithm in ${domain.name}, for agents`,
      },
    ],
    breadcrumbs: [
      { label: "Reference", href: u("/reference/") },
      { label: domain.name, href: u(`/${slug}/`) },
      { label: family.name },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: family.name,
      url: `${SITE}/${slug}/${fslug}/`,
      isPartOf: { "@type": "CollectionPage", name: domain.name, url: `${SITE}/${slug}/` },
      hasPart: topics.map((t) => ({ "@type": "TechArticle", name: t.name, url: `${SITE}/${t.path}/` })),
    },
    body,
  });
}

/** A landing page for the reference half of the site. */
function renderReferenceIndex(payload) {
  const { counts, domains } = payload;
  const body = `<h1>Reference</h1>
<p class="lede">A page for every one of the ${counts.topics} algorithms: signature, parameter
contract, an executed worked example, diagrams and citations. ${counts.withExample} pages carry an
example whose output came from running the code.</p>

<h2>Browse by domain</h2>
<div class="grid">
${domains
  .map((d) => {
    const first = payload.topics.find((t) => t.taxonomy.domainId === d.id);
    return `  <a class="card" href="${u(`/${domainSlug(first)}/`)}">
    <span class="tag">${esc(d.id)}</span>
    <h3>${esc(d.name)}</h3>
    <p>${plural(d.topicCount, "topic")} · ${families(d.families.length)}</p>
  </a>`;
  })
  .join("\n")}
</div>

<h2>How to read a reference page</h2>
<p>Each page states the <strong>contract</strong> — how to call the function correctly. It does not
explain the concept; that is what the <a href="${u("/concepts/")}">concept guides</a> and the
<a href="${ARTICLES}">articles</a> are for. Three sections matter most:</p>
<ul>
  <li><strong>Parameters</strong> — meaning, unit, constraints, and how nulls are treated.</li>
  <li><strong>Warm-up</strong> — how many leading positions are <code>null</code>, and why. Getting
  this wrong shifts a plotted series with no error to warn you.</li>
  <li><strong>Worked example</strong> — real input and the real returned value, labelled with where
  it came from. See <a href="${u("/guides/verification/")}">what &ldquo;verified&rdquo; means</a>.</li>
</ul>`;

  return shell({
    title: "Reference — fintech-algorithms",
    description: `Reference pages for all ${counts.topics} algorithms across ${counts.domains} domains, each with a parameter contract and an executed worked example.`,
    canonical: `${SITE}/reference/`,
    wide: true,
    nav: sidebar(payload, { currentPath: null, u }),
    breadcrumbs: [{ label: "Home", href: u("/") }, { label: "Reference" }],
    body,
  });
}

// ----------------------------------------------------------------- concepts

/**
 * Concept guides: one per domain, explaining the *subject* rather than any one
 * algorithm. This is the layer a generated reference cannot provide — a contract
 * tells you how to call `divisorContinuityAdjustment`, not why an index needs a
 * divisor at all.
 */
const CONCEPTS = [
  {
    slug: "corporate-actions",
    file: "corporate-actions.md",
    domainId: "D02",
    blurb: "Why an unadjusted price series is wrong, and the order adjustments have to be applied in.",
  },
  {
    slug: "index-construction",
    file: "index-construction.md",
    domainId: "D03",
    blurb: "An index is a divisor with marketing attached. Everything else is maintenance.",
  },
  {
    slug: "market-microstructure",
    file: "market-microstructure.md",
    domainId: "D11",
    blurb: "How orders become prices, and what the spread actually costs you.",
  },
  {
    slug: "market-data-engineering",
    file: "market-data-engineering.md",
    domainId: "D01",
    blurb: "Turning a raw tape into something you can compute on without lying to yourself.",
  },
  {
    slug: "market-breadth",
    file: "market-breadth.md",
    domainId: "D04",
    blurb: "The index went up. Did the market? Counting participants instead of watching price.",
  },
];

function renderConcept(payload, concept, source) {
  const heading = mdTitle(source);
  const bodyMd = source.replace(/^#\s+.+$/m, "").trim();
  const domain = payload.domains.find((d) => d.id === concept.domainId);
  const first = payload.topics.find((t) => t.taxonomy.domainId === concept.domainId);

  const footer =
    domain && first
      ? `<h2>The reference pages for this domain</h2>
<p><a href="${u(`/${domainSlug(first)}/`)}">${esc(domain.name)}</a> —
${plural(domain.topicCount, "algorithm")} across ${families(domain.families.length)}, each with a
parameter contract and an executed example.</p>`
      : "";

  return shell({
    title: `${heading} — fintech-algorithms`,
    description: concept.blurb,
    canonical: `${SITE}/concepts/${concept.slug}/`,
    breadcrumbs: [
      { label: "Home", href: u("/") },
      { label: "Concepts", href: u("/concepts/") },
      { label: heading },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: heading,
      description: concept.blurb,
      url: `${SITE}/concepts/${concept.slug}/`,
      inLanguage: "en",
      author: { "@type": "Organization", name: "The Fintech Builder", url: ARTICLES },
      publisher: { "@type": "Organization", name: "The Fintech Builder", url: ARTICLES },
    },
    provenance: `<aside class="provenance">
  <h2>About this guide</h2>
  <p>Written to explain the subject, not to restate the reference. Every code sample runs against the
  published package — <code>npm install fintech-algorithms</code> — and each algorithm it names has a
  <a href="${u("/reference/")}">reference page</a> stating its exact contract.</p>
  <p class="meta-line">Maintained by <a href="${ARTICLES}">The Fintech Builder</a> ·
  <a href="https://github.com/IslamBaraka90/fintech-algorithms-docs/blob/main/content/concepts/${esc(
    concept.file,
  )}">Improve this page</a></p>
</aside>`,
    body: `<article class="doc prose"><h1>${esc(heading)}</h1>\n${markdown(bodyMd)}\n${footer}</article>`,
  });
}

function renderConceptIndex(payload) {
  const cards = CONCEPTS.map((c) => {
    const heading = mdTitle(readFileSync(join(ROOT, "content", "concepts", c.file), "utf8"));
    const domain = payload.domains.find((d) => d.id === c.domainId);
    return `  <a class="card" href="${u(`/concepts/${c.slug}/`)}">
    <span class="tag">${esc(c.domainId)}</span>
    <h3>${esc(heading)}</h3>
    <p>${esc(c.blurb)}</p>
    ${domain ? `<p class="card-meta">${plural(domain.topicCount, "algorithm")}</p>` : ""}
  </a>`;
  }).join("\n");

  return shell({
    title: "Concepts — fintech-algorithms",
    description:
      "Guides to the subjects behind the library: corporate actions, index construction, market microstructure, market data engineering and market breadth.",
    canonical: `${SITE}/concepts/`,
    wide: true,
    breadcrumbs: [{ label: "Home", href: u("/") }, { label: "Concepts" }],
    body: `<h1>Concepts</h1>
<p class="lede">Reference pages state a contract. These explain the subject — what the problem is,
why the standard approaches exist, and where each one breaks.</p>
<div class="grid">
${cards}
</div>

<h2>How this documentation is layered</h2>
<div class="table-scroll"><table>
  <thead><tr><th>Layer</th><th>Answers</th><th>Where</th></tr></thead>
  <tbody>
    <tr><td>Concepts</td><td>What is this subject, and why does it work this way?</td><td>Here</td></tr>
    <tr><td>Guides</td><td>How do I accomplish a specific task?</td><td><a href="${u(
      "/guides/",
    )}">Guides</a></td></tr>
    <tr><td>Reference</td><td>How do I call this function correctly?</td><td><a href="${u(
      "/reference/",
    )}">Reference</a></td></tr>
    <tr><td>Articles</td><td>How does this one algorithm work, step by step?</td><td><a href="${ARTICLES}">thefintechbuilder.com</a></td></tr>
  </tbody>
</table></div>
<p>Each layer links to the next rather than repeating it. A concept guide that re-explained one
algorithm in depth would be competing with its own article for the same reader.</p>`,
  });
}

// ------------------------------------------------------------------ guides

const GUIDES = [
  { file: "start.md", path: "start", blurb: "Install, call your first algorithm, and understand nulls and verdicts." },
  { file: "charting.md", path: "guides/charting", blurb: "Join indicator output to candles without shifting the series." },
  { file: "data-providers.md", path: "guides/data-providers", blurb: "Write the one adapter you own, and validate at the boundary." },
  { file: "archetypes.md", path: "guides/archetypes", blurb: "Five input shapes cover all of it. Learn one and the rest follow." },
  { file: "verification.md", path: "guides/verification", blurb: "What the badges mean and where each example came from." },
  { file: "ai-agents.md", path: "guides/ai-agents", blurb: "Reading this library from an agent: what to fetch, in what order, and how far to trust it." },
  { file: "agent-skill.md", path: "guides/agent-skill", blurb: "Install the skill and let your coding agent use the library correctly." },
];

/*
 * Guides are prose, but a good deal of what they assert is payload data — how
 * many topics there are, how the two verification tiers divide them, how many
 * topics share an archetype. A number typed into prose goes stale silently and
 * nothing catches it, so a guide writes `{{topics}}` or `{{row-classify}}` and
 * the build fills it in. `contract` is the one derived value: the payload counts
 * the verified topics and the rest are the other tier by definition. An unknown
 * token fails the build rather than reaching the page as literal braces.
 */
function fillCounts(source, payload) {
  const { counts, archetypes } = payload;
  const values = {
    ...counts,
    contract: counts.topics - counts.verified,
    ...Object.fromEntries(archetypes.map((a) => [a.name, a.topicCount])),
  };
  return source.replace(/\{\{([\w-]+)\}\}/g, (token, key) => {
    if (!(key in values)) throw new Error(`Unknown count token ${token} in a guide`);
    return String(values[key]);
  });
}

function renderGuide(guide, source, payload) {
  const filled = fillCounts(source, payload);
  const heading = mdTitle(filled);
  const bodyMd = filled.replace(/^#\s+.+$/m, "").trim();
  const isStart = guide.path === "start";
  return shell({
    title: `${heading} — fintech-algorithms`,
    description: guide.blurb,
    canonical: `${SITE}/${guide.path}/`,
    breadcrumbs: isStart
      ? [{ label: "Reference", href: u("/") }, { label: heading }]
      : [{ label: "Reference", href: u("/") }, { label: "Guides", href: u("/guides/") }, { label: heading }],
    body: `<article class="doc prose"><h1>${esc(heading)}</h1>\n${markdown(bodyMd)}</article>`,
  });
}

function renderGuideIndex() {
  // The skill leads: it is the one page that changes how every other page here
  // gets read, and an agent that installs it needs none of the rest by hand.
  const items = GUIDES.filter((g) => g.path !== "start")
    .sort((a, b) => (a.path === "guides/agent-skill" ? -1 : b.path === "guides/agent-skill" ? 1 : 0))
    .map(
      (g) => `<a class="card" href="${u(`/${g.path}/`)}">
    <h3>${esc(mdTitle(readFileSync(join(ROOT, "content", g.file), "utf8")))}</h3>
    <p>${esc(g.blurb)}</p>
  </a>`,
    )
    .join("\n  ");

  return shell({
    title: "Guides — fintech-algorithms",
    description: "Task-shaped guides: plotting indicators, wiring a data provider, and how far to trust each page.",
    canonical: `${SITE}/guides/`,
    breadcrumbs: [{ label: "Reference", href: u("/") }, { label: "Guides" }],
    body: `<h1>Guides</h1>
<p class="lede">Reference pages state the contract for one algorithm. These are the
cross-cutting things you need once, and then never again.</p>
<p>New here? Start with the <a href="${u("/start/")}">quick start</a>. Working with a coding
agent? <a href="${u("/guides/agent-skill/")}">Install the skill</a> — it carries everything on
this page, and looks the contracts up rather than guessing at them.</p>
<div class="grid">
  ${items}
</div>`,
  });
}

// ----------------------------------------------------------------- machine

/*
 * Everything below is written for a program, not a person.
 *
 * The governing constraint is that an agent pays for every byte it reads. A
 * single 60 KB index that answers one question about one algorithm is a bad
 * trade, so the machine surface is layered: a root index that is mostly a
 * routing map, a per-domain slice small enough to read whole, and a per-topic
 * markdown page an order of magnitude cheaper than the HTML it mirrors.
 *
 * Every URL here is absolute. These files are fetched out of context, often
 * from a cache, and a root-relative link in one is unresolvable.
 */

/** Slice URL for a domain. Needs a topic because the slug lives on the path. */
const domainLlms = (payload, d) =>
  `${SITE}/${domainSlug(payload.topics.find((t) => t.taxonomy.domainId === d.id))}/llms.txt`;

/** One tier, one sentence — for pages that carry a tier rather than explain both. */
const TIER_MEANING = {
  verified:
    "The worked example below is the figure published in this algorithm's article, replayed and " +
    "asserted by the test suite on every build. The arithmetic cannot drift without the build failing.",
  contract:
    "The module loads, the entry point is callable and its declared signature matches the compiled " +
    "code. The example below is real captured output, but no independently published figure asserts " +
    "the numbers.",
};

/** What the two tiers license you to assume. Spelled out, not hinted at. */
const tierLegend = () => [
  `Verification tiers:`,
  `- verified — the worked example is the figure published in the algorithm's article, replayed`,
  `  and asserted by the test suite on every run. The arithmetic cannot drift without the build`,
  `  failing. Treat the numbers as reproducible.`,
  `- contract — the module loads, the entry point is callable and its declared signature matches`,
  `  the compiled code. The example is real captured output, but no independently published`,
  `  figure asserts it. Treat the shape as reliable and the numbers as unattested.`,
  `Full explanation: ${SITE}/guides/verification/`,
];

/**
 * One topic, one line.
 *
 * The archetype is the highest-value field here: it names the input shape class
 * — `series-transform` takes `number[]`, `tape-aggregate` takes trades — so an
 * agent can rule a topic in or out without fetching anything at all.
 *
 * The import subpath is deliberately *not* on the line. It is the docs URL with
 * one prefix swapped, and printing both put the topic path — over 100 characters
 * in the longer domains — on every line twice. Removing the duplicate is what
 * brings the largest slice inside its size budget, and the derivation is stated
 * once at the top of every file that uses these lines.
 */
const entryLine = (t) =>
  `- ${t.name} — \`${t.import.signature}\` — ${t.import.archetype} — ` +
  `${t.verification.tier} — ${SITE}/${t.path}/`;

const ENTRY_KEY = [
  `Each entry: name — signature — archetype — verification tier — docs URL`,
  `From the docs URL, mechanically:`,
  `  import subpath — swap the ${SITE}/ prefix for fintech-algorithms/ and drop the trailing slash`,
  `  markdown page  — append index.md; same contract as the HTML page, a fraction of the bytes`,
];

/**
 * The root index, or a single domain's slice of it.
 *
 * A slice is worthless if finding it costs a read of the whole index, so the
 * root leads with the routing map and each slice links back. Both carry the
 * install line and the payload URL, because either one may be the only file an
 * agent ever reads.
 */
function renderLlms(payload, domain = null) {
  const { counts, package: pkg } = payload;
  const common = [
    `Install: npm install fintech-algorithms`,
    `Agent skill (install it rather than re-deriving this file): ${SKILL_INSTALL}`,
    `  what it is: ${SITE}/guides/agent-skill/`,
    `Source: fintech-algorithms@${pkg.version} · payload schema ${payload.schemaVersion}`,
    `Reference payload: ${SITE}/reference/payload.json`,
    `Version endpoint: ${SITE}/version.json`,
  ];

  if (domain) {
    const topics = payload.topics.filter((t) => t.taxonomy.domainId === domain.id);
    const slug = domainSlug(topics[0]);
    const verified = topics.filter((t) => t.verification.tier === "verified").length;

    const lines = [
      `# ${domain.name} — fintech-algorithms`,
      ``,
      `> ${plural(topics.length, "algorithm")} in ${families(domain.families.length)}, sliced out of the`,
      `> fintech-algorithms reference. Zero-dependency TypeScript: plain arrays and objects in,`,
      `> plain values out. This file covers ${domain.id} only.`,
      ``,
      `${domain.id} · ${plural(topics.length, "topic")} · ${families(domain.families.length)} · ${verified} verified`,
      ...common,
      `Domain page: ${SITE}/${slug}/`,
      `Full index (${counts.topics} topics across ${counts.domains} domains): ${SITE}/llms.txt`,
      ``,
      ...tierLegend(),
      ``,
      ...ENTRY_KEY,
      ``,
    ];

    for (const f of domain.families) {
      const inFamily = topics.filter((t) => t.taxonomy.familyId === f.id);
      lines.push(`## ${f.id} — ${f.name}`, `${SITE}/${slug}/${familySlug(inFamily[0])}/`, ``);
      for (const t of inFamily) lines.push(entryLine(t));
      lines.push(``);
    }
    return lines.join("\n");
  }

  const lines = [
    `# fintech-algorithms`,
    ``,
    `> ${counts.topics} zero-dependency TypeScript implementations of market-data,`,
    `> corporate-action, index-construction, market-breadth, chart-pattern,`,
    `> statistical-time-series and technical-indicator algorithms. Provider-agnostic:`,
    `> plain arrays and objects in, plain values out. Import paths mirror article URLs.`,
    ``,
    `${counts.topics} topics · ${counts.domains} domains · ${counts.families} families · ` +
      `${counts.verified} verified · ${counts.withExample} with a worked example`,
    ...common,
    `Reference payload (published release): https://unpkg.com/fintech-algorithms@${pkg.version}/docs.json`,
    `Quick start: ${SITE}/start/`,
    `Using this from an agent: ${SITE}/guides/ai-agents/`,
    ``,
    `## Per-domain indexes`,
    ``,
    `Each slice below repeats this header and lists only its own domain. Fetch one of these`,
    `instead of this file once you know the domain — they are a fraction of the size.`,
    ``,
    ...payload.domains.map(
      (d) => `- ${d.id} — ${d.name} — ${plural(d.topicCount, "topic")} — ${domainLlms(payload, d)}`,
    ),
    ``,
    `## Guides`,
    ``,
    ...GUIDES.map((g) => `- ${mdTitle(readFileSync(join(ROOT, "content", g.file), "utf8"))} — ${g.blurb} — ${SITE}/${g.path}/`),
    `- Concepts index — one guide per domain, explaining the subject rather than the API — ${SITE}/concepts/`,
    ``,
    ...tierLegend(),
    ``,
    `## Topics`,
    ``,
    ...ENTRY_KEY,
    ``,
  ];

  for (const d of payload.domains) {
    lines.push(`### ${d.id} — ${d.name}`, `Domain slice: ${domainLlms(payload, d)}`, ``);
    for (const t of payload.topics.filter((x) => x.taxonomy.domainId === d.id)) lines.push(entryLine(t));
    lines.push(``);
  }
  return lines.join("\n");
}

/**
 * The markdown twin of a topic page.
 *
 * Generated from the payload rather than converted from the rendered HTML: the
 * HTML carries a sidebar of 324 links, a rail, breadcrumbs and a nav tree, none
 * of which mean anything to a reader that only wants the call signature. Going
 * back to the source drops a 74 KB page to a few kilobytes without deciding,
 * tag by tag, what to throw away.
 *
 * Sections mirror `renderTopic` in the same order, so a reader who has seen one
 * form recognises the other.
 */
function renderTopicMarkdown(payload, t) {
  // A newline or a pipe inside a description would silently break the row.
  const cell = (s) => String(s ?? "").replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|").trim();
  const fence = (lang, body) => ["```" + lang, body, "```"].join("\n");
  const L = [];

  L.push(`# ${t.name}`, ``);
  if (t.headline) L.push(`> ${t.headline}`, ``);
  L.push(
    `\`${t.id}\` · ${t.taxonomy.domain} → ${t.taxonomy.family} · archetype \`${t.import.archetype}\` · ` +
      `difficulty ${t.taxonomy.difficulty}/5 · verification **${t.verification.tier}**`,
    ``,
    `Full page: ${SITE}/${t.path}/`,
    `Agent skill: \`${SKILL_INSTALL}\` — ${SITE}/guides/agent-skill/`,
    ``,
  );

  L.push(`## Install and import`, ``, fence("bash", `npm install fintech-algorithms`), ``);
  L.push(fence("ts", `import { ${t.import.entry} } from "${t.import.subpath}";`), ``);

  L.push(`## Signature`, ``, fence("ts", t.import.signature), ``);

  if (t.api?.summary) L.push(t.api.summary, ``);

  if (t.api?.params.length) {
    L.push(`## Parameters`, ``, `| Name | Type | Required | Notes |`, `| --- | --- | --- | --- |`);
    for (const p of t.api.params) {
      const notes = [
        p.description ?? "",
        p.constraints
          ? Object.entries(p.constraints)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ")
          : "",
        p.nulls ? `nulls: ${p.nulls}` : "",
        p.default != null ? `default: ${JSON.stringify(p.default)}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      L.push(
        `| \`${cell(p.name)}\` | \`${cell(p.type ?? "—")}\` | ${p.required === false ? "no" : "yes"} | ${cell(notes)} |`,
      );
    }
    L.push(``);
  }

  if (t.api?.returns) {
    L.push(
      `## Returns`,
      ``,
      `\`${t.api.returns.type ?? "—"}\`${t.api.returns.length ? ` · length ${t.api.returns.length}` : ""}`,
      ``,
    );
    if (t.api.returns.description) L.push(t.api.returns.description, ``);
  }

  if (t.api?.warmup) {
    L.push(
      `## Warm-up`,
      ``,
      `The first \`${t.api.warmup.count}\` positions are \`${t.api.warmup.value}\`.` +
        (t.api.warmup.note ? ` ${t.api.warmup.note}` : ""),
      ``,
    );
  }

  if (t.api?.errors?.length) {
    L.push(`## Errors`, ``, ...t.api.errors.map((e) => `- When ${e.when} — ${e.behaviour}`), ``);
  }

  if (t.api?.complexity) {
    L.push(`## Complexity`, ``, `Time \`${t.api.complexity.time}\`, space \`${t.api.complexity.space}\`.`, ``);
  }

  L.push(`## Worked example`, ``);
  if (!t.example) {
    L.push(`No runnable example is available for this topic yet. The article works the`, `calculation through by hand: ${t.links.article}`, ``);
  } else {
    const ex = t.example;
    L.push((ORIGIN[ex.origin] ?? ORIGIN.executed).note, ``, `### Input`, ``);
    ex.args.forEach((a, i) => {
      L.push(`\`${t.import.params[i] ?? `argument ${i + 1}`}\`:`, ``, fence("json", pretty(a.value)), ``);
      if (a.elided) {
        L.push(
          a.elided.kind === "array"
            ? `Showing ${a.elided.shown} of ${a.elided.total} elements.`
            : `Showing ${a.elided.shown} of ${a.elided.total} fields.`,
          ``,
        );
      }
    });
    L.push(`### Call`, ``, fence("ts", `${t.import.entry}(${t.import.params.join(", ")})`), ``);
    L.push(`### Returns`, ``, `${ex.outputShape}`, ``, fence("json", pretty(ex.output)), ``);
    if (ex.outputElided) {
      L.push(
        ex.outputElided.kind === "array"
          ? `Showing ${ex.outputElided.shown} of ${ex.outputElided.total} elements.`
          : `Showing ${ex.outputElided.shown} of ${ex.outputElided.total} fields.`,
        ``,
      );
    }
  }

  if (t.import.exports.length > 1) {
    L.push(
      `## Other exports`,
      ``,
      `${t.import.exports
        .filter((e) => e !== t.import.entry)
        .map((e) => `\`${e}\``)
        .join(", ")}. Every module additionally exports \`run\` as an alias of its primary`,
      `function, and a \`meta\` object carrying its catalog id, domain, family, shape and article URL.`,
      ``,
    );
  }

  L.push(
    `## Verification and provenance`,
    ``,
    `Tier: **${t.verification.tier}**${t.verification.via ? ` (via ${t.verification.via})` : ""}.`,
    ``,
    TIER_MEANING[t.verification.tier] ?? TIER_MEANING.contract,
    ``,
    `Both tiers guarantee the signature. Full explanation: ${SITE}/guides/verification/`,
    ``,
    `Generated from the docs.json payload shipped inside fintech-algorithms@${payload.package.version}.`,
    `The signature and parameter list are checked against the compiled implementation at build time,`,
    `so a description that contradicts the code fails the build rather than reaching this file.`,
    ``,
  );

  L.push(
    `## Links`,
    ``,
    `- Article (how it works, step by step): ${t.links.article}`,
    `- Implementation source: ${t.links.source}`,
    ...(t.links.repo ? [`- Standalone repository: ${t.links.repo}`] : []),
    `- Package on npm: ${t.links.npm}`,
    `- Domain index for agents: ${SITE}/${domainSlug(t)}/llms.txt`,
    ``,
  );

  return L.join("\n");
}

const renderSitemap = (payload) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[
  `${SITE}/`,
  `${SITE}/reference/`,
  `${SITE}/concepts/`,
  ...CONCEPTS.map((c) => `${SITE}/concepts/${c.slug}/`),
  ...GUIDES.map((g) => `${SITE}/${g.path}/`),
  `${SITE}/guides/`,
  ...payload.domains.flatMap((d) => {
    const first = payload.topics.find((t) => t.taxonomy.domainId === d.id);
    return d.families.map((f) => {
      const inFamily = payload.topics.filter((t) => t.taxonomy.familyId === f.id);
      return `${SITE}/${domainSlug(first)}/${familySlug(inFamily[0])}/`;
    });
  }),
  ...payload.domains.map(
    (d) => `${SITE}/${domainSlug(payload.topics.find((t) => t.taxonomy.domainId === d.id))}/`,
  ),
  ...payload.topics.map((t) => `${SITE}/${t.path}/`),
]
  .map((loc) => `  <url><loc>${loc}</loc></url>`)
  .join("\n")}
</urlset>
`;

// -------------------------------------------------------------------- main

const { payload, raw: payloadRaw } = await loadPayload();
PAYLOAD_COUNT = payload.counts.topics;

if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });

write("index.html", renderHome(payload));

for (const guide of GUIDES) {
  write(
    `${guide.path}/index.html`,
    renderGuide(guide, readFileSync(join(ROOT, "content", guide.file), "utf8"), payload),
  );
}
write("guides/index.html", renderGuideIndex());

for (const concept of CONCEPTS) {
  write(
    `concepts/${concept.slug}/index.html`,
    renderConcept(payload, concept, readFileSync(join(ROOT, "content", "concepts", concept.file), "utf8")),
  );
}
write("concepts/index.html", renderConceptIndex(payload));
write("reference/index.html", renderReferenceIndex(payload));

for (const domain of payload.domains) {
  const first = payload.topics.find((t) => t.taxonomy.domainId === domain.id);
  write(`${domainSlug(first)}/index.html`, renderDomain(payload, domain));
  write(`${domainSlug(first)}/llms.txt`, renderLlms(payload, domain));

  for (const family of domain.families) {
    const inFamily = payload.topics.filter((t) => t.taxonomy.familyId === family.id);
    write(
      `${domainSlug(first)}/${familySlug(inFamily[0])}/index.html`,
      renderFamily(payload, domain, family, inFamily),
    );
  }
}

for (const topic of payload.topics) {
  write(`${topic.path}/index.html`, renderTopic(payload, topic));
  write(`${topic.path}/index.md`, renderTopicMarkdown(payload, topic));
}

// The search index used to be embedded in the home page, which made search
// unreachable from the 289 pages a reader is actually on. Now it is fetched once
// and cached by the browser.
write(
  "search-index.json",
  JSON.stringify(
    payload.topics.map((t) => ({
      n: t.name,
      p: t.path,
      d: t.taxonomy.domain,
      f: t.taxonomy.family,
      v: t.verification.tier === "verified",
    })),
  ),
);

/*
 * The payload, republished from this site.
 *
 * It was previously advertised only as `unpkg.com/fintech-algorithms@<version>/docs.json`,
 * which is a URL that goes stale the moment the version in a cached copy of
 * llms.txt no longer exists — a dangling 404 by construction. The self-hosted
 * copy is the exact bytes this build consumed, so it cannot disagree with the
 * pages around it. The versioned name is the permanent one; the unversioned name
 * is what everything links to.
 */
write("reference/payload.json", payloadRaw);
write(`reference/payload-${payload.package.version}.json`, payloadRaw);

/*
 * "Do the docs I am reading describe the package I have installed?" — one
 * sub-kilobyte fetch, rather than parsing a changelog or downloading 2.5 MB of
 * payload to read four fields off the top of it.
 */
write(
  "version.json",
  JSON.stringify({
    schemaVersion: payload.schemaVersion,
    package: payload.package,
    counts: payload.counts,
  }),
);

write("llms.txt", renderLlms(payload));
write("sitemap.xml", renderSitemap(payload));
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
write("CNAME", "docs.thefintechbuilder.com\n");
write(".nojekyll", "");
cpSync(join(ROOT, "assets"), join(DIST, "assets"), { recursive: true });

const pages = readdirSync(DIST, { recursive: true }).filter((f) => String(f).endsWith("index.html")).length;
console.log(
  `built ${pages} pages from fintech-algorithms@${payload.package.version} — ` +
    `${payload.counts.withExample} worked examples`,
);
