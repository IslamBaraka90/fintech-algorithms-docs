/**
 * Page-level structure shared by every template: heading anchors, the on-page
 * table of contents, and the navigation tree.
 *
 * These are computed from the rendered HTML rather than threaded through every
 * template. A topic page is assembled from a dozen independent fragments, and
 * asking each one to also register its heading would put the same bookkeeping in
 * a dozen places and guarantee one of them drifts.
 */

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Stable, readable, collision-free heading id. */
export function slugify(text, used = new Set()) {
  const base =
    String(text)
      .toLowerCase()
      .replace(/<[^>]*>/g, "")
      .replace(/&[a-z]+;/g, " ")
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section";
  let id = base;
  let i = 2;
  while (used.has(id)) id = `${base}-${i++}`;
  used.add(id);
  return id;
}

/**
 * Give every h2/h3 an id and a hover-revealed anchor, and return the headings.
 *
 * Without this nobody can link to "Warm-up" on the EMA page — which is exactly
 * the link that gets pasted into a code review.
 */
export function anchorHeadings(html) {
  const used = new Set();
  const headings = [];

  /*
   * Card titles are headings *inside a link*, and an `<a>` may not contain
   * another `<a>`. Injecting an anchor there makes the browser close the card
   * early, at which point the card's remaining children become siblings — and
   * on a grid that means every card explodes into three separate cells.
   *
   * So links containing a heading are masked out before anchoring and restored
   * afterwards. They are navigation rather than document structure, and nobody
   * deep-links to a card title.
   *
   * The placeholder is an HTML comment rather than a whitespace-delimited token:
   * it cannot be disturbed by surrounding formatting, and if restoration ever
   * failed it would be invisible rather than printed on the page.
   */
  const masked = [];
  const withoutLinks = html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, (match) => {
    if (!/<h[1-6]\b/.test(match)) return match; // ordinary links are untouched
    masked.push(match);
    return `<!--mask:${masked.length - 1}-->`;
  });

  // Headings arrive two ways: generated templates emit `<h2>` bare, while the
  // Markdown reader already assigns an id. Match both, and keep an existing id
  // rather than minting a second one — anything already linking to it would
  // break.
  const anchored = withoutLinks.replace(/<(h[23])([^>]*)>([\s\S]*?)<\/\1>/g, (_, tag, attrs, inner) => {
    const text = inner.replace(/<[^>]*>/g, "").trim();
    const existing = /\bid="([^"]+)"/.exec(attrs)?.[1];
    const id = existing ?? slugify(text, used);
    if (existing) used.add(existing);

    headings.push({ level: Number(tag[1]), id, text });
    const openTag = existing ? `<${tag}${attrs}>` : `<${tag} id="${id}">`;
    return `${openTag}${inner}<a class="anchor" href="#${id}" aria-label="Link to ${esc(text)}">#</a></${tag}>`;
  });

  const out = anchored.replace(/<!--mask:(\d+)-->/g, (_, i) => masked[Number(i)]);
  return { html: out, headings };
}

/** Sticky in-page contents. Omitted when there is too little to navigate. */
export function tableOfContents(headings) {
  const items = headings.filter((h) => h.level === 2);
  if (items.length < 3) return "";
  return `<nav class="toc" aria-label="On this page">
  <p class="toc-title">On this page</p>
  <ul>
${items.map((h) => `    <li><a href="#${h.id}">${esc(h.text)}</a></li>`).join("\n")}
  </ul>
</nav>`;
}

/**
 * Domain → family → topic tree, collapsed to the domain being read.
 *
 * 271 topics is far too much to render open. Everything outside the current
 * domain stays folded, and cross-domain movement is what search is for.
 */
export function sidebar(payload, { currentPath = null, u }) {
  const currentDomain = currentPath ? currentPath.split("/")[0] : null;

  const domains = payload.domains.map((domain) => {
    const topics = payload.topics.filter((t) => t.taxonomy.domainId === domain.id);
    const domainSlug = topics[0].path.split("/")[0];
    const open = domainSlug === currentDomain;

    const families = domain.families.map((family) => {
      const inFamily = topics.filter((t) => t.taxonomy.familyId === family.id);
      const familySlug = inFamily[0].path.split("/")[1];
      return `      <li class="nav-family">
        <a href="${u(`/${domainSlug}/${familySlug}/`)}">${esc(family.name)}</a>
        <ul>
${inFamily
  .map(
    (t) =>
      `          <li><a href="${u(`/${t.path}/`)}"${
        t.path === currentPath ? ' aria-current="page"' : ""
      }>${esc(t.name)}</a></li>`,
  )
  .join("\n")}
        </ul>
      </li>`;
    });

    return `  <li class="nav-domain">
    <details${open ? " open" : ""}>
      <summary><span class="nav-id">${esc(domain.id)}</span> ${esc(domain.name)}</summary>
      <ul>
${families.join("\n")}
      </ul>
    </details>
  </li>`;
  });

  return `<nav class="sidebar" aria-label="Reference">
  <ul class="nav-root">
${domains.join("\n")}
  </ul>
</nav>`;
}
