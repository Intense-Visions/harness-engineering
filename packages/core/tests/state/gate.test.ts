import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runMechanicalGate } from '../../src/state/state-manager';

describe('runMechanicalGate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-gate-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return passed=true with no checks when project type is undetectable', async () => {
    const result = await runMechanicalGate(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(true);
      expect(result.value.checks).toEqual([]);
    }
  });

  it('should detect npm project and run available checks', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        scripts: { test: 'echo "tests pass"', lint: 'echo "lint clean"' },
      })
    );

    const result = await runMechanicalGate(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.checks.length).toBeGreaterThan(0);
      expect(result.value.checks.every(c => c.name && c.command && typeof c.passed === 'boolean')).toBe(true);
    }
  });

  it('should use custom checks from gate.json', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'gate.json'),
      JSON.stringify({
        checks: [{ name: 'custom', command: 'echo "custom pass"' }],
      })
    );

    const result = await runMechanicalGate(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.checks.length).toBe(1);
      expect(result.value.checks[0].name).toBe('custom');
      expect(result.value.checks[0].passed).toBe(true);
    }
  });

  it('should report failed checks correctly', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'gate.json'),
      JSON.stringify({
        checks: [
          { name: 'pass', command: 'echo "ok"' },
          { name: 'fail', command: 'exit 1' },
        ],
      })
    );

    const result = await runMechanicalGate(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.checks.find(c => c.name === 'pass')?.passed).toBe(true);
      expect(result.value.checks.find(c => c.name === 'fail')?.passed).toBe(false);
    }
  });
});
