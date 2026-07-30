# Plotting an indicator on a chart

Charting libraries want `{ time, value }` pairs. The library returns bare arrays
positioned against your input. Getting from one to the other is four lines — and
the way most people write those four lines introduces an off-by-warm-up error
that is invisible until someone checks a number by hand.

This guide uses [Lightweight Charts](https://tradingview.github.io/lightweight-charts/),
but nothing here is specific to it.

## The mistake to avoid

```ts
// WRONG — the series is now shifted left by the warm-up length
const ema = calculateEma(closes, 20).filter((v) => v !== null);
const points = ema.map((value, i) => ({ time: bars[i].time, value }));
```

`calculateEma` returned 19 leading `null`s. Filtering them out first destroys the
correspondence between output index and bar index, so every point is drawn 19
bars too early. The chart still looks plausible, which is what makes it
dangerous.

## The correct join

Map first, filter second:

```ts
import { calculateEma } from "fintech-algorithms/technical-indicators/trend-smoothing/ema";

const closes = bars.map((b) => b.close);
const ema = calculateEma(closes, 20);

const points = bars
  .map((bar, i) => ({ time: bar.time, value: ema[i] }))
  .filter((p) => p.value !== null);
```

The index is consumed while it is still meaningful. `points` is now safe to hand
to any charting library.

```ts
const line = chart.addLineSeries({ color: "#0b5cd5", lineWidth: 2 });
line.setData(points);
```

## Multi-output indicators

Some algorithms return an object of parallel series rather than one array. MACD
is the common case:

```ts
import { macd } from "fintech-algorithms/technical-indicators/trend-systems/macd";

const { macdLine, signalLine, histogram } = macd(closes, 12, 26, 9);

const toPoints = (series: (number | null)[]) =>
  bars
    .map((bar, i) => ({ time: bar.time, value: series[i] }))
    .filter((p) => p.value !== null);

macdSeries.setData(toPoints(macdLine));
signalSeries.setData(toPoints(signalLine));
histogramSeries.setData(toPoints(histogram));
```

Each series carries its own warm-up: the signal line is defined later than the
MACD line, because it is an average *of* it. Keeping the join generic, as above,
handles that without special cases.

## Bands and channels

Bollinger Bands, Keltner and Donchian all return an upper, middle and lower
series. Charting libraries usually want them as separate line series, or as an
area between two lines:

```ts
import { calculate } from "fintech-algorithms/technical-indicators/volatility-and-channels/bollinger-bands";

const { upper, middle, lower } = calculate(closes, 20, 2);

upperSeries.setData(toPoints(upper));
middleSeries.setData(toPoints(middle));
lowerSeries.setData(toPoints(lower));
```

## Adjust prices before you plot them

This is the step almost every tutorial skips, and it is the reason a chart shows
a 50% crash that never happened.

If your provider returns unadjusted prices, apply the corporate actions **before**
computing anything:

```ts
import { calculate as backwardSplit }
  from "fintech-algorithms/corporate-actions-and-security-master-data/adjustment-factors/backward-split-adjustment";

const { adjustedPrices } = backwardSplit({
  prices: closes,
  volumes,
  eventIndex: splitBarIndex,
  postSplitSharesPerPreSplitShare: 2,
});

const ema = calculateEma(adjustedPrices, 20);
```

A 2-for-1 split halves the price overnight. Unadjusted, every indicator you own
reads that as a crash — and every backtest over it is wrong. See
[Backward Split Adjustment](/corporate-actions-and-security-master-data/adjustment-factors/backward-split-adjustment/)
for the full contract, and
[CRSP Cumulative Price Adjustment](/corporate-actions-and-security-master-data/adjustment-factors/crsp-cumulative-price-adjustment/)
when you have a whole history of events rather than one.

## Bars from a raw trade tape

If you receive ticks rather than candles, build the bars yourself — and consider
whether time is the right clock at all:

```ts
import { constructBars } from "fintech-algorithms/market-data-engineering/bar-construction/time-bars";
import { constructBars as dollarBars }
  from "fintech-algorithms/market-data-engineering/bar-construction/dollar-bars";

const minuteBars = constructBars(trades, { intervalMs: 60_000 });
const activityBars = dollarBars(trades, { threshold: 1_000_000 });
```

Time bars sample the market at a constant rate regardless of how much is
happening in it. Dollar bars sample it by traded value, so quiet periods produce
fewer bars and busy ones produce more.

## Rendering server-side

Nothing in the library touches the DOM, the filesystem or the network, so the
same code runs in a Worker, in Deno, or on a server generating a PNG. The only
part that differs is what consumes `points` at the end.
