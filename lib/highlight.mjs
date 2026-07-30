/**
 * A small syntax highlighter for the four languages this site actually shows:
 * TypeScript, JSON, shell and YAML.
 *
 * Tokenising rather than regex-replacing over HTML: the scanner walks the raw
 * source, and each token is HTML-escaped as it is emitted. That ordering is the
 * safety property — a string literal containing `</script>` or `<b>` can never
 * become markup, because escaping happens after the token boundary is known and
 * never over text that already contains tags.
 *
 * Unknown languages fall through to plain escaped text rather than guessing.
 */

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Sticky rules, tried in order at each position. First match wins. */
const RULES = {
  json: [
    ["str-key", /"(?:[^"\\]|\\.)*"(?=\s*:)/y],
    ["str", /"(?:[^"\\]|\\.)*"/y],
    ["num", /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y],
    ["lit", /\b(?:true|false|null)\b/y],
    ["punct", /[{}[\],:]/y],
  ],

  ts: [
    ["comment", /\/\/[^\n]*/y],
    ["comment", /\/\*[\s\S]*?\*\//y],
    ["str", /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/y],
    [
      "kw",
      /\b(?:import|export|from|const|let|var|function|return|await|async|new|class|extends|type|interface|enum|if|else|for|of|in|while|try|catch|throw|typeof|instanceof|as|default|null|undefined|true|false)\b/y,
    ],
    ["num", /\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y],
    ["fn", /\b[A-Za-z_$][\w$]*(?=\s*\()/y],
    ["type", /\b[A-Z][\w$]*\b/y],
    ["ident", /\b[A-Za-z_$][\w$]*\b/y],
    ["punct", /[{}()[\].,;:=<>|&?+\-*/!]/y],
  ],

  bash: [
    ["comment", /#[^\n]*/y],
    ["str", /"(?:[^"\\]|\\.)*"|'[^']*'/y],
    ["flag", /(?<=\s)--?[\w-]+/y],
    ["cmd", /^[a-z][\w.-]*/my],
    ["num", /\b\d+(?:\.\d+)?\b/y],
    ["punct", /[|&;<>()]/y],
  ],

  yaml: [
    ["comment", /#[^\n]*/y],
    ["str-key", /^[ \t]*-?[ \t]*[\w.-]+(?=\s*:)/my],
    ["str", /"(?:[^"\\]|\\.)*"|'[^']*'/y],
    ["num", /\b-?\d+(?:\.\d+)?\b/y],
    ["lit", /\b(?:true|false|null|yes|no)\b/y],
    ["punct", /[:>|[\]{},-]/y],
  ],
};

const ALIASES = {
  typescript: "ts",
  js: "ts",
  javascript: "ts",
  jsonc: "json",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
};

export function highlight(code, lang) {
  const rules = RULES[ALIASES[lang] ?? lang];
  if (!rules) return esc(code);

  let out = "";
  let i = 0;
  let plain = "";

  while (i < code.length) {
    let matched = false;
    for (const [cls, re] of rules) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m[0].length) {
        if (plain) {
          out += esc(plain);
          plain = "";
        }
        out += `<span class="t-${cls}">${esc(m[0])}</span>`;
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      plain += code[i];
      i += 1;
    }
  }
  return out + esc(plain);
}
