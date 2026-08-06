import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  runCliErgonomicsCraft,
  critiqueCommandFile,
  collectCliErgonomicsCraftPrompts,
  finalizeCliErgonomicsCraft,
} from '../../src/cli-ergonomics-craft';
import { MockLlmProvider, InSessionLlmProvider } from '../../src/shared/craft/llm/provider';

const LEAF = "new Command('build').option('--out <f>').action(async () => {});";
const GROUP = "new Command('db').addCommand(a).addCommand(b);";

describe('runCliErgonomicsCraft (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-craft-int-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('empty project: zero findings, zero LLM calls, exemplar count reported', async () => {
    const out = await runCliErgonomicsCraft({ path: tmpDir });
    expect(out.findings).toEqual([]);
    expect(out.summary.counts.filesScanned).toBe(0);
    expect(out.summary.llmCalls.count).toBe(0);
    expect(out.summary.catalog.exemplarsAvailable).toBe(5);
  });

  it('walks a command and emits findings via mock provider', async () => {
    writeFile('src/commands/build.ts', LEAF);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'CLI-R001',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"--out breaks the --output convention"}\n```',
      },
    ]);
    const out = await runCliErgonomicsCraft({ path: tmpDir, __testProvider: provider });
    expect(out.summary.counts.filesScanned).toBe(1);
    const r001 = out.findings.find((f) => f.code === 'CLI-R001');
    expect(r001).toBeDefined();
    expect(r001!.target.relative).toBe('src/commands/build.ts');
    expect(r001!.target.kind).toBe('leaf');
  });

  it('applies kind-filtered rubrics: leaf gets all 7, group gets only 2', async () => {
    writeFile('src/commands/build.ts', LEAF);
    const leafOut = await runCliErgonomicsCraft({ path: tmpDir });
    expect(leafOut.summary.llmCalls.count).toBe(7);
    expect(leafOut.summary.catalog.rubricsApplied).toContain('CLI-R007');

    fs.rmSync(path.join(tmpDir, 'src/commands/build.ts'));
    writeFile('src/commands/db.ts', GROUP);
    const groupOut = await runCliErgonomicsCraft({ path: tmpDir });
    expect(groupOut.summary.llmCalls.count).toBe(2);
    expect(groupOut.summary.catalog.rubricsApplied).toEqual(['CLI-R001', 'CLI-R002']);
    expect(groupOut.summary.catalog.rubricsApplied).not.toContain('CLI-R007');
  });

  it('excludes tests and barrels from the walk', async () => {
    writeFile('src/commands/real.ts', LEAF);
    writeFile('src/commands/real.test.ts', LEAF);
    writeFile('src/commands/_registry.ts', GROUP);
    const out = await runCliErgonomicsCraft({ path: tmpDir });
    expect(out.summary.counts.filesScanned).toBe(1);
    for (const f of out.findings) {
      expect(f.target.relative).toBe('src/commands/real.ts');
    }
  });

  it('honors maxFiles cap', async () => {
    for (let i = 0; i < 5; i++) writeFile(`src/commands/cmd-${i}.ts`, LEAF);
    const out = await runCliErgonomicsCraft({ path: tmpDir, maxFiles: 2 });
    expect(out.summary.counts.filesScanned).toBe(2);
  });

  it('honors an explicit commandsDir', async () => {
    writeFile('src/commands/ignored.ts', LEAF);
    writeFile('tools/mycli/run.ts', LEAF);
    const out = await runCliErgonomicsCraft({ path: tmpDir, commandsDir: 'tools/mycli' });
    expect(out.summary.counts.filesScanned).toBe(1);
  });

  it('emits a CliErgonomicsFinding with all 3 axes present (ADR 0019)', async () => {
    writeFile('src/commands/build.ts', LEAF);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'CLI-R001',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"low","message":"x"}\n```',
      },
    ]);
    const out = await runCliErgonomicsCraft({ path: tmpDir, __testProvider: provider });
    const f = out.findings.find((finding) => finding.code === 'CLI-R001');
    expect(f).toBeDefined();
    expect(f!.tier).toBe('foundational');
    expect(f!.impact).toBe('large');
    expect(f!.confidence).toBe('low');
    expect(f!.cite.rubricId).toMatch(/^CLI-R/);
  });

  it('reports cost telemetry from the provider', async () => {
    writeFile('src/commands/build.ts', LEAF);
    const out = await runCliErgonomicsCraft({ path: tmpDir });
    expect(out.summary.llmCalls.provider).toBe('mock');
    expect(out.summary.llmCalls.count).toBeGreaterThan(0);
  });

  it('cross-cutting critiqueCommandFile works on a single file', async () => {
    writeFile('src/commands/build.ts', LEAF);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'CLI-R001',
        response:
          '```json\n{"tier":"polish","impact":"small","confidence":"medium","message":"hi"}\n```',
      },
    ]);
    const findings = await critiqueCommandFile(path.join(tmpDir, 'src/commands/build.ts'), {
      relative: 'src/commands/build.ts',
      provider,
    });
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it('files override scopes critique to caller-supplied list', async () => {
    writeFile('src/commands/a.ts', LEAF);
    writeFile('src/commands/b.ts', LEAF);
    const out = await runCliErgonomicsCraft({
      path: tmpDir,
      files: [path.join(tmpDir, 'src/commands/a.ts')],
    });
    expect(out.summary.counts.filesScanned).toBe(1);
  });
});

// The default runtime provider is in-session (host-chat). Before the fix,
// runCliErgonomicsCraft swallowed the deferral in a bare catch and returned a
// zero-finding SUCCESS — a silent no-op. These tests pin the corrected
// two-step collect→finalize behavior.
describe('runCliErgonomicsCraft (in-session default path)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-craft-insession-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('inline entry throws a loud guard under the in-session provider (never a silent [])', async () => {
    writeFile('src/commands/build.ts', LEAF);
    await expect(
      runCliErgonomicsCraft({ path: tmpDir, __testProvider: new InSessionLlmProvider() })
    ).rejects.toThrow(/two-step flow/);
  });

  it('collect returns pending prompts instead of empty findings', async () => {
    writeFile('src/commands/build.ts', LEAF);
    const collected = await collectCliErgonomicsCraftPrompts({ path: tmpDir });
    expect(collected.status).toBe('collected');
    expect(collected.pendingPrompts.length).toBeGreaterThan(0);
    expect(collected.runId).toBeTruthy();
  });

  it('round-trips collect → finalize into real findings', async () => {
    writeFile('src/commands/build.ts', LEAF);
    const collected = await collectCliErgonomicsCraftPrompts({ path: tmpDir });
    const responses = collected.pendingPrompts.map((p, i) => ({
      promptId: p.promptId,
      raw:
        i === 0
          ? '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"--out breaks --output convention"}\n```'
          : '```json\nnull\n```',
    }));
    const out = await finalizeCliErgonomicsCraft({
      path: tmpDir,
      runId: collected.runId,
      responses,
    });
    expect(out.findings.length).toBeGreaterThanOrEqual(1);
    expect(out.summary.runId).toBe(collected.runId);
    expect(out.summary.llmCalls.provider).toBe('in-session');
    expect(out.findings[0]!.target.relative).toBe('src/commands/build.ts');
  });
});
