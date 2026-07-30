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
 *   node build.mjs                       # latest from unpkg
 *   node build.mjs --version 0.5.0       # a specific release
 *   node build.mjs --payload ../path/docs.json
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { markdown, title as mdTitle } from "./lib/markdown.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, "dist");

const SITE = "https://docs.thefintechbuilder.com";
const ARTICLES = "https://thefintechbuilder.com";
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

async function loadPayload() {
  const local = arg("--payload", null);
  if (local) {
    console.log(`payload: ${local}`);
    return JSON.parse(readFileSync(resolve(local), "utf8"));
  }
  const version = arg("--version", "latest");
  const url = `https://unpkg.com/fintech-algorithms@${version}/docs.json`;
  console.log(`payload: ${url}`);
  const res = await fetch(url);
  // A partial site is worse than no deploy: fail loudly rather than fall back.
  if (!res.ok) throw new Error(`payload fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
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
const families = (n) => `${n} ${n === 1 ? "family" : "families"}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const codeBlock = (label, body, cls = "") =>
  `<figure class="code ${cls}">${label ? `<figcaption>${esc(label)}</figcaption>` : ""}<pre><code>${esc(
    body,
  )}</code></pre></figure>`;

// -------------------------------------------------------------- page shell

const NAV = [
  { label: "Quick start", href: "/start/" },
  { label: "Guides", href: "/guides/" },
  { label: "Reference", href: "/#domains" },
];

function shell({ title, description, canonical, body, breadcrumbs = [], jsonLd = null, mermaid = false, wide = false }) {
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
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="${u("/assets/style.css")}">
<script>window.__BASE__=${JSON.stringify(BASE)};</script>
${jsonLd ? `<script type="application/ld+json">${jsonForScript(jsonLd)}</script>` : ""}
</head>
<body${wide ? ' class="wide"' : ""}>
<a class="skip" href="#main">Skip to content</a>
<header class="site">
  <div class="bar">
    <a class="brand" href="${u("/")}">fintech<span>-algorithms</span></a>
    <nav class="primary">${NAV.map((n) => `<a href="${u(n.href)}">${esc(n.label)}</a>`).join("")}</nav>
    <nav class="external">
      <a href="${ARTICLES}">Articles</a>
      <a href="${NPM}">npm</a>
      <a href="${GITHUB}">GitHub</a>
    </nav>
  </div>
</header>
${
  breadcrumbs.length
    ? `<nav class="crumbs" aria-label="Breadcrumb"><div class="inner">${breadcrumbs
        .map((c) => (c.href ? `<a href="${esc(c.href)}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`))
        .join('<i aria-hidden="true">/</i>')}</div></nav>`
    : ""
}
<main id="main">
${body}
</main>
<footer>
  <div class="inner">
    <p>Generated from the <code>docs.json</code> payload published with the package.
    No example on this site was written by hand — every one is the output of running the code.</p>
    <p><a href="${ARTICLES}">The Fintech Builder</a> · <a href="${u("/start/")}">Quick start</a> · <a href="${u(
      "/guides/verification/",
    )}">What “verified” means</a> · <a href="${u("/llms.txt")}">llms.txt</a></p>
  </div>
</footer>
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
    <a class="button ghost" href="${u("/guides/charting/")}">Plot one on a chart</a>
  </div>
  <dl class="stats">
    <div><dt>Topics</dt><dd>${counts.topics}</dd></div>
    <div><dt>Domains</dt><dd>${counts.domains}</dd></div>
    <div><dt>Worked examples</dt><dd>${counts.withExample}</dd></div>
    <div><dt>Verified</dt><dd>${counts.verified}</dd></div>
  </dl>
</section>

<section class="search">
  <label for="q">Search ${counts.topics} algorithms</label>
  <input id="q" type="search" placeholder="split adjustment · McClellan · divisor · ATR · Kalman" autocomplete="off" spellcheck="false">
  <ul id="results" hidden></ul>
</section>

<section id="domains">
  <h2>Browse by domain</h2>
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
</section>

<script src="${u("/assets/search.js")}" defer></script>
<script id="search-index" type="application/json">${jsonForScript(
    payload.topics.map((t) => ({
      n: t.name,
      p: t.path,
      d: t.taxonomy.domain,
      f: t.taxonomy.family,
      v: t.verification.tier === "verified",
    })),
  )}</script>`;

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
  <h2 id="${esc(familySlug(inFamily[0]))}">${esc(f.name)}</h2>
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
    breadcrumbs: [{ label: "Reference", href: u("/") }, { label: domain.name }],
    body: `<h1>${esc(domain.name)}</h1>
<p class="lede">${plural(domain.topicCount, "algorithm")} · ${families(domain.families.length)} · <code>${esc(
      domain.id,
    )}</code></p>
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
      return `${codeBlock(name, pretty(a.value))}${elisionNote(a.elided)}`;
    })
    .join("\n");

  return `<h2>Worked example</h2>
<p class="origin ${esc(ex.origin)}"><span class="badge ${
    ex.verified ? "verified" : "executed"
  }">${esc(origin.label)}</span> ${esc(origin.note)}</p>

<h3>Input</h3>
${inputs}

<h3>Call</h3>
${codeBlock(null, `${t.import.entry}(${params.join(", ")})`)}

<h3>Returns</h3>
<p class="shape">${esc(ex.outputShape)}</p>
${codeBlock(null, pretty(ex.output))}
${elisionNote(ex.outputElided)}`;
}

// -------------------------------------------------------------- topic page

function renderTopic(payload, t) {
  const parts = [];

  parts.push(`<h1>${esc(t.name)}</h1>`);
  if (t.headline) parts.push(`<p class="lede">${esc(t.headline)}</p>`);

  parts.push(`<h2>Install and import</h2>
${codeBlock("bash", "npm install fintech-algorithms")}
${codeBlock("ts", `import { ${t.import.entry} } from "${t.import.subpath}";`)}`);

  parts.push(`<h2>Signature</h2>
${codeBlock(null, t.import.signature)}`);

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
</aside>`;

  return shell({
    title: `${t.name} — fintech-algorithms`,
    description: `${t.name}${t.headline ? `: ${t.headline}` : ""}. Signature, parameters, worked example and import path for ${t.import.subpath}.`,
    canonical: `${SITE}/${t.path}/`,
    mermaid: t.assets.mermaid.length > 0,
    wide: true,
    breadcrumbs: [
      { label: "Reference", href: u("/") },
      { label: t.taxonomy.domain, href: u(`/${domainSlug(t)}/`) },
      { label: t.name },
    ],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: t.name,
      description: t.headline ?? t.name,
      programmingLanguage: "TypeScript",
      codeRepository: GITHUB,
      url: `${SITE}/${t.path}/`,
    },
    body: `<div class="with-rail"><article class="doc">\n${parts.join("\n\n")}\n</article>\n${rail}</div>`,
  });
}

// ------------------------------------------------------------------ guides

const GUIDES = [
  { file: "start.md", path: "start", blurb: "Install, call your first algorithm, and understand nulls and verdicts." },
  { file: "charting.md", path: "guides/charting", blurb: "Join indicator output to candles without shifting the series." },
  { file: "data-providers.md", path: "guides/data-providers", blurb: "Write the one adapter you own, and validate at the boundary." },
  { file: "verification.md", path: "guides/verification", blurb: "What the badges mean and where each example came from." },
];

function renderGuide(guide, source) {
  const heading = mdTitle(source);
  const bodyMd = source.replace(/^#\s+.+$/m, "").trim();
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
  const items = GUIDES.filter((g) => g.path !== "start")
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
<p>New here? Start with the <a href="${u("/start/")}">quick start</a>.</p>
<div class="grid">
  ${items}
</div>`,
  });
}

// ----------------------------------------------------------------- machine

function renderLlms(payload) {
  const lines = [
    `# fintech-algorithms`,
    ``,
    `> ${payload.counts.topics} zero-dependency TypeScript implementations of market-data,`,
    `> corporate-action, index-construction, market-breadth, chart-pattern,`,
    `> statistical-time-series and technical-indicator algorithms. Provider-agnostic:`,
    `> plain arrays and objects in, plain values out. Import paths mirror article URLs.`,
    ``,
    `Install: npm install fintech-algorithms`,
    `Quick start: ${SITE}/start/`,
    `Reference payload: https://unpkg.com/fintech-algorithms@${payload.package.version}/docs.json`,
    ``,
    `Each entry: name — import subpath — signature — verification tier — docs URL`,
    ``,
  ];
  for (const d of payload.domains) {
    lines.push(`## ${d.id} — ${d.name}`, ``);
    for (const t of payload.topics.filter((x) => x.taxonomy.domainId === d.id)) {
      lines.push(
        `- ${t.name} — \`${t.import.subpath}\` — \`${t.import.signature}\` — ${t.verification.tier} — ${SITE}/${t.path}/`,
      );
    }
    lines.push(``);
  }
  return lines.join("\n");
}

const renderSitemap = (payload) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[
  `${SITE}/`,
  ...GUIDES.map((g) => `${SITE}/${g.path}/`),
  `${SITE}/guides/`,
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

const payload = await loadPayload();

if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });

write("index.html", renderHome(payload));

for (const guide of GUIDES) {
  write(`${guide.path}/index.html`, renderGuide(guide, readFileSync(join(ROOT, "content", guide.file), "utf8")));
}
write("guides/index.html", renderGuideIndex());

for (const domain of payload.domains) {
  const first = payload.topics.find((t) => t.taxonomy.domainId === domain.id);
  write(`${domainSlug(first)}/index.html`, renderDomain(payload, domain));
}

for (const topic of payload.topics) {
  write(`${topic.path}/index.html`, renderTopic(payload, topic));
}

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
