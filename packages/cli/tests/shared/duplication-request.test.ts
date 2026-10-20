import { describe, it, expect } from 'vitest';
import {
  resolveDuplicationRequest,
  describeDuplicationNotRun,
} from '../../src/shared/duplication-request';

describe('resolveDuplicationRequest', () => {
  // The table IS the decision (plan decisions P3/P4). MUTATION: make `all`
  // run on an unconfigured project and row 3 fails; make an explicit
  // request honor `false` as "skip" and row 7 fails.
  it.each([
    ['drift / unconfigured', 'drift', undefined, 'skip'],
    ['dead-code / configured', 'dead-code', { minTokens: 50 }, 'skip'],
    ['all / unconfigured', 'all', undefined, 'skip'],
    ['all / false', 'all', false, 'skip'],
    ['all / true', 'all', true, 'run'],
    ['all / object', 'all', { minTokens: 50 }, 'run'],
    ['duplication / false', 'duplication', false, 'refuse'],
    ['duplication / unconfigured', 'duplication', undefined, 'run'],
    ['duplication / true', 'duplication', true, 'run'],
    ['duplication / object', 'duplication', { maxClasses: 5 }, 'run'],
  ])('%s -> %s', (_label, type, configured, kind) => {
    expect(resolveDuplicationRequest(type as string, configured as never).kind).toBe(kind);
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
