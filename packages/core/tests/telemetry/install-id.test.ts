import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getOrCreateInstallId } from '../../src/telemetry/install-id';

describe('getOrCreateInstallId', () => {
  const tmpDir = path.join(__dirname, '__test-tmp-install-id__');
  const installIdFile = path.join(tmpDir, '.harness', '.install-id');

  beforeEach(() => {
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a new UUIDv4 when .install-id does not exist', () => {
    const id = getOrCreateInstallId(tmpDir);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(fs.existsSync(installIdFile)).toBe(true);
  });

  it('returns the same ID on subsequent calls', () => {
    const first = getOrCreateInstallId(tmpDir);
    const second = getOrCreateInstallId(tmpDir);
    expect(first).toBe(second);
  });

  it('reads an existing install ID from disk', () => {
    const existingId = '12345678-1234-4abc-8abc-123456789abc';
    fs.writeFileSync(installIdFile, existingId, 'utf-8');
    const id = getOrCreateInstallId(tmpDir);
    expect(id).toBe(existingId);
  });

  it('trims whitespace from stored ID', () => {
    const existingId = '12345678-1234-4abc-8abc-123456789abc';
    fs.writeFileSync(installIdFile, `  ${existingId}  \n`, 'utf-8');
    const id = getOrCreateInstallId(tmpDir);
    expect(id).toBe(existingId);
  });

  it('creates .harness directory if it does not exist', () => {
    fs.rmSync(path.join(tmpDir, '.harness'), { recursive: true, force: true });
    const id = getOrCreateInstallId(tmpDir);
    expect(id).toMatch(/^[0-9a-f]{8}-/);
    expect(fs.existsSync(installIdFile)).toBe(true);
  });
});
