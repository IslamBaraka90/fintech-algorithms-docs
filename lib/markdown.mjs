/**
 * A very small Markdown renderer for the hand-written guides.
 *
 * The reference pages are generated from structured data and need no Markdown at
 * all; only the guides are prose. That is a narrow enough job that pulling in a
 * parser — and a lockfile, and a supply chain — for a site documenting a
 * zero-dependency library is the wrong trade.
 *
 * Supported: ATX headings, paragraphs, fenced code with a language label,
 * unordered and ordered lists, blockquotes, tables, horizontal rules, and inline
 * code / bold / italic / links. Anything else renders as plain text rather than
 * silently producing broken markup.
 */

import { highlight } from "./highlight.mjs";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Inline formatting. Escaping happens first so authored text cannot inject markup. */
export function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}

const codeBlock = (lang, body) =>
  `<figure class="code">${lang ? `<figcaption>${esc(lang)}</figcaption>` : ""}<pre><code${
    lang ? ` class="lang-${esc(lang)}"` : ""
  }>${highlight(body.replace(/\n$/, ""), lang)}</code></pre></figure>`;

export function markdown(src) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (buf.length) out.push(`<p>${inline(buf.join(" "))}</p>`);
    buf.length = 0;
  };
  const paragraph = [];

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code
    const fence = /^```(\w+)?\s*$/.exec(line);
    if (fence) {
      flushParagraph(paragraph);
      const body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(codeBlock(fence[1] ?? "", body.join("\n")));
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph(paragraph);
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = text.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
      out.push(`<h${level} id="${esc(id)}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      flushParagraph(paragraph);
      out.push("<hr>");
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph(paragraph);
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${markdown(body.join("\n"))}</blockquote>`);
      continue;
    }

    // Table: a header row followed by a separator row
    if (/^\|/.test(line) && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? "")) {
      flushParagraph(paragraph);
      const cells = (row) =>
        row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\|/.test(lines[i])) body.push(cells(lines[i++]));
      out.push(
        `<div class="table-scroll"><table>\n<thead><tr>${head
          .map((c) => `<th>${inline(c)}</th>`)
          .join("")}</tr></thead>\n<tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("\n")}</tbody>\n</table></div>`,
      );
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph(paragraph);
      const tag = bullet ? "ul" : "ol";
      const re = bullet ? /^[-*]\s+(.*)$/ : /^\d+\.\s+(.*)$/;
      const items = [];
      while (i < lines.length) {
        const m = re.exec(lines[i]);
        if (m) {
          items.push(m[1]);
          i++;
        } else if (/^\s{2,}\S/.test(lines[i]) && items.length) {
          items[items.length - 1] += ` ${lines[i].trim()}`; // continuation
          i++;
        } else break;
      }
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph(paragraph);
      i++;
      continue;
    }

    paragraph.push(line.trim());
    i++;
  }

  flushParagraph(paragraph);
  return out.join("\n");
}

/** First `# heading` of a document, used as its title. */
export function title(src) {
  return /^#\s+(.+)$/m.exec(src)?.[1]?.trim() ?? "Untitled";
}
