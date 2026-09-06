---
'@harness-engineering/cli': patch
---

Make `harness design-pipeline --no-freshen` and `--no-fill` actually skip their phases (#1881)

Both flags were silently inert — passing either ran the phase it names anyway.

Commander's negation syntax (`.option('--no-freshen')`) defines an option named `freshen` that
defaults to `true` and becomes `false` when the flag is passed; it never produces a `noFreshen`
key. The command read `opts.noFreshen`/`opts.noFill`, which are `undefined` on every code path,
so `input.noFreshen`/`input.noFill` were never set and the orchestrator — which skips a phase
only on `=== true` — always ran FRESHEN and FILL. The command now reads `opts.freshen === false`
and `opts.fill === false`, matching the idiom already used in `predict.ts`, `agent/review.ts`,
`recommend.ts`, `install.ts`, and `adoption.ts`.

The failure was silent in the worst direction. FILL is not only the expensive phase, it is the
only phase that writes into your repository **on a default run** — it scaffolds
`design-system/DESIGN.md` and `tokens.json`, and appends stub sections to an existing
`DESIGN.md`. (FIX writes too, but only under `--fix`.) So while `--no-fill` was inert there was
no way to stop a bare `harness design-pipeline` from mutating the repo, with no warning and no
signal in the output that the flag had been ignored.

The `DesignPipelineCliOptions` interface is corrected alongside the reads (`noFreshen?`/`noFill?`
to `freshen`/`fill`). It had been asserting a shape Commander never produces, which is why the
dead reads typechecked cleanly rather than being caught. The pipeline's own
`DesignPipelineInput.noFreshen`/`noFill` contract is unchanged — the defect was entirely at the
command boundary.
