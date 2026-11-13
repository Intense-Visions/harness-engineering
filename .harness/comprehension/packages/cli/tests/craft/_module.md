---
schemaVersion: 1
module: 'packages/cli/tests/craft'
sourceHash: '8fc572d970596bb43f17410a8afbfe8804b041352168f0061c6254843137095b'
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
