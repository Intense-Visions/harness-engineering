---
schemaVersion: 1
module: "packages/orchestrator/tests/agent"
sourceHash: "0715cb199e7b2cde8a10485747aa58ef8739308b09c8742edd36123f5a07d4ea"
compiledAt: "2026-08-28T01:22:12.522Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["analysis-env.test.ts", "analysis-provider-factory.test.ts", "backend-factory.test.ts", "backend-router-chain-walk.test.ts", "backend-router.test.ts", "config-migration.test.ts", "local-model-resolver.test.ts", "multi-backend-dispatch.test.ts", "multi-resolver-independence.test.ts", "orchestrator-backend-factory.test.ts", "runner.test.ts", "triage-skill-mapping.test.ts", "use-case-construction.test.ts"]
---

## Summary

packages/orchestrator/tests/agent validates the agent subsystem's analysis backbone—how the orchestrator derives and provisions evaluation providers (judges) that validate the coder's work. It covers two critical wiring points: (1) Analysis Environment derives HARNESS_ANALYSIS_* env vars from the thinking-mode backend for eval MCP tools, preferring an explicit SEL (judge) backend when configured, and never overriding operator-provided values. (2) Analysis Provider Factory translates BackendDef config to AnalysisProvider instances, handling resolver snapshot tracking so getModel() reflects live pool state, and validating unavailable resolvers with detailed diagnostic output for operator triage.

## Invariants

- Analysis derives from thinking-mode backend, not the coder backend—eval judges use the reasoner (strong model), not the fast coder.
- SEL (judge) layer takes priority over thinking backend—routing.intelligence.sel is the preferred judge if declared; falls back to thinking mode.
- Operator-pinned values are never overridden—if process.env.HARNESS_ANALYSIS_* is explicit or intelligence.models.{sel} is set, factory respects it; applyAnalysisEnv returns null rather than clobbering.
- getModel() is live unless pinned—resolver snapshot churn updates the provider's model reference without rebuild, unless an operator pinned a layer model.
- Local backends require an available resolver; cloud backends do not—unavailable local resolver nulls the provider and warns with diagnostic lists. Cloud backends (anthropic, openai) always build.
- First model in array or scalar model is the selected one—model resolution follows deterministic priority: first in prefer-list or the single scalar.
- Unavailable resolver warnings include diagnostic lists—P3-IMP-1 contract ensures operators can triage without grepping logs; msg includes Configured and Detected model arrays + endpoint.

## Interface Contract

```ts

```

## Dependency Slice

```
import { applyAnalysisEnv, deriveAnalysisEnv } from '../../src/agent/analysis-env'
import { buildAnalysisProvider } from '../../src/agent/analysis-provider-factory.js'
import { contextCapFromMemoryGb, createBackend } from '../../src/agent/backend-factory.js'
import { BackendRouter, toArray } from '../../src/agent/backend-router.js'
import { AnthropicBackend } from '../../src/agent/backends/anthropic.js'
import { ClaudeBackend } from '../../src/agent/backends/claude.js'
import from '../../src/agent/backends/container.js'
import { GeminiBackend } from '../../src/agent/backends/gemini.js'
import { LocalBackend } from '../../src/agent/backends/local.js'
import { MockBackend } from '../../src/agent/backends/mock'
import { MockBackend } from '../../src/agent/backends/mock.js'
import { OllamaBackend } from '../../src/agent/backends/ollama.js'
import { OpenAIBackend } from '../../src/agent/backends/openai.js'
import { PiBackend } from '../../src/agent/backends/pi.js'
import { migrateAgentConfig } from '../../src/agent/config-migration'
import { LocalModelResolver, defaultFetchModels, defaultWarmModel, defaultWarmModelViaCompletion, normalizeLocalModel } from '../../src/agent/local-model-resolver'
import { OrchestratorBackendFactory } from '../../src/agent/orchestrator-backend-factory'
import { OrchestratorBackendFactory } from '../../src/agent/orchestrator-backend-factory.js'
import { AgentRunner } from '../../src/agent/runner'
import { resolveSkillForTriage } from '../../src/agent/triage-skill-mapping'
import { buildRoutingUseCase } from '../../src/agent/use-case-builder'
import { routeIssue } from '../../src/core/model-router'
import { Orchestrator } from '../../src/orchestrator'
import { RoutingDecisionBus } from '../../src/routing/decision-bus.js'
import { SkillCatalogEntry } from '../../src/workflow/skill-catalog'
import { noopExecFile } from '../helpers/noop-exec-file'
import { AnthropicAnalysisProvider, ClaudeCliAnalysisProvider, OpenAICompatibleAnalysisProvider } from '@harness-engineering/intelligence'
import { EmptyPoolState, PoolStateProvider } from '@harness-engineering/local-models'
import { AgentBackend, AgentConfig, AgentEvent, AgentSession, BackendDef, Issue, IssueTrackerClient, Ok, RoutingConfig, RoutingUseCase, SessionStartParams, TurnParams, TurnResult, WorkflowConfig } from '@harness-engineering/types'
import { execFile, execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
