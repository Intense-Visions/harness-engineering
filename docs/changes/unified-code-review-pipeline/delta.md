# Delta: Unified Code Review Pipeline — Phase 2 (Mechanical Exclusion Boundary)

## Changes to @harness-engineering/core

- [ADDED] `packages/core/src/review/` module — new review pipeline runtime code
- [ADDED] `MechanicalFinding` type — structured finding from mechanical checks (tool, file, line, ruleId, message, severity)
- [ADDED] `MechanicalCheckResult` type — aggregate result of all mechanical checks (pass, stopPipeline, findings, per-check status)
- [ADDED] `MechanicalCheckOptions` type — options for configuring mechanical check execution (projectRoot, config, skip, changedFiles)
- [ADDED] `runMechanicalChecks()` function — runs harness validate, check-deps, check-docs, and security scan; returns structured results
- [ADDED] `ExclusionSet` class — indexes mechanical findings by file for O(1) lookup; `isExcluded(file, lineRange)` method for Phase 5 consumption
- [ADDED] `buildExclusionSet()` factory function — creates ExclusionSet from MechanicalFinding array
- [MODIFIED] `packages/core/src/index.ts` — added `export * from './review'` barrel re-export

## Behavioral Changes

- [ADDED] When validate or check-deps fails, `MechanicalCheckResult.stopPipeline` is `true` — downstream pipeline phases should not execute
- [ADDED] When check-docs or security-scan produce findings, `stopPipeline` is `false` — findings recorded for exclusion only
- [ADDED] `ExclusionSet.isExcluded()` returns `true` for file-level findings (no line number) regardless of queried line range
- [ADDED] Security findings with severity `info` are mapped to `warning` severity in MechanicalFinding
