---
schemaVersion: 1
module: 'packages/core/tests/review/agents'
sourceHash: 'fa7fdbc40b67d5af70be1fc3e4469d717aecfc6b4d939a03207cc792b467144a'
compiledAt: '2026-08-28T01:22:10.905Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'architecture-agent.test.ts',
    'bug-agent.test.ts',
    'compliance-agent.test.ts',
    'conditional-subagents.test.ts',
    'security-agent.test.ts',
  ]
---

## Summary

# Module Summary: `packages/core/tests/review/agents`

This test suite validates seven specialized code-review agents that implement heuristic-based static analysis. Each agent takes a `ContextBundle` (changed/context files, diff size, commit history) and produces `ReviewFinding[]` with domain-specific insights.

**The Agents:**

1. **Architecture** — detects layer violations (via harness-check-deps), large files (400+ lines), circular imports; tier=standard
2. **Bug Detection** — flags division by zero, empty catch blocks, missing tests; tier=strong
3. **Security** — detects eval, hardcoded secrets, SQL injection, command injection; tier=strong; heavily guarded against false positives (test files, comments, shell variables, CI expressions)
4. **Compliance** — validates code against project conventions (JSDoc, Result types) read from CLAUDE.md; tier=standard
5. **Typescript Strict** — flags `any` types, `@ts-ignore`, double casts, vague function names; skips test/declaration files
6. **Adversarial** — flags JSON.parse on untrusted input, floating promises, fetch without abort signals; emits confidence scores
7. **Frontend Races** — detects lifecycle gaps (setInterval without clearInterval, addEventListener without removeEventListener, fetch without abort before setState)

All agents use heuristic validation (no AST analysis) and skip test files by default. Findings carry metadata (severity, title, evidence, cweId/owaspCategory for security, confidence for conditional subagents) and must have unique IDs per agent.

The security agent is the most mature, with sophisticated false-positive suppression: distinguishes SQL keywords in prose vs. queries (companion-token detection), ignores shell variable references and CI expressions, skips comment-only lines, and guards secrets detection with test-file and comment-scope logic.

## Invariants

- All findings from an agent's domain must match the agent's declared domain (architecture → domain='architecture', etc.)
- Each agent must generate globally-unique finding IDs within its output set; duplicates = hard test failure
- Every finding must carry: id, title, domain, severity, validatedBy='heuristic', and evidence array
- Security findings that pass detector heuristics must survive enforceFindingIntegrity without downgrade/drop (especially SQL injections with companion tokens)
- Agent descriptors must export: domain, tier ('standard'|'strong'), displayName, and focusAreas array
- Test files are skipped entirely by most agents (typescript-strict, adversarial, security SQL/eval/exec detectors)
- Architecture agent can consume harness-check-deps-output context files to surface layer violations
- Adversarial/typescript-strict/frontend-races findings emit confidence >= 50 and carry subagent field
- Security agent's comment-skip guard applies ONLY to comment-only lines, not code lines with trailing comments
- SQL injection detection requires BOTH a SQL keyword AND structural companion (FROM/WHERE/SET/VALUES/INSERT/UPDATE/DELETE/JOIN); keywords alone in prose = false positive
- Hardcoded secret detection skips shell variable references ($VAR, ${VAR}), CI expressions (${{ ... }}), and command substitutions ($(...), backticks)
- Scoped package imports (@scope/pkg) must not trigger division-by-zero heuristic; real division is spaced (a / b)
- Test fixture markers (test files, JSDoc blocks) suppress secrets detection only in code files, not .env/\*.md files
- Finding severity must be in set: ['critical', 'important', 'suggestion']
- Compliance agent must produce at least one finding when conventions are present and violated

## Interface Contract

```ts

```

## Dependency Slice

```
import { runAdversarialAgent } from '../../../src/review/agents/adversarial-agent'
import { ARCHITECTURE_DESCRIPTOR, runArchitectureAgent } from '../../../src/review/agents/architecture-agent'
import { BUG_DETECTION_DESCRIPTOR, runBugDetectionAgent } from '../../../src/review/agents/bug-agent'
import { COMPLIANCE_DESCRIPTOR, runComplianceAgent } from '../../../src/review/agents/compliance-agent'
import { runFrontendRacesAgent } from '../../../src/review/agents/frontend-races-agent'
import { SECURITY_DESCRIPTOR, runSecurityAgent } from '../../../src/review/agents/security-agent'
import { runTypescriptStrictAgent } from '../../../src/review/agents/typescript-strict-agent'
import { enforceFindingIntegrity } from '../../../src/review/finding-integrity'
import { ContextBundle, ReviewFinding } from '../../../src/review/types'
import { describe, expect, it } from 'vitest'
```
