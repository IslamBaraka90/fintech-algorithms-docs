# Quick start

Install the package, adapt your data once, and call an algorithm. There is no
configuration file, no client to construct, and no API key — every function takes
plain arrays and plain objects.

```bash
npm install fintech-algorithms
```

Requires Node 22 or newer. The package is ESM-only and ships its own types.

## Your first call

Each algorithm has its own import path, and that path is identical to the URL of
its article and of this page:

```ts
import { calculateEma } from "fintech-algorithms/technical-indicators/trend-smoothing/ema";

calculateEma([10, 13, 16, 19], 3);
// → [null, null, 13, 16]
```

Two things in that output are worth understanding before you go further, because
they apply to almost every algorithm in the library.

## `null` means "not yet defined"

A 3-period average cannot exist until three observations have arrived. The first
two positions are `null` — not `0`, not omitted, not a partial average over one
value. The returned array is always the same length as the input, so index `i` of
the output always corresponds to index `i` of the input.

That matters the moment you plot it or join it to anything:

```ts
const ema = calculateEma(closes, 20);

// Safe: positions line up with your bars
bars.map((bar, i) => ({ time: bar.time, value: ema[i] }))
    .filter((point) => point.value !== null);
```

Dropping the nulls without keeping the index would silently shift your series
backwards by the warm-up length. Every reference page states the warm-up count
for its algorithm.

## Bad input is a verdict, not an exception

The validators and classifiers return a result per row instead of throwing, so a
single bad tick cannot abort a whole batch:

```ts
import { calculate } from "fintech-algorithms/market-data-engineering/cleaning-and-validation/ohlc-consistency-validator";

const verdicts = calculate(bars);
const clean = bars.filter((_, i) => verdicts[i].status === "ok");
```

Pure arithmetic errors — a window of zero, an empty series — do throw, because
those are programming mistakes rather than data problems.

## Bring your own data

The library ships **no data provider**: no HTTP client, no vendor SDK, no
`node:fs`, and zero runtime dependencies. You write one small mapping function
from your provider's payload to the shapes the library expects, and you own it.

```ts
import type { Bar } from "fintech-algorithms";

// Your provider → the library's Bar contract. One file, yours to keep.
const toBars = (payload: ProviderResponse): Bar[] =>
  payload.results.map((r) => ({
    timestamp: new Date(r.t).toISOString(),
    symbol: r.sym,
    open: r.o,
    high: r.h,
    low: r.l,
    close: r.c,
    volume: r.v,
  }));
```

When the vendor changes their API you edit that one file. The algorithms never
move. See [Wiring up a data provider](/guides/data-providers/) for a complete
worked adapter.

## Finding the algorithm you need

Three ways in:

- **Search** — the box on the [home page](/) matches names, families and import paths.
- **Browse by domain** — corporate actions, index construction, market breadth, and so on.
- **Derive the path** — if you know the article URL, you know the import path.

## Next

- [Plotting an indicator on a chart](/guides/charting/) — joining output to candles without misaligning it
- [Wiring up a data provider](/guides/data-providers/) — a full adapter, end to end
- [What "verified" means](/guides/verification/) — how far to trust each page
