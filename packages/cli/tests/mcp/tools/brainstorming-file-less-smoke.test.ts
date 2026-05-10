/**
 * Phase 4 Task 19 (D-P4-F): brainstorming → manage_roadmap contract smoke.
 *
 * Asserts the brainstorming skill's contract with `manage_roadmap` holds in
 * file-less mode. We do NOT load the brainstorming skill source — it lives
 * in `agents/`, not packages/. Instead we exercise the boundary: invoke
 * `handleManageRoadmapFileLess` with the same arguments brainstorming would
 * supply (title, milestone, status, summary) and assert that the supplied
 * stub `RoadmapTrackerClient.create()` is called once with the expected
 * `NewFeatureInput`.
 *
 * If the brainstorming skill were to bypass `manage_roadmap` and write
 * directly to `docs/roadmap.md`, file-less mode would silently break.
 * This test pins the abstraction layer the proposal claims.
 */
import { describe, it, expect, vi } from 'vitest';
import { Ok, type Result } from '@harness-engineering/types';
import { handleManageRoadmapFileLess } from '../../../src/mcp/tools/roadmap-file-less';
import type {
  RoadmapTrackerClient,
  TrackedFeature,
  HistoryEvent,
  NewFeatureInput,
  FeaturePatch,
} from '@harness-engineering/core';
import { ConflictError } from '@harness-engineering/core';

const tf = (over: Partial<TrackedFeature> = {}): TrackedFeature => ({
  externalId: over.externalId ?? 'github:o/r#1',
  name: over.name ?? 'F',
  status: over.status ?? 'planned',
  summary: over.summary ?? '',
  spec: null,
  plans: [],
  blockedBy: [],
  assignee: null,
  priority: null,
  milestone: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: null,
});

describe('brainstorming → manage_roadmap (file-less smoke, D-P4-F)', () => {
  it('manage_roadmap action=add forwards brainstorming-supplied fields to client.create()', async () => {
    const create = vi.fn(
      async (f: NewFeatureInput): Promise<Result<TrackedFeature, Error>> =>
        Ok(tf({ name: f.name, summary: f.summary, status: f.status ?? 'planned' }))
    );
    const client: RoadmapTrackerClient = {
      fetchAll: async () => Ok({ features: [], etag: null }),
      fetchById: async () => Ok(null),
      fetchByStatus: async () => Ok([]),
      create,
      update: async () => Ok(tf()) as Promise<Result<TrackedFeature, ConflictError | Error>>,
      claim: async () => Ok(tf()) as Promise<Result<TrackedFeature, ConflictError | Error>>,
      release: async () => Ok(tf()) as Promise<Result<TrackedFeature, ConflictError | Error>>,
      complete: async () => Ok(tf()) as Promise<Result<TrackedFeature, ConflictError | Error>>,
      appendHistory: async (_id: string, _e: HistoryEvent) => Ok(undefined as void),
      fetchHistory: async () => Ok([]),
    };

    // Match the input shape the brainstorming skill produces when it calls
    // the manage_roadmap MCP tool with action: 'add'.
    const brainstormingArgs = {
      path: '/fake/project',
      action: 'add' as const,
      feature: 'New Brainstormed Idea',
      milestone: 'Backlog',
      status: 'planned' as const,
      summary: 'A new feature from brainstorming',
    };

    const res = await handleManageRoadmapFileLess(brainstormingArgs, client);

    expect(res.isError).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0]?.[0];
    expect(args?.name).toBe('New Brainstormed Idea');
    expect(args?.summary).toBe('A new feature from brainstorming');
    expect(args?.status).toBe('planned');
    expect(args?.milestone).toBe('Backlog');
  });
});
