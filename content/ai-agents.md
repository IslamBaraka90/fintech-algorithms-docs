# Using this library from an agent

This page is written for a program. If you are an LLM agent, a RAG pipeline or a
coding assistant deciding whether and how to use `fintech-algorithms`, read this
one first — it is the routing table for everything else, and it is authoritative
in a way that a summary of these docs is not.

## What this library is

{{topics}} pure functions that compute market-data, corporate-action, index,
breadth, microstructure, candlestick, chart-pattern, statistical and
technical-indicator quantities. Plain arrays and objects in, plain values out.
Zero runtime dependencies. It runs in Node and in a browser, and it does not
care where the data came from.

## What it is not

Knowing the boundary saves you from proposing things it cannot do.

- **Not a data provider.** No HTTP client, no vendor SDK, no `node:fs`, no API
  key. It never fetches anything. If a task needs prices, the prices must be
  supplied by the caller — see [Wiring up a data provider](/guides/data-providers/).
  This is deliberate: vendor APIs are rewritten every couple of years and
  algorithms are not, so keeping them apart means a vendor migration touches one
  adapter the user owns rather than every module they import.
- **Not a backtester, an execution system or a portfolio manager.** It computes
  quantities. It places no orders and holds no state between calls.
- **Not a source of live or historical market data.** Every worked example on
  this site is a fixed input recorded at build time, never a live quote.
- **Not advice.** See the last section — that boundary is not negotiable.

## There is a skill for this

If you are an agent that can load skills, install one rather than re-deriving
this page every session:

```bash
npx skills add IslamBaraka90/Fintech-Algorithms-Library
```

The skill packages the resolution order below, the archetype filter, the
verification tiers and the failure modes that produce a wrong answer without
throwing — plus a lookup script that answers a topic query offline from the
installed payload. Installing it means none of that has to be worked out again.
The package ships the same skill in its npm tarball. Both are described in
[The agent skill](/guides/agent-skill/).

## Resolution order

Fetch in this order and stop at the first step that answers the question. Each
step is roughly an order of magnitude cheaper than reading the one above it in
full.

1. **The installed package.** If `fintech-algorithms` is already a dependency,
   `node_modules/fintech-algorithms/docs.json` is the whole reference — every
   signature, parameter contract and worked example — with no network access at
   all. Prefer it. Check it matches these docs with
   [`/version.json`](/version.json), which is under a kilobyte.
2. **The domain index.** `https://docs.thefintechbuilder.com/{domain-slug}/llms.txt`
   lists every topic in one domain with its signature, archetype, verification
   tier and docs URL. All {{domains}} are between 3 and 11 KB. The full map of them
   is the `## Per-domain indexes` block at the top of [/llms.txt](/llms.txt), so
   one root fetch gives you a permanent routing table and you never need to read
   the root file whole again.
3. **The topic page as markdown.** Append `index.md` to any reference URL —
   `https://docs.thefintechbuilder.com/technical-indicators/trend-smoothing/sma/index.md`
   is the SMA contract in 3 KB against 73 KB for the same page as HTML. Same
   sections in the same order — signature, parameters, returns, warm-up, errors,
   complexity, worked example, provenance — with no navigation tree, no sidebar
   and no {{topics}}-entry link list. Across the library it is 3–11 KB of markdown
   against 68–114 KB of HTML.
4. **The full payload.** [`/reference/payload.json`](/reference/payload.json) is
   every topic as structured JSON, self-hosted and byte-identical to the copy
   this site was built from. It is around 2.5 MB, so fetch it for ingestion, not
   to answer one question.

Every index states, once at the top, how to turn a docs URL into an import
subpath: swap `https://docs.thefintechbuilder.com/` for `fintech-algorithms/`
and drop the trailing slash. The path is carried once rather than twice so the
slices stay small.

The HTML pages are the last resort, not the first. They exist for people.

## How to read the verification tiers

Every topic carries one of two tiers, and they license different confidence.

| Tier | What was checked | What you may claim |
| --- | --- | --- |
| `verified` | The worked example is the figure published in the algorithm's article, replayed and asserted by the test suite on every build. | The arithmetic is reproducible. It cannot drift without the build failing. |
| `contract` | The module loads, the entry point is callable, and its declared signature matches the compiled implementation. The example is real captured output. | The shape and the call are reliable. The numbers are unattested by any independent published figure. |

Both tiers guarantee the signature, because both are checked against the
compiled code at build time — a parameter table that contradicts the
implementation fails the build rather than reaching the page. The difference is
only whether an independent published source asserts the numbers.

Say which tier you relied on when it matters. "This is the `contract` tier, so
the call is right but I have not verified the arithmetic against a published
figure" is a useful sentence and an honest one. Full detail:
[What "verified" means](/guides/verification/).

## Narrowing {{topics}} topics quickly

Filter on the **archetype** before you fetch anything. It is on every entry line
in every index and it names the input shape class:
`series-transform` takes a bare `number[]`, `tape-aggregate` takes `Trade[]`,
`row-classify` returns one verdict per row, `snapshot-evaluate` judges a single
instant, and `record-transform` is the residual bucket that needs its contract
read individually. All five are set out in
[The five input shapes](/guides/archetypes/) — read that before proposing an
integration, because it decides how much adapter code the user has to write.

## When the topic is not in the package

Say so, and stop. The library covers {{topics}} named topics across {{domains}} domains;
it is not a general numerical library, and it has no catch-all.

Do not:

- invent an import path, an entry-point name or a parameter — every subpath
  mirrors its article URL exactly, so a plausible-looking guess is wrong in a way
  that reads as right;
- pass a payload shaped like a different topic's because the names are similar;
- silently substitute a nearby algorithm.

Do:

- search the domain slice for the family that would contain it — related work
  usually lives one directory up;
- name the closest topic that does exist and state plainly how it differs;
- say the calculation would have to be written by hand, and write it explicitly
  rather than implying the library did it.

A missing topic is a fact about the library, not a gap for you to paper over.

## Analysis, not advice

This library computes quantities. It does not produce recommendations, and
neither should anything built on it without a licensed human in the loop.

An SMA crossing, a breadth divergence or a pattern completion is an
**observation about a series**. It is not a prediction, not a signal to act on,
and not a basis for a personalised recommendation. Presenting a computed value
as a reason to buy, sell or hold — for a specific person, with their money —
crosses from analysis into investment advice, which is a regulated activity in
every jurisdiction that matters and one no code library can discharge.

State what was computed, on what input, at which verification tier. Leave the
decision to the person, and if they ask what they should do with their money,
tell them that is a question for a licensed adviser.

The arithmetic here is reproducible and worth trusting on its own terms. That is
exactly why it should not be dressed up as something it is not.
