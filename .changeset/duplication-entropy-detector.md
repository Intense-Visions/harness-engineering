---
'@harness-engineering/core': minor
---

Wire duplication detection into the entropy pipeline: `detectDuplication`, the
`DuplicationReport` type, `EntropyConfig.analyze.duplication`,
`EntropyReport.duplication`, and `'duplication'` on the `AnalysisError['analyzer']`
union. Discovery is driven solely by `EntropyConfig.include` / `exclude`; per-file
read and parse failures become `AnalysisError`s with `analyzer: 'duplication'`
rather than failing the run; severity is advisory only, so duplication adds
nothing to `summary.errors` or `summary.warnings`. Also makes
`normalizeTokens` locate its range by binary search instead of rescanning each
file's whole token array per unit — re-measured at 214,130,152 token visits
before versus 1,976,826 after over this repository's non-test sources (2,153
eligible files, 17,064 units), with identical output.

Hardening from this phase's review: a malformed `duplication.ignorePatterns`
entry (a non-string, which an untyped `harness.config.json` can deliver) now
returns `Err INVALID_CONFIG` with `details.reason: 'invalid-ignore-pattern'`
instead of throwing out of `minimatch` and rejecting the whole entropy run;
duplication no longer runs when graph drift and dead-code data have bypassed
the snapshot, reporting `details.reason: 'snapshot-bypassed'` rather than
blaming `EntropyConfig.include` for a discovery that never ran; and `.js`,
`.mjs` and `.cjs` are parsed with JSX enabled, so a CRA- or Next-style project
is scanned instead of having every component skipped as unparseable (measured
byte-identical over every such file in this repository).

Phase 2 of the DRY-floor spec — no CLI or MCP surface yet.
