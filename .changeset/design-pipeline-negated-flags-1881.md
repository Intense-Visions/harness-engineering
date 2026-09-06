---
'@harness-engineering/cli': patch
---

Fix `harness design-pipeline --no-freshen` and `--no-fill`, which were silently inert — passing
either flag ran the phase it names anyway.

Commander's negation syntax (`.option('--no-freshen')`) defines an option named `freshen` that
defaults to `true` and becomes `false` when the flag is passed; it never produces a `noFreshen`
key. The command read `opts.noFreshen`/`opts.noFill`, which are `undefined` on every code path,
so `input.noFreshen`/`input.noFill` were never set and the orchestrator — which skips a phase
only on `=== true` — always ran FRESHEN and FILL. The command now reads `opts.freshen === false`
and `opts.fill === false`, matching the idiom already used in `predict.ts`, `agent/review.ts`,
`install.ts`, and `adoption.ts`.

The failure was silent in the worst direction: FILL is the expensive phase, so `--no-fill`
existed precisely to avoid work that then happened regardless, with no warning and no signal in
the output that the flag had been ignored.

The `DesignPipelineCliOptions` interface is corrected alongside the reads (`noFreshen?`/`noFill?`
to `freshen?`/`fill?`). It had been asserting a shape Commander never produces, which is why the
dead reads typechecked cleanly rather than being caught. The pipeline's own
`DesignPipelineInput.noFreshen`/`noFill` contract is unchanged — the defect was entirely at the
command boundary.
