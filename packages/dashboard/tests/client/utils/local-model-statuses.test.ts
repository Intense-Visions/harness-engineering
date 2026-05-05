import { describe, it, expect } from 'vitest';
import {
  mergeLocalModelStatusByName,
  mergeLocalModelStatusesFromHttp,
} from '../../../src/client/utils/local-model-statuses';
import type { NamedLocalModelStatus } from '../../../src/client/types/orchestrator';

function makeStatus(
  backendName: string,
  endpoint: string,
  available: boolean
): NamedLocalModelStatus {
  return {
    available,
    resolved: available ? 'gemma-4-e4b' : null,
    configured: ['gemma-4-e4b'],
    detected: available ? ['gemma-4-e4b'] : [],
    lastProbeAt: '2026-05-04T12:00:00.000Z',
    lastError: available ? null : 'fetch failed',
    warnings: [],
    backendName,
    endpoint,
  };
}

describe('mergeLocalModelStatusByName (Spec 2 P4-IMP-1)', () => {
  it('appends to an empty array', () => {
    const next = makeStatus('local', 'http://localhost:1234/v1', false);
    expect(mergeLocalModelStatusByName([], next)).toEqual([next]);
  });

  it('appends a new entry when no existing entry matches backendName', () => {
    const local = makeStatus('local', 'http://localhost:1234/v1', false);
    const pi2 = makeStatus('pi-2', 'http://192.168.1.50:1234/v1', false);

    const result = mergeLocalModelStatusByName([local], pi2);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(local);
    expect(result[1]).toBe(pi2);
  });

  it('replaces an existing entry in place when backendName matches', () => {
    const localUnhealthy = makeStatus('local', 'http://localhost:1234/v1', false);
    const localHealthy = makeStatus('local', 'http://localhost:1234/v1', true);

    const result = mergeLocalModelStatusByName([localUnhealthy], localHealthy);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(localHealthy);
    expect(result[0]?.available).toBe(true);
  });

  it('replace-in-place preserves order of other entries (first-seen index stable)', () => {
    const local = makeStatus('local', 'http://localhost:1234/v1', false);
    const pi2 = makeStatus('pi-2', 'http://192.168.1.50:1234/v1', false);
    const localHealthy = makeStatus('local', 'http://localhost:1234/v1', true);

    const result = mergeLocalModelStatusByName([local, pi2], localHealthy);

    expect(result).toHaveLength(2);
    expect(result[0]?.backendName).toBe('local');
    expect(result[0]?.available).toBe(true);
    expect(result[1]).toBe(pi2);
  });

  it('returns a new array reference (does not mutate prev)', () => {
    const local = makeStatus('local', 'http://localhost:1234/v1', false);
    const prev: NamedLocalModelStatus[] = [local];
    const localHealthy = makeStatus('local', 'http://localhost:1234/v1', true);

    const result = mergeLocalModelStatusByName(prev, localHealthy);

    expect(result).not.toBe(prev);
    expect(prev).toEqual([local]); // original unchanged
    expect(prev[0]).toBe(local);
  });

  it('append path also returns a new array reference', () => {
    const local = makeStatus('local', 'http://localhost:1234/v1', false);
    const prev: NamedLocalModelStatus[] = [local];
    const pi2 = makeStatus('pi-2', 'http://192.168.1.50:1234/v1', false);

    const result = mergeLocalModelStatusByName(prev, pi2);

    expect(result).not.toBe(prev);
    expect(prev).toEqual([local]);
  });
});

describe('mergeLocalModelStatusesFromHttp (Spec 2 P4-S1)', () => {
  it('seeds an empty prev with the entire HTTP payload', () => {
    const local = makeStatus('local', 'http://localhost:1234/v1', false);
    const pi2 = makeStatus('pi-2', 'http://192.168.1.50:1234/v1', false);

    const result = mergeLocalModelStatusesFromHttp([], [local, pi2]);

    expect(result).toEqual([local, pi2]);
  });

  it('preserves a WS-fresh entry for the same backendName (HTTP arrived second)', () => {
    const localFresh = makeStatus('local', 'http://localhost:1234/v1', true);
    const localStale = makeStatus('local', 'http://localhost:1234/v1', false);

    const result = mergeLocalModelStatusesFromHttp([localFresh], [localStale]);

    expect(result).toEqual([localFresh]);
    expect(result[0]?.available).toBe(true);
  });

  it('merges WS-fresh entries with HTTP-only entries (preserves WS, appends new)', () => {
    const localFresh = makeStatus('local', 'http://localhost:1234/v1', true);
    const localStale = makeStatus('local', 'http://localhost:1234/v1', false);
    const pi2 = makeStatus('pi-2', 'http://192.168.1.50:1234/v1', false);

    const result = mergeLocalModelStatusesFromHttp([localFresh], [localStale, pi2]);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(localFresh); // WS value preserved
    expect(result[1]).toEqual(pi2); // HTTP-only appended
  });

  it('returns prev unchanged when http is empty', () => {
    const local = makeStatus('local', 'http://localhost:1234/v1', false);
    const prev: NamedLocalModelStatus[] = [local];

    const result = mergeLocalModelStatusesFromHttp(prev, []);

    expect(result).toBe(prev);
  });
});
