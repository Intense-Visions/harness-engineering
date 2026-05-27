import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runMigrateBackends } from '../../src/commands/migrate-backends';

describe('migrate-backends', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-backends-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function writeOrchestratorMd(yaml: string): void {
    fs.writeFileSync(
      path.join(tmp, 'harness.orchestrator.md'),
      `---\n${yaml}\n---\n\nprompt template`
    );
  }

  function writeConfigJson(obj: object): void {
    fs.writeFileSync(path.join(tmp, 'harness.config.json'), JSON.stringify(obj, null, 2));
  }

  it('no-ops when harness.orchestrator.md does not exist', async () => {
    const r = await runMigrateBackends({ cwd: tmp });
    expect(r.status).toBe('noop');
    expect(r.message).toMatch(/No harness.orchestrator.md/);
  });

  it('no-ops when orchestrator.md has no agent.backends', async () => {
    writeOrchestratorMd('tracker:\n  kind: roadmap');
    writeConfigJson({ version: 1 });
    const r = await runMigrateBackends({ cwd: tmp });
    expect(r.status).toBe('noop');
  });

  it('errors when harness.config.json is missing', async () => {
    writeOrchestratorMd('agent:\n  backends:\n    primary: { type: claude, command: claude }');
    const r = await runMigrateBackends({ cwd: tmp });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/harness.config.json not found/);
  });

  it('copies backends into harness.config.json', async () => {
    writeOrchestratorMd(
      [
        'agent:',
        '  backends:',
        '    primary: { type: claude, command: claude }',
        '    ollama:',
        '      type: local',
        '      endpoint: http://localhost:11434/v1',
        '      model: deepseek-coder-v2',
      ].join('\n')
    );
    writeConfigJson({ version: 1 });
    const r = await runMigrateBackends({ cwd: tmp });
    expect(r.status).toBe('ok');

    const written = JSON.parse(fs.readFileSync(path.join(tmp, 'harness.config.json'), 'utf-8')) as {
      agent: { backends: Record<string, unknown> };
    };
    expect(written.agent.backends).toBeDefined();
    expect(Object.keys(written.agent.backends)).toEqual(['primary', 'ollama']);
    expect((written.agent.backends.ollama as Record<string, unknown>).type).toBe('local');
  });

  it('copies routing when present', async () => {
    writeOrchestratorMd(
      [
        'agent:',
        '  backends:',
        '    primary: { type: claude, command: claude }',
        '  routing:',
        '    default: primary',
      ].join('\n')
    );
    writeConfigJson({ version: 1 });
    const r = await runMigrateBackends({ cwd: tmp });
    expect(r.status).toBe('ok');

    const written = JSON.parse(fs.readFileSync(path.join(tmp, 'harness.config.json'), 'utf-8')) as {
      agent: { routing: { default: string } };
    };
    expect(written.agent.routing.default).toBe('primary');
  });

  it('refuses to overwrite existing agent.backends without --force', async () => {
    writeOrchestratorMd('agent:\n  backends:\n    primary: { type: claude }');
    writeConfigJson({
      version: 1,
      agent: { executor: 'subprocess', backends: { existing: { type: 'mock' } } },
    });
    const r = await runMigrateBackends({ cwd: tmp });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/already declares agent.backends/);
  });

  it('overwrites with --force', async () => {
    writeOrchestratorMd('agent:\n  backends:\n    primary: { type: claude }');
    writeConfigJson({
      version: 1,
      agent: { executor: 'subprocess', backends: { existing: { type: 'mock' } } },
    });
    const r = await runMigrateBackends({ cwd: tmp, force: true });
    expect(r.status).toBe('ok');
    const written = JSON.parse(fs.readFileSync(path.join(tmp, 'harness.config.json'), 'utf-8')) as {
      agent: { backends: Record<string, unknown> };
    };
    expect(written.agent.backends).toHaveProperty('primary');
    expect(written.agent.backends).not.toHaveProperty('existing');
  });

  it('dry-run does not write the file', async () => {
    writeOrchestratorMd('agent:\n  backends:\n    primary: { type: claude }');
    writeConfigJson({ version: 1 });
    const before = fs.readFileSync(path.join(tmp, 'harness.config.json'), 'utf-8');
    const r = await runMigrateBackends({ cwd: tmp, dryRun: true });
    expect(r.status).toBe('ok');
    expect(r.message).toMatch(/dry-run/);
    const after = fs.readFileSync(path.join(tmp, 'harness.config.json'), 'utf-8');
    expect(after).toBe(before);
  });
});
