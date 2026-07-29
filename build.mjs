#!/usr/bin/env node
/**
 * Build the reference site for `fintech-algorithms` from its published
 * `docs.json` payload.
 *
 * The payload is the only input. It ships inside the npm tarball, so every
 * released version is permanently addressable at
 * `unpkg.com/fintech-algorithms@x.y.z/docs.json` — this site therefore needs no
 * access to the private catalog, no build coupling to the library, and no
 * cross-repository token.
 *
 * URLs mirror the import path exactly, which is the library's central idea:
 *
 *   article  thefintechbuilder.com/technical-indicators/trend-smoothing/sma/
 *   docs     docs.thefintechbuilder.com/technical-indicators/trend-smoothing/sma/
 *   import   fintech-algorithms/technical-indicators/trend-smoothing/sma
 *
 * Deliberately dependency-free. 187 near-identical documents generated from one
 * JSON file do not need a framework, and a docs site for a zero-dependency
 * library should not carry a 300 MB toolchain of its own.
 *
 * Usage:
 *   node build.mjs                       # latest from unpkg
 *   node build.mjs --version 0.4.0       # a specific release
 *   node build.mjs --payload ../path/docs.json
 */

import { mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
 * Path prefix for hosts that serve the site below the domain root — a GitHub
 * Pages *project* URL, for example. Empty for the real deployment at
 * docs.thefintechbuilder.com, which is why it defaults to empty: delete the
 * `DOCS_BASE` variable once DNS points here and every link becomes root-relative
 * again with no code change.
 *
 * Canonical URLs deliberately ignore it — they always name the real site.
 */
const BASE = (arg("--base", process.env.DOCS_BASE ?? "")).replace(/\/$/, "");
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

const write = (relPath, contents) => {
  const full = join(DIST, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents, "utf8");
};

const pretty = (v) => {
  const s = JSON.stringify(v, null, 2);
  // Collapse short arrays of primitives onto one line — a 6-element price
  // series printed over 8 lines is noise, not clarity.
  return s.replace(/\[\n\s+((?:[^[\]{}]|\n)*?)\n\s+\]/g, (m, body) => {
    const flat = body.split("\n").map((l) => l.trim()).join(" ");
    return flat.length <= 80 ? `[${flat}]` : m;
  });
};

const domainSlug = (t) => t.path.split("/")[0];
const familySlug = (t) => t.path.split("/")[1];

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : word.endsWith("y") ? "" : "s"}`;
const families = (n) => `${n} ${n === 1 ? "family" : "families"}`;

// -------------------------------------------------------------- page shell

function shell({ title, description, canonical, body, breadcrumbs = [], jsonLd = null }) {
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
<link rel="stylesheet" href="${u("/assets/style.css")}">
<script>window.__BASE__=${JSON.stringify(BASE)};</script>
${jsonLd ? `<script type="application/ld+json">${jsonForScript(jsonLd)}</script>` : ""}
</head>
<body>
<header class="site">
  <a class="brand" href="${u("/")}"><strong>fintech-algorithms</strong> <span>reference</span></a>
  <nav>
    <a href="${ARTICLES}">Articles</a>
    <a href="${NPM}">npm</a>
    <a href="${GITHUB}">GitHub</a>
  </nav>
</header>
${breadcrumbs.length ? `<nav class="crumbs">${breadcrumbs
    .map((c) => (c.href ? `<a href="${esc(c.href)}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`))
    .join('<i>/</i>')}</nav>` : ""}
<main>
${body}
</main>
<footer>
  <p>Generated from <code>docs.json</code> published with the package. Every worked
  example on this site is a fixture the test suite asserts.</p>
  <p><a href="${ARTICLES}">The Fintech Builder</a> · <a href="${u('/llms.txt')}">llms.txt</a></p>
</footer>
</body>
</html>
`;
}

const badge = (t) =>
  t.verification.tier === "verified"
    ? `<span class="badge verified" title="Arithmetic asserted against the article's published worked example">verified</span>`
    : `<span class="badge contract" title="Module loads and exposes a callable entry point; its arithmetic is not asserted here">contract</span>`;

// --------------------------------------------------------------- home page

function renderHome(payload) {
  const { counts, domains } = payload;
  const body = `
<section class="hero">
  <h1>The algorithms behind market data, corporate actions, indices and breadth</h1>
  <p class="lede">Reference documentation for <strong>${counts.topics} zero-dependency
  TypeScript implementations</strong>. Import paths mirror article URLs, so a path you
  know on one surface works on all three.</p>
  <pre class="install"><code>npm install fintech-algorithms</code></pre>
  <dl class="stats">
    <div><dt>Topics</dt><dd>${counts.topics}</dd></div>
    <div><dt>Domains</dt><dd>${counts.domains}</dd></div>
    <div><dt>Families</dt><dd>${counts.families}</dd></div>
    <div><dt>Verified</dt><dd>${counts.verified}</dd></div>
  </dl>
</section>

<section class="search">
  <label for="q">Search ${counts.topics} algorithms</label>
  <input id="q" type="search" placeholder="split adjustment, McClellan, divisor, ATR…" autocomplete="off">
  <ul id="results" hidden></ul>
</section>

<section>
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

<section class="note">
  <h2>What “verified” means here</h2>
  <p><strong>${counts.verified} of ${counts.topics}</strong> topics have their arithmetic
  asserted against the worked example published in their article — the package, the article
  and the standalone repository agree on the numbers. The rest are proven to load and expose
  a callable entry point, but their output is not asserted. Each page states which it is.
  It is an honest split, not a marketing number.</p>
</section>

<script src="${u('/assets/search.js')}" defer></script>
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
  });
}

// ------------------------------------------------------------- domain page

function renderDomain(payload, domain) {
  const topics = payload.topics.filter((t) => t.taxonomy.domainId === domain.id);
  const slug = domainSlug(topics[0]);

  const familySections = domain.families
    .map((f) => {
      const inFamily = topics.filter((t) => t.taxonomy.familyId === f.id);
      return `<section class="family">
  <h2 id="${esc(familySlug(inFamily[0]))}">${esc(f.name)}</h2>
  <ul class="topics">
    ${inFamily
      .map(
        (t) => `<li>
      <a href="${u(`/${esc(t.path)}/`)}">${esc(t.name)}</a>
      ${badge(t)}
      <code>${esc(t.import.signature)}</code>
    </li>`,
      )
      .join("\n    ")}
  </ul>
</section>`;
    })
    .join("\n");

  return shell({
    title: `${domain.name} — fintech-algorithms`,
    description: `${domain.topicCount} algorithms across ${domain.families.length} families: ${domain.families.map((f) => f.name).join(", ")}.`,
    canonical: `${SITE}/${slug}/`,
    breadcrumbs: [{ label: "Home", href: u("/") }, { label: domain.name }],
    body: `<h1>${esc(domain.name)}</h1>
<p class="lede">${plural(domain.topicCount, "algorithm")} · ${families(domain.families.length)} · <code>${esc(domain.id)}</code></p>
${familySections}`,
  });
}

// -------------------------------------------------------------- topic page

function renderTopic(payload, t) {
  const parts = [];

  parts.push(`<h1>${esc(t.name)}</h1>`);
  if (t.headline) parts.push(`<p class="lede">${esc(t.headline)}</p>`);
  parts.push(`<p class="meta">${badge(t)}
  <code>${esc(t.id)}</code>
  <span>${esc(t.taxonomy.family)}</span>
  <span>shape: <code>${esc(t.import.archetype)}</code></span>
  <span>difficulty ${t.taxonomy.difficulty}</span></p>`);

  parts.push(`<h2>Install and import</h2>
<pre><code>npm install fintech-algorithms</code></pre>
<pre><code>import { ${esc(t.import.entry)} } from "${esc(t.import.subpath)}";</code></pre>`);

  parts.push(`<h2>Signature</h2>
<pre><code>${esc(t.import.signature)}</code></pre>`);
  if (t.import.exports.length > 1) {
    parts.push(`<p class="hint">This module also exports
    ${t.import.exports.filter((e) => e !== t.import.entry).map((e) => `<code>${esc(e)}</code>`).join(", ")}.
    Every module additionally exports <code>run</code> as an alias of its primary function,
    and a <code>meta</code> object.</p>`);
  }

  if (t.example) {
    parts.push(`<h2>Worked example</h2>
<p class="hint">Asserted by the test suite against the numbers published in the article —
this output cannot drift.</p>
<pre><code>${esc(t.example.call)}</code></pre>
<p class="label">Returns</p>
<pre><code>${esc(pretty(t.example.expected))}</code></pre>`);
  } else if (t.verification.tier === "verified") {
    parts.push(`<h2>Worked example</h2>
<p class="hint">This topic is verified against a ${
      t.verification.via === "row-fixture" ? "multi-row" : "multi-scenario"
    } fixture — hundreds of observations, correct to assert but too long to print here.
    The article walks the numbers through by hand.</p>
<p><a class="cta" href="${esc(t.links.article)}">Read the worked example →</a></p>`);
  }

  if (t.assets.diagrams.length) {
    parts.push(`<h2>Diagrams</h2>
${t.assets.diagrams
  .map(
    (d) =>
      `<figure><img loading="lazy" src="${esc(d.url)}" alt="${esc(t.name)} — ${esc(
        d.file.replace(/\.svg$/, "").replace(/-/g, " "),
      )}"></figure>`,
  )
  .join("\n")}`);
  }

  if (t.assets.mermaid.length) {
    // Collapsed: the diagrams above already carry the visual explanation, and a
    // wall of Mermaid source on every page is noise for most readers. Kept as
    // source rather than rendered so the site stays self-contained — rendering
    // would mean pulling a megabyte of JavaScript from a CDN.
    parts.push(`<h2>Calculation flow</h2>
${t.assets.mermaid
  .map(
    (m) => `<details class="flow">
  <summary>${esc(m.caption ?? "Mermaid diagram")}</summary>
  <pre><code>${esc(m.source)}</code></pre>
</details>`,
  )
  .join("\n")}`);
  }

  parts.push(`<h2>Learn how it works</h2>
<p>This page states the <strong>contract</strong>: how to call it correctly. The article
explains the <strong>concept</strong>: why it works and where it breaks.</p>
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

  parts.push(`<h2>Source</h2>
<ul class="links">
  <li><a href="${esc(t.links.source)}">Implementation on GitHub</a></li>
  ${t.links.repo ? `<li><a href="${esc(t.links.repo)}">Standalone repository</a></li>` : ""}
  <li><a href="${esc(t.links.npm)}">Package on npm</a></li>
</ul>`);

  return shell({
    title: `${t.name} — fintech-algorithms`,
    description: `${t.name}${t.headline ? `: ${t.headline}` : ""}. Signature, worked example and import path for ${t.import.subpath}.`,
    canonical: `${SITE}/${t.path}/`,
    breadcrumbs: [
      { label: "Home", href: u("/") },
      { label: t.taxonomy.domain, href: u(`/${domainSlug(t)}/`) },
      { label: t.taxonomy.family, href: u(`/${domainSlug(t)}/#${familySlug(t)}`) },
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
    body: parts.join("\n\n"),
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
<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">
${[
  `${SITE}/`,
  ...payload.domains.map(
    (d) => `${SITE}/${domainSlug(payload.topics.find((t) => t.taxonomy.domainId === d.id))}/`,
  ),
  ...payload.topics.map((t) => `${SITE}/${t.path}/`),
]
  .map((u) => `  <url><loc>${u}</loc></url>`)
  .join("\n")}
</urlset>
`.replace("www.sitemap.org", "www.sitemaps.org");

// -------------------------------------------------------------------- main

const payload = await loadPayload();

if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });

write("index.html", renderHome(payload));

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

console.log(
  `built ${payload.counts.topics} topic pages + ${payload.domains.length} domain pages ` +
    `from fintech-algorithms@${payload.package.version}`,
);
