import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditLogger } from './audit';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-audit-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('AuditLogger', () => {
  it('appends one JSONL line per call', async () => {
    const path = join(dir, 'audit.log');
    const logger = new AuditLogger(path);
    await logger.append({ tokenId: 'tok_abc', route: '/api/state', method: 'GET', status: 200 });
    await logger.append({
      tokenId: 'tok_def',
      route: '/api/state',
      method: 'GET',
      status: 401,
      tenantId: 't1',
    });
    await logger.flush();
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0] as string);
    expect(first.tokenId).toBe('tok_abc');
    expect(first.status).toBe(200);
    expect(first.timestamp).toMatch(/T.*Z$/);
    expect(first).not.toHaveProperty('payload');
    expect(first).not.toHaveProperty('body');
  });

  it('continues silently when the write fails (best-effort)', async () => {
    const path = join(dir, 'subdir-does-not-exist', 'audit.log');
    const logger = new AuditLogger(path, { createDir: false });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await logger.append({ tokenId: 't', route: '/api/x', method: 'GET', status: 200 });
    await logger.flush();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
