// packages/cli/tests/commands/cleanup-duplication-baseline.test.ts
//
// Roadmap `duplication-baseline-ratchet`: `harness cleanup -t duplication`
// records a baseline (`--update-baseline`) and reports the delta against it —
// through the REAL loader, analyzer and clone detector on a copied fixture.
// Advisory only (D4 / ADR 0134): the delta never reaches totalIssues.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runCleanup, createCleanupCommand } from '../../src/commands/cleanup';
import { DUPLICATION_BASELINE_PATH } from '../../src/shared/duplication-baseline';

const FIXTURE = path.join(__dirname, '../fixtures/duplication-cli-project');

let projectDir: string;

/** A second clone class with a different token stream from the fixture's. */
function cloneSource(name: string): string {
  return [
    `export function ${name}(values: number[], limit: number): number[] {`,
    '  const out: number[] = [];',
    '  for (let i = 0; i < values.length; i++) {',
    '    const value = values[i] * 2 + 1;',
    '    if (value > limit && out.length < 10) {',
    '      out.push(value - limit);',
    '    } else {',
    '      out.push(limit);',
    '    }',
    '  }',
    '  return out.reverse();',
    '}',
    '',
  ].join('\n');
}

function addSecondClass(): void {
  for (const name of ['scaleOne', 'scaleTwo', 'scaleThree']) {
    fs.writeFileSync(path.join(projectDir, 'src', `${name}.ts`), cloneSource(name));
  }
}

async function run(opts: { updateBaseline?: boolean; type?: 'duplication' | 'drift' } = {}) {
  return runCleanup({
    configPath: path.join(projectDir, 'harness.config.json'),
    type: opts.type ?? 'duplication',
    ...(opts.updateBaseline && { updateBaseline: true }),
  });
}

describe('harness cleanup -t duplication — baseline delta (advisory)', () => {
  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dup-baseline-'));
    fs.cpSync(FIXTURE, projectDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('advertises --update-baseline on the command', () => {
    const longs = createCleanupCommand().options.map((o) => o.long);
    expect(longs).toContain('--update-baseline');
  });

  it('reports "no-baseline" — not a zero delta — when none was recorded', async () => {
    const result = await run();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.duplicationBaseline).toEqual({
      status: 'no-baseline',
      path: DUPLICATION_BASELINE_PATH,
    });
  });

  it('writes the baseline with --update-baseline, then compares at zero', async () => {
    const recorded = await run({ updateBaseline: true });
    expect(recorded.ok).toBe(true);
    const file = path.join(projectDir, DUPLICATION_BASELINE_PATH);
    expect(fs.existsSync(file)).toBe(true);
    const baseline = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(baseline.version).toBe(1);
    expect(Object.keys(baseline.classes)).toHaveLength(1);
    expect(Object.values(baseline.classes)[0]).toMatchObject({ memberCount: 3 });

    const again = await run();
    if (!again.ok) throw again.error;
    expect(again.value.duplicationBaseline).toMatchObject({
      status: 'compared',
      classDelta: 0,
      added: [],
      removed: [],
      baselineClasses: 1,
      currentClasses: 1,
    });
  });

  it('reports +1 for a new clone class and keeps it OUT of totalIssues (D4)', async () => {
    await run({ updateBaseline: true });
    addSecondClass();
    const result = await run();
    if (!result.ok) throw result.error;
    expect(result.value.duplication?.classes).toHaveLength(2);
    expect(result.value.duplicationBaseline).toMatchObject({
      status: 'compared',
      classDelta: 1,
      removed: [],
      currentClasses: 2,
    });
    if (result.value.duplicationBaseline?.status !== 'compared') throw new Error('not compared');
    expect(result.value.duplicationBaseline.added).toHaveLength(1);
    expect(result.value.duplicationBaseline.rankTotalDelta).toBeGreaterThan(0);
    expect(result.value.totalIssues).toBe(0);
  });

  it('reports -1 when a recorded class is gone', async () => {
    await run({ updateBaseline: true });
    // Two copies remain, below the default minInstances of 3, so the class is gone.
    fs.rmSync(path.join(projectDir, 'src', 'gamma.ts'));
    fs.writeFileSync(
      path.join(projectDir, 'src', 'index.ts'),
      "export { totalAlpha } from './alpha';\nexport { accumulateBeta } from './beta';\n"
    );
    const result = await run();
    if (!result.ok) throw result.error;
    expect(result.value.duplicationBaseline).toMatchObject({
      status: 'compared',
      classDelta: -1,
      added: [],
      baselineClasses: 1,
      currentClasses: 0,
    });
    if (result.value.duplicationBaseline?.status !== 'compared') throw new Error('not compared');
    expect(result.value.duplicationBaseline.removed).toHaveLength(1);
  });

  it('reports a corrupt baseline as unreadable, not as a zero delta', async () => {
    const file = path.join(projectDir, DUPLICATION_BASELINE_PATH);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ not json');
    const result = await run();
    if (!result.ok) throw result.error;
    expect(result.value.duplicationBaseline?.status).toBe('unreadable');
  });

  it('refuses --update-baseline when the duplication detector did not run', async () => {
    const result = await run({ type: 'drift', updateBaseline: true });
    expect(result.ok).toBe(false);
    expect(fs.existsSync(path.join(projectDir, DUPLICATION_BASELINE_PATH))).toBe(false);
  });
});
