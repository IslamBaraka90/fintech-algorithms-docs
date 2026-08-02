# Market microstructure

Price is not a number the market hands you. It is the outcome of a queue, a set
of rules, and the accumulated decisions of everyone who arrived before you. This
guide is about the layer beneath the chart — where orders become prices, and
where the cost of trading actually lives.

## The spread is three different numbers

Ask what a trade costs and the honest answer is a question back: measured how?

**Quoted spread** — ask minus bid. What the book advertises, and the upper bound
on what a small marketable order pays.

```ts
import { quotedSpread } from "fintech-algorithms/market-microstructure/liquidity-and-spreads/quoted-spread";
```

**Effective spread** — twice the signed distance from the midpoint to the price
you actually got. Narrower than quoted when you execute inside the spread, wider
when you sweep multiple levels. This is what the trade cost.

**Realized spread** — the effective spread measured against the midpoint *after*
a horizon. It strips out the permanent price impact and leaves what the liquidity
provider actually earned.

The relationship is the useful part:

```
effective spread = realized spread + price impact
```

If you executed and the price kept moving your way, you paid the effective spread
but the market maker did not earn it — they were adversely selected. The horizon
you choose determines how much of the move is called impact rather than spread,
so it is a modelling decision, not a detail. Five minutes is conventional.

See [Realized Spread](/market-microstructure/liquidity-and-spreads/realized-spread/)
for the decomposition.

## When you have no quotes

Historical tapes often carry trades and nothing else. Two estimators exist for
exactly this, and both are worth knowing because both fail in instructive ways.

**Roll's estimator** infers the spread from the negative serial covariance of
price changes. Bid-ask bounce makes consecutive changes negatively correlated;
the size of that correlation implies the spread. When the covariance comes out
*positive* the model is contradicted — and the honest handling is to report zero
with a validity flag rather than an imaginary number.
[The reference page](/market-microstructure/liquidity-and-spreads/roll-spread-estimator/)
returns both.

**Corwin-Schultz** uses daily high-low ranges over two days, exploiting that the
range reflects both volatility and spread while volatility scales with time and
the spread does not. It frequently returns negative estimates, which are
theoretically impossible. Clipping them to zero is the authors' recommendation;
leaving them visible is more honest when averaging across a sample. That is a
parameter, not a default.

**Amihud illiquidity** is the low-frequency workhorse: average absolute return
per dollar traded, needing only daily data. One caution — the raw value is tiny,
so published figures are almost always scaled, and papers differ on by how much.
A figure quoted without its scale is not comparable to anything.

## Signing trades: who initiated?

Most microstructure work needs to know whether a trade was buyer- or
seller-initiated. The tape rarely says.

| Rule | Needs | Fails when |
|---|---|---|
| [Tick test](/market-microstructure/trade-classification/tick-test/) | Trade prices only | Price unchanged from the last trade |
| [Quote test](/market-microstructure/trade-classification/quote-test/) | Prevailing quotes | Trade exactly at the midpoint |
| [Lee-Ready](/market-microstructure/trade-classification/lee-ready-trade-signing/) | Both | Fewer cases — it is the hybrid |
| [Bulk volume](/market-microstructure/trade-classification/bulk-volume-classification/) | Aggregated bars | Assigns a *fraction*, not a sign |

Lee-Ready is the standard: quote test where the trade is away from the midpoint,
tick test at it. Most empirical results in the literature are built on it, so
reproducing them requires that rule specifically rather than a plausible
equivalent.

The classifiers disagree on exactly the ambiguous cases, which is why every
reference page here reports the count of unclassifiable trades rather than
silently picking a side.

## Order flow predicts short-horizon price moves

This is the most robust empirical finding in the field, and it is not about
trades.

**Order flow imbalance** counts the net signed change in depth at the touch —
including additions and cancellations, not just executions. It explains
short-horizon price movement better than trade volume does, because a cancelled
bid removes support just as effectively as a sale.

**Queue imbalance** — the share of depth resting on the bid versus the ask — is
simpler still and strongly predictive at very short horizons. One level is the
classic definition; going deeper captures a broader picture and dilutes the
signal.

**Microprice** is the counter-intuitive one. It weights the midpoint by the
*opposite* side's size, so a heavy bid pulls the price **up**:

```ts
import { microprice } from "fintech-algorithms/market-microstructure/order-book-dynamics/microprice";
```

That reads backwards until you see what it is estimating: not where the price is,
but where it is going. A large resting bid means buyers are queued and sellers
are scarce, so the next midpoint move is more likely up.

## Measuring information: Kyle, PIN, VPIN

Three ways to ask how much of the flow is informed.

**Kyle's lambda** is the price-impact coefficient from regressing price change on
signed order flow. Lambda *is* the illiquidity parameter in Kyle's model — higher
means each unit of flow moves price more. The
[reference page](/market-microstructure/order-flow-and-impact/kyle-lambda/)
returns R² alongside it, because a lambda from a regression that explains nothing
is a number rather than a measurement.

**PIN** — probability of informed trading — is estimated by maximum likelihood on
daily buy and sell counts. It is notoriously hard to optimise: the likelihood has
flat regions and local optima, which is why multiple starting points are a
parameter and why the result carries a convergence flag. An unconverged PIN is
not an estimate.

**VPIN** measures imbalance in *volume* buckets rather than clock time. It was
proposed as a flash-crash early warning and its predictive claims are actively
disputed. Worth computing, worth reading the debate before relying on.

## Depth: what can you actually trade?

The spread tells you the cost of a small order. For anything larger the question
is how deep the book is, and the honest answer requires walking it.

```ts
import { expectedFillPrice } from "fintech-algorithms/market-microstructure/market-depth-analytics/expected-market-order-fill-price";
```

[This](/market-microstructure/market-depth-analytics/expected-market-order-fill-price/)
returns `filled_quantity` and `unfilled_quantity` as separate fields, deliberately.
A book too thin to fill your order is not an edge case — it is the case that
matters, and an average price computed over a partial fill is misleading unless
you can see it was partial.

**Order book slope** measures how steeply depth accumulates away from the touch.
A steep book absorbs size with little movement; a flat one does not. Two
instruments can show identical spreads and behave completely differently under
size.

**Resiliency** is the third dimension, after spread and depth: how quickly the
book refills after being hit. It decides whether a large order can be worked at
all, and it is what a
[decay fit](/market-microstructure/order-book-dynamics/order-book-resiliency/)
estimates.

Treat **liquidity walls** with suspicion. A level holding disproportionate size
looks like a barrier — but a wall that disappears the moment price approaches was
never liquidity.

## Order arrivals cluster

Order flow is bursty, not smooth. A Poisson process cannot represent that; a
**Hawkes process** can, because each arrival raises the probability of the next.

The parameter to watch is the **branching ratio** — excitation divided by decay.
At or above 1 the process is explosive, has no stationary distribution, and any
forecast from it is meaningless. The
[reference page](/market-microstructure/order-book-dynamics/hawkes-order-arrival-model/)
returns it and a stability flag rather than quietly producing a diverging number.

## Where this connects

Microstructure sits between two other domains in the library:

- Below it, [market data engineering](/concepts/market-data-engineering/) —
  reconstructing the book from a feed at all, and doing it causally
- Beside it, matching engines and execution — the rules that produce the queue,
  and the algorithms that work an order through it

If you are building a realistic fill model, you need all three: the book from
D01, the depth and impact estimates from D11, and the matching rules from D12
that decide where in the queue your order actually sits.

## The honest caveat

Almost everything here was established on US equities, and much of it on data
from a market structure that has since changed. The estimators still work; the
*parameters* people quote — the five-minute horizon, the 0.015 scaling, the
conventional thresholds — are conventions from particular papers on particular
samples.

Recompute them on your own data before treating any threshold as a constant.
