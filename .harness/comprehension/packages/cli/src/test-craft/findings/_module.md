---
schemaVersion: 1
module: 'packages/cli/src/test-craft/findings'
sourceHash: 'fe251e6fa826542dea99a4ac9f7f9b8393e2145afd23702fb1519a144f5f6fc1'
compiledAt: '2026-08-28T01:22:09.448Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['schema.ts']
---

## Summary

`test-craft/findings` defines the output schema for the test-craft critique pipeline. It models test issues as a 3-axis finding (Tier, Impact, Confidence) with stable codes in the TEST-R\d{3} namespace, one-per-test granularity, and framework-agnostic extraction. The module re-exports shared axes from the craft/findings subsystem and adds test-specific types: `TestFinding` (the finding itself, bound to file/line/testName/nesting), `TestCraftSummary` (run metadata including error counts and truncation flags), and `ExtractedTest` (the uniform intermediate shape fed to critique before rendering findings).

## Invariants

- Code stability: `TestFinding.code` is immutable and follows TEST-R\d{3} namespace; breaking a code breaks downstream filtering/routing.
- Critique phase only: `phase` is hardcoded to `'critique'` in v1; v1 does not emit POLISH findings; changes to phase schema need coordinated rollout.
- Unmeasured abstention: Non-zero `critiqueErrors` means `findings: []` is an abstention (partial run), not a clean bill of health; consumers must check `critiqueErrors > 0` to avoid false confidence (issue #1346).
- Truncation is a cap: Non-zero `testsTruncated` means `testsExtracted` is capped at `maxTestsPerFile`, not the true population; large files silently lose coverage (issue #1347).
- Uniform extraction before critique: All frameworks (vitest, jest, mocha, Playwright, pytest) extract to a single `ExtractedTest` shape before critique; framework-specific logic must live in extraction, not finding schema.
- Framework detection is cardinality: `frameworksDetected` is a count map; zero-count frameworks in the scan are not recorded; consumers cannot distinguish 'never seen' from 'seen zero times'.

## Interface Contract

```ts
export Confidence
export Impact
export Tier
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../shared/craft/findings/axes.js'
```
