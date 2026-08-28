---
schemaVersion: 1
module: 'packages/core/src/review/ci/parsers'
sourceHash: '8cf7b5eff2be4119c9d0d5d93c610efb83010ceadd628b449a8f84b0e7b85cfe'
compiledAt: '2026-08-28T01:22:10.471Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['antigravity.ts', 'claude.ts', 'codex.ts', 'gemini.ts', 'local.ts']
---

## Interface Contract

```ts
export parseAntigravityVerdict
export parseClaudeVerdict
export parseCodexVerdict
export parseGeminiVerdict
export parseLocalVerdict
```

## Dependency Slice

```
import { CiReviewVerdict, buildCiReviewVerdict } from '../verdict-schema'
```
