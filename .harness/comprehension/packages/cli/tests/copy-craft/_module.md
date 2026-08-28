---
schemaVersion: 1
module: 'packages/cli/tests/copy-craft'
sourceHash: '606d8577ab7454c82ec62bff30e3c2bdaa45139177a7cc3e40714266b5a66e66'
compiledAt: '2026-08-28T01:22:09.668Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'critique.test.ts',
    'extract-commits.test.ts',
    'extract-pr.test.ts',
    'extract-source.test.ts',
    'in-session.test.ts',
    'integration.test.ts',
    'rubric-mapping.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectCopyCraftPrompts, critiqueCopyInFile, finalizeCopyCraft, runCopyCraft } from '../../src/copy-craft'
import { SEED_RUBRICS, rubricApplies } from '../../src/copy-craft/catalog/rubrics/index'
import { whatWhyHowToFixRubric } from '../../src/copy-craft/catalog/rubrics/what-why-how-to-fix'
import { extractCommits } from '../../src/copy-craft/extract/commits'
import { extractPRDescriptions } from '../../src/copy-craft/extract/pr-descriptions'
import { extractFromSource } from '../../src/copy-craft/extract/source'
import { ExtractedCopyItem } from '../../src/copy-craft/findings/schema'
import { critiqueOne } from '../../src/copy-craft/phases/critique'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
