import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAgentConfigs } from '../../../src/validation/agent-configs';

function makeTempRepo(): string {
  return mkdtempSync(join(tmpdir(), 'agent-config-runner-'));
}

describe('validateAgentConfigs', () => {
  const originalDisable = process.env.HARNESS_AGNIX_DISABLE;
  const originalBin = process.env.HARNESS_AGNIX_BIN;
  let cwd: string;

  beforeEach(() => {
    cwd = makeTempRepo();
    // Force the fallback path to keep tests hermetic — agnix may or may not be installed.
    process.env.HARNESS_AGNIX_DISABLE = '1';
    delete process.env.HARNESS_AGNIX_BIN;
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    if (originalDisable === undefined) delete process.env.HARNESS_AGNIX_DISABLE;
    else process.env.HARNESS_AGNIX_DISABLE = originalDisable;
    if (originalBin === undefined) delete process.env.HARNESS_AGNIX_BIN;
    else process.env.HARNESS_AGNIX_BIN = originalBin;
  });

  it('reports engine=fallback with fellBackBecause=env-disabled when HARNESS_AGNIX_DISABLE is set', async () => {
    const result = await validateAgentConfigs(cwd);
    expect(result.engine).toBe('fallback');
    expect(result.fellBackBecause).toBe('env-disabled');
  });

  it('reports engine=fallback with fellBackBecause=binary-not-found when no binary is installed', async () => {
    delete process.env.HARNESS_AGNIX_DISABLE;
    // Point at a guaranteed-missing bin so PATH lookup will fail.
    const result = await validateAgentConfigs(cwd, { agnixBin: '/definitely/not/a/binary' });
    expect(result.engine).toBe('fallback');
    expect(result.fellBackBecause).toBe('binary-not-found');
  });

  it('valid=true on clean repo', async () => {
    writeFileSync(join(cwd, 'CLAUDE.md'), '# clean\n');
    const result = await validateAgentConfigs(cwd);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('valid=false when an error-severity rule fires', async () => {
    writeFileSync(join(cwd, 'CLAUDE.md'), '   \n');
    const result = await validateAgentConfigs(cwd);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('strict mode promotes warnings to errors and flips valid', async () => {
    // HARNESS-AC-003 (missing h1) is warning-level by default.
    writeFileSync(join(cwd, 'CLAUDE.md'), 'no heading\n');
    const lenient = await validateAgentConfigs(cwd);
    expect(lenient.valid).toBe(true); // warnings are allowed

    const strict = await validateAgentConfigs(cwd, { strict: true });
    expect(strict.valid).toBe(false); // warnings now count as errors
    expect(strict.issues.every((i) => i.severity === 'error')).toBe(true);
  });
});
