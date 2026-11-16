/**
 * Adopter first-run dogfood (#2630): a freshly scaffolded project must survive
 * the first commands an adopter runs — `npm install` (the CLI pin must name a
 * version that exists) and `harness cleanup` (the scaffold must not fail its own
 * drift / entry-point checks).
 */
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import semver from 'semver';
import { runInit } from '../../src/commands/init';
import { runCleanup } from '../../src/commands/cleanup';
import { CLI_VERSION } from '../../src/version';

const TS_LEVELS = ['basic', 'intermediate', 'load-bearing-minimum', 'advanced'] as const;

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-first-run-'));
}

describe('harness init — adopter first run (#2630)', () => {
  it.each(TS_LEVELS)(
    '%s: package.json pins a @harness-engineering/cli range the running CLI satisfies',
    async (level) => {
      const dir = tmp();
      try {
        const result = await runInit({ cwd: dir, name: 'demo', level });
        expect(result.ok).toBe(true);
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
        const pin: string = pkg.devDependencies['@harness-engineering/cli'];
        // `^0.1.0` was never published (first release is 1.0.0), so `npm install`
        // 404'd and every guarded command warned about a version mismatch.
        expect(semver.validRange(pin)).not.toBeNull();
        expect(semver.satisfies(CLI_VERSION, pin)).toBe(true);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  );

  it.each(TS_LEVELS)('%s: a fresh scaffold has no documentation drift', async (level) => {
    const dir = tmp();
    try {
      const result = await runInit({ cwd: dir, name: 'demo', level });
      expect(result.ok).toBe(true);
      const clean = await runCleanup({
        cwd: dir,
        configPath: path.join(dir, 'harness.config.json'),
        type: 'drift',
        quiet: true,
      });
      expect(clean.ok).toBe(true);
      if (!clean.ok) return;
      expect(clean.value.ran.drift).toBe(true);
      expect(clean.value.driftIssues).toEqual([]);

      // Positive control: the drift scan does see the docs/index.md link — remove
      // its target and the same scan reports it.
      fs.rmSync(path.join(dir, 'docs', 'architecture.md'));
      const broken = await runCleanup({
        cwd: dir,
        configPath: path.join(dir, 'harness.config.json'),
        type: 'drift',
        quiet: true,
      });
      expect(broken.ok).toBe(true);
      if (!broken.ok) return;
      expect(broken.value.driftIssues.map((d) => d.issue).join('\n')).toContain('architecture.md');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('java: the scaffolded entry class is one the entry-point resolver recognises', async () => {
    const dir = tmp();
    try {
      const result = await runInit({ cwd: dir, name: 'demo', language: 'java' });
      expect(result.ok).toBe(true);
      // `src/main/java/App.java` matched neither Main.java nor *Application.java,
      // so `harness cleanup` failed with "Could not resolve entry points".
      const clean = await runCleanup({
        cwd: dir,
        configPath: path.join(dir, 'harness.config.json'),
        type: 'dead-code',
        quiet: true,
      });
      if (!clean.ok) throw new Error(clean.error.message);
      expect(clean.value.ran.deadCode).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
