---
schemaVersion: 1
module: 'packages/cli/tests/commands/notifications'
sourceHash: '9f8c02844407abcb0ddd8ba065202fc1868dc66217ab09a9c9a056ca92fbc445'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['test-cov544b.test.ts', 'test.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createNotificationsTestSubcommand } from '../../../src/commands/notifications/test'
import { Command } from 'commander'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
