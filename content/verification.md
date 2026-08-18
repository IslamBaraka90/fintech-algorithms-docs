# What "verified" means

Every reference page carries one of two badges. They are not marketing labels —
they describe exactly how much of that page a test suite is holding up, and they
are worth understanding before you trust a number.

## `verified`

The algorithm's arithmetic is **replayed and asserted on every build**. If
someone changes the implementation so it produces a different answer, CI goes
red.

Worth being precise about what that proves, because it is easy to read as more
than it is. The expected values are computed in the catalog by a Python
implementation written alongside the TypeScript rather than derived from it — so
this is **cross-language parity, not an independent third-party figure**. Two
implementations of one understanding agree.

That catches the failure mode this library actually has: a transcription slip, or
a generator that transformed something on its way into the package. It would not
catch both implementations sharing a misreading of the source material.

{{verified}} of {{topics}} topics are in this tier.

## `contract`

The module loads, its declared entry function exists and is callable, its
registry metadata matches reality, and its exports are what the package claims.
What is **not** asserted is the arithmetic: no published numbers exist in the
catalog for this topic yet, so nothing checks that the answer is right.

{{contract}} of {{topics}} topics are in this tier.

This is stated plainly rather than hidden, because the alternative — implying
uniform confidence across {{topics}} topics — would be worse. Most libraries in this
space assert nothing at all and say nothing about it.

## Where the examples come from

Separately from the badge, every page shows a worked example. There are three
sources, and each page says which one it used:

| Origin | What it is |
|---|---|
| **fixture** | The published `{ input, expected }` from the article. Asserted by the test suite — this output cannot drift. |
| **executed** | The arguments the algorithm's own test passes it, and what the function actually returned when run. Real output of real code, not asserted against the article. |
| **derived** | The same, for thin wrappers a test never calls directly: the entry is invoked with the arguments its shared sibling received. |

**No example on this site was typed by hand.** Every one is the output of running
the code. What differs between them is whether a second implementation
says that output is *correct*.

Long inputs and outputs are abbreviated for readability, and the page says how
much was elided — "6 of 160 shown" — rather than quietly truncating.

## How the gap gets closed

Moving a topic from `contract` to `verified` means adding machine-readable
expected values to the catalog: an input, and the numbers the article already
works through in prose. It is authoring work rather than engineering, and it
happens steadily.

If you find a wrong answer, the most useful thing you can send is the input and
the value you expected. That becomes a fixture, and a fixture is what turns a
`contract` badge into a `verified` one — for everyone.

[Open an issue](https://github.com/IslamBaraka90/Fintech-Algorithms-Library/issues)
