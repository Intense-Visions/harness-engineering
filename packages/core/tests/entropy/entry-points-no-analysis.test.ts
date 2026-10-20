import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildSnapshot } from '../../src/entropy/snapshot';
import { detectDeadCode } from '../../src/entropy/detectors/dead-code';
import { TypeScriptParser } from '../../src/shared/parsers';

/**
 * #2275, end to end: can an operator tell "no dead code" from "no analysis"?
 *
 * The two configurations below describe the SAME project. One lists a concrete
 * entry point; the other lists the glob an adopter would reasonably assume the
 * field accepts, given it takes an array of paths. Before the fix both produced
 * an `Ok` snapshot, and the glob one produced wholesale dead-export noise —
 * `helper` and `main` are both live, reached from `src/index.ts` — while the
 * surrounding gate still had no error to report.
 *
 * The discriminator asserted here is a NAMED finding on one side and a NAMED
 * unresolvable entry on the other, never a count of zero: a zero is exactly what
 * the defect produces, so it cannot tell the two apart.
 */

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'entry-points-e2e-'));
  const write = (rel: string, contents: string): void => {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  };
  write('package.json', JSON.stringify({ name: 'e2e-fixture' }));
  write(
    'src/index.ts',
    "import { helper } from './helper';\nexport function main(): string {\n  return helper();\n}\n"
  );
  write('src/helper.ts', "export function helper(): string {\n  return 'ok';\n}\n");
  write('src/orphan.ts', 'export function strandedExport(): number {\n  return 1;\n}\n');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const snapshotFor = (entryPoints: string[]) =>
  buildSnapshot({
    rootDir: root,
    parser: new TypeScriptParser(),
    analyze: { deadCode: true },
    include: ['src/**/*.ts'],
    entryPoints,
  });

describe('entropy analysis over an unresolvable entry point (#2275)', () => {
  it('reports the one genuinely dead export when the entry point resolves', async () => {
    const snapshot = await snapshotFor(['src/index.ts']);
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    expect(snapshot.value.entryPoints).toEqual([path.resolve(root, 'src/index.ts')]);

    const dead = await detectDeadCode(snapshot.value);
    expect(dead.ok).toBe(true);
    if (!dead.ok) return;

    const names = dead.value.deadExports.map((e) => e.name);
    // Positive: the stranded export IS named. Negative controls: the two live
    // symbols are not, which is what the glob configuration got wrong.
    expect(names).toContain('strandedExport');
    expect(names).not.toContain('helper');
    expect(names).not.toContain('main');
  });

  it('refuses to produce a report at all when the entry point is a glob', async () => {
    const snapshot = await snapshotFor(['src/**/*.ts']);

    expect(snapshot.ok).toBe(false);
    if (snapshot.ok) return;
    expect(snapshot.error.code).toBe('ENTRY_POINT_NOT_FOUND');
    expect(snapshot.error.details.issues).toEqual(['src/**/*.ts']);
    // This Err is what `runEntropyCheck`/`runPerfCheck` convert into an
    // abstention (`skipReason`), which `deriveExitCode` maps to
    // ZERO_DENOMINATOR — so the operator sees "did not run", not "clean".
    expect(snapshot.error.suggestions.join('\n')).toContain(
      'entryPoints are literal file paths, never glob patterns'
    );
  });
});
