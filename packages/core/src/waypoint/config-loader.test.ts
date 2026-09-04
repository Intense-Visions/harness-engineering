import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isErr, isOk } from '../shared/result';
import { loadWaypointConfig } from './config-loader';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-waypoint-config-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(config: unknown): void {
  writeFileSync(join(dir, 'harness.config.json'), JSON.stringify(config), 'utf8');
}

describe('waypoint/config-loader', () => {
  it('returns Ok({}) when harness.config.json is absent', () => {
    const result = loadWaypointConfig(dir);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toEqual({});
  });

  it('returns Ok({}) when the waypoint key is absent (non-adopter default)', () => {
    write({ version: 1, name: 'p' });
    const result = loadWaypointConfig(dir);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toEqual({});
  });

  it('parses a valid waypoint.sink block', () => {
    write({
      waypoint: {
        sink: {
          transport: 'spool',
          source: 'harness://outpost/u1/repo/p',
          maxEventsPerSegment: 500,
          onBehalfOf: 'user://chad',
        },
      },
    });
    const result = loadWaypointConfig(dir);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.sink?.transport).toBe('spool');
      expect(result.value.sink?.maxEventsPerSegment).toBe(500);
    }
  });

  it('rejects an invalid waypoint block with named issues', () => {
    write({ waypoint: { sink: { transport: 'carrier-pigeon' } } });
    const result = loadWaypointConfig(dir);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.message).toContain('waypoint.sink.transport');
  });

  it('rejects unparseable JSON with a clear error', () => {
    writeFileSync(join(dir, 'harness.config.json'), '{nope', 'utf8');
    const result = loadWaypointConfig(dir);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.message).toContain('Failed to parse');
  });
});
