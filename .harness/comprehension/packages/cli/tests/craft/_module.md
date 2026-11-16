---
schemaVersion: 1
module: 'packages/cli/tests/craft'
sourceHash: '25fe28558b5373c0fc3b967beb9bca583d088e24c5f6850a02c0082da4fbd6da'
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
