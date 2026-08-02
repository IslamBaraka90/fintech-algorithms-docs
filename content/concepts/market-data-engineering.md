# Market data engineering

Before any algorithm in this library is worth running, something has to turn a
raw feed into a series you can compute on. That layer is unglamorous, almost
never taught, and responsible for most of the wrong numbers in production
systems.

## A feed is a stream of trades, not candles

Every chart you have seen is the result of a **choice** about how to group
individual trades, and most people never learn they made one.

Time bars — one bar per minute, per hour, per day — are a convention inherited
from paper tape. They sample the market at a constant rate regardless of how much
is happening in it. At the open, a one-minute bar can contain thousands of trades;
at lunchtime it can contain three. The bars look identical on a chart and carry
wildly different amounts of information.

The library offers the alternatives explicitly:

| Bar type | Closes when | Useful because |
|---|---|---|
| [Time](/market-data-engineering/bar-construction/time-bars/) | A clock interval elapses | Universal, comparable, familiar |
| [Tick](/market-data-engineering/bar-construction/tick-bars/) | N trades have occurred | Bars arrive at the rate the market transacts |
| [Volume](/market-data-engineering/bar-construction/volume-bars/) | N shares have traded | Far more stable statistical properties |
| [Dollar](/market-data-engineering/bar-construction/dollar-bars/) | N currency traded | Stays comparable as the price level changes |

Volume and dollar bars are not exotic — they produce return series closer to
normally distributed than time bars do, which matters for anything that assumes
it. Dollar bars are the more robust of the two: 1,000 shares of a $10 stock and
of a $500 stock are not the same event, and only dollar bars know that.

The [imbalance and run bars](/market-data-engineering/bar-construction/tick-imbalance-bars/)
go further, closing a bar when signed flow becomes unusually one-sided relative
to recent expectation — sampling by *information* rather than by clock or
quantity.

```ts
import { constructBars } from "fintech-algorithms/market-data-engineering/bar-construction/dollar-bars";
```

## Real feeds carry garbage

A production feed contains fat-finger prints, duplicate messages, crossed quotes
and stale prices. One bad tick destroys an average; one duplicated trade inflates
volume; one crossed quote implies an arbitrage that does not exist.

The design decision that matters here: **validators return a verdict per row
rather than throwing.**

```ts
import { calculate } from "fintech-algorithms/market-data-engineering/cleaning-and-validation/ohlc-consistency-validator";

const verdicts = calculate(bars);
const clean = bars.filter((_, i) => verdicts[i].status === "ok");
```

One malformed bar in a batch of ten thousand should not lose the other 9,999 —
and it should not pass unnoticed either. That is the single most surprising
behaviour in the library, and it is deliberate.

A few specifics worth knowing:

- **The Hampel filter** flags points far from a rolling *median*, measured in
  robust deviations, so one fat-finger print cannot inflate the very statistic
  used to detect it. Its `mode` parameter matters enormously: `centred` sees
  future points and **must never run on a live feed**.
- **Crossed and locked markets** — bid above ask, or equal to it — are almost
  always a stale or misordered feed rather than a real arbitrage. Catch them
  before anything downstream trusts the spread.
- **Duplicate resolution** must be idempotent under replay, and a cancellation
  has to survive a later redelivery of the trade it cancelled. The
  [reference page](/market-data-engineering/cleaning-and-validation/duplicate-trade-resolver/)
  keeps cancelled trades as tombstones for exactly that reason.

## Timestamps are the hard part

Two feeds never agree exactly, and their clocks drift.

The distinction that unlocks this domain is between **event time** — when the
thing happened at the venue — and **available time** — when you could actually
have known about it. Every point-in-time guarantee in the library rests on
carrying both.

That distinction is what separates the two interpolation methods:

- [Previous-tick interpolation](/market-data-engineering/time-synchronization/previous-tick-interpolation/)
  carries the last value known *at that moment* forward. It is the only method
  safe on live data, because it never uses a value that had not yet arrived.
- [Linear quote interpolation](/market-data-engineering/time-synchronization/linear-quote-interpolation/)
  interpolates between the quotes either side of a target. More accurate, and
  **not causal** — it reads a quote from after the target. Research only.

The reference page for the second says so explicitly, because the two have nearly
identical signatures and completely different safety properties.

**Refresh-time sampling** solves a subtler problem: if you compute correlations
across instruments that trade at different times, non-synchronous trading biases
them toward zero. The remedy is a common clock that advances only when every
instrument has refreshed.

## Feeds degrade rather than fail

This is the operational insight. A feed rarely goes down cleanly. Latency creeps,
bars go missing, a vendor renames a field. Each has a different cause and a
different remedy, so the library reports them separately rather than as one
"feed unhealthy" flag:

- [Missing-bar gap classifier](/market-data-engineering/data-quality/missing-bar-gap-classifier/)
  — was the session closed, the instrument halted, the feed dropped, or a
  sequence number skipped? Only some of those are incidents, and treating them
  alike produces alert fatigue.
- [Feed latency monitor](/market-data-engineering/data-quality/feed-latency-monitor/)
  — validates that a latency measurement is *meaningful* before computing one.
  Subtracting timestamps written by two unsynchronised clocks produces a number,
  and that number means nothing.
- [Schema drift detector](/market-data-engineering/data-quality/schema-drift-detector/)
  — vendors rename and retype fields without announcement. A silently renamed
  field is worse than an outage, because nothing fails.
- [Stale quote detector](/market-data-engineering/cleaning-and-validation/stale-quote-detector/)
  — separates old-at-source from delayed-in-transport from unchanged-too-long.

## Never trust one vendor

Serious platforms run several feeds and reconcile them. Two sources never agree
exactly, so the reconciliation layer has to decide who is right — or refuse to
decide.

```ts
import { consensus } from "fintech-algorithms/market-data-engineering/data-quality/price-source-consensus-check";
```

[The result](/market-data-engineering/data-quality/price-source-consensus-check/)
is a **status**, not a bare number. A refusal to price when the quorum is not met
or the sources disagree beyond tolerance is a legitimate and important outcome —
returning a plausible average from two disagreeing feeds is how bad prices reach
production.

## Reconstructing an order book

If you consume depth rather than trades, the feed gives you a snapshot plus a
stream of deltas, and rebuilding the book correctly is its own discipline.

- **Level 2** is quantity per price level. A delta applied twice corrupts it
  invisibly.
- **Level 3** preserves individual orders and therefore queue position — the only
  basis for a realistic fill model.
- **Sequence gaps** are not a nuisance. Every message after a gap is applied to a
  book that is already wrong, so the
  [recovery routine](/market-data-engineering/order-book-feed-engineering/sequence-gap-detection-and-recovery/)
  decides between buffering and a full resync from snapshot.
- **Snapshot reconciliation** is the only thing that catches an incremental path
  that has been silently wrong for hours.

This is where market data engineering hands off to
[market microstructure](/concepts/market-microstructure/), which assumes a
correct book and asks what it means.

## Point in time, always

The final discipline, and the one that invalidates the most research.

```ts
import { asOfSnapshot } from "fintech-algorithms/market-data-engineering/data-quality/point-in-time-availability-guard";

asOfSnapshot(records, "2024-03-15T16:00:00Z");
```

Each record carries an `available_at` alongside its `observation_time`. The guard
returns only what had actually been published by the knowledge time, using the
latest revision available *then* rather than the corrected figure available now.

A backtest that reads a restated earnings figure hours before it was published
will look excellent and be worthless. The same idea drives the point-in-time
topics in [corporate actions](/concepts/corporate-actions/).

## A working pipeline

```
raw feed
  → normalise to a canonical event shape
  → validate, keeping verdicts rather than dropping rows
  → reconcile across sources
  → align clocks (causally)
  → construct bars — and consider whether time is the right clock
  → apply corporate actions
  → compute
```

Steps 2 and 3 are the ones most often skipped, and steps 4 and 7 are where the
subtle errors live.

## Why this domain exists

Every other domain in this library assumes clean, aligned, point-in-time correct
input. This is the domain that produces it — and none of its failures announce
themselves. A stale quote, a duplicated trade, a bar built across a gap, an
interpolation that peeked forward: all of them produce finite, plausible numbers
that pass every type check you have.
