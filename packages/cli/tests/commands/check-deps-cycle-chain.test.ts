import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runCheckDeps } from '../../src/commands/check-deps';

/**
 * Regression coverage for #2329: `check-deps` printed cycle chains that did not
 * close on the start node (`b -> a -> a`) and used absolute paths while the
 * finding's header (`file`) was repo-relative.
 */
describe('check-deps cycle chain (#2329)', () => {
  let root: string;

  function writeProject(dir: string, files: Record<string, string>): void {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ version: 1, rootDir: '.', name: path.basename(dir) })
    );
    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, 'src', name), body);
    }
  }

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-deps-2329-'));
    writeProject(path.join(root, 'two'), {
      'a.ts': "import { b } from './b.js';\nexport const a = (): number => b() + 1;\n",
      'b.ts': "import { a } from './a.js';\nexport const b = (): number => (a ? 1 : 0);\n",
    });
    writeProject(path.join(root, 'three'), {
      'a.ts': "import { b } from './b.js';\nexport const a = (): number => b();\n",
      'b.ts': "import { c } from './c.js';\nexport const b = (): number => c();\n",
      'c.ts': "import { a } from './a.js';\nexport const c = (): number => (a ? 1 : 0);\n",
    });
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function cycleOf(name: string) {
    const cwd = path.join(root, name);
    const result = await runCheckDeps({ configPath: path.join(cwd, 'harness.config.json'), cwd });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.circularDeps).toHaveLength(1);
    return result.value.circularDeps[0]!;
  }

  function expectClosedRelativeMessage(
    dep: { cycle: string[]; file: string; message: string },
    size: number
  ): void {
    const prefix = 'Circular dependency: ';
    expect(dep.message.startsWith(prefix)).toBe(true);
    const chain = dep.message.slice(prefix.length).split(' -> ');
    expect(chain).toHaveLength(size + 1);
    // Closes on its first node, and that node is the header file.
    expect(chain[chain.length - 1]).toBe(chain[0]);
    expect(chain[0]).toBe(dep.file);
    expect(new Set(chain.slice(0, -1)).size).toBe(size);
    // Repo-relative posix paths, like the header line.
    for (const p of chain) {
      expect(path.isAbsolute(p)).toBe(false);
      expect(p).toMatch(/^src\/[abc]\.ts$/);
    }
    // The structured chain closes on its first node too.
    expect(dep.cycle[dep.cycle.length - 1]).toBe(dep.cycle[0]);
  }

  it('renders a 2-file cycle as a closed, repo-relative chain', async () => {
    expectClosedRelativeMessage(await cycleOf('two'), 2);
  });

  it('renders a 3-file cycle as a closed, repo-relative chain', async () => {
    expectClosedRelativeMessage(await cycleOf('three'), 3);
  });
});
