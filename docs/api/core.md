# @harness-engineering/core

Core library for the Harness Engineering toolkit. Provides validation, constraint enforcement, entropy detection, context generation, feedback, state management, security scanning, CI orchestration, and more.

**Version:** 0.21.1

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
const VERSION: string; // "0.21.1"
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

Parses a roadmap markdown file into a structured `Roadmap` object. Supports extended fields: `Assignee`, `Priority` (P0–P3), `External-ID`. Parses `## Assignment History` section as a sentinel-bounded table into `AssignmentRecord[]`.

### `serializeRoadmap(roadmap)`

Serializes a `Roadmap` back to markdown. Extended fields (`Assignee`, `Priority`, `External-ID`) are conditionally emitted only when at least one is non-null on a feature, preserving round-trip fidelity for legacy roadmaps.

### `syncRoadmap(roadmap, options)`

Synchronizes a roadmap with the current state of specs and plans on disk.

**Types:** `SyncChange`, `SyncOptions`

### External Tracker Sync

#### `TrackerSyncAdapter` (interface)

Abstract interface for syncing roadmap features with external issue trackers. Methods: `createTicket`, `updateTicket`, `fetchTicketState`, `fetchAllTickets`, `assignTicket`.

#### `GitHubIssuesSyncAdapter`

GitHub Issues implementation of `TrackerSyncAdapter`. Uses native `fetch` with injectable `fetchFn` for testing. Label-based status disambiguation resolves the open/closed limitation.

#### `resolveReverseStatus(externalStatus, labels, config)`

Resolves an external ticket's status + labels to a roadmap `FeatureStatus` using `reverseStatusMap` config. Returns `null` if ambiguous or unmapped.

#### `syncToExternal(roadmap, adapter, config)`

Pushes planning fields to external service. Creates tickets for features without `externalId`, updates existing ones. Mutates roadmap in-place (stores new externalIds). Never throws.

#### `syncFromExternal(roadmap, adapter, config, options?)`

Pulls execution fields (assignee, status) from external service. External assignee wins. Status changes subject to directional guard — no regression unless `forceSync: true`.

#### `fullSync(roadmapPath, adapter, config, options?)`

Full bidirectional sync: read roadmap from disk, push, pull, write back. Serialized by in-process mutex to prevent concurrent write races.

**Types:** `ExternalSyncOptions`, `ExternalTicket`, `ExternalTicketState`, `SyncResult`, `TrackerSyncConfig`

### Pilot Scoring

#### `scoreRoadmapCandidates(roadmap, options?)`

Scores unblocked `planned`/`backlog` items using a two-tier sort: explicit priority first (P0 > P1 > P2 > P3), then weighted score (position 0.5, dependents 0.3, affinity 0.2). Returns `ScoredCandidate[]` sorted by rank.

#### `assignFeature(roadmap, featureName, assignee, date)`

Assigns a feature and appends to assignment history. No-op if already assigned to the same person. Reassignment produces two records: `unassigned` for the previous assignee, then `assigned` for the new one.

**Types:** `ScoredCandidate`, `PilotScoringOptions`

### Shared Utilities

#### `STATUS_RANK`

Record mapping `FeatureStatus` to numeric rank for directional sync protection. Shared between local sync and external tracker sync.

#### `isRegression(from, to)`

Returns `true` if transitioning from `from` to `to` would regress the status (lower rank).

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

---

## Code Navigation Module

AST-based code navigation using tree-sitter. Supports TypeScript, JavaScript, and Python. Source: [`packages/core/src/code-nav/`](../../packages/core/src/code-nav/)

### `parseFile(filePath)`

```typescript
function parseFile(filePath: string): Promise<Result<ParsedFile, ParseFileError>>;
```

Parses a source file into a tree-sitter AST with language metadata.

**Types:** `ParsedFile`, `ParseFileError`

### `getParser(lang)`

```typescript
function getParser(lang: SupportedLanguage): Promise<Parser>;
```

Returns a cached tree-sitter parser instance for the given language.

### `resetParserCache()`

Clears the parser instance cache. Primarily for testing.

### `getOutline(filePath)`

```typescript
function getOutline(filePath: string): Promise<OutlineResult>;
```

Extracts the structural outline of a file — top-level symbols (functions, classes, interfaces, types, variables) with their line ranges and signatures. Classes include child method symbols.

### `formatOutline(outline)`

```typescript
function formatOutline(outline: OutlineResult): string;
```

Formats an `OutlineResult` as a tree-style text representation with line numbers.

### `searchSymbols(query, directory, fileGlob?)`

```typescript
function searchSymbols(query: string, directory: string, fileGlob?: string): Promise<SearchResult>;
```

Searches for symbols matching a query (case-insensitive substring) across all supported files in a directory. Returns matching symbols with context.

### `unfoldSymbol(filePath, symbolName)`

```typescript
function unfoldSymbol(filePath: string, symbolName: string): Promise<UnfoldResult>;
```

Extracts a specific symbol's implementation from a file by name using AST boundaries. Falls back to raw file content if the symbol is not found or parsing fails.

### `unfoldRange(filePath, startLine, endLine)`

```typescript
function unfoldRange(filePath: string, startLine: number, endLine: number): Promise<UnfoldResult>;
```

Extracts a range of lines from a file.

### `detectLanguage(filePath)`

```typescript
function detectLanguage(filePath: string): SupportedLanguage | null;
```

Detects language from file extension. Returns `null` for unsupported extensions.

### `EXTENSION_MAP`

```typescript
const EXTENSION_MAP: Record<string, SupportedLanguage>;
```

Maps file extensions (`.ts`, `.tsx`, `.js`, `.jsx`, `.py`, etc.) to supported languages.

**Types:** `SupportedLanguage`, `SymbolKind`, `CodeSymbol`, `OutlineResult`, `SearchMatch`, `SearchResult`, `UnfoldResult`

---

## Pricing Module

Model pricing lookup and cost calculation using LiteLLM pricing data. Source: [`packages/core/src/pricing/`](../../packages/core/src/pricing/)

### `loadPricingData(projectRoot)`

```typescript
function loadPricingData(projectRoot: string): Promise<PricingDataset>;
```

Loads pricing data with a four-tier fallback strategy: fresh disk cache (<24h), network fetch from LiteLLM, expired disk cache, then bundled fallback data. Cache is stored at `.harness/cache/pricing.json`.

### `getModelPrice(model, dataset)`

```typescript
function getModelPrice(model: string, dataset: PricingDataset): ModelPricing | null;
```

Looks up pricing for a model name. Returns `null` with a console warning if the model is not found.

### `parseLiteLLMData(raw)`

```typescript
function parseLiteLLMData(raw: LiteLLMPricingData): PricingDataset;
```

Parses LiteLLM's raw pricing JSON into a `PricingDataset` map. Only includes chat-mode models with valid input/output costs. Converts per-token costs to per-million-token costs.

### `calculateCost(record, dataset)`

```typescript
function calculateCost(record: UsageRecord, dataset: PricingDataset): number | null;
```

Calculates the cost of a usage record in integer microdollars. Includes input, output, cache read, and cache write token costs. Returns `null` if the model is unknown.

### Constants

| Export                   | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| `LITELLM_PRICING_URL`    | Pinned URL for LiteLLM pricing data                          |
| `CACHE_TTL_MS`           | Cache time-to-live (24 hours in milliseconds)                |
| `STALENESS_WARNING_DAYS` | Days after which fallback usage triggers a staleness warning |

**Types:** `PricingDataset`, `PricingCacheFile`, `LiteLLMModelEntry`, `LiteLLMPricingData`, `FallbackPricingFile`

---

## Usage Module

Token usage aggregation and cost record parsing. Source: [`packages/core/src/usage/`](../../packages/core/src/usage/)

### `aggregateBySession(records)`

```typescript
function aggregateBySession(records: UsageRecord[]): SessionUsage[];
```

Aggregates usage records into per-session summaries, sorted by most recent first. When records from both harness and Claude Code sources share a session ID, harness token counts are authoritative and the result is marked as `'merged'`.

### `aggregateByDay(records)`

```typescript
function aggregateByDay(records: UsageRecord[]): DailyUsage[];
```

Aggregates usage records into per-day summaries grouped by UTC calendar date, sorted by most recent first.

### `readCostRecords(projectRoot)`

```typescript
function readCostRecords(projectRoot: string): UsageRecord[];
```

Reads `.harness/metrics/costs.jsonl` and normalizes snake_case hook output to camelCase `UsageRecord` format. Skips malformed lines with a warning. Returns empty array if file does not exist.

### `parseCCRecords()`

```typescript
function parseCCRecords(): UsageRecord[];
```

Discovers and parses Claude Code JSONL files from `~/.claude/projects/` directories. Deduplicates streaming chunks by keeping only the last entry per `requestId`. Each valid entry is tagged with `_source: 'claude-code'` for merge logic. Returns empty array if the directory does not exist.

---

## Blueprint Module

Project blueprint generation — scans a project and generates an HTML documentation site with LLM-powered code explanations. Source: [`packages/core/src/blueprint/`](../../packages/core/src/blueprint/)

### `ProjectScanner`

```typescript
class ProjectScanner {
  constructor(rootDir: string);
  scan(): Promise<BlueprintData>;
}
```

Scans a project directory to produce a `BlueprintData` structure. Reads `package.json` for the project name (falls back to directory name). Returns a scaffold with four default module categories: Foundations, Core Logic, Interaction Surface, and Cross-Cutting Concerns.

### `BlueprintGenerator`

```typescript
class BlueprintGenerator {
  generate(data: BlueprintData, options: BlueprintOptions): Promise<void>;
}
```

Generates an HTML blueprint from `BlueprintData`. Runs each module through the `ContentPipeline` for LLM-powered code translation, then renders the final HTML using EJS templates. Writes `index.html` to the specified output directory.

### `ContentPipeline`

```typescript
class ContentPipeline {
  generateModuleContent(module: BlueprintModule): Promise<Content>;
}
```

Generates human-readable code explanations for a blueprint module using the LLM service.

**Types:** `BlueprintData`, `BlueprintModule`, `BlueprintOptions`, `Content`, `Hotspot`, `ModuleDependency`

---

## Architecture Module

Architecture metric collection, baseline management, regression detection, trend analysis, and predictive forecasting. Source: [`packages/core/src/architecture/`](../../packages/core/src/architecture/)

### Collectors

| Class                      | Category          | Description                        |
| -------------------------- | ----------------- | ---------------------------------- |
| `CircularDepsCollector`    | circular-deps     | Detects circular dependency chains |
| `LayerViolationCollector`  | layer-violations  | Detects layer boundary violations  |
| `ComplexityCollector`      | complexity        | Measures code complexity           |
| `CouplingCollector`        | coupling          | Measures fan-in/fan-out coupling   |
| `ForbiddenImportCollector` | forbidden-imports | Detects forbidden import patterns  |
| `ModuleSizeCollector`      | module-size       | Measures module file counts/sizes  |
| `DepDepthCollector`        | dep-depth         | Measures dependency chain depth    |

All collectors implement the `Collector` interface: `collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]>`.

### `runAll(config, rootDir, collectors?)`

```typescript
function runAll(
  config: ArchConfig,
  rootDir: string,
  collectors?: Collector[]
): Promise<MetricResult[]>;
```

Runs all collectors in parallel and returns a flat array of metric results. Defaults to `defaultCollectors`. Failed collectors produce a zero-value result with error metadata.

### `defaultCollectors`

```typescript
const defaultCollectors: Collector[];
```

Array of all built-in collector instances.

### `ArchBaselineManager`

```typescript
class ArchBaselineManager {
  constructor(projectRoot: string, baselinePath?: string);
  capture(results: MetricResult[], commitHash: string): ArchBaseline;
  load(): ArchBaseline | null;
  save(baseline: ArchBaseline): void;
}
```

Manages architecture baselines stored at `.harness/arch/baselines.json`. Uses atomic writes (temp file + rename) to prevent corruption. `capture()` aggregates metric results by category into a baseline snapshot.

### `diff(current, baseline)`

```typescript
function diff(current: MetricResult[], baseline: ArchBaseline): ArchDiffResult;
```

Diffs current metric results against a stored baseline using ratchet logic: new violations and aggregate regressions cause failure, pre-existing violations are allowed, and resolved violations are tracked.

### `resolveThresholds(scope, config)`

```typescript
function resolveThresholds(scope: string, config: ArchConfig): ThresholdConfig;
```

Resolves effective thresholds for a given scope. Merges project-wide thresholds with module-level overrides when a matching module entry exists.

### `TimelineManager`

```typescript
class TimelineManager {
  constructor(rootDir: string);
  load(): TimelineFile;
  save(timeline: TimelineFile): void;
  capture(results: MetricResult[], commitHash: string): TimelineSnapshot;
  computeStabilityScore(metrics, thresholds): number;
  analyzeTrends(timeline: TimelineFile): TrendResult;
}
```

Manages architecture metric timelines stored at `.harness/arch/timeline.json`. Supports snapshot capture, trend analysis, and stability scoring. Uses atomic writes.

### `PredictionEngine`

```typescript
class PredictionEngine {
  constructor(
    rootDir: string,
    timelineManager: TimelineManager,
    estimator: SpecImpactEstimator | null
  );
  predict(options?: Partial<PredictionOptions>): PredictionResult;
}
```

Orchestrates weighted regression over timeline snapshots to produce per-category forecasts, warnings, and stability projections. Requires at least 3 snapshots. Supports roadmap-aware adjusted forecasts via `SpecImpactEstimator`.

### `SpecImpactEstimator`

```typescript
class SpecImpactEstimator {
  constructor(rootDir: string, coefficients?: EstimatorCoefficients);
  estimate(specPath: string): SpecImpactEstimate;
  estimateAll(features: Array<{ name: string; spec: string | null }>): SpecImpactEstimate[];
}
```

Mechanical extraction of structural signals from spec files. Applies configurable coefficients to produce per-category metric deltas. No LLM dependency — deterministic and auditable.

**Types:** `EstimatorCoefficients`

### Regression Utilities

| Function                                        | Description                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `weightedLinearRegression(points)`              | Weighted least squares linear regression (requires 2+ data points) |
| `applyRecencyWeights(values, decay?)`           | Assigns exponential recency weights (newest = 1.0, decay per step) |
| `projectValue(fit, t)`                          | Projects a value at future time `t` using a regression fit         |
| `weeksUntilThreshold(fit, currentT, threshold)` | Weeks until projected value crosses a threshold (null if never)    |
| `classifyConfidence(rSquared, dataPoints)`      | Classifies confidence tier (high/medium/low) from fit quality      |

**Types:** `DataPoint`, `RegressionFit`

### Constraint Graph Sync

### `syncConstraintNodes(store, rules, violations)`

```typescript
function syncConstraintNodes(
  store: ConstraintNodeStore,
  rules: ConstraintRule[],
  violations: MetricResult[]
): void;
```

Synchronizes constraint rules with graph nodes. Upserts each rule as a `constraint` node, updates `lastViolatedAt` timestamps for active violations, and prunes orphaned constraint nodes.

**Types:** `ConstraintNodeStore`

### `detectStaleConstraints(store, windowDays?, category?)`

```typescript
function detectStaleConstraints(
  store: ConstraintNodeStore,
  windowDays?: number,
  category?: ArchMetricCategory
): DetectStaleResult;
```

Detects constraint rules that haven't been violated within the given window (default: 30 days). Returns results sorted by most stale first.

**Types:** `StaleConstraint`, `DetectStaleResult`

### Vitest Matchers

### `archMatchers`

Custom Vitest matchers for architecture assertions. Register with `expect.extend(archMatchers)`.

| Matcher                     | Scope   | Description                                |
| --------------------------- | ------- | ------------------------------------------ |
| `toHaveNoCircularDeps()`    | Project | Asserts no circular dependencies           |
| `toHaveNoLayerViolations()` | Project | Asserts no layer boundary violations       |
| `toMatchBaseline(options?)` | Project | Asserts no new violations or regressions   |
| `toHaveMaxComplexity(max)`  | Module  | Asserts complexity within limit            |
| `toHaveMaxCoupling(limits)` | Module  | Asserts fan-in/fan-out within limits       |
| `toHaveMaxFileCount(max)`   | Module  | Asserts file count within limit            |
| `toNotDependOn(module)`     | Module  | Asserts no imports from a forbidden module |
| `toHaveMaxDepDepth(max)`    | Module  | Asserts dependency depth within limit      |

### `architecture(options?)` / `archModule(modulePath, options?)`

```typescript
function architecture(options?: ArchitectureOptions): ArchHandle;
function archModule(modulePath: string, options?: ArchitectureOptions): ArchHandle;
```

Factory functions for creating architecture handles consumed by the Vitest matchers. `architecture()` creates a project-wide handle; `archModule()` creates a module-scoped handle.

**Types:** `ArchHandle`, `ArchitectureOptions`

### Hashing Utilities

| Function                 | Description                                 |
| ------------------------ | ------------------------------------------- |
| `violationId(violation)` | Deterministic hash ID for a violation       |
| `constraintRuleId(rule)` | Deterministic hash ID for a constraint rule |

### Architecture Type Definitions

| Type / Schema               | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `ArchMetricCategory`        | Union of metric category strings                     |
| `Violation`                 | A single metric violation with file, detail, and ID  |
| `MetricResult`              | Collector output: category, scope, value, violations |
| `ArchBaseline`              | Stored baseline with per-category values and IDs     |
| `ArchDiffResult`            | Diff output: new/resolved violations, regressions    |
| `ArchConfig`                | Full architecture configuration                      |
| `ThresholdConfig`           | Per-category threshold values                        |
| `ConstraintRule`            | A constraint rule definition                         |
| `CategoryForecast`          | Per-category regression forecast                     |
| `AdjustedForecast`          | Forecast with roadmap-adjusted projections           |
| `PredictionResult`          | Full prediction output with warnings and stability   |
| `PredictionOptions`         | Options for prediction (horizon, categories, etc.)   |
| `PredictionWarning`         | Threshold crossing warning with severity             |
| `StabilityForecast`         | Composite stability score projections                |
| `SpecImpactEstimate`        | Per-feature metric impact deltas                     |
| `TimelineSnapshot`          | Single point-in-time metric capture                  |
| `TimelineFile`              | Full timeline with snapshot array                    |
| `TrendLine` / `TrendResult` | Trend analysis output                                |

**Schemas:** `ArchMetricCategorySchema`, `ViolationSchema`, `MetricResultSchema`, `CategoryBaselineSchema`, `ArchBaselineSchema`, `CategoryRegressionSchema`, `ArchDiffResultSchema`, `ThresholdConfigSchema`, `ArchConfigSchema`, `ConstraintRuleSchema`, `CategorySnapshotSchema`, `TimelineSnapshotSchema`, `TimelineFileSchema`, `TrendLineSchema`, `TrendResultSchema`, `ConfidenceTierSchema`, `PredictionRegressionResultSchema`, `DirectionSchema`, `CategoryForecastSchema`, `SpecImpactSignalsSchema`, `SpecImpactEstimateSchema`, `ContributingFeatureSchema`, `AdjustedForecastSchema`, `PredictionWarningSchema`, `StabilityForecastSchema`, `PredictionResultSchema`, `PredictionOptionsSchema`

**Constants:** `DEFAULT_STABILITY_THRESHOLDS`
