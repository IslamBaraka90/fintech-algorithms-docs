# Corporate actions

Every price series you will ever load is wrong until someone adjusts it. Not
approximately wrong — wrong in ways that produce a 50% crash on a day the company
had a good quarter, and wrong in ways that no error message will ever tell you
about.

This guide is about what corporate actions do to a price history, why the naive
fixes fail, and the order operations have to be applied in.

## The problem, in one chart

On 31 August 2020 Apple closed at $499.23. On 1 September it opened at $127.58.
Nothing happened to Apple. It executed a 4-for-1 stock split: every holder of one
share now held four, each worth a quarter as much. The company was worth exactly
what it had been worth the day before.

An unadjusted series records a **74.4% single-day loss**. Every indicator
computed over that series sees a crash:

- A 20-day moving average is dragged down for a month
- Volatility measures record an enormous outlier
- A momentum strategy sells
- A drawdown calculation reports a catastrophe that never happened

None of this raises an exception. The numbers are all finite, all plausible in
isolation, and all wrong.

## What "adjusting" actually means

The fix is to restate history so the series is **continuous in economic terms**.
For a split, that means dividing every pre-split price by the split ratio, and
multiplying every pre-split volume by it.

```ts
import { calculate } from "fintech-algorithms/corporate-actions-and-security-master-data/adjustment-factors/backward-split-adjustment";

calculate({
  prices: [120, 123, 60, 62],
  volumes: [1000, 1200, 2400, 2000],
  eventIndex: 2,
  postSplitSharesPerPreSplitShare: 2,
});
// adjustedPrices:  [60, 61.5, 60, 62]
// adjustedVolumes: [2000, 2400, 2400, 2000]
```

Two things in that call are worth dwelling on.

**The ratio has a direction, and it is the direction people get wrong.**
`postSplitSharesPerPreSplitShare: 2` means one old share became two. Invert it
and the adjustment doubles historical prices instead of halving them — producing
a series that is smooth, plausible, and off by a factor of four. This is common
enough that [the reference page](/corporate-actions-and-security-master-data/adjustment-factors/backward-split-adjustment/)
returns the convention it applied, so a result can be checked rather than
trusted.

**Volume moves the opposite way to price.** Adjusting one without the other
silently corrupts every turnover, liquidity and volume-confirmation measure
downstream. If you use
[OBV](/technical-indicators/volume-indicators/obv/) or
[money flow](/technical-indicators/volume-indicators/money-flow-index/), this
matters as much as the price adjustment does.

## Dividends: the adjustment people skip

A split is obvious because the chart jumps. A dividend is not, and that is
exactly why it gets ignored.

When a stock goes ex-dividend, the price drops by roughly the dividend amount.
That drop is not a loss — the holder received cash — but a price series records
it as one. Over a single quarter it is noise. Over twenty years on a broad equity
index it is roughly **2% a year, compounding**, which is the difference between
a price chart and reality.

This is why the same index is published as several different numbers:

| Variant | Dividends | Who it describes |
|---|---|---|
| Price return | Ignored | Nobody. It is a convention, not an investor. |
| Gross total return | Reinvested in full | A holder who suffers no withholding tax |
| Net total return | Reinvested after withholding | A foreign holder paying treaty rates |

They are published under nearly the same name and they diverge materially over a
decade. Quoting the wrong one is a misstatement, not a rounding difference. See
[Cash Dividend Total Return Adjustment](/corporate-actions-and-security-master-data/adjustment-factors/cash-dividend-total-return-adjustment/)
for the contract, and
[index return variants](/index-and-benchmark-engineering/return-variants/) for how
the same distinction plays out at index level.

## "Dividend" is four different events

The word covers four economically distinct things, and they adjust differently:

- **Cash dividend** — the ordinary case. Price adjusts, cash is reinvested.
- **Special dividend** — large or irregular enough that treating it as ordinary
  misstates the series. The hard part is not the arithmetic but the
  *classification*, which is a judgement. The
  [reference page](/corporate-actions-and-security-master-data/complex-distributions/special-dividend-adjustment/)
  returns the classification **and the reason for it**, because a judgement
  without its rationale cannot be reviewed.
- **Stock dividend** — additional shares instead of cash. Economically close to a
  split, reported differently, and with a volume convention that differs between
  vendors.
- **Return of capital** — reduces the investor's cost basis rather than paying
  income. Affects price continuity *and* tax reporting, differently from a
  dividend. Conflating the two misstates both.

## The hard half: rights issues and spin-offs

Splits and dividends are the easy cases. Two events are genuinely difficult.

**A rights issue** gives shareholders the right to buy new shares below the
market price. Value transfers rather than disappearing, and the price that makes
the series continuous is the *theoretical ex-rights price* — TERP. It is neither
a dividend nor a split, and applying either produces a wrong series.

**A spin-off** forks one company's history into two. The parent's price falls by
the value that left with the child, and the parent's own history must be restated
by that amount — otherwise the parent shows a decline it never suffered. The
difficulty is that the child's value is often not reliably known on the day, so
[the calculation](/corporate-actions-and-security-master-data/complex-distributions/spin-off-price-adjustment/)
returns a **status** rather than a number when it cannot be established.

## Order of application matters

This is the trap that survives even careful implementations.

Adjustments compose, and they do not commute. A split applied before a dividend
adjustment gives a different answer from the same two applied in the other order,
because the second operates on prices the first has already changed. If a
security had a 2-for-1 split and a $1 dividend in the same week, "adjust for both"
is not a well-defined instruction.

The library handles this by making the *preceding actions* an explicit input
rather than an assumption — see `precedingActions` on
[Special Dividend Adjustment](/corporate-actions-and-security-master-data/complex-distributions/special-dividend-adjustment/).
If your own pipeline applies adjustments in a loop, the order that loop runs in
is a decision you have made whether or not you meant to.

## The ticker is not the company

A related failure, and a worse one because it corrupts data rather than distorting
it.

Tickers are recycled. Companies rename, merge, and vanish. When Facebook became
META in June 2022, every database keyed on the symbol acquired two disconnected
halves of one company's history, and nothing threw an error. Somewhere, a ticker
that once meant one company now means another entirely.

The fix is to key on a **permanent identifier** and resolve symbols through it:

```ts
import { resolveTickerChain } from "fintech-algorithms/corporate-actions-and-security-master-data/identity-continuity/ticker-change-chain-resolution";
```

The [identity continuity family](/corporate-actions-and-security-master-data/identity-continuity/)
covers renames, share-class relationships, merger predecessor and successor
mapping, and delisting.

That last one is worth naming: **delisting returns are the single largest source
of survivorship bias in equity research**, because the companies that failed are
exactly the ones with no final price. Omitting them does not produce a small
error; it produces a backtest that never held anything that went to zero.

## Point in time, not as-of-today

Everything above assumes you know what the corporate action was. But corporate
actions are announced, amended, and occasionally cancelled — and a backtest that
applies the *final, corrected* version of an event is using information nobody had
at the time.

Every point-in-time topic in the library separates two timestamps:

- **`effectiveAt`** — the date the thing happened
- **`knownAt`** — the date you are asking from

They differ whenever a change is announced before it takes effect, or corrected
afterwards. Conflating them **is** survivorship bias, in one line. See
[Historical Constituent Reconstruction](/corporate-actions-and-security-master-data/point-in-time-universe/historical-constituent-reconstruction/)
and the [survivorship guard](/corporate-actions-and-security-master-data/point-in-time-universe/survivorship-bias-guard/),
which is a gate rather than a transform: the failure is the product.

## A working order of operations

If you are building a pipeline, this is a defensible sequence:

1. **Resolve identity** — map vendor symbols to a permanent key before anything else
2. **Reconstruct the point-in-time universe** at your `knownAt`
3. **Apply splits and stock dividends** — the share-count adjustments
4. **Apply distributions** — cash, special, return of capital, in event order
5. **Handle the hard events** — rights issues, spin-offs, mergers
6. **Reconcile** — adjusted prices should reproduce a published total-return figure

Step 6 is the one people skip and the only one that catches a mistake. If your
adjusted series cannot reproduce a published index total return to within a few
basis points, something in steps 3–5 is wrong.

## Why this is the hardest part of the library to get right

Nothing in this domain fails loudly. A wrong split ratio produces a smooth chart.
A missing dividend produces a plausible return. A recycled ticker produces a
complete-looking history. Every one of these will pass a code review, satisfy a
type checker, and run in production for years.

That is why the reference pages in this domain document the trap rather than
restating the signature — and why the ones that make a judgement return the
reason alongside the answer.
