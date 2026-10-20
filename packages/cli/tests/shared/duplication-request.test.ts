import { describe, it, expect } from 'vitest';
import {
  resolveDuplicationRequest,
  describeDuplicationNotRun,
  isEntropyIssueType,
  describeUnknownIssueType,
  ENTROPY_ISSUE_TYPES,
} from '../../src/shared/duplication-request';

describe('resolveDuplicationRequest', () => {
  // The table IS the decision (plan decisions P3/P4). MUTATION: make `all`
  // run on an unconfigured project and row 3 fails; make an explicit
  // request honor `false` as "skip" and row 7 fails.
  // Object rows with `$`-interpolated titles, not a positional `'%s -> %s'`:
  // printf placeholders consume args 0 and 1, so the second `%s` rendered the
  // TYPE where the outcome belongs — "duplication / false -> duplication"
  // instead of "-> refuse". A title that misreports the outcome actively
  // misleads whoever reads the failure.
  it.each([
    { label: 'drift / unconfigured', type: 'drift', configured: undefined, kind: 'skip' },
    {
      label: 'dead-code / configured',
      type: 'dead-code',
      configured: { minTokens: 50 },
      kind: 'skip',
    },
    { label: 'all / unconfigured', type: 'all', configured: undefined, kind: 'skip' },
    { label: 'all / false', type: 'all', configured: false, kind: 'skip' },
    { label: 'all / true', type: 'all', configured: true, kind: 'run' },
    { label: 'all / object', type: 'all', configured: { minTokens: 50 }, kind: 'run' },
    { label: 'duplication / false', type: 'duplication', configured: false, kind: 'refuse' },
    {
      label: 'duplication / unconfigured',
      type: 'duplication',
      configured: undefined,
      kind: 'run',
    },
    { label: 'duplication / true', type: 'duplication', configured: true, kind: 'run' },
    {
      label: 'duplication / object',
      type: 'duplication',
      configured: { maxClasses: 5 },
      kind: 'run',
    },
  ])('$label -> $kind', ({ type, configured, kind }) => {
    expect(resolveDuplicationRequest(type, configured as never).kind).toBe(kind);
  });

  it('passes an object config through verbatim', () => {
    const request = resolveDuplicationRequest('duplication', { maxClasses: 5 });
    expect(request).toEqual({ kind: 'run', analyze: { maxClasses: 5 } });
  });

  it('names the config key and the remedy when it refuses', () => {
    const request = resolveDuplicationRequest('duplication', false);
    expect(request.kind === 'refuse' && request.message).toContain('entropy.duplication');
    expect(request.kind === 'refuse' && request.message).toMatch(/Refusing to report/);
  });
});

describe('the shared issue-type vocabulary', () => {
  it('accepts exactly the five advertised types', () => {
    expect([...ENTROPY_ISSUE_TYPES]).toEqual([
      'drift',
      'dead-code',
      'patterns',
      'duplication',
      'all',
    ]);
    for (const type of ENTROPY_ISSUE_TYPES) {
      expect(isEntropyIssueType(type)).toBe(true);
    }
  });

  it.each(['duplicaiton', 'bogus', 'Duplication', '', 'dead_code'])(
    'rejects %o',
    (type: string) => {
      // `duplicaiton` is the measured real-world case: a one-character typo in
      // an 11-character word a human now types.
      expect(isEntropyIssueType(type)).toBe(false);
    }
  );

  it('names the typo, the allowed list and why it will not report a pass', () => {
    const message = describeUnknownIssueType('duplicaiton');
    expect(message).toContain('duplicaiton');
    expect(message).toContain('drift, dead-code, patterns, duplication, all');
    expect(message).toMatch(/Refusing to report a pass/);
  });
});

describe('describeDuplicationNotRun', () => {
  it("quotes the analyzer's own reason and suggestions", () => {
    const message = describeDuplicationNotRun([
      {
        analyzer: 'duplication',
        error: {
          code: 'INVALID_CONFIG',
          message: 'Duplication analysis did not run: the snapshot was bypassed.',
          details: { reason: 'snapshot-bypassed' },
          suggestions: ['Supply graph data for at most one of drift / deadCode'],
        },
      },
    ]);
    expect(message).toContain('snapshot was bypassed');
    expect(message).toContain('Supply graph data for at most one');
    // The honest signal: never the words "no duplication found".
    expect(message).not.toMatch(/no duplication/i);
  });

  it('says so when there is no error to quote', () => {
    expect(describeDuplicationNotRun([])).toMatch(/recorded no error/);
  });

  it("ignores another analyzer's error", () => {
    const message = describeDuplicationNotRun([
      {
        analyzer: 'drift',
        error: { code: 'PARSE_ERROR', message: 'drift blew up', details: {}, suggestions: [] },
      },
    ]);
    expect(message).toMatch(/recorded no error/);
    expect(message).not.toContain('drift blew up');
  });
});
