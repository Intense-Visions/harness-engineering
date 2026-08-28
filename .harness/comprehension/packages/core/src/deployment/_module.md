---
schemaVersion: 1
module: 'packages/core/src/deployment'
sourceHash: '3a9f2ae98ff2ddeb2e2016bc42cf38dc18ed4e811ae95bf97cb695ae5238e0f0'
compiledAt: '2026-08-28T01:22:10.331Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['detect.ts', 'evaluate.ts', 'exit-code.ts', 'index.ts', 'types.ts']
---

## Summary

`packages/core/src/deployment` detects and gates deployments by analyzing a repository's CI/CD surface and enforcing security/operational invariants. Detection (`detectDeploymentSurface`) is a pure, filesystem-abstracted scanner that discovers pipeline files (GitHub Actions, GitLab, Jenkins, CircleCI, Bitbucket, Azure), deploy scripts, and committed env files, heuristically extracting environment targets (prod/staging/dev), gating signals, rollback indicators, and pipeline stages. A single unparseable YAML is marked rather than thrown. Evaluation (`evaluateDeploymentGate`) is a pure classifier enforcing waivable and non-waivable rules against the surface; DEPLOY-SEC001 (hardcoded secret detection) is non-waivable and never consulted for rule overrides. Status routing shorts early: `disabled` (opted out), `abstained` (no surface), `blocked` (hard violations), or `pass`.

## Invariants

- DEPLOY-SEC001 is non-waivable — hardcoded secrets in pipelines/env files bypass the `rules` override map entirely and cannot be silenced via config.
- Filesystem isolation enforced: all file reads flow through injected `DeploymentFsPort`, never direct `fs` imports; enables testability and defensive error handling.
- Defensive capture, not throw — a single unparseable YAML pipeline is marked `unparseable: true` and included in the surface; the gate does not fail, allowing broken repos to be analyzed.
- Production-reachable ungating is global — if ANY file in the surface carries a gating signal (job dependencies, manual approval, environment protection), production is marked gated even if other files lack it.
- Status routing shorts all rules — `disabled` and `abstained` return early with empty findings, skipping all rule evaluation; only `pass`/`blocked` results run full classification.
- Rollback signal is multi-source — satisfied by runbook filename, workflow/script naming pattern, regex match in content, or explicit config flag; any one source counts.

## Interface Contract

```ts
export DeploymentExitCode
export DeploymentFile
export DeploymentFinding
export DeploymentFsPort
export DeploymentGateConfig
export DeploymentGateResult
export DeploymentSeverity
export DeploymentSurface
export deriveDeploymentExitCode
export detectDeploymentSurface
export evaluateDeploymentGate
```

## Dependency Slice

```
import { SecurityScanner } from '../security'
import { DeploymentExitCode, DeploymentFile, DeploymentFinding, DeploymentFsPort, DeploymentGateConfig, DeploymentGateResult, DeploymentSeverity, DeploymentSurface } from './types'
import { parseYaml } from 'yaml'
```
