import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Pull } from '@harness-engineering/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BanditLedger } from '../src/bandit/ledger';

// Wrap mkdirSync so the number of directory syscalls per append is observable.
const fsMock = vi.hoisted(() => ({ mkdirSync: vi.fn() }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  fsMock.mkdirSync.mockImplementation(actual.mkdirSync);
  return { ...actual, mkdirSync: fsMock.mkdirSync };
});

const pull: Pull = {
  ts: '2026-09-23T00:00:00.000Z',
  consumer: 'routing',
  context: 'quick-fix',
  arm: 'local',
  mode: 'exploit',
};

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'stats-ledger-dir-'));
  file = path.join(dir, 'nested', 'bandit.jsonl');
  fsMock.mkdirSync.mockClear();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('BanditLedger.append directory cache', () => {
  it('creates the directory once per ledger instance, not once per append', () => {
    const ledger = new BanditLedger({ path: file });
    for (let i = 0; i < 5; i += 1) ledger.append(pull);
    expect(fsMock.mkdirSync).toHaveBeenCalledTimes(1);
    expect(readFileSync(file, 'utf8').split('\n').filter(Boolean)).toHaveLength(5);
  });

  it('recreates the directory after an ENOENT append failure', () => {
    const onError = vi.fn<(error: Error) => void>();
    const ledger = new BanditLedger({ path: file, onError });
    ledger.append(pull);
    rmSync(path.dirname(file), { recursive: true, force: true }); // the directory vanishes under us
    ledger.append(pull); // ENOENT: reported, and the cache is reset
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]?.[0] as Error & { code?: string }).code).toBe('ENOENT');
    ledger.append(pull); // recovered: directory recreated, line written
    expect(fsMock.mkdirSync).toHaveBeenCalledTimes(2);
    expect(readFileSync(file, 'utf8').split('\n').filter(Boolean)).toHaveLength(1);
  });
});
