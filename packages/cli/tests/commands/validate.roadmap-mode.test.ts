import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runValidate } from '../../src/commands/validate';

function makeProjectRoot(configBody: object): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-roadmap-mode-'));
  fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify(configBody));
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Stub\n');
  return dir;
}

describe('runValidate — roadmap mode', () => {
  let dir: string;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('passes for default config (no roadmap field)', async () => {
    dir = makeProjectRoot({ version: 1, agentsMapPath: './AGENTS.md' });
    const result = await runValidate({
      configPath: path.join(dir, 'harness.config.json'),
      cwd: dir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.checks.roadmapMode).toBe(true);
    }
  });

  it('fails when mode: "file-less" and tracker is absent', async () => {
    dir = makeProjectRoot({
      version: 1,
      agentsMapPath: './AGENTS.md',
      roadmap: { mode: 'file-less' },
    });
    const result = await runValidate({
      configPath: path.join(dir, 'harness.config.json'),
      cwd: dir,
    });
    expect(result.ok).toBe(true); // runValidate returns Ok with valid=false
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.checks.roadmapMode).toBe(false);
      const found = result.value.issues.find((i) => i.check === 'roadmapMode');
      expect(found).toBeDefined();
      expect(found?.ruleId).toBe('ROADMAP_MODE_MISSING_TRACKER');
    }
  });

  it('fails when mode: "file-less" and docs/roadmap.md exists', async () => {
    dir = makeProjectRoot({
      version: 1,
      agentsMapPath: './AGENTS.md',
      roadmap: {
        mode: 'file-less',
        tracker: { kind: 'github', statusMap: { 'in-progress': 'open' } },
      },
    });
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), '# legacy');
    const result = await runValidate({
      configPath: path.join(dir, 'harness.config.json'),
      cwd: dir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.checks.roadmapMode).toBe(false);
      const found = result.value.issues.find((i) => i.check === 'roadmapMode');
      expect(found?.ruleId).toBe('ROADMAP_MODE_FILE_PRESENT');
    }
  });
});
