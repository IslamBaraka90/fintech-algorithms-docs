# The five input shapes

Every algorithm in the library carries a coarse shape label called its
**archetype**. It is not a type — it is a hint about what the first argument
looks like and what comes back. Five labels cover all {{topics}} topics, which means
that once you have called one member of a shape, the rest of that shape needs no
new integration work: the same adapter output feeds all of them.

The label travels with the code. It is on `meta.archetype` of every module, on
every reference page's sidebar, on every entry line in
[llms.txt](/llms.txt), and it is queryable:

```ts
import { byArchetype } from "fintech-algorithms";

byArchetype("series-transform");   // every topic that takes a plain number[]
```

## The distribution

| Archetype | Topics | First argument | Returns |
| --- | --- | --- | --- |
| `record-transform` | {{record-transform}} | domain-specific record or array | domain-specific result |
| `series-transform` | {{series-transform}} | `(number \| null)[]` | array of the same length |
| `row-classify` | {{row-classify}} | array of rows | one verdict per row |
| `tape-aggregate` | {{tape-aggregate}} | `Trade[]` | `Bar[]` |
| `snapshot-evaluate` | {{snapshot-evaluate}} | one point-in-time snapshot | one verdict |

Read that table in the order it is written. The two shapes with the cleanest
contracts are the smallest, and the largest is a residual bucket — which is worth
knowing before you build anything on top of the label.

## series-transform — {{series-transform}} topics

**Definition.** A pure function from a numeric series to a series of the same
length, aligned index-for-index with the input. Every topic in Technical
Indicators is one of these, and nothing else is.

**Input type.**

```ts
type SeriesTransform = (values: (number | null)[], ...params: number[]) => (number | null)[];
```

**Minimal payload.** No adapter at all — the input is a bare array of closes.

```ts
import { calculateSma } from "fintech-algorithms/technical-indicators/trend-smoothing/sma";

calculateSma([10, 13, 12, 15, 14, 18], 3);
// [null, null, 11.666…, 13.333…, 13.666…, 15.666…]
```

**The one thing that bites.** The leading `null`s are warm-up, not missing data,
and the output is deliberately the same length as the input so that
`bars[i]` and `sma[i]` describe the same instant. Do not filter the nulls out
before plotting — that shifts the whole series left by `window - 1` bars and
nothing will error. See [Plotting on a chart](/guides/charting/).

**Validator at the boundary.** A numeric series has no structure to check, so
check its values: the
[MAD Outlier Filter](/market-data-engineering/cleaning-and-validation/median-absolute-deviation-outlier-filter/)
or the
[Hampel Bad-Tick Filter](/market-data-engineering/cleaning-and-validation/hampel-bad-tick-filter/),
both of which take the same `number[]` you are about to pass to the indicator.

## tape-aggregate — {{tape-aggregate}} topics

**Definition.** Fold a raw trade tape into bars. All seven are the
[bar-construction family](/market-data-engineering/bar-construction/), they all
share the entry point `constructBars`, and they differ only in what closes a
bar — elapsed time, tick count, traded volume, dollar volume, or an imbalance
threshold.

**Input type.**

```ts
interface Trade {
  tradeId: string;
  timestamp: string;   // ISO 8601
  session: string;
  symbol: string;
  price: number;
  volume: number;
  currency: string;
}

type TapeAggregate = (trades: Trade[], config: object) => Bar[];
```

**Minimal payload.**

```ts
import { constructBars } from "fintech-algorithms/market-data-engineering/bar-construction/time-bars";

constructBars(
  [
    { tradeId: "1", timestamp: "2026-07-20T09:30:01Z", session: "RTH",
      symbol: "DEMO", price: 100, volume: 500, currency: "USD" },
  ],
  { intervalSeconds: 60, sessionStarts: { RTH: "09:30:00" } },
);
```

**The one thing that bites.** These are the only algorithms that care about
ordering and sessions. Trades must arrive in chronological order, and
`sessionStarts` is what anchors bucket boundaries — get it wrong and every bar
edge is off by the same amount, consistently enough to look correct.

**Validator at the boundary.** Run the
[Duplicate-Trade Resolver](/market-data-engineering/cleaning-and-validation/duplicate-trade-resolver/)
before aggregating. A duplicated print inflates volume permanently and is
invisible once it is inside a bar.

## row-classify — {{row-classify}} topics

**Definition.** Take an array of rows, return one verdict per row, in the same
order. These are the data-quality algorithms, and the shape is the point: they
never throw on bad input, because a single malformed record in a batch of ten
thousand should lose neither the record nor the other 9,999.

**Input type.**

```ts
type RowClassify = (rows: Row[], config?: object) => Verdict[];   // verdicts.length === rows.length
```

**Minimal payload.**

```ts
import { validateBars }
  from "fintech-algorithms/market-data-engineering/cleaning-and-validation/ohlc-consistency-validator";

const verdicts = validateBars(bars, { tickSize: 0.01, toleranceTicks: 1, priceScale: 1 });
const clean = bars.filter((_, i) => verdicts[i].valid);
```

**The one thing that bites.** Nothing signals failure except the verdict. If you
ignore the return value the call looks like it succeeded, because it did — the
algorithm's job was to tell you, not to stop you.

**Validator at the boundary.** This archetype *is* the boundary. It is what you
run before the other four.

## snapshot-evaluate — {{snapshot-evaluate}} topics

**Definition.** One moment, not a series. Takes a snapshot plus a policy or a
decision time, and returns a single verdict about that instant.

**Input type.**

```ts
type SnapshotEvaluate = (snapshot: object, policyOrTime: object | string) => Verdict;
```

**Minimal payload.**

```ts
import { consensus }
  from "fintech-algorithms/market-data-engineering/data-quality/price-source-consensus-check";

consensus(
  { as_of: "2026-07-20T09:30:00Z", quotes: [/* one entry per independent source */] },
  { minimum_independent_sources: 3, z_threshold: 3, absolute_tolerance: 0.01,
    maximum_tolerance: 0.05, max_age_ms: 2000 },
);
```

**The one thing that bites.** The second argument is usually a *decision time*,
and it is what makes the result reproducible. Passing "now" instead of the
timestamp you are evaluating turns a point-in-time check into a
look-ahead — the
[Point-in-Time Availability Guard](/market-data-engineering/data-quality/point-in-time-availability-guard/)
exists precisely to catch that class of mistake in your own pipeline.

**Validator at the boundary.** These are themselves validators. Feed them the
snapshot you are about to trust.

## record-transform — {{record-transform}} topics

**Definition.** Everything else. This is the residual bucket: a topic lands here
when it is not one of the four shapes above, which is why it spans twelve of the
{{domains}} domains and {{record-transform}} of the {{topics}} topics.

**Do not treat it as a shape.** `record-transform` tells you that the input is a
domain-specific record or array and the output is a domain-specific result. It
does not tell you the field names, and two record-transforms from different
families rarely accept the same object. Corporate-action adjustment factors,
index divisor maintenance, candlestick classification and on-chain metrics are
all record-transforms and share nothing structurally.

**What to do instead.** Read the contract for the specific topic. Every one of
the {{topics}} has a parameter table with types, constraints and null handling, and an
executed worked example whose input is a valid payload you can copy:

```
https://docs.thefintechbuilder.com/<topic-path>/          the page
https://docs.thefintechbuilder.com/<topic-path>/index.md  the same contract, ~10× smaller
```

**Validator at the boundary.** Whichever matches the record you are passing. If
it is a bar, the
[OHLC Consistency Validator](/market-data-engineering/cleaning-and-validation/ohlc-consistency-validator/);
if it is a quote, the
[Stale-Quote Detector](/market-data-engineering/cleaning-and-validation/stale-quote-detector/);
if it is a corporate action, its own family's guard.

## Why the label is coarse on purpose

The archetype is assigned by the generator from the family, the domain and the
entry point's verb — `validate`, `detect` and `classify` mean `row-classify`;
`evaluate`, `consensus` and `asOf` mean `snapshot-evaluate`. It is informational
metadata, not a load-bearing type. It is there to narrow {{topics}} candidates to a
handful before you read anything in detail, and it is deliberately not a promise
about field names.

The types are the documentation. The archetype just tells you which types to go
and read.

Every count on this page is substituted at build time from the payload the site
was generated from, so it describes the package version named at the foot of the
reference pages rather than whenever this prose was last edited. To check that
against what you have installed, fetch [version.json](/version.json), or take the
[reference payload](/reference/payload.json) and group it by `import.archetype`.
