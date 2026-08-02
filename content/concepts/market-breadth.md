# Market breadth

The index went up. Did the market?

Those are different questions, and a capitalisation-weighted index cannot answer
the second. Breadth is the family of measures that counts participants instead of
watching price — and when the two disagree, the disagreement is the signal.

## Why an index is not the market

In a cap-weighted index, the largest constituents dominate the level. When a
handful of very large companies rise while most others fall, the index still goes
up. Nothing is wrong with the index — it is doing exactly what it was designed to
do — but "the market rose" is not a fair description of that day.

Breadth measures ask a different question: **how many** things went up, not how
much weight went up.

```ts
import { calculateNetAdvances } from "fintech-algorithms/market-breadth-and-internals/advance-decline-breadth/net-advances";
```

## Start with counting, then fix the counting

**Net advances** — advances minus declines — is the simplest measure and the
input to most others.

It has one flaw that took the field decades to fix: the number of listed issues
changes. A net-advance reading of +800 meant something different in 1970 than it
does today, because the universe has grown. Raw counts are not comparable across
eras.

The fix is to make it **scale-free**:

- [Advance/decline ratio](/market-breadth-and-internals/advance-decline-breadth/advance-decline-ratio/)
  — advances divided by declines
- [Normalized A/D line](/market-breadth-and-internals/advance-decline-breadth/normalized-advance-decline-line/)
  — net advances divided by issues traded, then accumulated

Everything downstream inherits this problem, which is why the McClellan family
exists in both traditional and ratio-adjusted forms.

## The cumulative line, and what it is for

Running net advances into a cumulative total gives the **advance/decline line**.
Its level is arbitrary — it depends entirely on where you started the
accumulation — so the level carries no information at all.

The shape does. Specifically, **divergence**: when the index makes a new high and
the A/D line does not, fewer and fewer names are participating in the advance.
That has preceded most significant tops, and it is visible weeks before price
confirms it.

One caution the [reference page](/market-breadth-and-internals/advance-decline-breadth/cumulative-advance-decline-line/)
enforces: a gap in a cumulative series propagates forward **forever**. Miss three
sessions and every subsequent value is wrong by that amount. The routine returns
the sessions it could not find rather than silently bridging them, and it applies
a knowledge cutoff so revisions arriving later do not quietly rebuild history
into a line nobody traded.

## The McClellan family

The [McClellan oscillator](/market-breadth-and-internals/mcclellan-family/ratio-adjusted-mcclellan-oscillator/)
is the difference between a 19-day and a 39-day exponential average of net
advances. Fast, noisy, and useful for spotting short-term extremes.

The [summation index](/market-breadth-and-internals/mcclellan-family/ratio-adjusted-summation-index-rasi/)
accumulates the oscillator, turning a fast signal into a slow regime gauge. The
oscillator says what is happening this week; the summation index says what has
been happening for months.

Both come in traditional and ratio-adjusted forms, and the choice matters:
**only the ratio-adjusted versions are comparable across decades**. Historical
threshold values quoted for the traditional oscillator were derived on a much
smaller universe of listed issues.

There are volume-weighted variants too, and when the issue-based and
volume-based readings disagree, that disagreement is itself informative — many
small advancers versus a few heavily-traded ones.

## Participation: how many are actually in an uptrend?

Advance/decline measures one session. These measure position over a long lookback:

- [New highs and new lows](/market-breadth-and-internals/high-low-and-trend-breadth/new-highs-new-lows/)
  — how many issues reached 52-week extremes. A rally where fewer and fewer names
  make new highs is thinning.
- [Percent above the 200-day average](/market-breadth-and-internals/high-low-and-trend-breadth/percent-above-200-day-ma/)
  — a market with 80% of names above their long-term average is a different
  market from one with 35%, even at the same index level.

The 20-, 50- and 200-day variants read different horizons: short-term turnover,
intermediate trend health, and long-term participation.

A detail worth noting in the reference: these return `equal_count` separately.
Securities sitting exactly on their moving average are neither above nor below,
and folding them either way biases the reading.

## Pressure and exhaustion

Some breadth measures capture force rather than direction.

**TRIN** (the Arms index) divides the advance/decline *issue* ratio by the
advance/decline *volume* ratio. Above 1 means declining issues are absorbing
proportionally more volume than their numbers suggest. It is a comparison of two
ratios, so inverting either one flips the reading — which is why the
[reference page](/market-breadth-and-internals/thrust-and-pressure/arms-index-trin/)
exposes both components.

**The Zweig breadth thrust** is the rare one: the advance ratio moving from below
0.40 to above 0.615 within ten sessions. It fires a handful of times in a
generation, and has historically marked the start of major advances. That rarity
is the point — and also why it cannot be validated on a short sample.

**Upside/downside volume ratio** at extremes — a 9-to-1 up day — is a recognised
initiation signal for the same reason: it is rare.

## Concentration: the most topical question in markets

"Seven stocks are holding up the entire market." How would you prove it?

```ts
import { calculate } from "fintech-algorithms/market-breadth-and-internals/concentration-and-diffusion/top-n-index-contribution";
```

[Top-N contribution](/market-breadth-and-internals/concentration-and-diffusion/top-n-index-contribution/)
answers it directly: how much of the index's move came from its largest N
members. It is a claim that is usually asserted and rarely measured.

Two companions make it rigorous:

- **Herfindahl concentration** — the sum of squared weights. Squaring is what
  makes it a concentration measure: it is dominated by the largest holdings in a
  way a simple count never is. Note it is reported both as a fraction and in
  points, which differ by a factor of 10,000 and are frequently confused.
- **Effective number of constituents** — the reciprocal of HHI. An index of 500
  names with an effective number of 60 is, for risk purposes, a 60-stock
  portfolio. **The gap between the actual count and the effective count is the
  entire message.**

**Diffusion** asks the same question across groups rather than constituents: what
share of sectors, or of factors, is improving? A move concentrated in one sector
and a move spread across all eleven look identical at index level.

## Reading breadth honestly

Three cautions, all of which the reference pages encode.

**Ready flags, not zeros.** Rows carry a `ready` flag, and a row that is not
ready is excluded rather than treated as zero. A missing count and a count of
zero mean opposite things about participation.

**The universe is the argument.** Two systems disagreeing on breadth almost
always disagree about *which securities were in the universe*, not about the
arithmetic. That is why every reference page here returns the universe id and
revision alongside the number.

**Point-in-time or nothing.** Breadth data is revised routinely. A cumulative
line silently rebuilt from revised inputs is not the line anyone traded, so the
cumulative topics take a knowledge cutoff and ignore anything that arrived after
it.

## A dashboard, in order

If you are assembling a breadth view, this sequence builds up:

1. **Net advances and the A/D ratio** — the daily reading
2. **The cumulative A/D line** — the shape, watched for divergence
3. **McClellan oscillator and RASI** — fast signal and slow regime
4. **Percent above 50- and 200-day** — participation across horizons
5. **TRIN and upside/downside volume** — pressure
6. **Top-N contribution and effective N** — how narrow is this?

Steps 1–3 tell you what breadth is doing. Steps 4–6 tell you whether to believe
the index.

## Where this connects

Breadth is computed *over* a universe, and the universe has to be reconstructed
point-in-time — which is
[corporate actions](/concepts/corporate-actions/) territory. It is computed *from*
prices that need adjustment, which is the same domain. And the concentration
measures are the same arithmetic an index provider uses when
[capping weights](/concepts/index-construction/).

The [reference pages](/market-breadth-and-internals/) state each contract
exactly.
