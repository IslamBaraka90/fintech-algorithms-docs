# Wiring up a data provider

The library ships no data provider, and never will. That is a deliberate
architectural choice, not a gap: vendor APIs are rewritten every couple of years,
and algorithms are not. Keeping them apart means a vendor migration touches one
file you own rather than every module you import.

What you write is an **adapter**: a mapping from your provider's payload to the
shapes the library expects.

## The shapes

Two contracts cover most of the library.

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

interface Bar {
  timestamp: string;   // ISO 8601
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```

Series transforms — every moving average, oscillator and channel — take a plain
`number[]` instead, so they need no adapter at all.

## A complete adapter

```ts
import type { Bar } from "fintech-algorithms";

interface VendorBar {
  t: number;      // epoch milliseconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export function toBars(symbol: string, rows: VendorBar[]): Bar[] {
  return rows.map((r) => ({
    timestamp: new Date(r.t).toISOString(),
    symbol,
    open: r.o,
    high: r.h,
    low: r.l,
    close: r.c,
    volume: r.v,
  }));
}
```

That is the whole integration. Everything downstream imports `Bar`, not your
vendor's type.

## Validate at the boundary

An adapter is the right place to reject bad data, because it is the only place
that knows what the vendor is capable of sending. The library has algorithms for
exactly this:

```ts
import { calculate as validateOhlc }
  from "fintech-algorithms/market-data-engineering/cleaning-and-validation/ohlc-consistency-validator";

const bars = toBars("AAPL", rows);
const verdicts = validateOhlc(bars);

const clean = bars.filter((_, i) => verdicts[i].status === "ok");
const rejected = verdicts.filter((v) => v.status !== "ok");

if (rejected.length) {
  logger.warn({ rejected }, "bars rejected at the provider boundary");
}
```

Note that it returns a verdict per row rather than throwing. One malformed bar in
a batch of ten thousand should not lose the other 9,999 — and it should not pass
silently either.

Related: [Hampel Bad-Tick Filter](/market-data-engineering/cleaning-and-validation/hampel-bad-tick-filter/),
[Stale Quote Detector](/market-data-engineering/cleaning-and-validation/stale-quote-detector/),
[Duplicate Trade Resolver](/market-data-engineering/cleaning-and-validation/duplicate-trade-resolver/).

## More than one provider

Two feeds never agree exactly, and their clocks drift. Reconcile them rather than
picking one and hoping:

```ts
import { calculate as consensus }
  from "fintech-algorithms/market-data-engineering/data-quality/price-source-consensus-check";

const verdict = consensus(
  { primary: 101.24, secondary: 101.26, tertiary: 101.25 },
  { toleranceBps: 5 },
);
```

See [Price Source Consensus Check](/market-data-engineering/data-quality/price-source-consensus-check/)
and the [time-synchronization family](/market-data-engineering/#time-synchronization).

## Keep the adapter out of the algorithms

The one rule worth enforcing in review: nothing below the adapter should ever
know your vendor's field names. If a function signature mentions `r.c` or
`results[]`, the boundary has leaked.

That is also why the library will not accept a provider client as an optional
peer dependency. A dependency that is optional in the manifest is not optional in
the architecture.

## Where credentials belong

Nowhere in this library, and nowhere in the adapter's committed source. Read them
from the environment in the layer that constructs the HTTP client, above the
adapter:

```ts
const client = new VendorClient({ apiKey: process.env.VENDOR_API_KEY });
const rows = await client.dailyBars("AAPL");
const bars = toBars("AAPL", rows);   // adapter never sees the key
```
