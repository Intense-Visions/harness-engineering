---
'@harness-engineering/cli': patch
---

fix(check-deps): stop reporting clean when the dependency analysis fails

`runCheckDeps` consumed both analysis engines as bare success guards with no
`else`:

```ts
const depsResult = await validateDependencies(layerConfig);
if (depsResult.ok) {
  /* push violations */
}

const circularResult = await detectCircularDepsInFiles(uniqueFiles, parser);
if (circularResult.ok && circularResult.value.hasCycles) {
  /* push cycles */
}
```

An `Err` from either engine was discarded. `valid` stayed `true`, the finding
lists stayed empty, and the command exited `SUCCESS` — a result byte-identical
to a genuinely clean repo. `harness check-deps && deploy` would proceed, a
`--json` consumer saw `layerViolations: []`, and the `--findings-json`
maintenance contract reported `{ "findings": 0 }`.

An engine failure now refuses to report clean, mirroring the zero-module
abstention (#1188) already in this file: `valid` is set `false` and the reason is
recorded in a new `analysisErrors: string[]` field, surfaced as an issue in every
output mode and emitted in the JSON payload.

**Exit-code behaviour change on the previously-silent failure path.** The command
now distinguishes three outcomes instead of two:

| Outcome                            | Before | After |
| ---------------------------------- | ------ | ----- |
| Check ran, no findings             | 0      | 0     |
| Check ran, found violations/cycles | 1      | 1     |
| Check could not run (engine `Err`) | **0**  | **2** |

A path that previously exited `0` may now exit `2` (`ExitCode.ERROR`). Only that
path changes: a genuinely clean run still exits `0` with identical output and no
`analysisErrors` key, and a run with real findings still exits `1`.
