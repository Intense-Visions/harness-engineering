---
schemaVersion: 1
module: 'packages/cli/tests/craft'
sourceHash: 'd01610159fc82c296389eb2b926be3e18379a67efe8a8365554bdbe7ce990a49'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['capability-subset-law.test.ts']
---

## Interface Contract

```ts
export CORPUS
export GATED
export PROBES
export declaredExtensions
export expectedSymbol
export isTsJsExt
```

## Dependency Slice

```
import { extractCodeUnits } from '../../src/code-craft/extract/units'
import { extractIdentifiers } from '../../src/naming-craft/extract/identifiers'
import { detectSignals } from '../../src/security-craft/extract/signals'
import { detectFramework } from '../../src/test-craft/extract/framework'
import { extractPythonTests } from '../../src/test-craft/extract/python-tests'
import { extractTests } from '../../src/test-craft/extract/tests'
import { CRAFT_ANY_LANGUAGE, CRAFT_REVIEW_DOMAINS, EXTENSION_MAP, SupportedLanguage } from '@harness-engineering/core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
```
