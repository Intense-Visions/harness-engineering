/**
 * Non-source files are not dependency-graph nodes (#2671).
 *
 * Layer globs such as `src/types/**` also match `.gitkeep`, Markdown and JSON.
 * `buildDependencyGraph` put every matched path into `graph.nodes`, so the
 * `check_dependencies` MCP tool listed `src/types/.gitkeep` as a module of a
 * freshly scaffolded project. Real engine, real tmp-dir fixture.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { validateDependencies, defineLayer } from '../../src/constraints/dependencies';
import { TypeScriptParser } from '../../src/shared/parsers';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-2671-nodes-'));
  fs.mkdirSync(path.join(root, 'src/types'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/types/.gitkeep'), '');
  fs.writeFileSync(path.join(root, 'src/types/README.md'), '# types\n');
  fs.writeFileSync(path.join(root, 'src/domain/.gitkeep'), '');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function validate() {
  return validateDependencies({
    layers: [
      defineLayer('types', ['src/types/**'], []),
      defineLayer('domain', ['src/domain/**'], ['types']),
    ],
    rootDir: root,
    parser: new TypeScriptParser(),
    fallbackBehavior: 'skip',
  });
}

const rel = (p: string): string => path.relative(root, p).replace(/\\/g, '/');

describe('dependency graph nodes are source modules only (#2671)', () => {
  it('does not list .gitkeep or Markdown as graph nodes', async () => {
    const result = await validate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.graph.nodes.map(rel)).toEqual([]);
    expect(result.value.analyzedFiles).toBe(0);
  });

  it('positive control: a real source file is still a node', async () => {
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const order = 1;\n');
    const result = await validate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.graph.nodes.map(rel)).toEqual(['src/domain/order.ts']);
    expect(result.value.analyzedFiles).toBe(1);
  });
});
