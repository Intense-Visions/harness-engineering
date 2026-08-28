---
schemaVersion: 1
module: "packages/orchestrator/tests/workflow"
sourceHash: "be85615125bdd8da84ff8228fe20d5d6572bc293cb2d3c464558e122f6822bb0"
compiledAt: "2026-08-28T01:22:12.790Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["config.test.ts", "loader.test.ts", "orchestrator-context.test.ts", "orchestrator.workflow-dispatch.test.ts", "routing-config-schema.test.ts", "routing-cross-field.test.ts", "routing-isolation-schema.test.ts", "routing-warnings.test.ts", "schema.test.ts", "skill-catalog.test.ts", "spec-b-phase-2-acceptance.test.ts", "workflow-for.test.ts"]
---

## Summary

**packages/orchestrator/tests/workflow** validates the orchestrator's workflow system across configuration, routing, schema enforcement, and runtime execution. The 3.2k-line suite (12 test files) covers: budget governance (day/week envelopes per fleet), backend definitions (8 types with discriminated union), routing logic (scalar + array chains with cross-field resolution), prewarm injection for context optimization, declarative workflow specs, and multi-stage execution with retry semantics. Key dependencies include WorkflowLoader, buildWorkflowContext, executeWorkflow, and the schema validators—all strict-mode to reject typos rather than silently drop config anomalies. MockBackend is used throughout for deterministic testing.

## Invariants

- Strict schema validation rejects unknown keys and typos; configuration mistakes are caught at validation time, not silently dropped.
- A workflow config must define either legacy agent.backend or modern agent.backends + routing; having neither is a fatal error (SC15).
- Routing references (default, skills, modes) must resolve to backends declared in agent.backends; unknown backend names are caught early.
- Token budget envelopes must be positive; zero would stall all dispatch and is rejected as a guard against config mistakes.
- Stage routing decisions resolve via backendFactory.resolveName(), not the backend instance's .name property; this authoritative routing key may differ from backend type (fixes #1520 divergence).
- Pre-warm comprehension is injected at render time via resolveLeafPrewarm, seeded from issue title/description; black-box does not record the rendered prompt.
- Config validation preserves soft warnings (unknown skill/mode names, typos) while accepting the config; soft guards for catching intent errors without blocking deployment.
- Declarative workflows must have at least one stage; zero-stage specs are rejected to prevent malformed pipeline definitions.
- Backend type is discriminated (claude, anthropic, openai, gemini, local, ollama, pi, mock); each type validates its required fields (e.g., pi requires endpoint + model).
- Resource budget entries validate limit and windowMs; malformed entries are rejected rather than silently ignored to prevent rate-limit bypass.
- Skill and mode routing chains are non-empty arrays or scalars; empty fallback chains are rejected to prevent fallback-failure loops.

## Interface Contract

```ts

```

## Dependency Slice

```
import { MockBackend } from '../../src/agent/backends/mock.js'
import { StructuredLogger } from '../../src/logging/logger.js'
import { Orchestrator } from '../../src/orchestrator.js'
import { RunningEntry } from '../../src/types/internal.js'
import { crossFieldRoutingIssues, routingWarnings } from '../../src/workflow/config'
import { getDefaultConfig, validateWorkflowConfig } from '../../src/workflow/config.js'
import { executeWorkflow, runStageSession, stageAttemptKey } from '../../src/workflow/execute-workflow.js'
import { WorkflowLoader } from '../../src/workflow/loader'
import { buildWorkflowContext, resolveLeafPrewarmSources, resolveStagePrewarmBlock } from '../../src/workflow/orchestrator-context.js'
import { BackendDefSchema, RoutingConfigSchema, StagedWorkflowDeclSchema, WorkflowStepSchema, validateBackendsAndRouting } from '../../src/workflow/schema'
import { discoverSkillCatalog, discoverSkillCatalogNames } from '../../src/workflow/skill-catalog'
import { workflowFor } from '../../src/workflow/workflow-for.js'
import { WorkspaceManager } from '../../src/workspace/manager.js'
import { AgentBackend, BackendCapabilities, BackendDef, CapabilityTier, ComplexityVerdict, Issue, Ok, RoutingConfig, RoutingDecision, RoutingRequest, STANDARD_COGNITIVE_MODES, StageRun, WorkflowConfig, WorkflowStep } from '@harness-engineering/types'
import { execSync } from 'node:child_process'
import * as fs, { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os, { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
