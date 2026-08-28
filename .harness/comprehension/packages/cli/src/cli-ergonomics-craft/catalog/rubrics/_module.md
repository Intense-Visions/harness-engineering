---
schemaVersion: 1
module: 'packages/cli/src/cli-ergonomics-craft/catalog/rubrics'
sourceHash: '7286ec9effb3dffe5043a906f7ea4f3f15b80ccfde1f2bd3a4710f5bf8b6abdf'
compiledAt: '2026-08-28T01:22:08.762Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'composes-with-other-tools.ts',
    'defaults-are-sane.ts',
    'destructive-actions-are-guarded.ts',
    'errors-are-actionable.ts',
    'help-is-task-oriented.ts',
    'index.ts',
    'names-are-predictable.ts',
    'output-is-scannable.ts',
    'types.ts',
  ]
---

## Summary

packages/cli/src/cli-ergonomics-craft/catalog/rubrics is a curated judgment rubric library defining seven seed rubrics (CLI-R001 through CLI-R007) for assessing CLI ergonomics quality. It captures ceiling questions only human judgment can answer — predictable naming, task-oriented help, actionable errors, sane defaults, scannable output, Unix composability, and guarded destructive actions. Each rubric cites authoritative sources (CLIG.dev, POSIX, exemplar CLIs) and includes practical watch-fors. The module exports CliRubric type, CommandKind discriminant (universal '\*' or leaf-specific), SEED_RUBRICS (the immutable v1 catalog), and rubricsForKind(kind) filter. It is the structural twin of docs-craft's rubric catalog — both are living catalogs (ADR 0020) designed as input to craft skills for human quality judgment, not mechanical enforcement.

## Invariants

- Scope filter is deterministic: a rubric applies iff appliesTo[0] === '\*' (universal) OR kind is in appliesTo (specific); no conditional matching.
- Universal rubrics are immobile: only CLI-R001 (naming) and CLI-R002 (help) have appliesTo: ['*'] and apply to all command kinds including namespace groups.
- Leaf rubrics scope correctly: CLI-R003–R007 have appliesTo: ['leaf'] because they critique output/errors/defaults/safety surfaces that pure namespace groups lack; no leaf rubric can be promoted to universal scope.
- Rubrics are versioned immutably: each seed entry pins version: 1 and contribution timestamp; mutating a seed must bump version to distinguish editions in a living catalog.
- Signal tracking is isolation-safe: each rubric's signal (invocations and suppressedAt list) is mutable across sessions but isolated from content—signal changes never alter evaluation criteria or description.
- Rubric filtering is reversible: rubricsForKind() returns a subset of SEED_RUBRICS based on kind alone; the filter is recomputable and stateless, enabling consistent multi-query access to the catalog.

## Interface Contract

```ts
export CliRubric
export CommandKind
export SEED_RUBRICS
export rubricsForKind
```

## Dependency Slice

```
import { composesWithOtherToolsRubric } from './composes-with-other-tools.js'
import { defaultsAreSaneRubric } from './defaults-are-sane.js'
import { destructiveActionsAreGuardedRubric } from './destructive-actions-are-guarded.js'
import { errorsAreActionableRubric } from './errors-are-actionable.js'
import { helpIsTaskOrientedRubric } from './help-is-task-oriented.js'
import { namesArePredictableRubric } from './names-are-predictable.js'
import { outputIsScannableRubric } from './output-is-scannable.js'
import { CliRubric, CommandKind } from './types.js'
```
