---
'@harness-engineering/cli': minor
---

Duplication detection reaches the operator: `harness cleanup -t duplication` and the
`detect_entropy` MCP tool's `type: "duplication"` report whole-unit Type-2 clone classes
(>= 3 members, >= 40 normalized tokens, ranked `tokenCount x members`).

Both surfaces are **advisory**. Clone classes never enter `CleanupResult.totalIssues`, so they
never affect the command's exit code and never appear in the `--findings-json` maintenance
contract; on the MCP side they are reported under `advisory.duplication`, outside
`totalIssues`. Because `-t duplication` runs no doc-drift, dead-code or pattern analyzer, the
command now prints "Entropy issues: not checked" instead of a green-ticked zero over three
checks that never ran.

`entropy.duplication` in `harness.config.json` is a new validated config block
(`minTokens`, `minInstances`, `ignorePatterns`, `maxClasses`). It was previously stripped by
the config schema with an "ignored unknown key" warning, so operator tuning could not reach
the detector at all. `minInstances` has a floor of 2 (the detector hard-skips groups below 2,
so 1 silently means "report every pair") and `maxClasses` must be positive (`0` reported zero
classes while counting every one of them as truncated). **`ignorePatterns` REPLACES the
shipped 21 default globs rather than appending to them** — a project that sets one pattern
stops ignoring tests, fixtures, generated output, `dist` and `node_modules` unless it restates
them.

The block's PRESENCE is the opt-in for `-t all` / `type: "all"`, so unconfigured projects see
no change; an explicit request runs on the shipped defaults. `entropy.duplication: false` plus
an explicit request REFUSES rather than reporting a clean scan that never ran, and a detector
that could not execute (for example a graph-fed run that bypassed the codebase snapshot) is
reported with the analyzer's own reason instead of an empty result.

`detect_entropy`'s payload no longer carries `duplication.byMember`: it is a `Map`, which
`JSON.stringify` rendered as `{}` — indistinguishable from an empty index. Its contents are
already in `classes[].members`.

Four further refusals and one payload change came out of the review of this work, all on the
same "never report a pass over a check that never ran" rule:

- An unrecognized `-t <type>` / `type` value is refused on both surfaces. It previously ran NO
  analyzer and still exited 0 — and published `{"findings":0}` on the `--findings-json`
  contract — so `harness cleanup -t duplicaiton` looked like a clean project.
- `detect_entropy` refuses when `harness.config.json` fails validation instead of silently
  analyzing on built-in defaults. zod rejects the document whole, so the fallback was
  discarding the project's `entryPoints` and `excludePatterns` and scanning a different scope
  than the configured one. `harness cleanup` already exited 2 on the same input.
- `harness cleanup -t duplication --quiet` now prints the advisory section. The quiet gate was
  keyed on `totalIssues`, which deliberately excludes duplication, so the channel was
  suppressed entirely.
- `CleanupResult.duplication` carries `filesSkipped`, and the printed advisory line says
  `; N file(s) skipped` when non-zero. A partial skip makes a scan incomplete, and the CLI had
  no way to say so.
- `detect_entropy`'s detailed payload emits `summary`, `analysisErrors` and `duplication`
  BEFORE `snapshot`, and omits each file's `ast`. Response compaction truncates by prefix, and
  the snapshot was 98% of the payload, so everything a caller could act on was being truncated
  away. Pass `compact: false` for the untruncated report, ASTs excluded.
