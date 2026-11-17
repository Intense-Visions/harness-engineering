import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { runMinimalInit, buildUpgradePath } from '../../src/commands/init-minimal';
import { runCheckArch } from '../../src/commands/check-arch';

/** A temp git repo so the pre-commit verification loop can be installed. */
function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-minimal-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

describe('runMinimalInit (ADR 0101)', () => {
  it('scaffolds exactly the 5 Minimum Viable Harness artifacts', async () => {
    const dir = makeRepo();
    try {
      const result = await runMinimalInit({ cwd: dir, name: 'demo' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Exactly five artifacts, each of the five MVH items, all scaffolded.
      expect(result.value.artifacts).toHaveLength(5);
      expect(result.value.artifacts.every((a) => a.scaffolded)).toBe(true);

      // 1. Repo guide — AGENTS.md.
      expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(true);

      // 2. One runnable local check — harness.config.json wiring check-arch.
      const configPath = path.join(dir, 'harness.config.json');
      expect(fs.existsSync(configPath)).toBe(true);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.template.level).toBe('minimal');

      // 3. One hard architectural rule — arch enabled, fail-closed, baseline seeded.
      expect(config.architecture.enabled).toBe(true);
      expect(config.architecture.thresholds.complexity.max).toBe(15);
      const baselinePath = path.join(dir, '.harness', 'arch', 'baselines.json');
      expect(fs.existsSync(baselinePath)).toBe(true);

      // 4. One verification loop — a pre-commit hook running the arch check.
      const preCommit = path.join(dir, '.git', 'hooks', 'pre-commit');
      expect(fs.existsSync(preCommit)).toBe(true);
      expect(fs.readFileSync(preCommit, 'utf-8')).toContain('harness check-arch');

      // 5. One permission boundary — the safety-floor guard hooks.
      expect(fs.existsSync(path.join(dir, '.harness', 'hooks', 'block-no-verify.js'))).toBe(true);
      expect(fs.existsSync(path.join(dir, '.harness', 'hooks', 'autonomy-guard.js'))).toBe(true);
      const settings = JSON.parse(
        fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf-8')
      );
      expect(JSON.stringify(settings.hooks)).toContain('block-no-verify');
      expect(JSON.stringify(settings.hooks)).toContain('autonomy-guard');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does NOT scaffold the deferred heavier artifacts (STRATEGY, framework, design)', async () => {
    const dir = makeRepo();
    try {
      await runMinimalInit({ cwd: dir, name: 'demo' });
      expect(fs.existsSync(path.join(dir, 'STRATEGY.md'))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'package.json'))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'eslint.config.mjs'))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to overwrite an initialized project without --force', async () => {
    const dir = makeRepo();
    try {
      const first = await runMinimalInit({ cwd: dir, name: 'demo' });
      expect(first.ok).toBe(true);
      const second = await runMinimalInit({ cwd: dir, name: 'demo' });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.message).toMatch(/already initialized/i);
      const forced = await runMinimalInit({ cwd: dir, name: 'demo', force: true });
      expect(forced.ok).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('degrades gracefully outside a git repo (verification loop deferred, not fatal)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-nogit-'));
    try {
      const result = await runMinimalInit({ cwd: dir, name: 'demo' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const loop = result.value.artifacts.find((a) => a.mvh.includes('verification loop'));
      expect(loop?.scaffolded).toBe(false);
      expect(loop?.note).toBeTruthy();
      // The other four artifacts still land.
      expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'harness.config.json'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the seeded arch rule is fail-closed — check-arch passes clean, fails on an over-complex fn', async () => {
    const dir = makeRepo();
    try {
      await runMinimalInit({ cwd: dir, name: 'demo' });
      const configPath = path.join(dir, 'harness.config.json');
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });

      // A trivial module passes the seeded floor.
      fs.writeFileSync(path.join(dir, 'src', 'ok.ts'), 'export const ok = 1;\n');
      const clean = await runCheckArch({ cwd: dir, configPath });
      expect(clean.ok).toBe(true);
      if (clean.ok) expect(clean.value.passed).toBe(true);

      // A function well over the complexity cap of 15 trips the gate.
      const overComplex =
        'export function f(n: number): number {\n' +
        '  ' +
        Array.from({ length: 20 }, (_, i) => `if (n > ${i}) {`).join('') +
        'return 1;' +
        '}'.repeat(20) +
        '\n  return 0;\n}\n';
      fs.writeFileSync(path.join(dir, 'src', 'complex.ts'), overComplex);
      const dirty = await runCheckArch({ cwd: dir, configPath });
      expect(dirty.ok).toBe(true);
      if (dirty.ok) expect(dirty.value.passed).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prints an ordered, additive upgrade path to the fuller tiers', () => {
    const lines = buildUpgradePath().join('\n');
    expect(lines).toMatch(/additive/i);
    expect(lines).toContain('/harness:strategy');
    expect(lines).toContain('harness init --tier intermediate');
    expect(lines).toContain('harness init --tier advanced');
  });
  // #2630: the hook ran `npx harness check-arch`, but the minimal tier writes no
  // package.json, so npx resolved the UNRELATED npm package `harness` (no bin) —
  // "could not determine executable to run" — and blocked every commit, even with
  // the CLI installed globally on PATH (npx does not consult PATH).
  describe.skipIf(process.platform === 'win32')('pre-commit hook CLI resolution (#2630)', () => {
    /** Run the installed hook with PATH = stub bin dir + the system dirs. */
    function runHook(dir: string, stubs: Record<string, string>): { code: number; log: string } {
      const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-hook-bin-'));
      const log = path.join(bin, 'calls.log');
      for (const [name, body] of Object.entries(stubs)) {
        const file = path.join(bin, name);
        fs.writeFileSync(file, `#!/bin/sh\necho "${name} $*" >> "${log}"\n${body}\n`);
        fs.chmodSync(file, 0o755);
      }
      let code = 0;
      try {
        execFileSync('sh', [path.join(dir, '.git', 'hooks', 'pre-commit')], {
          cwd: dir,
          env: { PATH: `${bin}:/usr/bin:/bin` },
          stdio: 'ignore',
        });
      } catch (err) {
        code = (err as { status?: number }).status ?? 1;
      }
      const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf-8') : '';
      fs.rmSync(bin, { recursive: true, force: true });
      return { code, log: calls };
    }

    it('uses a harness CLI on PATH instead of npx-resolving the npm package "harness"', async () => {
      const dir = makeRepo();
      try {
        await runMinimalInit({ cwd: dir, name: 'demo' });
        const res = runHook(dir, { harness: 'exit 0', npx: 'exit 1' });
        expect(res.log).toMatch(/^harness check-arch$/m);
        expect(res.code).toBe(0);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('falls back to npx with the real package name, never a bare `npx harness`', async () => {
      const dir = makeRepo();
      try {
        await runMinimalInit({ cwd: dir, name: 'demo' });
        const res = runHook(dir, { npx: 'exit 0' });
        expect(res.log).toMatch(/^npx .*@harness-engineering\/cli.* check-arch$/m);
        expect(res.code).toBe(0);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('still blocks the commit when the arch check fails', async () => {
      const dir = makeRepo();
      try {
        await runMinimalInit({ cwd: dir, name: 'demo' });
        const res = runHook(dir, { harness: 'exit 1' });
        expect(res.code).toBe(1);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    // Post-release smoke of cli@14.1.0: on a fresh scaffold (no source files)
    // check-arch abstains with exit 3 (ZERO_DENOMINATOR), and the hook blocked
    // the project's very first commit. Exit 3 means "measured nothing", so the
    // hook lets it through; every other non-zero exit still blocks.
    it('lets an abstention (exit 3: nothing measured yet) through', async () => {
      const dir = makeRepo();
      try {
        await runMinimalInit({ cwd: dir, name: 'demo' });
        const res = runHook(dir, { harness: 'exit 3' });
        expect(res.log).toMatch(/^harness check-arch$/m);
        expect(res.code).toBe(0);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('still blocks on an error exit (2), not only on violations', async () => {
      const dir = makeRepo();
      try {
        await runMinimalInit({ cwd: dir, name: 'demo' });
        const res = runHook(dir, { harness: 'exit 2' });
        expect(res.code).toBe(1);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('inspects the exit code even under a `set -e` in a merged, user-owned hook', async () => {
      const dir = makeRepo();
      try {
        const hook = path.join(dir, '.git', 'hooks', 'pre-commit');
        fs.mkdirSync(path.dirname(hook), { recursive: true });
        fs.writeFileSync(hook, '#!/bin/sh\nset -e\n');
        await runMinimalInit({ cwd: dir, name: 'demo' });
        expect(runHook(dir, { harness: 'exit 3' }).code).toBe(0);
        expect(runHook(dir, { harness: 'exit 1' }).code).not.toBe(0);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it('git-ignores the .harness runtime artifacts the CLI writes (#2630)', async () => {
    const dir = makeRepo();
    try {
      await runMinimalInit({ cwd: dir, name: 'demo' });
      expect(fs.existsSync(path.join(dir, '.harness', '.gitignore'))).toBe(true);
      // Exit 0 = ignored. Without the file every `git add -A` staged telemetry.
      execFileSync('git', ['check-ignore', '-q', '.harness/metrics/adoption.jsonl'], { cwd: dir });
      // ...while the seeded arch baseline (artifact 3) stays tracked.
      expect(() =>
        execFileSync('git', ['check-ignore', '-q', '.harness/arch/baselines.json'], { cwd: dir })
      ).toThrow();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
