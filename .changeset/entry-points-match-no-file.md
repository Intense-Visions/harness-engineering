---
'@harness-engineering/core': minor
'@harness-engineering/cli': major
'@harness-engineering/dashboard': patch
---

A configured entry point that matches no file is reported by name instead of producing a clean pass over zero analysis.

`resolveEntryPoints` accepted any non-empty `entryPoints` array as-is:

```ts
if (explicitEntries && explicitEntries.length > 0) {
  return Ok(explicitEntries.map((e) => resolve(rootDir, e)));
}
```

No existence check. The literal string became a reachability root in `snapshot.entryPoints`, and the dead-code BFS seeds its queue from exactly that array — so a root that matches no file reached no code and produced **two opposite wrong answers at once**: wholesale dead-export noise (nothing is reachable, so everything looks dead) and a clean `pass` from `perf`, which had nothing to report because it analysed nothing. Measured on a scaffolded project with `index.ts -> helper.ts` plus an unreferenced `orphan.ts`: `entryPoints: ["src/**/*.ts"]` flagged `helper`, `main` and `neverUsed`; `entryPoints: ["src/index.ts"]` flagged only `neverUsed`. A wrong explicit value was worse than no value, because a non-empty array also suppresses the auto-detection that gets it right.

Configured entry points are now existence-checked, and any that match no file return `ENTRY_POINT_NOT_FOUND` naming them — the unresolvable entries in `details.issues`, the strings the author wrote rather than their absolute forms, and a count (`"1 of 3 configured entryPoints match no file"`) so a partial config is distinguishable from a wholly broken one. A directory is rejected for the same reason a missing path is: a reachability walk parses its entry point, so a directory is as dead a root as an absent file.

## Globs are still not expanded, deliberately

The field is documented as literal paths in the schema that defines it (`PerformanceConfigSchema.entryPoints`, `EntropyConfigSchema.entryPoints`), no doc under `docs/` or template claims otherwise, and this repository's own config uses 62 concrete paths and no wildcard. Expanding globs would also not fix the reported defect — it would swap one false green for the opposite one. `entryPoints: ["src/**/*.ts"]` expanded makes **every** file a reachability root, and `detectDeadCode` skips any file that is itself an entry point, so the dead-code detector would report nothing at all on every project. A wildcard entry is therefore rejected with advice that names the field's contract (`entryPoints are literal file paths, never glob patterns`), because "that file is right there" is the first reaction to a wildcard being called unresolvable.

## Strict on ANY unresolvable entry, not only on all of them

The precedent is `classifyMeasurement`'s `rules-not-received` branch in `check-arch`: declared work that never reached the analysis abstains loudly even when the surrounding denominators look healthy. A config listing nine roots of which one is a typo analyses eight and silently drops the author's intent for the ninth — which, given the documented remediation for `UNREFERENCED_ENTRY_POINT` is "declare it in `entryPoints`, do not delete it", is usually the intent to keep a file the dead-code detector would otherwise flag. Dropping it quietly is the same defect at smaller scale.

No new plumbing carries the result. The `Err` reaches the operator through the abstention channel built for this class under #2071: `runEntropyCheck` and `runPerfCheck` turn a failed analysis into `skipReason`, `ci check` ranks an abstention above `pass`, and `deriveExitCode` maps it to `ZERO_DENOMINATOR` (3) rather than 0. "No analysis" was already rendered differently from "no dead code"; this change makes the entry-point case reach it.

## Same defect on the auto-detection path

`resolveTypeScript` accepted `package.json` `main`/`exports`/`bin` with no existence check either, so a `main` naming an unbuilt artifact (`dist/index.js` before a build) short-circuited resolution with a root that matches nothing **and** suppressed the conventional `src/index.ts` fallback below it — the same silent zero, on the path most TypeScript projects actually take. Those fields are now existence-filtered: the entries that exist are used, and a manifest whose declarations all point at absent files falls through to conventional resolution instead of poisoning the result.

## Breaking: a green gate can go red with no change to your code

`major` on the CLI for the reason `harness check-deps` and `audit_anatomy` took one: the observable contract of a command that gates CI changes. An adopter with a stale or wildcard `entryPoints` entry goes from `pass` to an abstention on `ci check`'s `entropy` and `perf` checks, and `check-perf` goes from exit 0 to exit 1 reporting `Analysis failed: N of M configured entryPoints match no file`. That green was never a verdict — it was a report over an analysis that never ran — but it was green, and it will not be after upgrading. The remedy the error names is to correct or remove the offending entries, or to remove `entryPoints` entirely and let auto-detection resolve them.

`minor` rather than `major` on core because it is a 0.x package, where minor is the breaking channel; 30 prior core changesets use it and none has used `major`.

## Two callers that would have turned the new error into a wrong answer

- **Dashboard Health and Perf panels.** `discoverEntryPoints` synthesised `packages/<name>/src/index.ts` for every directory under `packages/` with no existence check, then passed them as explicit entry points. This repository's own `packages/dashboard` has no `src/index.ts`, so with the core change alone both panels would have gone from a report to `ENTRY_POINT_NOT_FOUND: 1 of 13 configured entryPoints match no file`. Measured against this repo through the built analyzer: the old discovery gives that error, the filtered discovery gives 12 entry points and a report over 2428 files. The guessed paths are now existence-filtered, the same treatment as package.json `main`: a guess is not a configuration.
- **`composeInsights` (`harness insights`, `insights_summary`).** On a failed entropy analysis it returned `{ driftCount: 0, deadFiles: 0, deadExports: 0 }`, and the health block derived from it then reported `passed: true`, "No structural health findings." The core change makes that path reachable for a project whose package.json `main` names an unbuilt artifact. It now throws into the existing `safeGather` channel, so `entropy` and `health` are `null` with a warning naming the failure, the report's existing representation of "not measured". One existing CLI test (`insights` › `silently drops unknown --skip keys`) asserted `entropy` was non-null on an empty temp directory, which held only because the swallowed failure produced zeros; its fixture now has a `src/index.ts` so the section it checks really runs, and it also asserts no warnings.

## No effect on this repository's gates

All 62 `entropy.entryPoints` and all 9 `performance.entryPoints` resolve to existing files, checked path by path. Before and after, with the CLI built from each: `check-perf --json` reports 1555 issues, and the only two that differ are the size and coupling-ratio findings for `entry-points.ts` itself, the file this change edits. `cleanup --type dead-code --json` reports 720 dead-code findings, identical before and after. No `analysis-error` issue appears in either run.
