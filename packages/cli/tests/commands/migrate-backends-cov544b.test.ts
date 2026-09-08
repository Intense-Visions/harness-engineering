import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runMigrateBackends, createBackendsSubcommand } from '../../src/commands/migrate-backends';

let tmp: string;
let logOutput: string[];
let errOutput: string[];
let exitCode: number | undefined;

const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
  logOutput.push(a.map(String).join(' '));
});
const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  errOutput.push(a.map(String).join(' '));
});
const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
  exitCode = code;
  throw new Error('exit:' + code);
}) as never);

function writeOrchestratorMd(yaml: string): void {
  fs.writeFileSync(
    path.join(tmp, 'harness.orchestrator.md'),
    `---\n${yaml}\n---\n\nprompt template`
  );
}
function writeConfigJson(obj: object): void {
  fs.writeFileSync(path.join(tmp, 'harness.config.json'), JSON.stringify(obj, null, 2));
}

function run(args: string[]): Promise<unknown> {
  const parent = new Command();
  parent.addCommand(createBackendsSubcommand());
  parent.exitOverride();
  return parent.parseAsync(['backends', ...args], { from: 'user' });
}

beforeEach(() => {
  vi.clearAllMocks();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-backends-cov544b-'));
  vi.spyOn(process, 'cwd').mockReturnValue(tmp);
  logOutput = [];
  errOutput = [];
  exitCode = undefined;
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

afterAll(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  exitSpy.mockRestore();
});

describe('createBackendsSubcommand action (cov544b)', () => {
  it('migrates and exits SUCCESS with an informational message', async () => {
    writeOrchestratorMd('agent:\n  backends:\n    primary: { type: claude, command: claude }');
    writeConfigJson({ version: 1 });
    await expect(run([])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
    expect(logOutput.join('\n')).toContain('Migrated 1 backend');
  });

  it('logs an error and exits ERROR when harness.config.json is missing', async () => {
    writeOrchestratorMd('agent:\n  backends:\n    primary: { type: claude }');
    await expect(run([])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
    expect(errOutput.join('\n')).toContain('harness.config.json not found');
  });

  it('dry-run action reports the plan (including routing) and exits SUCCESS', async () => {
    writeOrchestratorMd(
      [
        'agent:',
        '  backends:',
        '    primary: { type: claude }',
        '  routing:',
        '    default: primary',
      ].join('\n')
    );
    writeConfigJson({ version: 1 });
    await expect(run(['--dry-run'])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('dry run');
    expect(out).toContain('Would also copy agent.routing.');
  });
});

describe('runMigrateBackends edge branches (cov544b)', () => {
  it('errors on invalid JSON in harness.config.json', async () => {
    writeOrchestratorMd('agent:\n  backends:\n    primary: { type: claude }');
    fs.writeFileSync(path.join(tmp, 'harness.config.json'), '{ not valid json ');
    const r = await runMigrateBackends({ cwd: tmp });
    expect(r.status).toBe('error');
    expect(r.message).toContain('not valid JSON');
  });

  it('errors when harness.config.json cannot be read (path is a directory)', async () => {
    writeOrchestratorMd('agent:\n  backends:\n    primary: { type: claude }');
    // Make the config path an unreadable directory → readFileSync throws EISDIR.
    fs.mkdirSync(path.join(tmp, 'harness.config.json'));
    const r = await runMigrateBackends({ cwd: tmp });
    expect(r.status).toBe('error');
    expect(r.message).toContain('Failed to read');
  });

  it('migrates without routing when the frontmatter has no agent.routing', async () => {
    writeOrchestratorMd('agent:\n  backends:\n    primary: { type: claude }');
    writeConfigJson({ version: 1 });
    const r = await runMigrateBackends({ cwd: tmp });
    expect(r.status).toBe('ok');
    const written = JSON.parse(fs.readFileSync(path.join(tmp, 'harness.config.json'), 'utf-8')) as {
      agent: Record<string, unknown>;
    };
    expect(written.agent.backends).toBeDefined();
    expect(written.agent).not.toHaveProperty('routing');
  });

  it('treats a non-object agent block as no routing to copy', async () => {
    // agent is a scalar in the routing-read pass → readRouting returns null.
    // backends are still read by the (separate) reader, so this stays a migrate.
    writeOrchestratorMd('agent:\n  backends:\n    primary: { type: claude }\nother: 1');
    writeConfigJson({ version: 1 });
    const r = await runMigrateBackends({ cwd: tmp });
    expect(r.status).toBe('ok');
  });

  it('copies routing when present in the frontmatter', async () => {
    writeOrchestratorMd(
      [
        'agent:',
        '  backends:',
        '    primary: { type: claude }',
        '  routing:',
        '    default: primary',
      ].join('\n')
    );
    writeConfigJson({ version: 1 });
    const r = await runMigrateBackends({ cwd: tmp });
    expect(r.status).toBe('ok');
    expect(r.message).toContain('+ routing');
    const written = JSON.parse(fs.readFileSync(path.join(tmp, 'harness.config.json'), 'utf-8')) as {
      agent: { routing: { default: string } };
    };
    expect(written.agent.routing.default).toBe('primary');
  });
});
