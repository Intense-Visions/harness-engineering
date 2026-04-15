# Plan: Analysis Tracker Sync Phase 4 — Orchestrator Integration

**Date:** 2026-04-15 | **Spec:** docs/changes/analysis-tracker-sync/proposal.md | **Tasks:** 7 | **Time:** ~30 min

## Goal

When the orchestrator finishes analyzing an issue and a tracker is configured, it automatically publishes the analysis as a structured comment on the corresponding tracker ticket — preventing duplicate publishes via the published index.

## Observable Truths (Acceptance Criteria)

1. When the orchestrator completes `archiveAnalysisResults` and a tracker is configured, analysis records with non-null `externalId` that are not already in the published index are published as comments via `adapter.addComment()`.
2. When an analysis record has `externalId: null`, the system shall not attempt to publish it.
3. When an analysis record's `issueId` already exists in the published index, the system shall not publish a duplicate comment.
4. When no `harness.config.json` exists or has no `roadmap.tracker` section, the system shall skip auto-publish silently.
5. When `addComment` fails for a record, the system shall log the error but continue processing remaining records (non-fatal).
6. If no `GITHUB_TOKEN` is available, the system shall skip auto-publish silently (same as no tracker configured).
7. `renderAnalysisComment` is importable from `@harness-engineering/orchestrator` (moved from CLI).
8. `loadPublishedIndex` and `savePublishedIndex` are importable from `@harness-engineering/orchestrator` (moved from CLI).
9. The CLI `publish-analyses` command continues to work, importing the extracted functions from `@harness-engineering/orchestrator`.
10. `npx vitest run` in `packages/orchestrator` passes all existing and new tests.
11. `npx vitest run` in `packages/cli` passes all existing tests (imports updated).

## File Map

```
CREATE  packages/orchestrator/src/core/analysis-comment.ts
CREATE  packages/orchestrator/src/core/published-index.ts
CREATE  packages/orchestrator/tests/core/analysis-comment.test.ts
CREATE  packages/orchestrator/tests/core/published-index.test.ts
CREATE  packages/orchestrator/tests/core/auto-publish.test.ts
MODIFY  packages/orchestrator/src/core/index.ts (add exports)
MODIFY  packages/orchestrator/src/orchestrator.ts (add autoPublishAnalyses method, call after archiveAnalysisResults)
MODIFY  packages/cli/src/commands/publish-analyses.ts (import renderAnalysisComment, loadPublishedIndex, savePublishedIndex from orchestrator)
MODIFY  packages/cli/tests/commands/publish-analyses.test.ts (update import path)
```

## Tasks

### Task 1: Extract renderAnalysisComment to orchestrator package

**Depends on:** none | **Files:** `packages/orchestrator/src/core/analysis-comment.ts`, `packages/orchestrator/tests/core/analysis-comment.test.ts`, `packages/orchestrator/src/core/index.ts`

1. Create `packages/orchestrator/src/core/analysis-comment.ts` with the `renderAnalysisComment` function moved from `packages/cli/src/commands/publish-analyses.ts`:

```typescript
import type { AnalysisRecord } from './analysis-archive';

/**
 * Renders an AnalysisRecord as a structured markdown comment.
 * Format: summary header + reasoning bullets + collapsible JSON with discriminator.
 *
 * Used by both the orchestrator auto-publish and the CLI publish-analyses command.
 */
export function renderAnalysisComment(record: AnalysisRecord): string {
  const lines: string[] = [];

  lines.push(`## Harness Analysis: ${record.identifier}`);
  lines.push('');

  if (record.score) {
    lines.push(
      `**Risk:** ${record.score.riskLevel} (${(record.score.confidence * 100).toFixed(0)}% confidence)`
    );
    lines.push(`**Route:** ${record.score.recommendedRoute}`);
  }
  lines.push(`**Analyzed:** ${record.analyzedAt}`);
  lines.push('');

  if (record.score && record.score.reasoning.length > 0) {
    for (const r of record.score.reasoning) {
      lines.push(`- ${r}`);
    }
    lines.push('');
  }

  // Collapsible details block with full AnalysisRecord + discriminator fields
  const jsonPayload = {
    _harness_analysis: true,
    _version: 1,
    ...record,
  };

  lines.push('<details>');
  lines.push('<summary>Full Analysis Data</summary>');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(jsonPayload, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}
```

2. Create `packages/orchestrator/tests/core/analysis-comment.test.ts` — migrate the 5 existing tests from `packages/cli/tests/commands/publish-analyses.test.ts`, updating the import to the new location:

```typescript
import { describe, it, expect } from 'vitest';
import { renderAnalysisComment } from '../../src/core/analysis-comment';
import type { AnalysisRecord } from '../../src/core/analysis-archive';

function makeRecord(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    issueId: 'test-issue-1',
    identifier: 'test-feature-abc123',
    spec: null,
    score: {
      overall: 0.65,
      confidence: 0.82,
      riskLevel: 'medium',
      blastRadius: { filesEstimated: 5, modules: 2, services: 1 },
      dimensions: { structural: 0.5, semantic: 0.7, historical: 0.6 },
      reasoning: ['Touches shared utility module', 'No prior changes in this area'],
      recommendedRoute: 'human',
    },
    simulation: null,
    analyzedAt: '2026-04-15T12:00:00Z',
    externalId: 'github:owner/repo#42',
    ...overrides,
  };
}

describe('renderAnalysisComment', () => {
  it('includes the summary header with risk, route, confidence, and analyzedAt', () => {
    const result = renderAnalysisComment(makeRecord());
    expect(result).toContain('## Harness Analysis: test-feature-abc123');
    expect(result).toContain('**Risk:** medium (82% confidence)');
    expect(result).toContain('**Route:** human');
    expect(result).toContain('**Analyzed:** 2026-04-15T12:00:00Z');
  });

  it('includes reasoning bullets', () => {
    const result = renderAnalysisComment(makeRecord());
    expect(result).toContain('- Touches shared utility module');
    expect(result).toContain('- No prior changes in this area');
  });

  it('includes a <details> block with discriminator JSON', () => {
    const record = makeRecord();
    const result = renderAnalysisComment(record);
    expect(result).toContain('<details>');
    expect(result).toContain('<summary>Full Analysis Data</summary>');
    expect(result).toContain('```json');
    expect(result).toContain('</details>');

    const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/);
    expect(jsonMatch).not.toBeNull();
    const parsed = JSON.parse(jsonMatch![1]!);
    expect(parsed._harness_analysis).toBe(true);
    expect(parsed._version).toBe(1);
    expect(parsed.issueId).toBe('test-issue-1');
  });

  it('handles record with no score gracefully', () => {
    const result = renderAnalysisComment(makeRecord({ score: null }));
    expect(result).toContain('## Harness Analysis: test-feature-abc123');
    expect(result).toContain('_harness_analysis');
    expect(result).not.toContain('**Risk:**');
  });

  it('renders high risk level correctly', () => {
    const record = makeRecord({
      score: {
        overall: 0.9,
        confidence: 0.95,
        riskLevel: 'high',
        blastRadius: { filesEstimated: 20, modules: 5, services: 3 },
        dimensions: { structural: 0.9, semantic: 0.8, historical: 0.85 },
        reasoning: ['Major cross-cutting change'],
        recommendedRoute: 'simulation-required',
      },
    });
    const result = renderAnalysisComment(record);
    expect(result).toContain('**Risk:** high (95% confidence)');
    expect(result).toContain('**Route:** simulation-required');
  });
});
```

3. Add exports to `packages/orchestrator/src/core/index.ts` — append:

```typescript
export { renderAnalysisComment } from './analysis-comment';
```

4. Run: `cd packages/orchestrator && npx vitest run tests/core/analysis-comment.test.ts`
5. Commit: `feat(orchestrator): extract renderAnalysisComment to orchestrator core`

---

### Task 2: Extract published index helpers to orchestrator package

**Depends on:** none (parallel with Task 1) | **Files:** `packages/orchestrator/src/core/published-index.ts`, `packages/orchestrator/tests/core/published-index.test.ts`, `packages/orchestrator/src/core/index.ts`

1. Create `packages/orchestrator/src/core/published-index.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

const PUBLISHED_INDEX_RELATIVE = '.harness/metrics/published-analyses.json';

export interface PublishedIndex {
  [issueId: string]: string; // ISO timestamp of when published
}

/**
 * Load the published analyses index from disk.
 * Returns an empty object if the file does not exist or is unparseable.
 */
export function loadPublishedIndex(projectRoot: string): PublishedIndex {
  const p = path.join(projectRoot, PUBLISHED_INDEX_RELATIVE);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Persist the published analyses index to disk.
 * Creates parent directories if they do not exist.
 */
export function savePublishedIndex(projectRoot: string, index: PublishedIndex): void {
  const p = path.join(projectRoot, PUBLISHED_INDEX_RELATIVE);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(index, null, 2), 'utf-8');
}
```

2. Create `packages/orchestrator/tests/core/published-index.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadPublishedIndex, savePublishedIndex } from '../../src/core/published-index';

describe('published-index', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-idx-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadPublishedIndex', () => {
    it('returns empty object when file does not exist', () => {
      expect(loadPublishedIndex(tmpDir)).toEqual({});
    });

    it('returns parsed index when file exists', () => {
      const indexPath = path.join(tmpDir, '.harness', 'metrics', 'published-analyses.json');
      fs.mkdirSync(path.dirname(indexPath), { recursive: true });
      fs.writeFileSync(indexPath, JSON.stringify({ 'issue-1': '2026-04-15T12:00:00Z' }));
      expect(loadPublishedIndex(tmpDir)).toEqual({ 'issue-1': '2026-04-15T12:00:00Z' });
    });

    it('returns empty object on malformed JSON', () => {
      const indexPath = path.join(tmpDir, '.harness', 'metrics', 'published-analyses.json');
      fs.mkdirSync(path.dirname(indexPath), { recursive: true });
      fs.writeFileSync(indexPath, 'not-json');
      expect(loadPublishedIndex(tmpDir)).toEqual({});
    });
  });

  describe('savePublishedIndex', () => {
    it('creates directories and writes JSON', () => {
      const index = { 'issue-1': '2026-04-15T12:00:00Z' };
      savePublishedIndex(tmpDir, index);
      const indexPath = path.join(tmpDir, '.harness', 'metrics', 'published-analyses.json');
      expect(fs.existsSync(indexPath)).toBe(true);
      expect(JSON.parse(fs.readFileSync(indexPath, 'utf-8'))).toEqual(index);
    });

    it('overwrites existing index', () => {
      savePublishedIndex(tmpDir, { 'issue-1': '2026-04-15T12:00:00Z' });
      savePublishedIndex(tmpDir, { 'issue-1': '2026-04-15T12:00:00Z', 'issue-2': '2026-04-15T13:00:00Z' });
      const indexPath = path.join(tmpDir, '.harness', 'metrics', 'published-analyses.json');
      const loaded = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      expect(Object.keys(loaded)).toHaveLength(2);
    });
  });
});
```

3. Add exports to `packages/orchestrator/src/core/index.ts` — append:

```typescript
export { loadPublishedIndex, savePublishedIndex } from './published-index';
export type { PublishedIndex } from './published-index';
```

4. Run: `cd packages/orchestrator && npx vitest run tests/core/published-index.test.ts`
5. Commit: `feat(orchestrator): extract published index helpers to orchestrator core`

---

### Task 3: Update CLI publish-analyses to import from orchestrator

**Depends on:** Task 1, Task 2 | **Files:** `packages/cli/src/commands/publish-analyses.ts`, `packages/cli/tests/commands/publish-analyses.test.ts`

1. In `packages/cli/src/commands/publish-analyses.ts`:

   a. Remove the local `renderAnalysisComment` function (lines 34-73).

   b. Remove the local `PUBLISHED_INDEX_PATH`, `PublishedIndex` interface, `loadPublishedIndex`, and `savePublishedIndex` (lines 8-28).

   c. Add import at top (alongside the existing `AnalysisRecord` import from orchestrator):

   ```typescript
   import {
     renderAnalysisComment,
     loadPublishedIndex,
     savePublishedIndex,
   } from '@harness-engineering/orchestrator';
   import type { AnalysisRecord } from '@harness-engineering/orchestrator';
   ```

   The `createPublishAnalysesCommand` function body stays the same — it already calls `renderAnalysisComment(record)`, `loadPublishedIndex(projectPath)`, `savePublishedIndex(projectPath, publishedIndex)`.

2. In `packages/cli/tests/commands/publish-analyses.test.ts`, update the import:

   ```typescript
   // Before:
   import { renderAnalysisComment } from '../../src/commands/publish-analyses';
   // After:
   import { renderAnalysisComment } from '@harness-engineering/orchestrator';
   ```

3. Run: `cd packages/cli && npx vitest run tests/commands/publish-analyses.test.ts`
4. Run: `cd packages/cli && npx vitest run tests/commands/sync-analyses.test.ts` (verify no regression)
5. Commit: `refactor(cli): import renderAnalysisComment and published index from orchestrator`

---

### Task 4: Add loadTrackerSyncConfig utility to orchestrator

**Depends on:** none (parallel with Tasks 1-3) | **Files:** `packages/orchestrator/src/core/tracker-config.ts`, `packages/orchestrator/src/core/index.ts`

The orchestrator needs to detect whether a tracker is configured by reading `harness.config.json`. This is a lightweight config loader that does NOT depend on Zod — just a JSON parse with runtime type guards. This avoids pulling in the CLI's schema dependency.

1. Create `packages/orchestrator/src/core/tracker-config.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TrackerSyncConfig } from '@harness-engineering/types';

/**
 * Lightweight loader for tracker sync config from harness.config.json.
 * Returns null if the file does not exist, has no roadmap.tracker section,
 * or the tracker config is malformed.
 *
 * This intentionally avoids a Zod dependency — the CLI's schema validation
 * covers that; the orchestrator just needs to detect presence and extract
 * the minimum fields needed for auto-publish.
 */
export function loadTrackerSyncConfig(projectRoot: string): TrackerSyncConfig | null {
  try {
    const configPath = path.join(projectRoot, 'harness.config.json');
    if (!fs.existsSync(configPath)) return null;

    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as { roadmap?: { tracker?: unknown } };

    const tracker = config.roadmap?.tracker;
    if (!tracker || typeof tracker !== 'object') return null;

    const t = tracker as Record<string, unknown>;
    if (t.kind !== 'github') return null;
    if (typeof t.statusMap !== 'object' || t.statusMap === null) return null;

    return tracker as TrackerSyncConfig;
  } catch {
    return null;
  }
}
```

2. Add export to `packages/orchestrator/src/core/index.ts`:

```typescript
export { loadTrackerSyncConfig } from './tracker-config';
```

3. No separate test file for this — it will be exercised by the auto-publish integration test in Task 6.
4. Commit: `feat(orchestrator): add lightweight loadTrackerSyncConfig utility`

---

### Task 5: Wire autoPublishAnalyses into the orchestrator

**Depends on:** Task 1, Task 2, Task 4 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. Add imports at the top of `packages/orchestrator/src/orchestrator.ts` (near line 36, after the `./core/index` import):

```typescript
import { renderAnalysisComment } from './core/analysis-comment';
import { loadPublishedIndex, savePublishedIndex } from './core/published-index';
import { loadTrackerSyncConfig } from './core/tracker-config';
import { GitHubIssuesSyncAdapter, type TrackerSyncAdapter } from '@harness-engineering/core';
```

2. Add the `autoPublishAnalyses` private method to the `Orchestrator` class, after the `archiveAnalysisResults` method (after line 358):

```typescript
  /**
   * Auto-publish analysis results to the external tracker as structured comments.
   * Fires only when:
   * - A tracker is configured in harness.config.json (roadmap.tracker)
   * - GITHUB_TOKEN env var is available
   * - The record has a non-null externalId
   * - The record has not already been published (per the published index)
   *
   * Errors are non-fatal: a failed publish logs a warning but does not block
   * the orchestrator tick.
   */
  private async autoPublishAnalyses(
    candidates: Issue[],
    enrichedSpecs: Map<string, EnrichedSpec>,
    complexityScores: Map<string, ComplexityScore>,
    simulationResults: Map<string, SimulationResult>
  ): Promise<void> {
    const projectRoot = path.resolve(this.config.workspace.root, '..', '..');
    const trackerConfig = loadTrackerSyncConfig(projectRoot);
    if (!trackerConfig) return;

    const token = process.env.GITHUB_TOKEN;
    if (!token) return;

    let adapter: TrackerSyncAdapter;
    try {
      adapter = new GitHubIssuesSyncAdapter({ token, config: trackerConfig });
    } catch (err) {
      this.logger.warn('Failed to create tracker adapter for auto-publish', {
        error: String(err),
      });
      return;
    }

    const publishedIndex = loadPublishedIndex(projectRoot);
    let publishedCount = 0;

    for (const issue of candidates) {
      const spec = enrichedSpecs.get(issue.id) ?? null;
      const score = complexityScores.get(issue.id) ?? null;
      const simulation = simulationResults.get(issue.id) ?? null;
      if (!spec && !score && !simulation) continue;

      const externalId = issue.externalId ?? null;
      if (!externalId) continue;
      if (publishedIndex[issue.id]) continue;

      const record: AnalysisRecord = {
        issueId: issue.id,
        identifier: issue.identifier,
        spec,
        score,
        simulation,
        analyzedAt: new Date().toISOString(),
        externalId,
      };

      try {
        const commentBody = renderAnalysisComment(record);
        const result = await adapter.addComment(externalId, commentBody);

        if (result.ok) {
          publishedIndex[issue.id] = new Date().toISOString();
          publishedCount++;
          this.logger.info(`Auto-published analysis for ${issue.identifier} to ${externalId}`);
        } else {
          this.logger.warn(`Auto-publish failed for ${issue.identifier}: ${result.error.message}`, {
            issueId: issue.id,
          });
        }
      } catch (err) {
        this.logger.warn(`Auto-publish error for ${issue.identifier}`, {
          issueId: issue.id,
          error: String(err),
        });
      }
    }

    if (publishedCount > 0) {
      try {
        savePublishedIndex(projectRoot, publishedIndex);
      } catch (err) {
        this.logger.warn('Failed to persist published index after auto-publish', {
          error: String(err),
        });
      }
    }
  }
```

3. In the `runIntelligencePipeline` method, add the `autoPublishAnalyses` call after the existing `archiveAnalysisResults` call (after line 413):

```typescript
    // Auto-publish to external tracker (non-fatal)
    try {
      await this.autoPublishAnalyses(candidates, enrichedSpecs, complexityScores, simulationResults);
    } catch (err) {
      this.logger.warn('Auto-publish analyses failed', { error: String(err) });
    }
```

4. Add the `AnalysisRecord` import at the top if not already present (it's imported via `./core/index` as a type — verify and add explicit import if needed). The type is already re-exported from `./core/index` so it's accessible. Add to the existing destructured import from `'./core/index'`:

```typescript
// In the existing import from './core/index', add AnalysisRecord to the type imports
```

Actually, `AnalysisRecord` is already exported as a type from `./core/index`. It just needs to be referenced. Since the method constructs an `AnalysisRecord` object, the type will be inferred. No explicit import change needed unless TypeScript complains — in which case add `type { AnalysisRecord }` to the existing `./core/index` import.

5. Run: `cd packages/orchestrator && npx vitest run tests/integration/orchestrator.test.ts` (verify no regression)
6. Commit: `feat(orchestrator): wire autoPublishAnalyses after analysis completion`

---

### Task 6: Add auto-publish integration test

**Depends on:** Task 5 | **Files:** `packages/orchestrator/tests/core/auto-publish.test.ts`

This test exercises the `autoPublishAnalyses` behavior through the orchestrator's `runIntelligencePipeline` → `archiveAnalysisResults` → `autoPublishAnalyses` chain. We test it indirectly via `asyncTick` with mocks.

1. Create `packages/orchestrator/tests/core/auto-publish.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Orchestrator } from '../../src/orchestrator';
import { WorkflowConfig, Issue, Ok } from '@harness-engineering/types';

// Mock GitHubIssuesSyncAdapter at the module level
const mockAddComment = vi.fn().mockResolvedValue(Ok(undefined));
vi.mock('@harness-engineering/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...original,
    GitHubIssuesSyncAdapter: vi.fn().mockImplementation(() => ({
      addComment: mockAddComment,
    })),
  };
});

function createTmpProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-pub-'));
  // Create .harness/workspaces (orchestrator workspace root)
  fs.mkdirSync(path.join(dir, '.harness', 'workspaces'), { recursive: true });
  // Create harness.config.json with tracker config
  const config = {
    version: 1,
    roadmap: {
      tracker: {
        kind: 'github',
        repo: 'owner/repo',
        labels: ['harness'],
        statusMap: {
          backlog: 'open',
          planned: 'open',
          'in-progress': 'open',
          done: 'closed',
          blocked: 'open',
        },
      },
    },
  };
  fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify(config));
  return dir;
}

describe('autoPublishAnalyses', () => {
  let tmpDir: string;
  let originalToken: string | undefined;

  beforeEach(() => {
    tmpDir = createTmpProject();
    originalToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'test-token';
    mockAddComment.mockClear();
  });

  afterEach(() => {
    if (originalToken !== undefined) {
      process.env.GITHUB_TOKEN = originalToken;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeConfig(tmpDir: string): WorkflowConfig {
    return {
      tracker: {
        kind: 'mock',
        activeStates: ['planned'],
        terminalStates: ['done'],
      },
      polling: { intervalMs: 1000 },
      workspace: { root: path.join(tmpDir, '.harness', 'workspaces') },
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 1000,
      },
      agent: {
        backend: 'mock',
        maxConcurrentAgents: 2,
        maxTurns: 3,
        maxRetryBackoffMs: 1000,
        maxConcurrentAgentsByState: { planned: 1 },
        turnTimeoutMs: 5000,
        readTimeoutMs: 5000,
        stallTimeoutMs: 5000,
      },
      server: { port: null },
      intelligence: { enabled: true },
    };
  }

  function makeIssue(overrides: Partial<Issue> = {}): Issue {
    return {
      id: 'issue-1',
      identifier: 'H-1',
      title: 'Test issue',
      description: 'Test description',
      priority: 1,
      state: 'planned',
      branchName: null,
      url: null,
      labels: [],
      blockedBy: [],
      spec: null,
      plans: [],
      createdAt: null,
      updatedAt: null,
      externalId: 'github:owner/repo#42',
      ...overrides,
    };
  }

  it('publishes analysis when tracker is configured and externalId is present', async () => {
    const issue = makeIssue();
    const config = makeConfig(tmpDir);
    const mockTracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([issue])),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
    };
    const orchestrator = new Orchestrator(config, 'Prompt', {
      tracker: mockTracker,
      backend: undefined,
    });
    await orchestrator.tick();

    // Verify addComment was called with the external ID and a comment containing the analysis
    expect(mockAddComment).toHaveBeenCalledTimes(1);
    expect(mockAddComment).toHaveBeenCalledWith(
      'github:owner/repo#42',
      expect.stringContaining('## Harness Analysis: H-1')
    );

    // Verify published index was updated
    const indexPath = path.join(tmpDir, '.harness', 'metrics', 'published-analyses.json');
    expect(fs.existsSync(indexPath)).toBe(true);
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    expect(index['issue-1']).toBeDefined();
  });

  it('skips auto-publish when externalId is null', async () => {
    const issue = makeIssue({ externalId: null });
    const config = makeConfig(tmpDir);
    const mockTracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([issue])),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
    };
    const orchestrator = new Orchestrator(config, 'Prompt', {
      tracker: mockTracker,
    });
    await orchestrator.tick();

    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it('skips auto-publish when no tracker config exists', async () => {
    // Remove the config file
    fs.unlinkSync(path.join(tmpDir, 'harness.config.json'));

    const issue = makeIssue();
    const config = makeConfig(tmpDir);
    const mockTracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([issue])),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
    };
    const orchestrator = new Orchestrator(config, 'Prompt', {
      tracker: mockTracker,
    });
    await orchestrator.tick();

    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it('skips already-published records', async () => {
    // Pre-populate published index
    const metricsDir = path.join(tmpDir, '.harness', 'metrics');
    fs.mkdirSync(metricsDir, { recursive: true });
    fs.writeFileSync(
      path.join(metricsDir, 'published-analyses.json'),
      JSON.stringify({ 'issue-1': '2026-04-15T12:00:00Z' })
    );

    const issue = makeIssue();
    const config = makeConfig(tmpDir);
    const mockTracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([issue])),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
    };
    const orchestrator = new Orchestrator(config, 'Prompt', {
      tracker: mockTracker,
    });
    await orchestrator.tick();

    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it('skips auto-publish when GITHUB_TOKEN is not set', async () => {
    delete process.env.GITHUB_TOKEN;

    const issue = makeIssue();
    const config = makeConfig(tmpDir);
    const mockTracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([issue])),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
    };
    const orchestrator = new Orchestrator(config, 'Prompt', {
      tracker: mockTracker,
    });
    await orchestrator.tick();

    expect(mockAddComment).not.toHaveBeenCalled();
  });
});
```

Note: This test depends on the intelligence pipeline being enabled (`intelligence: { enabled: true }`) but the pipeline creation might fail without a valid API key. The `autoPublishAnalyses` method is called from `runIntelligencePipeline`, which only runs when `this.pipeline` is non-null. If the pipeline is null (no API key), the whole pipeline is skipped and auto-publish never fires.

This means the test needs to either:
- Mock the intelligence pipeline to return analysis results, OR
- Test the `autoPublishAnalyses` method more directly

[checkpoint:decision] — During execution, verify whether the intelligence pipeline can be mocked adequately in this integration test. If the mock setup is too complex (e.g., requiring API key mocking for pipeline creation), pivot to testing `autoPublishAnalyses` as a standalone method by making it `protected` or by extracting it as a standalone function that receives the necessary context. The test assertions remain the same regardless of approach.

2. Run: `cd packages/orchestrator && npx vitest run tests/core/auto-publish.test.ts`
3. Commit: `test(orchestrator): add auto-publish analysis integration tests`

---

### Task 7: Verify full test suite and cross-package compatibility

**Depends on:** Task 3, Task 6 | **Files:** none (verification only)

1. Run full orchestrator test suite: `cd packages/orchestrator && npx vitest run`
2. Run full CLI test suite: `cd packages/cli && npx vitest run`
3. Run TypeScript type-check across affected packages:
   ```
   cd packages/orchestrator && npx tsc --noEmit
   cd packages/cli && npx tsc --noEmit
   ```
4. Verify the round-trip test still passes: `cd packages/cli && npx vitest run tests/commands/sync-analyses.test.ts`
5. If any failures, fix and re-run.
6. Commit: `chore: verify cross-package compatibility after auto-publish wiring` (only if fixes were needed)

[checkpoint:human-verify] — Confirm all tests pass and the feature is ready for review.
