---
'@harness-engineering/cli': patch
---

Refuse to run findings-producing commands when the CLI is sharply out of step
with the workspace it is scanning.

A stale scanner does not fail — it emits well-formed, confident, wrong output.
In the run that motivated this change, a Node bin directory was prepended to
`PATH` to obtain Node 22; that directory also contained a `harness` shim
symlinked to an install ten major versions old. Every process spawned under that
`PATH` ran the old CLI, which predates the prior-line `harness-ignore`
suppression pass and therefore re-reported every already-justified suppression.
33 of 36 code-side security findings were phantoms, and the single finding
escalated to a human decision gate pointed at a line that was the XSS detection
vocabulary registry — annotated as definitional and suppressed.

A workspace can now declare the CLI line it expects via a new optional
`toolchain.cliVersion` key in `harness.config.json` (a semver range, e.g.
`">=11"`). The CLI compares its own version against that range, falling back to a
`@harness-engineering/cli` range in the project's `package.json`
`devDependencies`/`dependencies` when no config pin is set. Non-semver
specifiers (`workspace:*`, `file:`, `link:`, `git+`, `*`, `latest`) are ignored
rather than coerced, so monorepos do not produce false mismatches.

The severity ladder is deliberately asymmetric, because staleness is the
dangerous direction — an older scanner re-reports resolved findings (falsehood),
while a newer one reports rules the workspace has not adopted yet (noise):

- range satisfied — silent
- 2+ majors behind the range minimum — **refuse**, exit code 3 (`ZERO_DENOMINATOR`
  — "abstained, not passed"; deliberately not exit 1, which is what these
  commands already return when they found _real_ findings)
- exactly 1 major behind, or unsatisfied at a delta of 0 or less — warn, proceed

Only findings-producing commands are gated: `check-arch`, `check-deployment`,
`check-deps`, `check-docs`, `check-harness-strength`, `check-perf`,
`check-security`, `cleanup`, `cross-check`, `review-ci`, and `validate`. `doctor`, `update`, `setup`, and `init` are deliberately never
gated — those are the commands you need when your toolchain is wrong, and a
guard that blocks its own remedy is a trap.

When no expected version can be resolved, the guard is silent. Warning there
would fire for every project that has not opted in and would train everyone to
ignore the output, destroying the signal for the case that matters.

`HARNESS_NO_VERSION_GUARD=1` downgrades a refusal to a warning. It
deliberately does **not** silence the notice: a variable that suppressed the
message entirely would be exported once into a shell profile or CI config and
would restore the original silent failure permanently. The hatch buys a working
command, not a quiet one.

The refusal message names both versions, the expectation's source, and the
resolved path of the binary actually running — that last line is the one that
makes a shadowed `PATH` visible, which is what nobody could see when this
happened.

Note the inherent limitation: this guard cannot fire inside a CLI old enough to
predate it. It makes the failure class loud going forward; the accompanying
`-fleet` family reference documents the `PATH`-shadowing trap for as long as
stale binaries remain in circulation.
