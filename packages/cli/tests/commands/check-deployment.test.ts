import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createCheckDeploymentCommand,
  runCheckDeployment,
} from '../../src/commands/check-deployment';

/**
 * Create a throwaway project dir with a harness.config.json plus optional files.
 * `config` is serialized as-is (pass a raw string for the malformed-config case).
 */
function makeProject(opts: { config: object | string; files?: Record<string, string> }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-deployment-'));
  const raw = typeof opts.config === 'string' ? opts.config : JSON.stringify(opts.config);
  fs.writeFileSync(path.join(dir, 'harness.config.json'), raw);
  for (const [rel, content] of Object.entries(opts.files ?? {})) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

const SECRET_WORKFLOW = [
  'name: deploy',
  'on: push',
  'env:',
  '  AWS: "AKIAIOSFODNN7EXAMPLE"',
  'jobs:',
  '  deploy:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: echo deploy to production',
  '',
].join('\n');

// Reaches production, is gated (environment: + workflow_dispatch), has a rollback
// signal, but is missing the recommended stages and a health check → soft-only pass.
const SOFT_ONLY_WORKFLOW = [
  'name: deploy',
  'on:',
  '  workflow_dispatch:',
  'jobs:',
  '  deploy:',
  '    environment: production',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: ./deploy.sh production',
  '      - run: ./rollback.sh',
  '',
].join('\n');

describe('check-deployment command', () => {
  describe('createCheckDeploymentCommand', () => {
    it('creates command with correct name', () => {
      expect(createCheckDeploymentCommand().name()).toBe('check-deployment');
    });

    it('has --findings-json option', () => {
      const opts = createCheckDeploymentCommand().options.map((o) => o.long);
      expect(opts).toContain('--findings-json');
    });
  });

  describe('runCheckDeployment', () => {
    it('abstains on a repo with no CI/CD files and no deployment config (SC6)', async () => {
      const dir = makeProject({ config: { version: 1 } });
      try {
        const result = await runCheckDeployment({
          configPath: path.join(dir, 'harness.config.json'),
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.status).toBe('abstained');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('blocks on a hardcoded secret in a pipeline (SC2, DEPLOY-SEC001)', async () => {
      const dir = makeProject({
        config: { version: 1, deployment: { enabled: true } },
        files: { '.github/workflows/deploy.yml': SECRET_WORKFLOW },
      });
      try {
        const result = await runCheckDeployment({
          configPath: path.join(dir, 'harness.config.json'),
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.status).toBe('blocked');
          expect(result.value.findings.some((f) => f.code === 'DEPLOY-SEC001')).toBe(true);
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('reports disabled when deployment.enabled is false (SC7)', async () => {
      const dir = makeProject({ config: { version: 1, deployment: { enabled: false } } });
      try {
        const result = await runCheckDeployment({
          configPath: path.join(dir, 'harness.config.json'),
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.status).toBe('disabled');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('returns Err with ExitCode.ERROR (2) on a malformed config (D2)', async () => {
      const dir = makeProject({ config: '{ this is not valid json' });
      try {
        const result = await runCheckDeployment({
          configPath: path.join(dir, 'harness.config.json'),
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.exitCode).toBe(2);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('passes with only soft advisories when the pipeline is gated + has rollback (SC5)', async () => {
      const dir = makeProject({
        config: { version: 1, deployment: { enabled: true } },
        files: { '.github/workflows/deploy.yml': SOFT_ONLY_WORKFLOW },
      });
      try {
        const result = await runCheckDeployment({
          configPath: path.join(dir, 'harness.config.json'),
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.status).toBe('pass');
          expect(result.value.hardViolations).toHaveLength(0);
          expect(result.value.softViolations.length).toBeGreaterThan(0);
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('satisfies DEPLOY-RB001 when a rollback config block is present (D5 seam)', async () => {
      // Ungated prod pipeline, no in-file rollback signal, but a `rollback` config
      // block → rollbackConfigured wires through so RB001 does NOT fire.
      const dir = makeProject({
        config: {
          version: 1,
          deployment: { enabled: true },
          rollback: {},
        },
        files: {
          '.github/workflows/deploy.yml': [
            'name: deploy',
            'on:',
            '  workflow_dispatch:',
            'jobs:',
            '  deploy:',
            '    environment: production',
            '    steps:',
            '      - run: ./deploy.sh production',
            '',
          ].join('\n'),
        },
      });
      try {
        const result = await runCheckDeployment({
          configPath: path.join(dir, 'harness.config.json'),
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.rollbackPathPresent).toBe(true);
          expect(result.value.findings.some((f) => f.code === 'DEPLOY-RB001')).toBe(false);
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('action handler', () => {
    let mockExit: ReturnType<typeof vi.spyOn>;
    let mockConsoleLog: ReturnType<typeof vi.spyOn>;
    const exitError = new Error('process.exit');

    beforeEach(() => {
      mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw exitError;
      }) as never);
      mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      mockExit.mockRestore();
      mockConsoleLog.mockRestore();
    });

    async function safeParseAsync(program: Command, args: string[]) {
      try {
        await program.parseAsync(args);
      } catch (e) {
        if (e !== exitError) throw e;
      }
    }

    function makeProgram(): Command {
      const program = new Command();
      program.option('--json', 'JSON output');
      program.option('--quiet', 'Quiet output');
      program.option('--verbose', 'Verbose');
      program.option('-c, --config <path>', 'Config');
      program.addCommand(createCheckDeploymentCommand());
      return program;
    }

    function loggedText(): string {
      return mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
    }

    async function runAgainst(configPath: string, extraArgs: string[] = []) {
      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '-c',
        configPath,
        'check-deployment',
        ...extraArgs,
      ]);
    }

    it('abstain fixture → exit 3 with an "abstained" line', async () => {
      const dir = makeProject({ config: { version: 1 } });
      try {
        await runAgainst(path.join(dir, 'harness.config.json'));
        expect(mockExit).toHaveBeenCalledWith(3);
        expect(loggedText()).toContain('abstained');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('blocked (secret) fixture → exit 1', async () => {
      const dir = makeProject({
        config: { version: 1, deployment: { enabled: true } },
        files: { '.github/workflows/deploy.yml': SECRET_WORKFLOW },
      });
      try {
        await runAgainst(path.join(dir, 'harness.config.json'));
        expect(mockExit).toHaveBeenCalledWith(1);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('soft-only fixture → exit 0 with the advisory listed (SC5)', async () => {
      const dir = makeProject({
        config: { version: 1, deployment: { enabled: true } },
        files: { '.github/workflows/deploy.yml': SOFT_ONLY_WORKFLOW },
      });
      try {
        await runAgainst(path.join(dir, 'harness.config.json'));
        expect(mockExit).toHaveBeenCalledWith(0);
        expect(loggedText()).toContain('DEPLOY-');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('disabled fixture → exit 0 with an opt-out note distinct from abstain (SC7)', async () => {
      const dir = makeProject({ config: { version: 1, deployment: { enabled: false } } });
      try {
        await runAgainst(path.join(dir, 'harness.config.json'));
        expect(mockExit).toHaveBeenCalledWith(0);
        const text = loggedText();
        expect(text).toContain('disabled via config');
        expect(text).not.toContain('abstained');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('malformed config → exit 2 (D2)', async () => {
      const dir = makeProject({ config: '{ not valid json' });
      try {
        await runAgainst(path.join(dir, 'harness.config.json'));
        expect(mockExit).toHaveBeenCalledWith(2);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('--findings-json → trailing line parses as the findings contract', async () => {
      const dir = makeProject({
        config: { version: 1, deployment: { enabled: true } },
        files: { '.github/workflows/deploy.yml': SOFT_ONLY_WORKFLOW },
      });
      try {
        await runAgainst(path.join(dir, 'harness.config.json'), ['--findings-json']);
        expect(mockExit).toHaveBeenCalledWith(0);
        const lines = mockConsoleLog.mock.calls.map((c) => String(c[0]));
        const parsed = JSON.parse(lines[lines.length - 1]!);
        expect(typeof parsed.findings).toBe('number');
        expect(parsed.check).toBe('check-deployment');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('--json → prints the full DeploymentGateResult', async () => {
      const dir = makeProject({
        config: { version: 1, deployment: { enabled: true } },
        files: { '.github/workflows/deploy.yml': SECRET_WORKFLOW },
      });
      try {
        const program = makeProgram();
        await safeParseAsync(program, [
          'node',
          'test',
          '--json',
          '-c',
          path.join(dir, 'harness.config.json'),
          'check-deployment',
        ]);
        // exit code unchanged by --json (still blocked → 1).
        expect(mockExit).toHaveBeenCalledWith(1);
        const blob = mockConsoleLog.mock.calls.map((c) => String(c[0])).join('\n');
        const parsed = JSON.parse(blob);
        expect(parsed.status).toBe('blocked');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
