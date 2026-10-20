---
'@harness-engineering/core': minor
'@harness-engineering/cli': major
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

**No effect on this repository.** All 62 `entropy.entryPoints` and all 9 `performance.entryPoints` resolve to existing files, measured path by path; both gates still produce a verdict with the change built in (entropy: 543 dead exports over 62 entry points; perf: 668 complexity and 510 coupling violations over 9), and `.harness/**` baselines are untouched.

## One true positive left red rather than tuned

`packages/cli/tests/commands/config-implied-root.test.ts` -> `'check-perf analyses the -c project'` fails on this branch with `Analysis failed: 9 of 9 configured entryPoints match no file`. Nine is this repository's `performance.entryPoints` count, measured while the scan root was a temp fixture: `runCheckPerfAction` forwards `-c` to `resolveProject` for the root but never passes `configPath` to `runCheckPerf`, so `resolveConfiguredEntryPoints(undefined)` walks up from `process.cwd()` and reads **this** repository's config. The root half of that split was fixed under #911; the entry-point half was not. The test asserted `issues` was `[]` and documented that zero as proof of correct rooting — but the zero came from nine unresolvable roots producing no analysis, so the assertion measured nothing it claimed to. Any fix to this defect that existence-checks configured entry points turns that test red. It is filed as #2293 and left failing rather than adjusted, because the adjustment would re-bury the defect and the fix belongs to the `-c` family tracked in #2287.
