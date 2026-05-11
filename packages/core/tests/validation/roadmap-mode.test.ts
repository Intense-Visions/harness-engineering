import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { validateRoadmapMode } from '../../src/validation/roadmap-mode';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-mode-test-'));
}

describe('validateRoadmapMode', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('passes when mode is absent (default file-backed)', () => {
    const result = validateRoadmapMode({}, tmp);
    expect(result.ok).toBe(true);
  });

  it('passes when mode is "file-backed" with no tracker', () => {
    const result = validateRoadmapMode({ roadmap: { mode: 'file-backed' } }, tmp);
    expect(result.ok).toBe(true);
  });

  it('passes when mode is "file-backed" with file present (today’s behavior)', () => {
    fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'docs', 'roadmap.md'), '# x');
    const result = validateRoadmapMode({ roadmap: { mode: 'file-backed' } }, tmp);
    expect(result.ok).toBe(true);
  });

  it('passes when mode is "file-less" with tracker configured AND file absent', () => {
    const result = validateRoadmapMode(
      {
        roadmap: {
          mode: 'file-less',
          tracker: { kind: 'github', statusMap: { 'in-progress': 'open' } },
        },
      },
      tmp
    );
    expect(result.ok).toBe(true);
  });

  it('fails (Rule A) when mode is "file-less" and tracker is absent', () => {
    const result = validateRoadmapMode({ roadmap: { mode: 'file-less' } }, tmp);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/roadmap\.tracker/);
      expect(result.error.message).toMatch(/file-less/);
      expect(result.error.code).toBe('ROADMAP_MODE_MISSING_TRACKER');
    }
  });

  it('fails (Rule B) when mode is "file-less" and docs/roadmap.md exists', () => {
    fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'docs', 'roadmap.md'), '# legacy');
    const result = validateRoadmapMode(
      {
        roadmap: {
          mode: 'file-less',
          tracker: { kind: 'github', statusMap: { 'in-progress': 'open' } },
        },
      },
      tmp
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/docs\/roadmap\.md/);
      expect(result.error.message).toMatch(/harness roadmap migrate/);
      expect(result.error.code).toBe('ROADMAP_MODE_FILE_PRESENT');
    }
  });

  it('fails (Rule A first) when mode is "file-less", tracker absent, and file present', () => {
    fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'docs', 'roadmap.md'), '# legacy');
    const result = validateRoadmapMode({ roadmap: { mode: 'file-less' } }, tmp);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Rule A is reported first because tracker absence is a stronger
      // structural error than file presence (file is recoverable via migrate).
      expect(result.error.code).toBe('ROADMAP_MODE_MISSING_TRACKER');
    }
  });
});
