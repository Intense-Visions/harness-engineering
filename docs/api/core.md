# @harness-engineering/core

Core library for the Harness Engineering toolkit. Provides validation, constraint enforcement, entropy detection, context generation, feedback, state management, security scanning, CI orchestration, and more.

**Version:** 0.13.1

## Installation

```bash
npm install @harness-engineering/core
```

## Overview

This package re-exports everything from `@harness-engineering/types` and adds the runtime implementation modules. All functions return `Result<T, E>` types for consistent error handling.

```typescript
import { validateFileStructure, Ok, Err } from '@harness-engineering/core';
```

## Constants

### `VERSION`

```typescript
const VERSION: string; // "0.12.0"
```

## Error Types

### `BaseError`

```typescript
interface BaseError {
  code: string;
  message: string;
  details: Record<string, unknown>;
  suggestions: string[];
}
```

### Specialized Error Interfaces

| Type              | Error Codes                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ValidationError` | `INVALID_TYPE`, `MISSING_FIELD`, `VALIDATION_FAILED`, `PARSE_ERROR`                                                                         |
| `ContextError`    | `PARSE_ERROR`, `SCHEMA_VIOLATION`, `MISSING_SECTION`, `BROKEN_LINK`                                                                         |
| `ConstraintError` | `WRONG_LAYER`, `CIRCULAR_DEP`, `FORBIDDEN_IMPORT`, `BOUNDARY_ERROR`, `PARSER_UNAVAILABLE`                                                   |
| `EntropyError`    | `SNAPSHOT_BUILD_FAILED`, `PARSE_ERROR`, `ENTRY_POINT_NOT_FOUND`, `INVALID_CONFIG`, `CONFIG_VALIDATION_ERROR`, `FIX_FAILED`, `BACKUP_FAILED` |
| `FeedbackError`   | `AGENT_SPAWN_ERROR`, `AGENT_TIMEOUT`, `TELEMETRY_ERROR`, `TELEMETRY_UNAVAILABLE`, `REVIEW_ERROR`, `DIFF_PARSE_ERROR`, `SINK_ERROR`          |

### `createError(code, message, details?, suggestions?)`

```typescript
function createError<T extends BaseError>(
  code: T['code'],
  message: string,
  details?: Record<string, unknown>,
  suggestions?: string[]
): T;
```

Factory function for creating typed errors.

---

## Validation Module

### `validateFileStructure(rootDir, conventions)`

Validates that a project's file structure matches the given conventions.

**Types:** `Convention`, `StructureValidation`

### `validateConfig(config)`

Validates a harness configuration object.

**Types:** `ConfigError`

### `validateCommitMessage(message, format?)`

Validates a commit message against a format specification.

**Types:** `CommitFormat`, `CommitValidation`

---

## Context Module

### `validateAgentsMap(content)` _(deprecated)_

> **Deprecated:** Use graph-based validation via `Assembler.checkCoverage()` from `@harness-engineering/graph` instead.

Validates the structure of an AGENTS.md file.

**Types:** `AgentMapLink`, `AgentMapSection`, `AgentMapValidation`

### `extractMarkdownLinks(content)` / `extractSections(content)`

Utility functions for parsing markdown content.

### `checkDocCoverage(options)`

Checks documentation coverage across a project. Source: [`doc-coverage.ts`](../../packages/core/src/context/doc-coverage.ts)

**Types:** `DocumentationGap`, `CoverageReport`, `CoverageOptions`, `GraphCoverageData`

### `validateKnowledgeMap(rootDir)` _(deprecated)_

> **Deprecated:** Use graph-based validation via `Assembler.checkCoverage()` from `@harness-engineering/graph` instead.

Validates the knowledge map integrity (broken links, missing references).

**Types:** `BrokenLink`, `IntegrityReport`

### `generateAgentsMap(config)`

Generates an AGENTS.md file from project configuration.

**Types:** `GenerationSection`, `AgentsMapConfig`

### `contextBudget(overrides?)`

Creates a token budget allocation for context assembly.

**Types:** `TokenBudget`, `TokenBudgetOverrides`

### `contextFilter(files, phase)`

Filters files based on workflow phase relevance.

**Types:** `WorkflowPhase`, `FileCategory`, `ContextFilterResult`

### `getPhaseCategories(phase)`

Returns the file categories relevant to a given workflow phase.

### `REQUIRED_SECTIONS`

Constant array of required AGENTS.md sections.

---

## Constraints Module

### `defineLayer(config)`

Defines an architectural layer with allowed dependencies.

### `validateDependencies(graph, layers)`

Validates dependency edges against layer rules.

### `buildDependencyGraph(rootDir)`

Builds a dependency graph from source files.

**Types:** `Layer`, `LayerConfig`, `DependencyEdge`, `DependencyGraph`, `DependencyViolation`, `DependencyValidation`

### `resolveFileToLayer(filePath, layers)`

Maps a file path to its architectural layer.

### Constraint Sharing

| Function                           | Description                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `removeSharedConstraints(rootDir)` | Removes shared constraint symlinks/copies from a project. Source: [`remove.ts`](../../packages/core/src/constraints/sharing/remove.ts) |

### `detectCircularDeps(graph)` / `detectCircularDepsInFiles(files)`

Detects circular dependency chains.

**Types:** `CircularDependency`, `CircularDepsResult`

### `createBoundaryValidator(definitions)` / `validateBoundaries(source, definitions)`

Validates module boundary constraints (e.g., requiring Zod schemas at public boundaries).

**Types:** `BoundaryDefinition`, `BoundaryValidator`, `BoundaryViolation`, `BoundaryValidation`

---

## Entropy Module

### `EntropyAnalyzer`

Main class for running entropy analysis across a codebase.

### `buildSnapshot(rootDir)`

Builds a codebase snapshot for entropy detection.

**Types:** `CodebaseSnapshot`, `SourceFile`, `DocumentationFile`, `ExportMap`

### Detectors

| Function                                       | Description                              | Report Type        |
| ---------------------------------------------- | ---------------------------------------- | ------------------ |
| `detectDocDrift(snapshot)`                     | Finds documentation-code drift           | `DriftReport`      |
| `detectDeadCode(snapshot)`                     | Finds unused exports, files, symbols     | `DeadCodeReport`   |
| `detectPatternViolations(snapshot, config)`    | Matches forbidden/required code patterns | `PatternReport`    |
| `detectComplexityViolations(snapshot, config)` | Flags overly complex code                | `ComplexityReport` |
| `detectCouplingViolations(snapshot, config)`   | Detects high coupling between modules    | `CouplingReport`   |
| `detectSizeBudgetViolations(snapshot, config)` | Checks file/module size limits           | `SizeBudgetReport` |

### Fixers

| Function                                  | Description                                        |
| ----------------------------------------- | -------------------------------------------------- |
| `createFixes(report)`                     | Creates fix objects from an entropy report         |
| `applyFixes(fixes)`                       | Applies fixes to the filesystem                    |
| `previewFix(fix)`                         | Returns a preview of what a fix would change       |
| `createCommentedCodeFixes(blocks)`        | Creates fixes for removing commented-out code      |
| `createOrphanedDepFixes(deps)`            | Creates fixes for removing orphaned dependencies   |
| `createForbiddenImportFixes(violations)`  | Creates fixes for forbidden import violations      |
| `generateSuggestions(report)`             | Generates human-readable suggestions from a report |
| `classifyFinding(finding)`                | Classifies a cleanup finding by safety level       |
| `applyHotspotDowngrade(finding, context)` | Downgrades finding severity in hotspot areas       |
| `deduplicateCleanupFindings(findings)`    | Removes duplicate cleanup findings                 |

### Configuration

| Export                          | Description                     |
| ------------------------------- | ------------------------------- |
| `validatePatternConfig(config)` | Validates pattern configuration |
| `PatternConfigSchema`           | Zod schema for pattern config   |
| `EntropyConfigSchema`           | Zod schema for entropy config   |

#### Entropy Type Definitions

| File                                                                           | Description                                                                   |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [`report.ts`](../../packages/core/src/entropy/types/report.ts)                 | Entropy report types (`EntropyReport`, `DriftReport`, `DeadCodeReport`, etc.) |
| [`pattern.ts`](../../packages/core/src/entropy/types/pattern.ts)               | Pattern violation types                                                       |
| [`pattern-config.ts`](../../packages/core/src/entropy/types/pattern-config.ts) | Pattern configuration types and schema                                        |
| [`fix.ts`](../../packages/core/src/entropy/types/fix.ts)                       | Fix types for entropy auto-remediation                                        |

### `parseSize(sizeStr)`

Parses a human-readable size string (e.g., "100kb") into bytes.

---

## Performance Module

### `BaselineManager`

Manages performance baselines (load, save, compare).

### `BenchmarkRunner`

Runs performance benchmarks.

**Types:** `BenchmarkRunOptions`

### `RegressionDetector`

Detects performance regressions by comparing benchmarks against baselines.

### `CriticalPathResolver`

Identifies critical execution paths.

**Types:** `BenchmarkResult`, `Baseline`, `BaselinesFile`, `RegressionResult`, `RegressionReport`, `CriticalPathEntry`, `CriticalPathSet`, `GraphCriticalPathData`

---

## Feedback Module

### Configuration

| Function                    | Description                        |
| --------------------------- | ---------------------------------- |
| `configureFeedback(config)` | Sets feedback module configuration |
| `getFeedbackConfig()`       | Returns current feedback config    |
| `resetFeedbackConfig()`     | Resets to default feedback config  |

### Self-Review

| Function                             | Description                                       |
| ------------------------------------ | ------------------------------------------------- |
| `createSelfReview(changes, config?)` | Creates a self-review checklist from code changes |
| `ChecklistBuilder`                   | Fluent builder class for review checklists        |
| `parseDiff(diffText)`                | Parses a unified diff string                      |
| `analyzeDiff(diffText)`              | Analyzes a diff for review-relevant patterns      |

### Peer Review

| Function                                      | Description                                       |
| --------------------------------------------- | ------------------------------------------------- |
| `requestPeerReview(context, agent)`           | Requests a peer review from a single agent        |
| `requestMultiplePeerReviews(context, agents)` | Requests reviews from multiple agents in parallel |

### Telemetry

| Export                 | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `NoOpTelemetryAdapter` | No-op telemetry adapter for testing or when telemetry is disabled |

### Executor

| Export         | Description                      |
| -------------- | -------------------------------- |
| `NoOpExecutor` | No-op agent executor for testing |

### Action Logging

| Function / Class           | Description                                |
| -------------------------- | ------------------------------------------ |
| `logAgentAction(action)`   | Logs a single agent action                 |
| `trackAction(context, fn)` | Wraps a function with action tracking      |
| `getActionEmitter()`       | Returns the singleton action event emitter |
| `AgentActionEmitter`       | Event emitter class for agent actions      |
| `ConsoleSink`              | Logs actions to console                    |
| `FileSink`                 | Logs actions to a file                     |
| `NoOpSink`                 | Discards action events                     |

---

## State Module

### State Management

| Function                                   | Description                                                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `loadState(rootDir)`                       | Loads harness state from `.harness/state.json`                                                                         |
| `saveState(rootDir, state)`                | Saves harness state                                                                                                    |
| `appendLearning(rootDir, learning)`        | Appends a learning entry                                                                                               |
| `loadRelevantLearnings(rootDir, query)`    | Loads learnings relevant to a query                                                                                    |
| `loadBudgetedLearnings(rootDir, options)`  | Loads learnings within a token budget with two-tier (session + global) loading, recency sorting, and relevance scoring |
| `clearLearningsCache()`                    | Clears the in-memory learnings cache                                                                                   |
| `appendFailure(rootDir, failure)`          | Records a failure entry                                                                                                |
| `loadFailures(rootDir)`                    | Loads failure history                                                                                                  |
| `archiveFailures(rootDir)`                 | Archives old failures                                                                                                  |
| `saveHandoff(rootDir, handoff)`            | Saves a handoff document                                                                                               |
| `loadHandoff(rootDir)`                     | Loads the current handoff                                                                                              |
| `runMechanicalGate(rootDir, config)`       | Runs a mechanical quality gate                                                                                         |
| `parseDateFromEntry(entry)`                | Parses a YYYY-MM-DD date from a learning entry string                                                                  |
| `analyzeLearningPatterns(entries)`         | Groups learning entries by `[skill:X]` and `[outcome:Y]` tags, returns patterns with 3+ occurrences                    |
| `archiveLearnings(rootDir, entries)`       | Archives learning entries to `.harness/learnings-archive/{YYYY-MM}.md`                                                 |
| `pruneLearnings(rootDir)`                  | Analyzes patterns, archives old entries, keeps 20 most recent in `learnings.md`                                        |
| `resolveSessionDir(rootDir, slug)`         | Resolves session directory path under `.harness/sessions/<slug>/`                                                      |
| `updateSessionIndex(rootDir, slug, desc)`  | Updates `.harness/sessions/index.md` with a session entry                                                              |
| `writeSessionSummary(rootDir, slug, data)` | Writes session `summary.md` and updates session index                                                                  |
| `loadSessionSummary(rootDir, slug)`        | Loads a session's `summary.md` contents, or null if missing                                                            |
| `listActiveSessions(rootDir)`              | Reads `.harness/sessions/index.md` contents, or null if missing                                                        |

**Types:** `HarnessState`, `FailureEntry`, `Handoff`, `GateResult`, `GateConfig`, `BudgetedLearningsOptions`, `LearningPattern`, `PruneResult`, `SessionSummaryData`

**Schemas:** `HarnessStateSchema`, `FailureEntrySchema`, `HandoffSchema`, `GateResultSchema`, `GateConfigSchema`

**Constants:** `DEFAULT_STATE`

#### Source Files

| File                                                                         | Description                                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`state-shared.ts`](../../packages/core/src/state/state-shared.ts)           | Shared utilities for state loading, saving, and path resolution |
| [`state-persistence.ts`](../../packages/core/src/state/state-persistence.ts) | Persistence layer for durable state storage                     |
| [`session-summary.ts`](../../packages/core/src/state/session-summary.ts)     | Session summary generation and management                       |
| [`session-resolver.ts`](../../packages/core/src/state/session-resolver.ts)   | Session directory resolution and index management               |
| [`mechanical-gate.ts`](../../packages/core/src/state/mechanical-gate.ts)     | Mechanical quality gate implementation                          |
| [`handoff.ts`](../../packages/core/src/state/handoff.ts)                     | Handoff document save/load                                      |
| [`failures.ts`](../../packages/core/src/state/failures.ts)                   | Failure recording and archival                                  |

### Streams

| Function                                 | Description                                  |
| ---------------------------------------- | -------------------------------------------- |
| `resolveStreamPath(rootDir, streamName)` | Resolves filesystem path for a stream        |
| `createStream(rootDir, info)`            | Creates a new stream                         |
| `listStreams(rootDir)`                   | Lists all streams                            |
| `setActiveStream(rootDir, name)`         | Sets the active stream                       |
| `archiveStream(rootDir, name)`           | Archives a stream                            |
| `loadStreamIndex(rootDir)`               | Loads the stream index                       |
| `saveStreamIndex(rootDir, index)`        | Saves the stream index                       |
| `migrateToStreams(rootDir)`              | Migrates legacy state to stream-based        |
| `getStreamForBranch(rootDir, branch)`    | Gets the stream associated with a git branch |
| `touchStream(rootDir, name)`             | Updates the stream's last-touched timestamp  |

**Types:** `StreamInfo`, `StreamIndex`

**Schemas:** `StreamInfoSchema`, `StreamIndexSchema`

**Constants:** `DEFAULT_STREAM_INDEX`

---

## Workflow Module

### `executeWorkflow(workflow, executor)`

```typescript
function executeWorkflow(workflow: Workflow, executor: StepExecutor): Promise<WorkflowResult>;
```

Executes a workflow by running each step through the provided executor.

**Types:** `StepExecutor`

---

## Pipeline Module

### `runPipeline(context, executor, options?)`

Runs a single-turn skill execution pipeline.

### `runMultiTurnPipeline(context, turnExecutor, options?)`

Runs a multi-turn skill execution pipeline.

**Types:** `PipelineOptions`, `PipelineResult`, `SkillExecutor`, `TurnExecutor`

---

## Security Module

### `SecurityScanner`

Main class for running security scans against source files.

### `RuleRegistry`

Registry for security scan rules.

### `detectStack(rootDir)`

Detects the technology stack of a project (Node, React, Go, etc.).

### Configuration

| Function                               | Description                      |
| -------------------------------------- | -------------------------------- |
| `parseSecurityConfig(config)`          | Parses security configuration    |
| `resolveRuleSeverity(rule, overrides)` | Resolves effective rule severity |

### Built-in Rule Sets

| Export                 | Category                        |
| ---------------------- | ------------------------------- |
| `secretRules`          | Hard-coded secrets and API keys |
| `injectionRules`       | SQL/command injection           |
| `xssRules`             | Cross-site scripting            |
| `cryptoRules`          | Weak cryptography               |
| `pathTraversalRules`   | Path traversal                  |
| `networkRules`         | Insecure network usage          |
| `deserializationRules` | Unsafe deserialization          |
| `nodeRules`            | Node.js-specific                |
| `expressRules`         | Express.js-specific             |
| `reactRules`           | React-specific                  |
| `goRules`              | Go-specific                     |

**Types:** `SecurityCategory`, `SecuritySeverity`, `SecurityConfidence`, `SecurityRule`, `SecurityFinding`, `ScanResult`, `SecurityConfig`, `RuleOverride`

**Constants:** `DEFAULT_SECURITY_CONFIG`

---

## CI Module

### `runCIChecks(input)`

```typescript
function runCIChecks(input: RunCIChecksInput): Promise<CICheckReport>;
```

Orchestrates all CI checks and returns a unified report.

**Types:** `RunCIChecksInput`

---

## Review Pipeline Module

### `runReviewPipeline(options)`

End-to-end code review pipeline: eligibility check, mechanical checks, fan-out to specialized agents, validation, deduplication, and formatted output.

### Review Phases

| Function                                  | Description                                        |
| ----------------------------------------- | -------------------------------------------------- |
| `checkEligibility(metadata)`              | Phase 1: Determines if a PR is eligible for review |
| `runMechanicalChecks(bundle, options?)`   | Phase 2: Runs mechanical/static checks             |
| `fanOutReview(bundle, options?)`          | Phase 3-4: Fans out to specialized review agents   |
| `validateFindings(findings, options?)`    | Phase 5: Validates review findings                 |
| `deduplicateFindings(findings, options?)` | Phase 6: Deduplicates overlapping findings         |
| `determineAssessment(findings)`           | Phase 7: Determines overall assessment             |

### Review Agents

| Export                                              | Description                    |
| --------------------------------------------------- | ------------------------------ |
| `runComplianceAgent` / `COMPLIANCE_DESCRIPTOR`      | Compliance review agent        |
| `runBugDetectionAgent` / `BUG_DETECTION_DESCRIPTOR` | Bug detection agent            |
| `runSecurityAgent` / `SECURITY_DESCRIPTOR`          | Security review agent          |
| `runArchitectureAgent` / `ARCHITECTURE_DESCRIPTOR`  | Architecture review agent      |
| `AGENT_DESCRIPTORS`                                 | Array of all agent descriptors |

### Output Formatting

| Function                                   | Description                                      |
| ------------------------------------------ | ------------------------------------------------ |
| `formatTerminalOutput(findings, options?)` | Formats findings for terminal display            |
| `formatFindingBlock(finding)`              | Formats a single finding                         |
| `formatGitHubComment(findings)`            | Formats findings as a GitHub PR comment          |
| `formatGitHubSummary(result)`              | Formats a review summary for GitHub              |
| `getExitCode(assessment)`                  | Maps assessment to process exit code             |
| `isSmallSuggestion(finding)`               | Checks if a finding is a small inline suggestion |

### Other

| Function                                       | Description                                          |
| ---------------------------------------------- | ---------------------------------------------------- |
| `ExclusionSet` / `buildExclusionSet(patterns)` | Manages file exclusion patterns                      |
| `detectChangeType(diff)`                       | Classifies a diff as refactor, feature, bugfix, etc. |
| `scopeContext(bundle, options?)`               | Scopes context to relevant files                     |
| `resolveModelTier(config)`                     | Resolves which model tier to use                     |

#### Review Type Definitions

| File                                                                  | Description                                |
| --------------------------------------------------------------------- | ------------------------------------------ |
| [`pipeline.ts`](../../packages/core/src/review/types/pipeline.ts)     | Pipeline configuration and execution types |
| [`output.ts`](../../packages/core/src/review/types/output.ts)         | Output formatting types                    |
| [`mechanical.ts`](../../packages/core/src/review/types/mechanical.ts) | Mechanical check types                     |
| [`context.ts`](../../packages/core/src/review/types/context.ts)       | Review context types                       |

---

## Roadmap Module

### `parseRoadmap(content)`

Parses a roadmap markdown file into a structured `Roadmap` object.

### `serializeRoadmap(roadmap)`

Serializes a `Roadmap` back to markdown.

### `syncRoadmap(roadmap, options)`

Synchronizes a roadmap with the current state of specs and plans on disk.

**Types:** `SyncChange`, `SyncOptions`

---

## Interaction Module

Schemas and types for agent-to-user interaction events.

**Types:** `InteractionType`, `Question`, `Confirmation`, `Transition`, `EmitInteractionInput`

**Schemas:** `InteractionTypeSchema`, `QuestionSchema`, `ConfirmationSchema`, `TransitionSchema`, `EmitInteractionInputSchema`

---

## Update Checker

### `isUpdateCheckEnabled(configInterval?)`

```typescript
function isUpdateCheckEnabled(configInterval?: number): boolean;
```

Returns false if `HARNESS_NO_UPDATE_CHECK=1` or interval is 0.

### `shouldRunCheck(state, intervalMs)`

```typescript
function shouldRunCheck(state: UpdateCheckState | null, intervalMs: number): boolean;
```

Returns true when enough time has passed since the last check.

### `readCheckState()`

```typescript
function readCheckState(): UpdateCheckState | null;
```

Reads cached update check state from `~/.harness/update-check.json`.

### `spawnBackgroundCheck(currentVersion)`

```typescript
function spawnBackgroundCheck(currentVersion: string): void;
```

Spawns a detached background process to check npm for the latest version.

### `getUpdateNotification(currentVersion)`

```typescript
function getUpdateNotification(currentVersion: string): string | null;
```

Returns a formatted notification string if a newer version is available, or null.

**Types:** `UpdateCheckState`

---

## Parsers

### `TypeScriptParser`

Class that parses TypeScript files into an AST with import/export information.

### `createParseError(message, file?)`

Factory function for creating parse errors.

**Types:** `LanguageParser`, `AST`, `Import`, `Export`, `ParseError`, `HealthCheckResult`
