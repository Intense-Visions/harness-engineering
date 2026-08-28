---
schemaVersion: 1
module: 'packages/core/tests/blueprint'
sourceHash: '805d4d2893d8e982cebade14e4ae554a13f7f692cb01ed9960bced9fc82815a5'
compiledAt: '2026-08-28T01:22:10.707Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['content-pipeline.test.ts', 'generator.test.ts', 'scanner.test.ts']
---

## Summary

The `blueprint` test suite validates a static-site generation pipeline for project documentation. Three interdependent components work together: (1) ContentPipeline transforms module metadata into rendered content, ensuring `codeTranslation` is populated; (2) BlueprintGenerator consumes project data and outputs an HTML site with modules listed as section headers; (3) ProjectScanner introspects the filesystem to extract project metadata and enumerate modules. The suite is thin—each component gets one happy-path test. The generator test is most substantive: it writes files to a temp directory, verifying both that `index.html` is created and that it contains expected markup (title with project name, module headers).

## Invariants

- Pipeline contract: ContentPipeline.generateModuleContent() must always return an object with a codeTranslation property (not optional, not null)
- Generator output format: Generated HTML must include a <title> tag with pattern 'Blueprint: {projectName}' and <h2>{moduleName}</h2> for each module
- Scanner cardinality: Current project must contain exactly 4 discoverable modules (hardcoded expectation)
- File I/O: Generator must write synchronously to outputDir; scanner must be instantiable with a filesystem path
- No fixture data: All tests use live/generated data, not fixtures—scanner test depends on actual working directory structure

## Interface Contract

```ts

```

## Dependency Slice

```
import { ContentPipeline } from '../../src/blueprint/content-pipeline'
import { BlueprintGenerator } from '../../src/blueprint/generator'
import { ProjectScanner } from '../../src/blueprint/scanner'
import { BlueprintModule } from '../../src/blueprint/types'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
```
