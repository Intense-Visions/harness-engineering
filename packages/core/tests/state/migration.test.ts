import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { migrateToStreams, loadStreamIndex } from '../../src/state/stream-resolver';

describe('migrateToStreams', () => {
  it('moves old-layout files to streams/default/', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
    const hDir = path.join(tmp, '.harness');
    fs.mkdirSync(hDir, { recursive: true });
    fs.writeFileSync(path.join(hDir, 'state.json'), '{"schemaVersion":1}');
    fs.writeFileSync(path.join(hDir, 'handoff.json'), '{}');
    fs.writeFileSync(path.join(hDir, 'learnings.md'), '# Learnings');
    fs.writeFileSync(path.join(hDir, 'failures.md'), '# Failures');

    const result = await migrateToStreams(tmp);
    expect(result.ok).toBe(true);

    const defaultDir = path.join(hDir, 'streams', 'default');
    expect(fs.existsSync(path.join(defaultDir, 'state.json'))).toBe(true);
    expect(fs.existsSync(path.join(defaultDir, 'handoff.json'))).toBe(true);
    expect(fs.existsSync(path.join(defaultDir, 'learnings.md'))).toBe(true);
    expect(fs.existsSync(path.join(defaultDir, 'failures.md'))).toBe(true);

    // Old files should be gone
    expect(fs.existsSync(path.join(hDir, 'state.json'))).toBe(false);
    expect(fs.existsSync(path.join(hDir, 'handoff.json'))).toBe(false);

    // Index should exist with default stream
    const idx = await loadStreamIndex(tmp);
    expect(idx.ok).toBe(true);
    if (idx.ok) {
      expect(idx.value.streams['default']).toBeTruthy();
      expect(idx.value.activeStream).toBe('default');
    }

    fs.rmSync(tmp, { recursive: true });
  });

  it('is idempotent — no-ops when already migrated', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
    const hDir = path.join(tmp, '.harness');
    fs.mkdirSync(hDir, { recursive: true });
    fs.writeFileSync(path.join(hDir, 'state.json'), '{"schemaVersion":1}');

    await migrateToStreams(tmp);
    const result = await migrateToStreams(tmp);
    expect(result.ok).toBe(true);

    fs.rmSync(tmp, { recursive: true });
  });

  it('no-ops when no old state files exist', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
    const result = await migrateToStreams(tmp);
    expect(result.ok).toBe(true);
    fs.rmSync(tmp, { recursive: true });
  });

  it('handles partial old layout (only state.json)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
    const hDir = path.join(tmp, '.harness');
    fs.mkdirSync(hDir, { recursive: true });
    fs.writeFileSync(path.join(hDir, 'state.json'), '{"schemaVersion":1}');

    const result = await migrateToStreams(tmp);
    expect(result.ok).toBe(true);

    expect(fs.existsSync(path.join(hDir, 'streams', 'default', 'state.json'))).toBe(true);
    expect(fs.existsSync(path.join(hDir, 'state.json'))).toBe(false);

    fs.rmSync(tmp, { recursive: true });
  });

  it('preserves file contents during migration', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
    const hDir = path.join(tmp, '.harness');
    fs.mkdirSync(hDir, { recursive: true });
    const stateContent = '{"schemaVersion":1,"position":{"phase":"test"}}';
    const learningsContent = '# Learnings\n\n- **2026-03-19:** Important thing';
    fs.writeFileSync(path.join(hDir, 'state.json'), stateContent);
    fs.writeFileSync(path.join(hDir, 'learnings.md'), learningsContent);

    await migrateToStreams(tmp);

    const defaultDir = path.join(hDir, 'streams', 'default');
    expect(fs.readFileSync(path.join(defaultDir, 'state.json'), 'utf-8')).toBe(stateContent);
    expect(fs.readFileSync(path.join(defaultDir, 'learnings.md'), 'utf-8')).toBe(learningsContent);

    fs.rmSync(tmp, { recursive: true });
  });
});
