# Index construction

An index is a divisor with marketing attached. Once you understand that sentence,
the other thirty-nine algorithms in this domain are maintenance.

## The whole idea, in four lines

An index level is a market value divided by a number:

```
level = market value of the constituents / divisor
```

Pick a base date, pick a base level — 100 and 1000 are both conventional — and
the divisor falls out:

```ts
import { calculate } from "fintech-algorithms/index-and-benchmark-engineering/index-initialization-and-continuity/index-divisor-initialization";

calculate({ marketValue: 250, baseLevel: 1000 });
// { marketValue: 250, divisor: 0.25, indexLevel: 1000 }
```

That is the entire mechanism. Everything else in index engineering exists to
answer one question: **what do you do when the market value changes for a reason
that is not a price move?**

## The divisor absorbs everything that is not economics

A constituent issues new shares. A member is swapped out. A company splits. In
each case the aggregate market value of the index jumps — but nothing has happened
to the *market*, so the index level must not move.

The answer is to rescale the divisor so the level is unchanged across the event:

```ts
import { calculate } from "fintech-algorithms/index-and-benchmark-engineering/index-initialization-and-continuity/divisor-continuity-adjustment";

calculate({ oldMarketValue: 1_000_000, newMarketValue: 1_200_000, oldDivisor: 1000 });
// oldLevel, newDivisor, bridgedLevel, continuityError
```

The [reference page](/index-and-benchmark-engineering/index-initialization-and-continuity/divisor-continuity-adjustment/)
returns a `continuityError`. It should be zero or floating-point dust. Anything
larger means the before and after values were **not measured at the same
prices** — the adjustment has absorbed a real price move, and the index has
quietly lost information. That single field is the best diagnostic in the domain.

This is also the bridge to [corporate actions](/concepts/corporate-actions/):
when a constituent splits, the D02 machinery adjusts the constituent's price
series, and the
[divisor bridge](/index-and-benchmark-engineering/index-initialization-and-continuity/corporate-action-divisor-bridge/)
routes the non-market part of the value change through the divisor.

## Weighting is a choice, and it is the choice

Cap weighting is one option among a dozen, and each tells a different story about
the same market.

**Price weighting** — the Dow. Sum the prices, divide by a divisor. Weight follows
share *price*, not company size, so a $500 stock moves it more than a $50 stock
ten times larger. This is why the Dow and the S&P disagree on ordinary days.

**Market-cap weighting** — the textbook default. Weight by company size.

**Free-float weighting** — weight by the shares that can actually be bought.
Strategic, government and insider holdings are excluded, because a fund cannot buy
shares that are not for sale. This is what makes an index *replicable*, and it is
the reason a float factor exists at all.

**Everything else** — [fundamental](/index-and-benchmark-engineering/alternative-weighting/fundamental-weighted-index/),
[dividend yield](/index-and-benchmark-engineering/alternative-weighting/dividend-yield-weighted-index/),
[factor score](/index-and-benchmark-engineering/alternative-weighting/factor-score-weighted-index/),
[minimum volatility](/index-and-benchmark-engineering/alternative-weighting/minimum-volatility-index/),
[equal risk contribution](/index-and-benchmark-engineering/alternative-weighting/equal-risk-contribution-index/).
Each encodes a view about what "the market" should mean.

Two of these carry warnings worth repeating. **Dividend-yield weighting**
mechanically overweights companies in distress, because yield rises as price
falls. **Minimum volatility** is only as good as its covariance estimate — and a
covariance matrix estimated from fewer observations than assets is not positive
semi-definite, which no optimiser can rescue.

## Capping is subtler than it looks

No serious index lets one constituent take over. Regulation requires limits — the
UCITS 5/10/40 rule is the best-known — and mandates impose more.

The naive implementation is to cap the offenders at the limit. That is wrong,
and the reason is worth understanding: **capping one name lifts everyone else**,
because the excess weight has to go somewhere. Redistributing it can push a
second name over the cap, which requires another pass, which can push a third.

```ts
import { calculate } from "fintech-algorithms/index-and-benchmark-engineering/weighting-and-capping/iterative-cap-redistribution";
```

[The routine](/index-and-benchmark-engineering/weighting-and-capping/iterative-cap-redistribution/)
iterates to convergence and returns `iterations`, `maxWeight` and `weightSum` so
you can check it actually converged rather than hit its iteration bound. It also
throws when the cap is **mathematically unsatisfiable** — if `cap × count < 1`,
no allocation exists, and failing loudly beats returning weights that do not sum
to one.

[Group-level capping](/index-and-benchmark-engineering/weighting-and-capping/group-level-capping/)
adds a second constraint layer — sector limits alongside constituent limits — and
the two interact: satisfying one can break the other, so both must be enforced
together.

## The same index quotes several different numbers

This surprises people, and it causes real misstatements.

| Variant | What it is |
|---|---|
| Price return | Price moves only |
| Gross total return | Dividends reinvested in full |
| Net total return | Dividends reinvested after withholding tax |
| Excess return | Total return less a cash return |
| Currency converted | Restated in another currency, unhedged |
| Currency hedged | Currency exposure neutralised with rolling forwards |

The gaps come from dividend treatment, withholding tax, funding rates and FX.
Over a decade they are large. Quoting a price-return figure where a total-return
one was meant understates performance by roughly 2% a year on equities; quoting
converted where hedged was meant can differ by double digits in a year.

Two specific traps:

- **Excess return** requires both series to cover identical periods with the same
  compounding frequency. Mismatched frequencies are a silent error.
- **Currency conversion** depends on the *direction* of the FX quotation. Get it
  backwards and the currency effect inverts — and the result still looks
  plausible. The
  [reference page](/index-and-benchmark-engineering/return-variants/currency-converted-index/)
  echoes the quote convention back for exactly this reason.

## Strategy indices: where path dependence bites

Leveraged and inverse indices reset daily. That single design decision is why a
2× product does not deliver 2× over a month.

In a choppy market, compounding a daily reset **erodes the level even when the
underlying ends flat**. Add the financing drag and the long-run gap widens
further. This is not a defect in the product; it is what a daily reset means, and
the [reference page](/index-and-benchmark-engineering/strategy-indices/leveraged-daily-reset-index/)
says so rather than leaving it to be discovered.

[Volatility control](/index-and-benchmark-engineering/strategy-indices/volatility-control-index/)
has a related honesty problem: exposure is set from *trailing* realised
volatility, so the mechanism always acts after the fact. It dampens; it does not
avoid. The reference returns the exposure path alongside the returns, because the
exposure is what explains the behaviour.

[Decrement indices](/index-and-benchmark-engineering/strategy-indices/fixed-decrement-index/)
deduct a fixed number of points or a percentage per year. They exist to make
option pricing on them cheaper, and the deduction is a real drag borne by the
holder — not a fee schedule.

## Governance is where an index earns credibility

Rules decide membership, and the rules are the product.

**Eligibility and liquidity screens** define what the index claims to represent.
The liquidity test uses a *median* over a minimum number of months, deliberately:
a mean is dominated by one spike of activity, and a single month of IPO volume
should not qualify a name.

**Buffer rules** are the interesting one. Without a buffer, a company hovering at
the boundary is swapped in and out every review — churn that costs every tracking
fund real money. A buffer lets an incumbent stay while it ranks within a margin
beyond the cutoff. It is deliberately asymmetric, and widening it trades index
purity for lower turnover. That trade-off *is* the design decision.

**Free-float factors are rounded to bands**, usually 5%. Unrounded factors would
force a weight change every time a holding moved a fraction of a percent. A little
precision is traded for a great deal less turnover.

Finally, [replication cost](/index-and-benchmark-engineering/governance-and-maintenance/index-replication-cost-estimator/)
is where the rulebook meets reality. A screen that looks clean on paper can be
expensive to track, and turnover is the number that predicts it.

## If you are building one

A defensible order:

1. **Eligibility and liquidity screens** — define the candidate universe
2. **Free-float factors** — decide what is actually investable
3. **Weight** — cap-weighted, then apply constituent and group caps to convergence
4. **Initialise** — base date, base level, divisor
5. **Maintain** — bridge every corporate action through the divisor
6. **Publish the variants you need** — and label which one you are quoting

Step 5 is the one that runs forever, and the `continuityError` from step 5 is the
one number worth alerting on.

## Where to go next

The [reference pages for this domain](/index-and-benchmark-engineering/) state
each contract exactly. If you want the concept behind a *constituent's* price
series rather than the index's, start with
[corporate actions](/concepts/corporate-actions/) — an index is only as correct as
the prices underneath it.
