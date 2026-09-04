import { describe, it, expect } from 'vitest';
import { createUlidFactory } from './ulid';
import { validateSdlcEvent } from './validate';

const mint = createUlidFactory();

function validEvent(): Record<string, unknown> {
  return {
    specversion: '1.0',
    id: mint(),
    source: 'harness://repo/test',
    type: 'sdlc.claim.opened.v1',
    time: '2026-09-04T18:21:07.000Z',
    subject: 'item/example',
    actor: { kind: 'agent', id: 'agent://harness/roadmap', onBehalfOf: 'user://chad' },
  };
}

function issueFields(candidate: unknown): string[] {
  const result = validateSdlcEvent(candidate);
  if (result.ok) return [];
  return result.issues.map((issue) => issue.field);
}

describe('waypoint/validate', () => {
  it('accepts a minimal valid envelope', () => {
    const result = validateSdlcEvent(validEvent());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.type).toBe('sdlc.claim.opened.v1');
      expect(result.event.datacontenttype).toBeUndefined();
    }
  });

  it('stamps datacontenttype when data is present', () => {
    const result = validateSdlcEvent({ ...validEvent(), data: { a: 1 } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.event.datacontenttype).toBe('application/json');
  });

  it('rejects a non-object candidate with a $ diagnostic', () => {
    expect(issueFields('nope')).toEqual(['$']);
  });

  it('names each violated field', () => {
    const fields = issueFields({
      ...validEvent(),
      specversion: '2.0',
      id: 'bad',
      type: 'sdlc.made.up.v1',
      time: 'not-a-time',
      subject: '',
      grade: 'V9',
      data: 'not-an-object',
    });
    expect(fields).toEqual(
      expect.arrayContaining(['specversion', 'id', 'type', 'time', 'subject', 'grade', 'data'])
    );
  });

  it('enforces the closed v1 vocabulary', () => {
    expect(issueFields({ ...validEvent(), type: 'sdlc.intent.reopened.v1' })).toContain('type');
  });

  it('enforces actor duality: agent actors require onBehalfOf', () => {
    expect(issueFields({ ...validEvent(), actor: { kind: 'agent', id: 'agent://x' } })).toContain(
      'actor.onBehalfOf'
    );
    const human = validateSdlcEvent({
      ...validEvent(),
      actor: { kind: 'human', id: 'user://chad' },
    });
    expect(human.ok).toBe(true);
  });

  it('rejects a missing or malformed actor', () => {
    expect(issueFields({ ...validEvent(), actor: undefined })).toContain('actor');
    expect(issueFields({ ...validEvent(), actor: { kind: 'robot', id: '' } })).toEqual(
      expect.arrayContaining(['actor.kind', 'actor.id'])
    );
  });

  it('validates causes as an array of ULIDs', () => {
    expect(issueFields({ ...validEvent(), causes: 'x' })).toContain('causes');
    expect(issueFields({ ...validEvent(), causes: ['not-a-ulid'] })).toContain('causes[0]');
    const ok = validateSdlcEvent({ ...validEvent(), causes: [mint()] });
    expect(ok.ok).toBe(true);
  });

  it('accepts every pinned verification grade', () => {
    for (const grade of ['V0', 'V1', 'V2', 'V3']) {
      expect(validateSdlcEvent({ ...validEvent(), grade }).ok).toBe(true);
    }
  });
});
