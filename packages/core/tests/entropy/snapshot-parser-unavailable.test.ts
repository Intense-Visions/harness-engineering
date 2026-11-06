/**
 * The entropy snapshot must fail closed when the parser cannot run at all.
 *
 * `parseSourceFiles` skips files that fail to parse. That is right for a syntax
 * error in one file. Once `TypeScriptParser` resolved estree lazily (#2267), a
 * missing install also arrived as a per-file error, so every file was skipped,
 * the snapshot had no files and no edges, and `harness cleanup` reported zero
 * dead code at exit 0 over a tree it never read.
 *
 * Each case pairs the unavailable parser with a healthy one over the SAME input,
 * so the fixture gives a different answer in the two states.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';
import { parseSourceFiles, buildSnapshot } from '../../src/entropy/snapshot';
import { TypeScriptParser } from '../../src/shared/parsers/typescript';

const LOAD_FAILURE = "Cannot find module '@typescript-eslint/typescript-estree'";

function unavailableParser(): TypeScriptParser {
  return new TypeScriptParser(() => Promise.reject(new Error(LOAD_FAILURE)));
}

describe('parseSourceFiles and buildSnapshot with an unavailable parser (#2267)', () => {
  let root: string;
  let good: string;
  let broken: string;

  beforeEach(async () => {
    root = await fsp.mkdtemp(join(os.tmpdir(), 'snapshot-unavail-'));
    await fsp.mkdir(join(root, 'src'), { recursive: true });
    good = join(root, 'src', 'index.ts');
    broken = join(root, 'src', 'broken.ts');
    await fsp.writeFile(good, "import { dep } from './dep';\nexport const fine = dep;\n");
    await fsp.writeFile(join(root, 'src', 'dep.ts'), 'export const dep = 1;\n');
    await fsp.writeFile(broken, 'export const = ;\n');
    await fsp.writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'fx', main: 'src/index.ts' })
    );
  });
  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true });
  });

  it('skips a file with a syntax error but parses its siblings', async () => {
    const parser = new TypeScriptParser();
    const result = await parseSourceFiles([broken, good], () => parser);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.map((f) => f.path)).toEqual([good]);
    expect(result.value[0]!.imports.map((i) => i.source)).toEqual(['./dep']);
  });

  it('fails with the PARSER_UNAVAILABLE reason instead of returning no files', async () => {
    const parser = unavailableParser();
    const result = await parseSourceFiles([broken, good], () => parser);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('SNAPSHOT_BUILD_FAILED');
    expect(result.error.details.reason).toBe('PARSER_UNAVAILABLE');
    expect(result.error.message).toContain(LOAD_FAILURE);
  });

  it('buildSnapshot yields real files and edges when the parser is healthy', async () => {
    const result = await buildSnapshot({
      rootDir: root,
      parser: new TypeScriptParser(),
      include: ['src/**/*.ts'],
      analyze: { deadCode: true },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.files.length).toBe(2);
    expect(result.value.dependencyGraph.edges.length).toBe(1);
  });

  it('buildSnapshot fails closed instead of a snapshot with no files', async () => {
    const result = await buildSnapshot({
      rootDir: root,
      parser: unavailableParser(),
      include: ['src/**/*.ts'],
      analyze: { deadCode: true },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.details.reason).toBe('PARSER_UNAVAILABLE');
  });
});
