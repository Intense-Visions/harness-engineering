// packages/cli/tests/commands/cleanup-entropy-enabled.test.ts
//
// Issue #2633: `entropy.enabled: false` declares the drift / dead-code gate
// NOT APPLICABLE (schema.ts, #2071) — every language-base template ships it —
// yet `harness cleanup` and the `detect_entropy` MCP tool never read the key
// and ran the TypeScript analyzers anyway, reporting their output as findings.
//
// Real loader, real analyzer, real temp project — no mocks. The fixture has a
// genuine dead file and a genuine drift reference, so a run that ignores the
// key is observable as findings rather than as an empty report.
//
// MUTATIONS these rows fail against:
//   - dropping the gate from `runCleanup` fails every `cleanup` row under
//     `enabled: false` (the dead file comes back as a finding);
//   - dropping the explicit-request refusal fails the refusal rows (the
//     command runs and returns Ok);
//   - dropping the gate from `handleDetectEntropy` fails the MCP rows;
//   - gating on `enabled !== true` instead of `=== false` fails the
//     "absent" positive controls.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runCleanup, printCleanupResult } from '../../src/commands/cleanup';
import { handleDetectEntropy } from '../../src/mcp/tools/entropy';
import { OutputFormatter, OutputMode } from '../../src/output/formatter';

let projectDir: string;

function write(rel: string, content: string): void {
  const file = path.join(projectDir, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeFixture(entropy: Record<string, unknown> | undefined): void {
  write(
    'harness.config.json',
    JSON.stringify(
      {
        version: 1,
        rootDir: '.',
        docsDir: './docs',
        ...(entropy && { entropy: { entryPoints: ['src/index.ts'], ...entropy } }),
        ...(!entropy && { performance: { entryPoints: ['src/index.ts'] } }),
      },
      null,
      2
    )
  );
  write('src/index.ts', "export { realFunction } from './real';\n");
  write('src/real.ts', 'export function realFunction(): number {\n  return 1;\n}\n');
  // In scope and unreferenced: one dead file.
  write('src/orphan.ts', 'export function orphanHelper(): number {\n  return 2;\n}\n');
  // One genuine drift reference.
  write('docs/guide.md', '# Guide\n\nCall `realFunction` here, not `vanishedFunction`.\n');
}

function cleanup(type: 'all' | 'drift' | 'dead-code' | 'patterns' | 'duplication') {
  return runCleanup({
    cwd: projectDir,
    configPath: path.join(projectDir, 'harness.config.json'),
    type,
  });
}

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-entropy-enabled-'));
});

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true });
});

describe('harness cleanup honours `entropy.enabled: false` (#2633)', () => {
  it('-t all runs no gating analyzer and says the gate is disabled by config', async () => {
    writeFixture({ enabled: false });
    const result = await cleanup('all');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.ran).toEqual({
      drift: false,
      deadCode: false,
      patterns: false,
      duplication: false,
    });
    expect(result.value.deadCode).toEqual([]);
    expect(result.value.driftIssues).toEqual([]);
    expect(result.value.totalIssues).toBe(0);
    // Visible, not a silent zero.
    expect(result.value.disabledByConfig).toMatch(/entropy\.enabled: false/);

    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => void lines.push(args.join(' '));
    try {
      printCleanupResult(result.value, new OutputFormatter(OutputMode.TEXT));
    } finally {
      console.log = original;
    }
    const printed = lines.join('\n');
    expect(printed).toMatch(/not checked/);
    expect(printed).toMatch(/entropy\.enabled: false/);
    expect(printed).not.toMatch(/Entropy issues: 0/);
  });

  for (const type of ['drift', 'dead-code', 'patterns'] as const) {
    it(`an explicit -t ${type} refuses rather than running`, async () => {
      writeFixture({ enabled: false });
      const result = await cleanup(type);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/entropy\.enabled: false/);
      expect(result.error.message).toMatch(/Refusing/);
    });
  }

  it('-t duplication is governed by `entropy.duplication`, not by `entropy.enabled`', async () => {
    writeFixture({ enabled: false });
    const result = await cleanup('duplication');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ran.duplication).toBe(true);
    expect(result.value.disabledByConfig).toBeUndefined();
  });

  it('positive control: `enabled: true` runs the analyzers and finds the dead file', async () => {
    writeFixture({ enabled: true });
    const result = await cleanup('all');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ran.deadCode).toBe(true);
    expect(result.value.deadCode.map((d) => d.file.replaceAll('\\', '/'))).toContainEqual(
      expect.stringMatching(/src\/orphan\.ts$/)
    );
    expect(result.value.disabledByConfig).toBeUndefined();
  });

  it('positive control: an absent entropy block runs the analyzers', async () => {
    writeFixture(undefined);
    const result = await cleanup('dead-code');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ran.deadCode).toBe(true);
    expect(result.value.deadCode.length).toBeGreaterThan(0);
  });
});

describe('detect_entropy honours `entropy.enabled: false` (#2633)', () => {
  it('type "all" in summary mode reports the gate disabled, with no categories run', async () => {
    writeFixture({ enabled: false });
    const result = await handleDetectEntropy({ path: projectDir, type: 'all', mode: 'summary' });
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(payload.disabledByConfig).toMatch(/entropy\.enabled: false/);
    expect(payload.totalIssues).toBe(0);
    expect(payload.categories ?? {}).toEqual({});
  });

  it('type "all" in detailed mode reports the gate disabled rather than findings', async () => {
    writeFixture({ enabled: false });
    const result = await handleDetectEntropy({ path: projectDir, type: 'all' });
    expect(result.isError).toBeFalsy();
    const text = result.content[0]!.text;
    expect(text).toMatch(/entropy\.enabled: false/);
    expect(text).not.toMatch(/orphan\.ts/);
  });

  for (const type of ['drift', 'dead-code', 'patterns'] as const) {
    it(`an explicit type "${type}" refuses rather than running`, async () => {
      writeFixture({ enabled: false });
      const result = await handleDetectEntropy({ path: projectDir, type, mode: 'summary' });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/entropy\.enabled: false/);
    });
  }

  it('positive control: `enabled: true` reports the dead file', async () => {
    writeFixture({ enabled: true });
    const result = await handleDetectEntropy({ path: projectDir, type: 'all', mode: 'summary' });
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text) as {
      totalIssues: number;
      disabledByConfig?: string;
    };
    expect(payload.totalIssues).toBeGreaterThan(0);
    expect(payload.disabledByConfig).toBeUndefined();
  });
});
