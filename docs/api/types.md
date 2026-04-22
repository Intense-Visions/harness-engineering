# @harness-engineering/types

TypeScript types and interfaces for the Harness Engineering toolkit.

**Source:** [index.ts](../../packages/types/src/index.ts), [orchestrator.ts](../../packages/types/src/orchestrator.ts)

**Version:** 0.10.0

## Installation

```bash
npm install @harness-engineering/types
```

## Overview

This package provides the shared type definitions used across all Harness Engineering packages. It includes the `Result<T, E>` type for consistent error handling, workflow orchestration types, skill metadata, CI/CD integration types, and roadmap structures.

## Result Type

The foundational error-handling pattern used throughout the toolkit.

### `Result<T, E>`

```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
```

A discriminated union for explicit error handling. All core functions return this type.

### `Ok(value)`

```typescript
function Ok<T>(value: T): Result<T, never>;
```

Creates a successful Result wrapping the given value.

### `Err(error)`

```typescript
function Err<E>(error: E): Result<never, E>;
```

Creates a failed Result wrapping the given error.

### `isOk(result)`

```typescript
function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T };
```

Type guard that narrows a Result to its success variant.

### `isErr(result)`

```typescript
function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E };
```

Type guard that narrows a Result to its failure variant.

**Usage:**

```typescript
import { Ok, Err, isOk, type Result } from '@harness-engineering/types';

function divide(a: number, b: number): Result<number, string> {
  if (b === 0) return Err('Division by zero');
  return Ok(a / b);
}

const result = divide(10, 2);
if (isOk(result)) {
  console.log(result.value); // 5
}
```

## Workflow Types

Types for multi-step workflow orchestration.

### `WorkflowStep`

```typescript
interface WorkflowStep {
  skill: string;
  produces: string;
  expects?: string;
  gate?: 'pass-required' | 'advisory';
}
```

A single step in a workflow, referencing a skill by name.

### `Workflow`

```typescript
interface Workflow {
  name: string;
  steps: WorkflowStep[];
}
```

A named sequence of workflow steps.

### `StepOutcome`

```typescript
type StepOutcome = 'pass' | 'fail' | 'skipped';
```

### `WorkflowStepResult`

```typescript
interface WorkflowStepResult {
  step: WorkflowStep;
  outcome: StepOutcome;
  artifact?: string;
  error?: string;
  durationMs: number;
}
```

### `WorkflowResult`

```typescript
interface WorkflowResult {
  workflow: Workflow;
  stepResults: WorkflowStepResult[];
  pass: boolean;
  totalDurationMs: number;
}
```

## Skill Metadata Types

### `STANDARD_COGNITIVE_MODES`

```typescript
const STANDARD_COGNITIVE_MODES = [
  'adversarial-reviewer',
  'constructive-architect',
  'meticulous-implementer',
  'diagnostic-investigator',
  'advisory-guide',
  'meticulous-verifier',
] as const;
```

### `CognitiveMode`

```typescript
type CognitiveMode = (typeof STANDARD_COGNITIVE_MODES)[number] | (string & {});
```

A standard cognitive mode or any custom string.

### `SkillMetadata`

```typescript
interface SkillMetadata {
  name: string;
  version: string;
  description: string;
  cognitive_mode?: CognitiveMode;
  stability?: StabilityTier;
}
```

## Pipeline Types

### `SkillContext`

```typescript
interface SkillContext {
  skillName: string;
  phase: string;
  files: string[];
  tokenBudget?: Record<string, number>;
  metadata: Record<string, unknown>;
}
```

### `TurnContext`

```typescript
interface TurnContext extends SkillContext {
  turnNumber: number;
  previousResults: unknown[];
}
```

### `SkillError`

```typescript
type SkillError = { code: string; message: string; phase: string };
```

### `SkillResult`

```typescript
type SkillResult = { success: boolean; artifacts: string[]; summary: string };
```

### `SkillLifecycleHooks`

```typescript
interface SkillLifecycleHooks {
  preExecution?: (context: SkillContext) => SkillContext | null;
  perTurn?: (context: TurnContext) => TurnContext | null;
  postExecution?: (context: SkillContext, result: SkillResult) => void;
}
```

## CI/CD Integration Types

### `CICheckName`

```typescript
type CICheckName =
  | 'validate'
  | 'deps'
  | 'docs'
  | 'entropy'
  | 'security'
  | 'perf'
  | 'phase-gate'
  | 'arch'
  | 'traceability';
```

### `CICheckStatus`

```typescript
type CICheckStatus = 'pass' | 'fail' | 'warn' | 'skip';
```

### `CICheckIssue`

```typescript
interface CICheckIssue {
  severity: 'error' | 'warning';
  message: string;
  file?: string;
  line?: number;
}
```

### `CICheckResult`

```typescript
interface CICheckResult {
  name: CICheckName;
  status: CICheckStatus;
  issues: CICheckIssue[];
  durationMs: number;
}
```

### `CICheckReport`

```typescript
interface CICheckReport {
  version: 1;
  project: string;
  timestamp: string;
  checks: CICheckResult[];
  summary: CICheckSummary;
  exitCode: 0 | 1 | 2;
}
```

### `CICheckSummary`

```typescript
interface CICheckSummary {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
}
```

### `CICheckOptions`

```typescript
interface CICheckOptions {
  skip?: CICheckName[];
  failOn?: CIFailOnSeverity;
  configPath?: string;
}
```

### `CIInitOptions`

```typescript
interface CIInitOptions {
  platform?: CIPlatform;
  checks?: CICheckName[];
}
```

### `CIPlatform`

```typescript
type CIPlatform = 'github' | 'gitlab' | 'generic';
```

### `CIFailOnSeverity`

```typescript
type CIFailOnSeverity = 'error' | 'warning';
```

## Usage Types

### `UsageRecord`

```typescript
interface UsageRecord {
  sessionId: string;
  timestamp: string;
  tokens: TokenUsage;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  model?: string;
  costMicroUSD?: number;
}
```

Extended entry for cost tracking storage and display.

### `ModelPricing`

```typescript
interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M?: number;
  cacheWritePer1M?: number;
}
```

Per-model pricing rates in USD per 1 million tokens.

### `DailyUsage`

```typescript
interface DailyUsage {
  date: string;
  sessionCount: number;
  tokens: TokenUsage;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  costMicroUSD: number | null;
  models: string[];
}
```

Aggregated usage for a single calendar day.

### `SessionUsage`

```typescript
interface SessionUsage {
  sessionId: string;
  firstTimestamp: string;
  lastTimestamp: string;
  tokens: TokenUsage;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  model?: string;
  costMicroUSD: number | null;
  source: 'harness' | 'claude-code' | 'merged';
}
```

Aggregated usage for a single session across all its turns.

---

## External Tracker Types

### `ExternalTicket`

```typescript
interface ExternalTicket {
  externalId: string;
  url: string;
}
```

Represents a ticket created in an external tracking service.

### `ExternalTicketState`

```typescript
interface ExternalTicketState {
  externalId: string;
  title: string;
  status: string;
  labels: string[];
  assignee: string | null;
}
```

Current state of a ticket in the external service.

### `SyncResult`

```typescript
interface SyncResult {
  created: ExternalTicket[];
  updated: string[];
  assignmentChanges: Array<{ feature: string; from: string | null; to: string | null }>;
  errors: Array<{ featureOrId: string; error: Error }>;
}
```

Result of a sync operation collecting successes and errors per-feature.

### `TrackerSyncConfig`

```typescript
interface TrackerSyncConfig {
  kind: 'github';
  repo?: string;
  labels?: string[];
  statusMap: Record<FeatureStatus, string>;
  reverseStatusMap?: Record<string, FeatureStatus>;
}
```

Configuration for external tracker sync.

---

## Roadmap Types

### `FeatureStatus`

```typescript
type FeatureStatus = 'backlog' | 'planned' | 'in-progress' | 'done' | 'blocked' | 'needs-human';
```

### `RoadmapFeature`

```typescript
type Priority = 'P0' | 'P1' | 'P2' | 'P3';

interface RoadmapFeature {
  name: string;
  status: FeatureStatus;
  spec: string | null;
  plans: string[];
  blockedBy: string[];
  summary: string;
  assignee: string | null;
  priority: Priority | null;
  externalId: string | null;
  updatedAt: string | null;
}
```

### `RoadmapMilestone`

```typescript
interface RoadmapMilestone {
  name: string;
  isBacklog: boolean;
  features: RoadmapFeature[];
}
```

### `RoadmapFrontmatter`

```typescript
interface RoadmapFrontmatter {
  project: string;
  version: number;
  created?: string;
  updated?: string;
  lastSynced: string;
  lastManualEdit: string;
}
```

### `AssignmentRecord`

```typescript
interface AssignmentRecord {
  feature: string;
  assignee: string;
  action: 'assigned' | 'completed' | 'unassigned';
  date: string;
}
```

### `Roadmap`

```typescript
interface Roadmap {
  frontmatter: RoadmapFrontmatter;
  milestones: RoadmapMilestone[];
  assignmentHistory: AssignmentRecord[];
}
```

### `TrackerComment`

```typescript
interface TrackerComment {
  id: string;
  body: string;
  createdAt: string;
  author: string;
  updatedAt: string | null;
}
```

## Caching / Stability Types

```typescript
type StabilityTier = 'static' | 'stable' | 'volatile' | 'experimental';

interface StabilityMetadata {
  tier: StabilityTier;
  ttlMs: number;
}
```

## Session State Types

```typescript
const SESSION_SECTION_NAMES = ['tasks', 'decisions', 'blockers', 'notes'] as const;
type SessionSectionName = (typeof SESSION_SECTION_NAMES)[number];
type SessionEntryStatus = 'pending' | 'in_progress' | 'done' | 'blocked' | 'skipped';

interface SessionEntry {
  id: string;
  content: string;
  status: SessionEntryStatus;
  createdAt: string;
  updatedAt: string;
}

type SessionSections = Record<SessionSectionName, SessionEntry[]>;
```

## Adoption Telemetry Types

```typescript
interface SkillInvocationRecord {
  skill: string;
  timestamp: string;
  duration?: number;
  outcome?: string;
}

interface SkillAdoptionSummary {
  skill: string;
  count: number;
  lastUsed: string;
}

interface AdoptionSnapshot {
  records: SkillInvocationRecord[];
  period: { start: string; end: string };
}
```

## Telemetry Types

```typescript
interface TelemetryConfig {
  enabled: boolean;
  endpoint?: string;
}

interface TelemetryIdentity {
  installId: string;
  userId?: string;
}

type ConsentState = 'granted' | 'denied' | 'unknown';

interface TelemetryEvent {
  name: string;
  properties?: Record<string, unknown>;
  timestamp: string;
}
```

## Orchestrator Types

See [Orchestrator API Reference](orchestrator.md) for the full set of orchestrator types including `AgentSession`, `AgentEvent`, `TurnResult`, `AgentBackend`, `TrackerConfig`, `PollingConfig`, `WorkspaceConfig`, `HooksConfig`, `AgentConfig`, `ServerConfig`, `WorkflowConfig`, `IntelligenceConfig`, `EscalationConfig`, `ScopeTier`, `ConcernSignal`, `RoutingDecision`, and more.

## Container & Secrets Types

```typescript
interface ContainerCreateOpts {
  image: string;
  workDir: string;
  env?: Record<string, string>;
}

interface ContainerExecOpts {
  command: string[];
  timeout?: number;
}

interface ContainerHandle {
  id: string;
  exec(opts: ContainerExecOpts): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  destroy(): Promise<void>;
}

interface ContainerRuntime {
  create(opts: ContainerCreateOpts): Promise<ContainerHandle>;
}

interface SecretBackend {
  resolve(key: string): Promise<string>;
}
```
