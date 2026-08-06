# The agent skill

The package ships an agent skill: a folder of instructions in the open
[Agent Skills](https://agentskills.io) format, which Claude Code, Codex, Cursor
and some seventy other agents load on demand when a task looks like it needs
this library. It exists because the failure mode of an agent meeting {{topics}}
algorithms it has never read is not refusal — it is confident invention. A
plausible import subpath, a plausible parameter, a plausible field name on the
result. The skill replaces each of those guesses with a lookup against the same
payload this site is built from.

## Install

Two routes, and they install the same skill.

```bash
npx skills add IslamBaraka90/Fintech-Algorithms-Library
```

The CLI copies the skill into your agent's skills directory — into the current
project by default, or `-g` for every project on the machine. Nothing is
installed from npm and the project does not have to depend on the library yet,
which makes this the route to take when you want the agent to know what is
available *before* deciding whether to use it.

If the package is already a dependency, the skill is on disk already:

```
node_modules/fintech-algorithms/skills/fintech-algorithms/
```

It ships inside the npm tarball, so this copy is version-matched to the
`docs.json` sitting beside it in the package root — the same file the lookup
script reads. Point the agent at that directory, or copy it into the agent's
skills folder if that is the only place it looks.

## What is in it

- **`SKILL.md`** — the router. Four non-negotiable rules, the resolution order
  below, the archetype table, and the conditions under which to load each
  reference. It is what the agent reads first and often all it reads.
- **`references/archetypes.md`** — the five input shapes, with executed
  examples, for mapping a user's data onto a signature.
- **`references/ingestion.md`** — provider to adapter to validation to
  computation, and the canonical `Trade` and `Bar` shapes.
- **`references/recipes.md`** — end-to-end tasks: clean a feed, build bars from
  ticks, produce a multi-indicator report.
- **`references/pitfalls.md`** — failure modes that do not throw. The code runs,
  a number comes out, and the number is wrong.
- **`scripts/lookup.mjs`** — the CLI below.

The references are not loaded up front. `SKILL.md` names the condition under
which each one becomes worth its bytes, which is what keeps a skill covering
{{topics}} topics cheap to carry.

## The lookup script

`scripts/lookup.mjs` has no dependencies and no install step. It reads
`node_modules/fintech-algorithms/docs.json` when the package is installed
anywhere above the working directory, and otherwise fetches
[`/reference/payload.json`](/reference/payload.json) and caches it for a day. So
it answers from the version you actually have, and still answers when you have
installed nothing at all. `FINTECH_DOCS_JSON` points it at a specific file.

| Command | Does |
|---|---|
| `search <query>` | find topics by name, slug, family or entry point |
| `show <slug\|id\|path>` | the full contract: signature, parameters, warm-up, errors, executed example |
| `archetype <name>` | every topic sharing an input shape, and the caveat that comes with it |
| `domain <id\|slug>` | every topic in one domain, grouped by family |
| `domains` | the {{domains}} domains and their index URLs |
| `version` | the reference version against the published one |

It accepts a slug (`rsi`), a catalog id (`D07-F03-A01`), an import subpath or a
docs URL, so anything the agent already has in hand is a valid argument:

```bash
node scripts/lookup.mjs search bollinger
```

```
2 matches

D07-F04-A03  Bollinger Bands
    import { bollingerBands } from "fintech-algorithms/technical-indicators/volatility-and-channels/bollinger-bands";
    bollingerBands(close, p, multiplier) · series-transform · verified

D07-F04-A06  Bollinger BandWidth
    import { bollingerBandwidth } from "fintech-algorithms/technical-indicators/volatility-and-channels/bollinger-bandwidth";
    bollingerBandwidth(close, p, multiplier) · series-transform · verified
```

Every part of that came out of the payload: the import path, the parameter
names, the archetype, the verification tier. `show bollinger-bands` goes on to
give the parameter contract, the warm-up, the errors it throws and a worked
example that was executed rather than typed. When a topic does not exist, the
script says so instead of returning the nearest thing — that answer is the
correct one, not an obstacle to route around.

## What it changes about the answers you get

- **It does not invent a subpath.** Every subpath mirrors its docs URL exactly,
  which is precisely what makes a guess dangerous: it reads as correct. The
  skill's first rule is to look the path up or say the topic does not exist.
- **Warm-up is read, not estimated.** `show sma` reports `window - 1` leading
  nulls and says why they are null rather than partial; `show rsi` reports `p`.
  An agent working from the skill tells you how many leading values are warm-up
  instead of quietly counting them as signal.
- **The verification tier is stated.** {{verified}} of {{topics}} topics are
  `verified` — the arithmetic is replayed and asserted on every build. The other
  {{contract}} are `contract`: the signature and shape are checked, the numbers
  are not attested by an independent published figure. The skill requires that
  distinction to be said out loud on any numeric claim.
- **It knows the return keys are inconsistent.** `bollingerBands` returns
  `percent_b`; a `macd` row carries `fastEma`. There is no rule that recovers
  both, so the skill takes field names from the captured example output and
  never from the return type.

## The boundary

One rule in the skill is not about correctness. An indicator crossing is an
observation about a series, not a recommendation for a specific person's money,
and the skill defers to the statement on this site rather than paraphrasing it
into something softer: [Analysis, not advice](/guides/ai-agents/#analysis-not-advice).

## Which agents can use it

Any agent that reads the Agent Skills format. The `skills` CLI installs into
around seventy-five of them, and where the files land depends on the agent:

| Agent | In the project | Globally |
|---|---|---|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Codex | `.agents/skills/` | `~/.codex/skills/` |
| Cursor | `.agents/skills/` | `~/.cursor/skills/` |

`.agents/skills/` is the shared convention, so one project-level install often
serves several agents at once. The full list — OpenCode, Copilot, Gemini CLI,
Amp, Zed, Goose and the rest — is in the
[CLI's own documentation](https://github.com/vercel-labs/skills#supported-agents).

If your agent reads skills from somewhere else, it is a directory of markdown
and one script: copy it there, or read
[Using this library from an agent](/guides/ai-agents/), which is the same
material written to be fetched rather than installed.
