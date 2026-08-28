---
schemaVersion: 1
module: 'packages/cli/src/cli-ergonomics-craft/catalog/rubrics'
sourceHash: '7286ec9effb3dffe5043a906f7ea4f3f15b80ccfde1f2bd3a4710f5bf8b6abdf'
compiledAt: '2026-08-28T01:22:08.762Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
