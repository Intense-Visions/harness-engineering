---
'@harness-engineering/cli': major
---

`harness design-pipeline`: a verifier that could not run no longer reports a pass

**Breaking behaviour change for anything gating on the design-pipeline verdict.**
`runDesignPipeline` derived `verdict` from the finding severities alone, so
`context.verifiersFailed` — the record of a verifier that examined nothing —
could not influence it. The pipeline reported `verdict: 'pass'` over a run in
which one of its four verifiers saw no part of the design surface, and
`harness design-pipeline` exits on the verdict (`verdict === 'fail' ? 1 : 0`),
so that false pass was a gate that could not fail. `run_design_pipeline` (MCP)
returned the same false verdict.

Same bug class as `harness ci check` #2071, fixed in #2207: a summary field
computed independently of the thing it summarises.

**What changed.** The verdict is now resolved _from_ the context in a single
expression, which returns the abstention set it resolved against as
`context.degradedBy` — a projection of `verifiersFailed`, so the verdict and
its evidence cannot disagree. This is a stronger property than checking the two
for agreement: there is nothing to forget to check.

- A non-empty `verifiersFailed` yields `verdict: 'fail'` with `degradedBy`
  naming each abstaining verifier. Names are not de-duplicated —
  `detect-drift` runs in both DETECT and the FIX loop, and two abstentions are
  two facts.
- An error-severity finding still wins the verdict, and `degradedBy` is still
  populated alongside it, so a reader can always tell "we could not see part of
  the surface" from "we found a violation".
- A genuinely clean run still reports `pass`, and a warn-only run still reports
  `warn`. Both directions are pinned by test.

`verdict` keeps its three-value domain (`pass | warn | fail`), as the issue
preferred over widening it: `degradedBy` carries the reason, `verdict` carries
the non-zero-ness. This mirrors `harness check-design`, whose `valid` is
`bySeverity.error === 0 && verifiersFailed.length === 0`. `check-design` also
separates the two non-zero cases by exit code (`hasErrors ? 1 : degraded ? 2 : 0`);
`harness design-pipeline` exits `1` for both, because its verdict→exit map lives
in `packages/cli/src/commands/design-pipeline.ts`, outside this change.

**What this means for your pipeline.** A design-pipeline step that is green
today _because_ a verifier abstained will start failing. That is the defect
being fixed — the gate was not enforcing anything — but it surfaces in your CI.
`verifiersFailed[].error` and `degradedBy` name what could not run. #2210 made
an abstention reachable in five situations (an exclude glob that discarded
every candidate; an explicit `files` list that resolved to nothing readable; a
project walk that hit the depth cap; a design surface in a dialect no verifier
parses; candidates that resolved but could not be opened), plus the FIX loop's
final re-detect. Every other recorded abstention now fails the gate too, and
two of them are the ones you are most likely to hit first:

- **The design-craft critique failing** (FILL phase). When a backend is
  selected (`HARNESS_CRAFT_LLM` or `craft.llm.backend`) but cannot serve the
  critique — its name is missing from `agent.backends`, its entry is
  incomplete, or it is unreachable (an outage, a rate limit, a network error) —
  the critique abstains, and the run now reports `fail` (exit `1`)
  with `degradedBy: ['design-craft-critique']` and zero findings. Measured on a
  fixture that otherwise passes:
  `HARNESS_CRAFT_LLM=nonexistent-backend harness design-pipeline --json` →
  exit `1`, `verdict: 'fail'`, `bySeverity {error:0, warn:0, info:0}`. On the
  previous release the same run was `pass`, exit `0`.
- **`align-design-system` throwing** inside the `--fix` loop (FIX phase).

Craft is documented as an advisory ceiling layer. **If you do not want a
configured craft backend to be able to fail CI, run with `--no-fill`** (MCP: `noFill: true`), which skips the
FILL phase — the craft critique and input bootstrap — so the critique cannot
abstain. Measured on the same fixture with the same unknown backend:
`HARNESS_CRAFT_LLM=nonexistent-backend harness design-pipeline --json --no-fill`
→ exit `0`, `verdict: 'pass'`, `design-craft-critique` absent from both
`verifiersRun` and `verifiersFailed`. Because FILL runs after AUDIT, skipping
it cannot hide a rule-based verifier's abstention. Know what you give up:
`--no-fill` turns craft **off** rather than making it advisory (no craft
suggestions at all), and it skips bootstrapping missing design inputs, so an
empty project that reports `warn` (with stubs written) reports `pass` (with no
stubs written) under `--no-fill`. Neither changes the exit code.

With no LLM configuration at all, the critique runs in-session and does not
abstain: an otherwise-clean project still reports `pass`, exit `0`.

`@harness-engineering/cli` is post-1.0 (13.x), so a behavioural break in a
gate's verdict lands there as a **major**, matching #2207.

**Two more instances of the same class, swept in the same surface:**

- `craftSuggestions` was stored next to `craftFindings` by FILL. It is now
  counted from that list in REPORT, so the count cannot drift from the list it
  counts.
- The AUDIT phase routes verifier findings into named buckets by verifier name.
  The comment claimed an unknown name was "stashed under `audit-anatomy` by
  default"; the branch had no `else`, so those findings were dropped while
  `verifiersRun` recorded the verifier as having contributed. A 5th registered
  verifier could report any number of violations and the run would still read
  clean. An unroutable name is now an abstention naming the missing bucket.
  **If you register your own verifier**, that means `register()` alone now
  fails every run: it also needs a field on `DesignPipelineContext.auditFindings`,
  a routing branch in `phases/audit.ts` and a count in `phases/report.ts`. The
  code comments and the `harness-design-pipeline` skill previously said a 5th
  verifier "composes for free" with a `register()` call; that was never true
  (its findings were dropped) and has been corrected to state what is required.

`newContext()` also initialised `verdict: 'pass'` — a green reading asserted
before any verifier had run. It is now fail-closed; REPORT overwrites it on
every run that reaches Phase 6.
