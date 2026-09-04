import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FleetHandoffRecord, SdlcEvent } from '@harness-engineering/types';
import { initWaypointEmitter, resetWaypointEmitterForTests } from './emitter';
import {
  emitFleetHandoffWritten,
  emitFleetProvenanceWritten,
  emitRoadmapClaim,
  emitRoadmapRelease,
  emitRoadmapStatusChange,
  emitSkillPhaseTransition,
  emitVerdictPersisted,
  verdictGrade,
} from './events';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-waypoint-events-'));
  resetWaypointEmitterForTests();
  initWaypointEmitter({ sink: { transport: 'spool', onBehalfOf: 'user://tester' } }, dir);
});

afterEach(() => {
  resetWaypointEmitterForTests();
  rmSync(dir, { recursive: true, force: true });
});

function spooledEvents(): SdlcEvent[] {
  const spoolDir = join(dir, '.harness', 'spool');
  if (!existsSync(spoolDir)) return [];
  const events: SdlcEvent[] = [];
  for (const entry of readdirSync(spoolDir)) {
    if (!entry.endsWith('.jsonl')) continue;
    for (const line of readFileSync(join(spoolDir, entry), 'utf8').split('\n')) {
      if (line.length > 0) events.push(JSON.parse(line) as SdlcEvent);
    }
  }
  return events;
}

describe('waypoint/events — roadmap mutator mapping', () => {
  it('setStatus maps to intent.updated (and intent.closed for done)', () => {
    emitRoadmapStatusChange('My Feature', 'planned', 'backlog');
    emitRoadmapStatusChange('My Feature', 'done', 'in-progress');
    const [updated, closed] = spooledEvents();
    expect(updated?.type).toBe('sdlc.intent.updated.v1');
    expect(updated?.subject).toBe('item/My Feature');
    expect(updated?.data).toEqual({
      mutator: 'setStatus',
      status: 'planned',
      previousStatus: 'backlog',
    });
    expect(closed?.type).toBe('sdlc.intent.closed.v1');
  });

  it('claim maps to claim.opened with the assignee', () => {
    emitRoadmapClaim('My Feature', 'orchestrator-abcd1234');
    const [event] = spooledEvents();
    expect(event?.type).toBe('sdlc.claim.opened.v1');
    expect(event?.data).toEqual({ mutator: 'claim', assignee: 'orchestrator-abcd1234' });
  });

  it('release maps to claim.released, omitting a null previous assignee', () => {
    emitRoadmapRelease('My Feature', 'chad');
    emitRoadmapRelease('My Feature', null);
    const [withPrev, withoutPrev] = spooledEvents();
    expect(withPrev?.type).toBe('sdlc.claim.released.v1');
    expect(withPrev?.data).toEqual({ mutator: 'release', previousAssignee: 'chad' });
    expect(withoutPrev?.data).toEqual({ mutator: 'release' });
  });
});

describe('waypoint/events — skill phase transitions', () => {
  it('preserves the qualityGate payload on build.finished', () => {
    emitSkillPhaseTransition({
      completedPhase: 'execution',
      suggestedNext: 'verification',
      reason: 'all tasks complete',
      artifacts: ['src/a.ts'],
      qualityGate: { checks: [{ name: 'tests', passed: true }], allPassed: true },
    });
    const [event] = spooledEvents();
    expect(event?.type).toBe('sdlc.build.finished.v1');
    expect(event?.subject).toBe('phase/execution');
    expect(event?.data).toEqual({
      completedPhase: 'execution',
      suggestedNext: 'verification',
      reason: 'all tasks complete',
      artifacts: ['src/a.ts'],
      qualityGate: { checks: [{ name: 'tests', passed: true }], allPassed: true },
    });
  });
});

describe('waypoint/events — verdict grading', () => {
  it('maps passing verdicts to their asserted grades', () => {
    expect(verdictGrade('acceptance', 'MEASURABLE')).toBe('V1');
    expect(verdictGrade('outcome', 'SATISFIED')).toBe('V2');
    expect(verdictGrade('uat', 'ACCEPTED')).toBe('V3');
  });

  it('maps every non-passing verdict to V0', () => {
    expect(verdictGrade('acceptance', 'NOT_MEASURABLE')).toBe('V0');
    expect(verdictGrade('outcome', 'INCONCLUSIVE')).toBe('V0');
    expect(verdictGrade('uat', 'REJECTED')).toBe('V0');
  });

  it('emits verify.graded carrying the persisted verdict verbatim', () => {
    emitVerdictPersisted({
      kind: 'outcome',
      verdict: 'SATISFIED',
      confidence: 'high',
      item: 'my-change',
      detail: { specPath: 'docs/changes/my-change/proposal.md' },
    });
    const [event] = spooledEvents();
    expect(event?.type).toBe('sdlc.verify.graded.v1');
    expect(event?.grade).toBe('V2');
    expect(event?.subject).toBe('item/my-change');
    expect(event?.data).toMatchObject({
      kind: 'outcome',
      verdict: 'SATISFIED',
      confidence: 'high',
    });
  });

  it('carries an explicit human actor for UAT sign-offs', () => {
    emitVerdictPersisted({
      kind: 'uat',
      verdict: 'ACCEPTED',
      item: 'my-change',
      actor: { kind: 'human', id: 'user://chad' },
    });
    const [event] = spooledEvents();
    expect(event?.actor).toEqual({ kind: 'human', id: 'user://chad' });
    expect(event?.grade).toBe('V3');
  });
});

describe('waypoint/events — fleet artifacts', () => {
  it('provenance write maps to build.finished with stages and path', () => {
    emitFleetProvenanceWritten({
      item: 'my-slug',
      stages: ['brainstorm', 'plan', 'execute'],
      artifactPath: 'docs/changes/my-slug/provenance.json',
    });
    const [event] = spooledEvents();
    expect(event?.type).toBe('sdlc.build.finished.v1');
    expect(event?.data).toEqual({
      artifact: 'provenance',
      artifactPath: 'docs/changes/my-slug/provenance.json',
      stages: ['brainstorm', 'plan', 'execute'],
    });
  });

  it('done handoff maps to review.requested; non-done to intent.updated', () => {
    const done: FleetHandoffRecord = {
      status: 'done',
      fleet: 'roadmap-fleet',
      item: 'my-slug',
      summary: 'shipped',
      evidence: [{ kind: 'pr', ref: 'https://example.test/pr/1' }],
      next_steps: [],
    };
    emitFleetHandoffWritten(done);
    emitFleetHandoffWritten({
      ...done,
      status: 'parked',
      blocker: 'unforeseen fork',
    });
    const [reviewRequested, parked] = spooledEvents();
    expect(reviewRequested?.type).toBe('sdlc.review.requested.v1');
    expect(reviewRequested?.data).toMatchObject({
      artifact: 'handoff',
      status: 'done',
      fleet: 'roadmap-fleet',
      evidence: [{ kind: 'pr', ref: 'https://example.test/pr/1' }],
    });
    expect(parked?.type).toBe('sdlc.intent.updated.v1');
    expect(parked?.data).toMatchObject({ status: 'parked', blocker: 'unforeseen fork' });
  });
});
