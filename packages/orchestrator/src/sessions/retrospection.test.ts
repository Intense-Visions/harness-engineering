import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  AnalysisProvider,
  AnalysisRequest,
  AnalysisResponse,
} from '@harness-engineering/intelligence';
import type { RetrospectionProposalsResponse } from '@harness-engineering/types';
import { listProposals, type SkillProposal } from '@harness-engineering/core';
import {
  retrospectArchivedSession,
  isRetrospectionEnabled,
  RETROSPECTION_PROPOSED_BY,
} from './retrospection';

/** Provider that returns a fixed retrospection payload regardless of the request. */
function providerReturning(payload: RetrospectionProposalsResponse): AnalysisProvider {
  return {
    async analyze<T>(_req: AnalysisRequest): Promise<AnalysisResponse<T>> {
      return {
        result: payload as unknown as T,
        tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        model: 'test-model',
        latencyMs: 1,
      };
    },
  };
}

function throwingProvider(): AnalysisProvider {
  return {
    async analyze() {
      throw new Error('provider boom');
    },
  };
}

const NEW_SKILL_DRAFT = {
  kind: 'new-skill' as const,
  justification:
    'The session repeatedly hand-rolled retry logic; a dedicated skill would capture the pattern.',
  content: {
    name: 'resilient-retry',
    description: 'Standardises exponential-backoff retry handling across network calls.',
    skillYaml: 'name: resilient-retry\ndescription: retry helper\n',
    skillMd: '# Resilient Retry\n\nUse exponential backoff.\n',
  },
};

const REFINEMENT_DRAFT = {
  kind: 'refinement' as const,
  targetSkill: 'harness-debugging',
  justification:
    'The debugging skill missed the archive-corpus reproduction step this session relied on.',
  content: {
    name: 'harness-debugging',
    description: 'Adds an archived-session reproduction step to the debugging playbook.',
    diff: '--- a/SKILL.md\n+++ b/SKILL.md\n@@\n+Reproduce from the archived session corpus first.\n',
  },
};

function seedArchive(projectPath: string, sessionId: string): string {
  const archiveDir = join(projectPath, '.harness', 'archive', 'sessions', sessionId);
  mkdirSync(archiveDir, { recursive: true });
  writeFileSync(join(archiveDir, 'summary.md'), '# session summary\n\nBuilt the thing.');
  writeFileSync(join(archiveDir, 'learnings.md'), '## learnings\n\n- retry logic was duplicated');
  return archiveDir;
}

describe('isRetrospectionEnabled', () => {
  it('is off when no config block is present', () => {
    expect(isRetrospectionEnabled(undefined)).toBe(false);
  });
  it('is off when explicitly disabled', () => {
    expect(isRetrospectionEnabled({ enabled: false })).toBe(false);
  });
  it('is on when a block is present and not disabled', () => {
    expect(isRetrospectionEnabled({})).toBe(true);
    expect(isRetrospectionEnabled({ enabled: true })).toBe(true);
  });
});

describe('retrospectArchivedSession', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'retro-'));
  });
  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('emits applyable proposals in the existing SkillProposal shape', async () => {
    const archiveDir = seedArchive(projectPath, 'sess-1');
    const result = await retrospectArchivedSession({
      archiveDir,
      sessionId: 'sess-1',
      projectPath,
      provider: providerReturning({ proposals: [NEW_SKILL_DRAFT, REFINEMENT_DRAFT] }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.written).toHaveLength(2);
    expect(result.value.skipped).toBe(0);

    // Proposals are persisted to the existing store and readable via core.
    const persisted = (await listProposals(projectPath, { kind: 'skill' })) as SkillProposal[];
    expect(persisted).toHaveLength(2);

    const newSkill = persisted.find((p) => p.skillKind === 'new-skill');
    const refinement = persisted.find((p) => p.skillKind === 'refinement');
    expect(newSkill).toBeDefined();
    expect(refinement).toBeDefined();

    // Applyable shape: target + change + rationale + provenance + open status.
    expect(newSkill!.status).toBe('open');
    expect(newSkill!.proposedBy).toBe(RETROSPECTION_PROPOSED_BY);
    expect(newSkill!.source.sessionId).toBe('sess-1');
    expect(newSkill!.content.skillYaml).toBeTruthy();
    expect(newSkill!.content.skillMd).toBeTruthy();

    expect(refinement!.status).toBe('open');
    expect(refinement!.targetSkill).toBe('harness-debugging');
    expect(refinement!.content.diff).toBeTruthy();
    expect(refinement!.source.justification.length).toBeGreaterThanOrEqual(20);
  });

  it('drops invalid drafts (kind↔content mismatch) and counts them skipped', async () => {
    const archiveDir = seedArchive(projectPath, 'sess-bad');
    const bad = {
      kind: 'new-skill' as const,
      justification: 'This new skill is missing its required skillYaml and skillMd payload fields.',
      content: {
        name: 'broken-skill',
        description: 'A new-skill proposal that omits the required skill content payloads.',
        // no skillYaml / skillMd → fails the new-skill cross-field rule
      },
    };
    const result = await retrospectArchivedSession({
      archiveDir,
      sessionId: 'sess-bad',
      projectPath,
      provider: providerReturning({ proposals: [bad, NEW_SKILL_DRAFT] }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.written).toHaveLength(1);
    expect(result.value.skipped).toBe(1);
    const persisted = await listProposals(projectPath, { kind: 'skill' });
    expect(persisted).toHaveLength(1);
  });

  it('clears the timeout timer on the happy path (never keeps the loop alive)', async () => {
    // Regression: the `Promise.race` timeout `setTimeout` used to leak — on the
    // fast/happy path the timer stayed armed for the full `timeoutMs`, keeping
    // the event loop alive and stalling `archive_session` / test workers. With
    // fake timers we can prove no timer remains after the call settles.
    vi.useFakeTimers();
    try {
      const archiveDir = seedArchive(projectPath, 'sess-timer');
      const result = await retrospectArchivedSession({
        archiveDir,
        sessionId: 'sess-timer',
        projectPath,
        config: { enabled: true, timeoutMs: 60_000 },
        provider: providerReturning({ proposals: [NEW_SKILL_DRAFT] }),
      });
      expect(result.ok).toBe(true);
      // The 60s timeout timer must have been cleared in `finally`; if it leaked
      // this count would be 1 and the loop would stay alive for a full minute.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('truncates an over-returning provider to maxProposals instead of dropping all', async () => {
    // Regression: the response schema carried a `.max(10)`, so a provider that
    // returned >10 drafts failed validation and ALL proposals were dropped.
    // The cap now lives in the runtime `.slice(0, maxProposals)`, which keeps
    // the first N. Twelve valid drafts (over the old bound) must yield N, not 0.
    const archiveDir = seedArchive(projectPath, 'sess-many');
    const many = Array.from({ length: 12 }, (_, i) => ({
      kind: 'new-skill' as const,
      justification:
        'The session repeatedly hand-rolled the same helper; capture it as a reusable skill.',
      content: {
        name: `over-limit-skill-${i}`,
        description: `A distinct new-skill draft number ${i} produced by an over-eager provider run.`,
        skillYaml: `name: over-limit-skill-${i}\ndescription: helper\n`,
        skillMd: `# Over Limit ${i}\n\nDo the thing.\n`,
      },
    }));
    const result = await retrospectArchivedSession({
      archiveDir,
      sessionId: 'sess-many',
      projectPath,
      config: { enabled: true, maxProposals: 3 },
      provider: providerReturning({ proposals: many }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.written).toHaveLength(3);
    const persisted = await listProposals(projectPath, { kind: 'skill' });
    expect(persisted).toHaveLength(3);
  });

  it('respects the maxProposals cap', async () => {
    const archiveDir = seedArchive(projectPath, 'sess-cap');
    const result = await retrospectArchivedSession({
      archiveDir,
      sessionId: 'sess-cap',
      projectPath,
      config: { enabled: true, maxProposals: 1 },
      provider: providerReturning({ proposals: [NEW_SKILL_DRAFT, REFINEMENT_DRAFT] }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.written).toHaveLength(1);
  });

  it('returns Err when the session corpus is empty', async () => {
    const archiveDir = join(projectPath, '.harness', 'archive', 'sessions', 'sess-empty');
    mkdirSync(archiveDir, { recursive: true });
    const result = await retrospectArchivedSession({
      archiveDir,
      sessionId: 'sess-empty',
      projectPath,
      provider: providerReturning({ proposals: [NEW_SKILL_DRAFT] }),
    });
    expect(result.ok).toBe(false);
  });

  it('returns Err (never throws) when the provider call fails', async () => {
    const archiveDir = seedArchive(projectPath, 'sess-throw');
    const result = await retrospectArchivedSession({
      archiveDir,
      sessionId: 'sess-throw',
      projectPath,
      provider: throwingProvider(),
    });
    expect(result.ok).toBe(false);
    // Nothing persisted.
    const persisted = await listProposals(projectPath, { kind: 'skill' });
    expect(persisted).toHaveLength(0);
  });
});
