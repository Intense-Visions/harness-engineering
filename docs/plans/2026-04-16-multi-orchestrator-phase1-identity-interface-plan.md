# Plan: Multi-Orchestrator Phase 1 -- Identity + Interface

**Date:** 2026-04-16 | **Spec:** `docs/changes/multi-orchestrator-claim-coordination/proposal.md` | **Tasks:** 6 | **Time:** ~25 min

## Goal

Add orchestrator identity resolution and claim/release methods to the tracker interface, with a working implementation on `RoadmapTrackerAdapter`, so the orchestrator can claim and release issues via the tracker -- laying the foundation for multi-orchestrator coordination in Phase 2.

## Observable Truths (Acceptance Criteria)

1. `IssueTrackerClient` in `packages/types/src/orchestrator.ts` has two new required methods: `claimIssue(issueId: string, orchestratorId: string): Promise<Result<void, Error>>` and `releaseIssue(issueId: string): Promise<Result<void, Error>>`.
2. `WorkflowConfig` in `packages/types/src/orchestrator.ts` gains an optional `orchestratorId?: string` field.
3. When `RoadmapTrackerAdapter.claimIssue(id, orchestratorId)` is called, the feature's status transitions to `"in-progress"` and its `assignee` field is set to the `orchestratorId`.
4. When `RoadmapTrackerAdapter.claimIssue()` is called for a feature already claimed by the same `orchestratorId`, it is a no-op (`Ok`).
5. When `RoadmapTrackerAdapter.releaseIssue(id)` is called, the feature's status transitions to the first `activeStates` value and its `assignee` field is cleared (set to `null`).
6. `resolveOrchestratorId(configId?)` returns the explicit value when provided, or auto-generates `{hostname}-{shortHash}` from a UUID persisted at `~/.harness/orchestrator-id`.
7. The auto-generated UUID is created once and persisted; subsequent calls return the same identity.
8. `npx vitest run packages/orchestrator/tests/tracker/roadmap.test.ts` passes with claim/release tests.
9. `npx vitest run packages/orchestrator/tests/core/orchestrator-identity.test.ts` passes.
10. `npx vitest run` in `packages/orchestrator` passes (no regressions).

## File Map

```
MODIFY packages/types/src/orchestrator.ts                          — add claimIssue/releaseIssue to IssueTrackerClient; add orchestratorId to WorkflowConfig
MODIFY packages/orchestrator/src/tracker/adapters/roadmap.ts       — implement claimIssue() and releaseIssue()
CREATE packages/orchestrator/src/core/orchestrator-identity.ts     — resolveOrchestratorId utility
CREATE packages/orchestrator/tests/core/orchestrator-identity.test.ts — tests for identity resolution
MODIFY packages/orchestrator/tests/tracker/roadmap.test.ts         — add tests for claimIssue and releaseIssue
MODIFY packages/orchestrator/src/core/index.ts                     — re-export resolveOrchestratorId
```

## Tasks

### Task 1: Extend IssueTrackerClient interface and WorkflowConfig type

**Depends on:** none | **Files:** `packages/types/src/orchestrator.ts`

1. Open `packages/types/src/orchestrator.ts`.

2. Add the two new methods to the `IssueTrackerClient` interface (after `markIssueComplete`):

```typescript
  /**
   * Claims an issue for the given orchestrator by transitioning it to
   * "in-progress" and recording the orchestrator identity. Idempotent
   * if already claimed by the same orchestratorId.
   */
  claimIssue(issueId: string, orchestratorId: string): Promise<Result<void, Error>>;
  /**
   * Releases a previously claimed issue by transitioning it back to an
   * active state and clearing the orchestrator identity.
   */
  releaseIssue(issueId: string): Promise<Result<void, Error>>;
```

3. Add an optional `orchestratorId` field to `WorkflowConfig`:

```typescript
export interface WorkflowConfig {
  // ... existing fields ...
  /** Optional stable identity for this orchestrator instance. Auto-generated if omitted. */
  orchestratorId?: string;
}
```

4. Run: `cd packages/types && npx tsc --noEmit` -- expect compile errors in `roadmap.ts` (adapter does not yet implement new methods). That is expected; the types package itself should compile.

5. Run: `harness validate`

6. Commit: `feat(types): add claimIssue/releaseIssue to IssueTrackerClient and orchestratorId to WorkflowConfig`

---

### Task 2: Create orchestrator identity resolution utility

**Depends on:** none (parallel with Task 1) | **Files:** `packages/orchestrator/src/core/orchestrator-identity.ts`

1. Create `packages/orchestrator/src/core/orchestrator-identity.ts`:

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';

const IDENTITY_FILE = path.join(os.homedir(), '.harness', 'orchestrator-id');

/**
 * Resolves the orchestrator identity. Uses the explicit configId if
 * provided; otherwise reads or creates a persisted machine UUID at
 * ~/.harness/orchestrator-id and combines it with the hostname.
 *
 * Format: `{hostname}-{first8charsOfSha256(uuid)}`
 * Example: `chads-macbook-a7f3b2c1`
 */
export async function resolveOrchestratorId(configId?: string): Promise<string> {
  if (configId) return configId;

  const machineId = await getOrCreateMachineId();
  const shortHash = createHash('sha256').update(machineId).digest('hex').slice(0, 8);
  const hostname = os
    .hostname()
    .toLowerCase()
    .replace(/\.local$/, '');
  return `${hostname}-${shortHash}`;
}

async function getOrCreateMachineId(): Promise<string> {
  try {
    const content = await fs.readFile(IDENTITY_FILE, 'utf-8');
    const trimmed = content.trim();
    if (trimmed.length > 0) return trimmed;
  } catch {
    // File does not exist or is unreadable -- create it
  }

  const newId = randomUUID();
  await fs.mkdir(path.dirname(IDENTITY_FILE), { recursive: true });
  await fs.writeFile(IDENTITY_FILE, newId, 'utf-8');
  return newId;
}

/** Exposed for testing only -- returns the path to the identity file. */
export const ORCHESTRATOR_IDENTITY_FILE = IDENTITY_FILE;
```

2. Run: `harness validate`

3. Commit: `feat(orchestrator): add resolveOrchestratorId utility for persistent identity`

---

### Task 3: Write tests for orchestrator identity resolution

**Depends on:** Task 2 | **Files:** `packages/orchestrator/tests/core/orchestrator-identity.test.ts`

1. Create `packages/orchestrator/tests/core/orchestrator-identity.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';

vi.mock('node:fs/promises');
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, hostname: vi.fn(() => 'test-host.local') };
});

describe('resolveOrchestratorId', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it('returns explicit configId when provided', async () => {
    const { resolveOrchestratorId } = await import('../../src/core/orchestrator-identity');
    const result = await resolveOrchestratorId('my-explicit-id');
    expect(result).toBe('my-explicit-id');
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it('reads existing machine ID from disk and combines with hostname', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    const { resolveOrchestratorId } = await import('../../src/core/orchestrator-identity');
    const result = await resolveOrchestratorId();
    // Hostname "test-host.local" -> "test-host" (strip .local)
    expect(result).toMatch(/^test-host-[a-f0-9]{8}$/);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('creates and persists a new UUID when file does not exist', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: no such file or directory'));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const { resolveOrchestratorId } = await import('../../src/core/orchestrator-identity');
    const result = await resolveOrchestratorId();
    expect(result).toMatch(/^test-host-[a-f0-9]{8}$/);
    expect(fs.mkdir).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    // Verify the UUID was written
    const writtenUuid = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
    expect(writtenUuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('produces consistent results for the same machine ID', async () => {
    const fixedUuid = '12345678-1234-1234-1234-123456789abc';
    vi.mocked(fs.readFile).mockResolvedValue(fixedUuid);
    const { resolveOrchestratorId } = await import('../../src/core/orchestrator-identity');
    const result1 = await resolveOrchestratorId();
    const result2 = await resolveOrchestratorId();
    expect(result1).toBe(result2);
  });
});
```

2. Run: `cd packages/orchestrator && npx vitest run tests/core/orchestrator-identity.test.ts` -- observe pass.

3. Run: `harness validate`

4. Commit: `test(orchestrator): add tests for orchestrator identity resolution`

---

### Task 4: Implement claimIssue and releaseIssue on RoadmapTrackerAdapter

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/tracker/adapters/roadmap.ts`

1. Open `packages/orchestrator/src/tracker/adapters/roadmap.ts`.

2. Add the `claimIssue` method after `markIssueComplete`:

```typescript
  /**
   * Claims an issue by transitioning its status to "in-progress" and
   * writing the orchestratorId into the assignee field. Idempotent if
   * already claimed by the same orchestratorId.
   */
  async claimIssue(issueId: string, orchestratorId: string): Promise<Result<void, Error>> {
    try {
      if (!this.config.filePath) return Err(new Error('Missing filePath'));

      const content = await fs.readFile(this.config.filePath, 'utf-8');
      const roadmapResult = parseRoadmap(content);
      if (!roadmapResult.ok) return roadmapResult as unknown as Result<void, Error>;

      const roadmap = roadmapResult.value;
      const target = this.findFeatureById(roadmap.milestones, issueId);
      if (!target) return Ok(undefined);

      // Idempotent: already claimed by same orchestrator
      if (
        target.status === 'in-progress' &&
        target.assignee === orchestratorId
      ) {
        return Ok(undefined);
      }

      target.status = 'in-progress' as FeatureStatus;
      target.assignee = orchestratorId;
      await fs.writeFile(this.config.filePath, serializeRoadmap(roadmap), 'utf-8');
      return Ok(undefined);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
```

3. Add the `releaseIssue` method after `claimIssue`:

```typescript
  /**
   * Releases a claimed issue by transitioning back to the first active
   * state and clearing the assignee field.
   */
  async releaseIssue(issueId: string): Promise<Result<void, Error>> {
    try {
      if (!this.config.filePath) return Err(new Error('Missing filePath'));

      const activeState = this.config.activeStates[0];
      if (!activeState) {
        return Err(new Error('Tracker config has no activeStates; cannot release'));
      }

      const content = await fs.readFile(this.config.filePath, 'utf-8');
      const roadmapResult = parseRoadmap(content);
      if (!roadmapResult.ok) return roadmapResult as unknown as Result<void, Error>;

      const roadmap = roadmapResult.value;
      const target = this.findFeatureById(roadmap.milestones, issueId);
      if (!target) return Ok(undefined);

      // Already in an active state and unassigned -- no-op
      if (
        this.config.activeStates.includes(target.status) &&
        target.assignee === null
      ) {
        return Ok(undefined);
      }

      target.status = activeState as FeatureStatus;
      target.assignee = null;
      await fs.writeFile(this.config.filePath, serializeRoadmap(roadmap), 'utf-8');
      return Ok(undefined);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
```

4. Run: `cd packages/orchestrator && npx tsc --noEmit` -- should compile.

5. Run: `harness validate`

6. Commit: `feat(orchestrator): implement claimIssue/releaseIssue on RoadmapTrackerAdapter`

---

### Task 5: Write tests for claimIssue and releaseIssue on RoadmapTrackerAdapter

**Depends on:** Task 4 | **Files:** `packages/orchestrator/tests/tracker/roadmap.test.ts`

1. Open `packages/orchestrator/tests/tracker/roadmap.test.ts`.

2. Add the following `describe` blocks after the existing `markIssueComplete` describe block (before the final closing `});`):

```typescript
describe('claimIssue', () => {
  const writableRoadmap = `---
project: Test Project
version: 1
last_synced: '2026-03-24T00:00:00.000Z'
last_manual_edit: '2026-03-24T00:00:00.000Z'
---

# Roadmap

## MVP

### Task 1

- **Status:** planned
- **Spec:** —
- **Summary:** First task
- **Blockers:** —
- **Plan:** —
`;

  it('transitions feature to in-progress and writes orchestratorId as assignee', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(writableRoadmap);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const adapter = new RoadmapTrackerAdapter(mockConfig);
    const result = await adapter.claimIssue(idFor('Task 1'), 'orch-abc123');

    expect(result.ok).toBe(true);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    const written = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
    expect(written).toMatch(/### Task 1\n\n- \*\*Status:\*\* in-progress/);
    expect(written).toContain('**Assignee:** orch-abc123');
  });

  it('is idempotent when already claimed by the same orchestrator', async () => {
    const alreadyClaimed = writableRoadmap
      .replace('**Status:** planned', '**Status:** in-progress')
      .replace('- **Plan:** —', '- **Plan:** —\n- **Assignee:** orch-abc123');
    vi.mocked(fs.readFile).mockResolvedValue(alreadyClaimed);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const adapter = new RoadmapTrackerAdapter(mockConfig);
    const result = await adapter.claimIssue(idFor('Task 1'), 'orch-abc123');

    expect(result.ok).toBe(true);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('overwrites claim when a different orchestrator claims', async () => {
    const claimedByOther = writableRoadmap
      .replace('**Status:** planned', '**Status:** in-progress')
      .replace('- **Plan:** —', '- **Plan:** —\n- **Assignee:** orch-other');
    vi.mocked(fs.readFile).mockResolvedValue(claimedByOther);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const adapter = new RoadmapTrackerAdapter(mockConfig);
    const result = await adapter.claimIssue(idFor('Task 1'), 'orch-abc123');

    expect(result.ok).toBe(true);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    const written = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
    expect(written).toContain('**Assignee:** orch-abc123');
  });

  it('is a no-op when the feature is not found', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(writableRoadmap);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const adapter = new RoadmapTrackerAdapter(mockConfig);
    const result = await adapter.claimIssue(idFor('Nonexistent'), 'orch-abc123');

    expect(result.ok).toBe(true);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

describe('releaseIssue', () => {
  const claimedRoadmap = `---
project: Test Project
version: 1
last_synced: '2026-03-24T00:00:00.000Z'
last_manual_edit: '2026-03-24T00:00:00.000Z'
---

# Roadmap

## MVP

### Task 1

- **Status:** in-progress
- **Spec:** —
- **Summary:** First task
- **Blockers:** —
- **Plan:** —
- **Assignee:** orch-abc123
- **Priority:** —
- **External-ID:** —
`;

  it('transitions feature back to first active state and clears assignee', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(claimedRoadmap);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const adapter = new RoadmapTrackerAdapter(mockConfig);
    const result = await adapter.releaseIssue(idFor('Task 1'));

    expect(result.ok).toBe(true);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    const written = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
    expect(written).toMatch(/### Task 1\n\n- \*\*Status:\*\* planned/);
    // Assignee should be cleared (em-dash in serialized form)
    expect(written).toMatch(/\*\*Assignee:\*\* \u2014/);
  });

  it('is a no-op when the feature is not found', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(claimedRoadmap);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const adapter = new RoadmapTrackerAdapter(mockConfig);
    const result = await adapter.releaseIssue(idFor('Nonexistent'));

    expect(result.ok).toBe(true);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('returns Err when activeStates is empty', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(claimedRoadmap);
    const adapter = new RoadmapTrackerAdapter({ ...mockConfig, activeStates: [] });
    const result = await adapter.releaseIssue(idFor('Task 1'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/activeStates/);
    }
  });
});
```

3. Run: `cd packages/orchestrator && npx vitest run tests/tracker/roadmap.test.ts` -- observe all tests pass.

4. Run: `harness validate`

5. Commit: `test(orchestrator): add claimIssue/releaseIssue tests for RoadmapTrackerAdapter`

---

### Task 6: Export resolveOrchestratorId from core barrel and verify full test suite

**Depends on:** Task 2, Task 3 | **Files:** `packages/orchestrator/src/core/index.ts`

1. Open `packages/orchestrator/src/core/index.ts`.

2. Add the export at the end of the file:

```typescript
export { resolveOrchestratorId, ORCHESTRATOR_IDENTITY_FILE } from './orchestrator-identity';
```

3. Run: `cd packages/orchestrator && npx vitest run` -- verify all tests pass (no regressions).

4. Run: `cd packages/orchestrator && npx tsc --noEmit` -- verify type-check passes.

5. Run: `harness validate`

6. Commit: `feat(orchestrator): export resolveOrchestratorId from core barrel`

[checkpoint:human-verify] After this task, verify the full test suite passes and the interface changes are correct before proceeding to Phase 2 (ClaimManager).

## Dependency Graph

```
Task 1 (types) ─────────┐
                         ├──> Task 4 (adapter impl) ──> Task 5 (adapter tests)
Task 2 (identity util) ──┤
                         └──> Task 3 (identity tests) ──> Task 6 (barrel + verify)
```

Tasks 1 and 2 are parallelizable (no shared files).
Tasks 3 and 4 are parallelizable (different subsystems).

## Design Decisions

| #   | Decision                                                                        | Rationale                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Use the existing `assignee` field on `RoadmapFeature` to store `orchestratorId` | No schema changes needed to the roadmap parser/serializer; `assignee` is already parsed, serialized, and nullable. Claim = set assignee; release = clear assignee. |
| 2   | `claimIssue` always transitions to literal `"in-progress"`                      | The spec is explicit: claim = "in-progress" state. This is the standard convention across all tracker adapters.                                                    |
| 3   | `releaseIssue` transitions to `config.activeStates[0]`                          | Mirrors the spec's "transitions back to the first activeStates value". Typically `"planned"`.                                                                      |
| 4   | Identity utility uses `os.hostname()` stripped of `.local` suffix               | macOS appends `.local` to hostnames; stripping it produces cleaner identifiers like `chads-macbook-a7f3b2c1`.                                                      |
| 5   | Identity file at `~/.harness/orchestrator-id` (not project-local)               | The identity is machine-scoped, not project-scoped. Two orchestrators on the same machine should share identity. Different machines need different identities.     |

## Notes

- The `harness validate` command currently fails with a pre-existing config issue (`statusMap.needs-human` not in Zod enum). This is unrelated to our changes.
- The `RoadmapFeature` type already has `assignee: string | null` which is parsed from `**Assignee:**` lines and serialized by `serializeRoadmap()`. The serializer outputs extended lines (Assignee, Priority, External-ID) as a group when any of the three is non-null. After a claim sets `assignee`, subsequent serialization will include the Assignee line. After a release clears it back to null, if Priority and External-ID are also null, the extended lines are omitted entirely.
- Phase 2 (ClaimManager) will consume `resolveOrchestratorId` in the orchestrator constructor and wire `claimIssue`/`releaseIssue` into the tick loop.
