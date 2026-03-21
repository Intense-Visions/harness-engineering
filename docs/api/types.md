# @harness-engineering/types

TypeScript types and interfaces for the Harness Engineering toolkit.

**Version:** 0.1.0

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
type CICheckName = 'validate' | 'deps' | 'docs' | 'entropy' | 'security' | 'perf' | 'phase-gate';
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

## Roadmap Types

### `FeatureStatus`

```typescript
type FeatureStatus = 'backlog' | 'planned' | 'in-progress' | 'done' | 'blocked';
```

### `RoadmapFeature`

```typescript
interface RoadmapFeature {
  name: string;
  status: FeatureStatus;
  spec: string | null;
  plans: string[];
  blockedBy: string[];
  summary: string;
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
  lastSynced: string;
  lastManualEdit: string;
}
```

### `Roadmap`

```typescript
interface Roadmap {
  frontmatter: RoadmapFrontmatter;
  milestones: RoadmapMilestone[];
}
```
