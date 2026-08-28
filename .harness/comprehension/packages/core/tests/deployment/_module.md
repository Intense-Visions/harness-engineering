---
schemaVersion: 1
module: 'packages/core/tests/deployment'
sourceHash: '2a91fc804036a2f5cb1264258802ddd5c7390733eb8564f8e79a48b7af4e417b'
compiledAt: '2026-08-28T01:22:10.797Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['detect.test.ts', 'evaluate.test.ts', 'exit-code.test.ts', 'fixtures.ts']
---

## Summary

The `packages/core/tests/deployment` module tests three phases of deployment safety: **Detection** scans repos for deployment surfaces (pipelines, scripts, env files) and flags ungated production deploys; **Evaluation** runs a configurable security/reliability gate with non-waivable hardcoded-secret detection and waivable rollback/gating rules; **Exit codes** map results to CLI codes (pass→0, blocked→1, abstained→3). Fixtures provide mock filesystem and partial surface builders.

## Invariants

- DEPLOY-SEC001 (hardcoded secrets) is non-waivable — always blocks with hard severity even when rules override to 'off'
- Hardcoded secrets must not flag variable references — ${{ secrets.X }} and $VAR_NAME patterns are excluded
- Production deployment requires structural gating — either GH Actions environment protection or a prior staging job with needs: dependency
- Rollback satisfaction is disjunctive — satisfied by ANY of: in-repo signal, rollbackConfigured flag, or waived rule
- Empty deployment surface with no config returns abstained status; disabled when config explicitly sets enabled: false
- Unparseable pipeline files are counted as surfaces (not dropped) and marked with unparseable: true flag
- Hard violations block (status=blocked); soft violations only advise — multiple soft findings with no hard violations yield status=pass
- Config absence short-circuits to abstained only when surface is empty; any config present triggers full evaluation

## Interface Contract

```ts
export memFs
export surface
```

## Dependency Slice

```
import { detectDeploymentSurface } from '../../src/deployment/detect'
import { evaluateDeploymentGate } from '../../src/deployment/evaluate'
import { deriveExitCode } from '../../src/deployment/exit-code'
import { DeploymentFsPort, DeploymentGateResult, DeploymentSurface } from '../../src/deployment/types'
import { memFs, surface } from './fixtures'
import { describe, expect, it } from 'vitest'
```
