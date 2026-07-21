import { describe, it, expect } from 'vitest';
import { makeTrackerConflictBody } from './conflict-body';
import { ConflictError } from './client';

const EXTERNAL_ID = 'ISSUE-42';
const DIFF = {
  status: { ours: 'in-progress', theirs: 'done' },
} as const;

describe('makeTrackerConflictBody', () => {
  it('builds the 409 body from a ConflictError, defaulting conflictedWith to err.diff', () => {
    const err = new ConflictError(EXTERNAL_ID, DIFF);

    const body = makeTrackerConflictBody(err);

    expect(body).toEqual({
      error: err.message,
      code: 'TRACKER_CONFLICT',
      externalId: EXTERNAL_ID,
      conflictedWith: DIFF,
      refreshHint: 'reload-roadmap',
    });
    // conflictedWith defaults to the exact diff instance off the error.
    expect(body.conflictedWith).toBe(err.diff);
  });

  it('carries the ConflictError message verbatim into error', () => {
    const message = 'Conflict on ISSUE-42: claimed by Bob';
    const err = new ConflictError(EXTERNAL_ID, DIFF, null, message);

    const body = makeTrackerConflictBody(err);

    expect(body.error).toBe(message);
  });

  it('overrides conflictedWith when opts.conflictedWith is provided', () => {
    const err = new ConflictError(EXTERNAL_ID, DIFF);
    const override = 'claimed by Bob';

    const body = makeTrackerConflictBody(err, { conflictedWith: override });

    expect(body.conflictedWith).toBe(override);
    // Other fields remain sourced from the error.
    expect(body.externalId).toBe(EXTERNAL_ID);
    expect(body.code).toBe('TRACKER_CONFLICT');
  });

  it('treats an undefined override as absent and falls back to err.diff', () => {
    const err = new ConflictError(EXTERNAL_ID, DIFF);

    const body = makeTrackerConflictBody(err, { conflictedWith: undefined });

    expect(body.conflictedWith).toBe(err.diff);
  });

  it('preserves a falsy-but-defined override (does not fall back to err.diff)', () => {
    const err = new ConflictError(EXTERNAL_ID, DIFF);

    // `??` only falls back on null/undefined, so empty string and null must win.
    expect(makeTrackerConflictBody(err, { conflictedWith: '' }).conflictedWith).toBe('');
    expect(makeTrackerConflictBody(err, { conflictedWith: 0 }).conflictedWith).toBe(0);
    expect(makeTrackerConflictBody(err, { conflictedWith: false }).conflictedWith).toBe(false);
  });

  it('falls back to err.diff when override is explicitly null', () => {
    const err = new ConflictError(EXTERNAL_ID, DIFF);

    const body = makeTrackerConflictBody(err, { conflictedWith: null });

    expect(body.conflictedWith).toBe(err.diff);
  });

  it('defaults to an empty options object (callable with a single argument)', () => {
    const err = new ConflictError(EXTERNAL_ID, {});

    const body = makeTrackerConflictBody(err);

    expect(body.conflictedWith).toEqual({});
    expect(body.refreshHint).toBe('reload-roadmap');
  });

  it('always pins the constant code and refreshHint discriminants', () => {
    const body = makeTrackerConflictBody(new ConflictError('X-1', DIFF));

    expect(body.code).toBe('TRACKER_CONFLICT');
    expect(body.refreshHint).toBe('reload-roadmap');
  });
});
