import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentEvent, SkillInvocationRecord } from '@harness-engineering/types';
import { TrajectoryBuilder } from './trajectory';

function makeTempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-trajectory-'));
}

function writeAdoptionRecords(projectRoot: string, records: SkillInvocationRecord[]): void {
  const dir = path.join(projectRoot, '.harness', 'metrics');
  fs.mkdirSync(dir, { recursive: true });
  const lines = records.map((r) => JSON.stringify(r)).join('\n');
  fs.writeFileSync(path.join(dir, 'adoption.jsonl'), lines + '\n');
}

describe('TrajectoryBuilder.fromSession', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = makeTempProject();
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('returns zero metadata for an empty session (no adoption records, no events)', () => {
    const meta = TrajectoryBuilder.fromSession({ sessionId: 'sess-1', projectRoot });
    expect(meta).toEqual({
      turnsCount: 0,
      toolCallCount: 0,
      modelTokenSpend: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
      promptCacheHit: 0,
      promptCacheMiss: 0,
      totalDurationMs: 0,
      phasesReached: [],
    });
  });

  it('counts a single skill invocation and tool calls from the event snapshot', () => {
    writeAdoptionRecords(projectRoot, [
      {
        skill: 'harness-execution',
        session: 'sess-1',
        startedAt: '2026-05-14T00:00:00.000Z',
        duration: 1500,
        outcome: 'completed',
        phasesReached: ['execute'],
      },
    ]);

    const events: AgentEvent[] = [
      { type: 'tool_use', timestamp: '2026-05-14T00:00:01.000Z' },
      { type: 'tool_use', timestamp: '2026-05-14T00:00:02.000Z' },
      // Non-tool event should be ignored.
      { type: 'thought', timestamp: '2026-05-14T00:00:03.000Z' },
    ];

    const meta = TrajectoryBuilder.fromSession({ sessionId: 'sess-1', projectRoot, events });
    expect(meta.turnsCount).toBe(1);
    expect(meta.toolCallCount).toBe(2);
    expect(meta.phasesReached).toEqual(['execute']);
    expect(meta.totalDurationMs).toBe(1500);
  });

  it('aggregates phases reached across multiple skill invocations', () => {
    writeAdoptionRecords(projectRoot, [
      {
        skill: 'harness-planning',
        session: 'sess-2',
        startedAt: '2026-05-14T00:00:00.000Z',
        duration: 1000,
        outcome: 'completed',
        phasesReached: ['gather', 'plan'],
      },
      {
        skill: 'harness-execution',
        session: 'sess-2',
        startedAt: '2026-05-14T00:01:00.000Z',
        duration: 2500,
        outcome: 'completed',
        phasesReached: ['execute', 'verify'],
      },
      // Belongs to a different session — must be ignored.
      {
        skill: 'harness-execution',
        session: 'sess-OTHER',
        startedAt: '2026-05-14T00:02:00.000Z',
        duration: 9999,
        outcome: 'completed',
        phasesReached: ['noise'],
      },
    ]);

    const meta = TrajectoryBuilder.fromSession({ sessionId: 'sess-2', projectRoot });
    expect(meta.turnsCount).toBe(2);
    expect(meta.phasesReached.sort()).toEqual(['execute', 'gather', 'plan', 'verify']);
    expect(meta.totalDurationMs).toBe(3500);
  });

  it('aggregates token spend across events including cache hits/misses', () => {
    writeAdoptionRecords(projectRoot, [
      {
        skill: 'harness-execution',
        session: 'sess-3',
        startedAt: '2026-05-14T00:00:00.000Z',
        duration: 500,
        outcome: 'completed',
        phasesReached: ['execute'],
      },
    ]);

    const events: AgentEvent[] = [
      {
        type: 'message',
        timestamp: '2026-05-14T00:00:01.000Z',
        usage: {
          inputTokens: 1000,
          outputTokens: 200,
          totalTokens: 1200,
          cacheCreationTokens: 50,
          cacheReadTokens: 0,
        },
      },
      {
        type: 'message',
        timestamp: '2026-05-14T00:00:02.000Z',
        usage: {
          inputTokens: 800,
          outputTokens: 150,
          totalTokens: 950,
          cacheCreationTokens: 0,
          cacheReadTokens: 600,
        },
      },
      {
        type: 'message',
        timestamp: '2026-05-14T00:00:03.000Z',
        usage: {
          inputTokens: 700,
          outputTokens: 100,
          totalTokens: 800,
          cacheCreationTokens: 0,
          cacheReadTokens: 700,
        },
      },
    ];

    const meta = TrajectoryBuilder.fromSession({ sessionId: 'sess-3', projectRoot, events });
    expect(meta.modelTokenSpend).toEqual({
      input: 2500,
      output: 450,
      cacheCreation: 50,
      cacheRead: 1300,
    });
    expect(meta.promptCacheHit).toBe(2);
    expect(meta.promptCacheMiss).toBe(1);
  });
});
