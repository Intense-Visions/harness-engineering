---
schemaVersion: 1
module: 'agents/skills/tests'
sourceHash: '7b5c85eac24dd12d36ab40f838a903c7b70e31aa813492d0c492c7a395d7adee'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'autonomy-wiring.test.ts',
    'fleet-clump-lane-unit.test.ts',
    'fleet-command-gated-lane-isolation.test.ts',
    'harness-compound.test.ts',
    'harness-strategy.test.ts',
    'harness-test-advisor.test.ts',
    'initialize-test-suite-project.test.ts',
    'interaction-channel.test.ts',
    'internal-refs.test.ts',
    'issue-fleet-routes.test.ts',
    'pause-markers.test.ts',
    'pause-markers.ts',
    'pause-protocol.test.ts',
    'platform-parity.test.ts',
    'references.test.ts',
    'schema.test.ts',
    'schema.ts',
    'structure.test.ts',
  ]
---

## Interface Contract

```ts
export ALLOWED_PLATFORMS
export ALLOWED_TRIGGERS
export MARKER_WINDOW
export PAUSE_CLASSES
export PAUSE_PHRASES
export PAUSE_PREAMBLE
export PAUSE_PREAMBLE_HEADING
export START_STEP
export SUMMARY_STEP
export SkillMetadataSchema
export WORKFLOW_SKILLS
export canonicalMarkerLine
export isPausePhrase
export pauseMarkerViolations
export scanSkill
```

## Dependency Slice

```
import { MARKER_WINDOW, PAUSE_PREAMBLE, PAUSE_PREAMBLE_HEADING, START_STEP, SUMMARY_STEP, WORKFLOW_SKILLS, marker, pauseMarkerViolations, scanSkill } from './pause-markers'
import { ALLOWED_PLATFORMS, SkillMetadataSchema } from './schema'
import { BEHAVIORAL_REQUIRED_SECTIONS, CompoundLockHeldError, KNOWLEDGE_REQUIRED_SECTIONS, RIGID_SECTIONS, acquireCompoundLock } from '@harness-engineering/core'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { glob } from 'glob'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { dirname, relative, resolve } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { z } from 'zod'
```
