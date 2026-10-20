/**
 * `-c/--config` must select the PROJECT, not just the config FILE.
 *
 * This is the bug class `check-arch` was fixed out of under issue #911 (commit
 * 9f322084c: `options.cwd ?? path.dirname(configPath)`). The fix was copied
 * inline rather than shared, so the same split — config read from the `-c`
 * tree, measurement taken from `process.cwd()` — survived in a dozen sibling
 * commands. `check-docs` was the one reported (while reviewing #2282); the rest
 * were found by sweeping every command that pairs a `-c`-sourced config load
 * with a `process.cwd()` root.
 *
 * Every test here runs from the REAL `process.cwd()` (vitest's cwd for this
 * package is `packages/cli`) and points `-c` at a tmpdir fixture. There is no
 * `process.cwd` spy anywhere in this file, by design: a spy would hide exactly
 * the defect under test.
 *
 * FIXTURE CHOICE. The wrong answer has to be arithmetically unreachable from
 * the right one. An exit code is not enough on its own — `packages/cli` sits
 * below `check-docs`' 80% floor, so a scan of the WRONG directory also exits 1
 * (measured in #2282). So each case asserts a DENOMINATOR or a named finding
 * that only the fixture can produce: a one-file tree, or a violation at a path
 * that exists only in the tmpdir. `packages/cli` has 783 source files, so a
 * `toBe(1)` on a file count cannot be satisfied by coincidence; and it is also
 * immune to a zero-denominator abstention (#1146) being read as agreement.
 */
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { runCheckVocabulary } from '../../src/commands/check-vocabulary';
import { runAuditProtected } from '../../src/commands/audit-protected';
import { runCheckDeps } from '../../src/commands/check-deps';
import { runAdd } from '../../src/commands/add';
import { resolveProject } from '../../src/config/loader';

/** Make a tmpdir project, run `fn` with its config path, always clean up. */
async function withProject(
  config: Record<string, unknown>,
  seed: (root: string) => Promise<void>,
  fn: (configPath: string, root: string) => Promise<void>
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'harness-implied-root-'));
  try {
    await mkdir(path.join(root, 'src'), { recursive: true });
    await mkdir(path.join(root, 'docs'), { recursive: true });
    const configPath = path.join(root, 'harness.config.json');
    await writeFile(configPath, JSON.stringify({ version: 1, name: 'fixture', ...config }));
    await seed(root);
    // Guard the premise of every test below: if the suite ever ran FROM the
    // fixture, all of these assertions would be vacuous.
    expect(process.cwd()).not.toBe(root);
    await fn(configPath, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('-c selects the project root, not just the config file (#911 class)', () => {
  describe('resolveProject', () => {
    it('roots on the directory that owns an explicit config', async () => {
      await withProject(
        { rootDir: '.', docsDir: './docs' },
        async () => {},
        async (configPath, root) => {
          const result = resolveProject(configPath);
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value.root).toBe(root);
            expect(result.value.config.name).toBe('fixture');
          }
        }
      );
    });

    it('lets an explicit cwd override the implied root', async () => {
      await withProject(
        { rootDir: '.', docsDir: './docs' },
        async () => {},
        async (configPath) => {
          const result = resolveProject(configPath, '/explicit/override');
          expect(result.ok).toBe(true);
          if (result.ok) expect(result.value.root).toBe('/explicit/override');
        }
      );
    });
  });

  /**
   * `check-vocabulary` scans Markdown for deprecated terms. The discriminator is
   * a violation whose `file` is a path that exists ONLY in the fixture, plus a
   * `filesScanned` of exactly 1. Against `packages/cli` this rule matches
   * nothing (the term is nonsense) and the scan reads a different file set.
   */
  it('check-vocabulary scans the -c project', async () => {
    await withProject(
      {
        rootDir: '.',
        docsDir: './docs',
        vocabulary: {
          enabled: true,
          paths: ['docs/**/*.md'],
          exclude: ['**/node_modules/**'],
          rules: [{ deprecated: 'zorblax', canonical: 'widget', reason: 'fixture rule' }],
        },
      },
      async (root) => {
        await writeFile(path.join(root, 'docs/guide.md'), '# Guide\n\nUse the zorblax here.\n');
      },
      async (configPath) => {
        const result = await runCheckVocabulary({ configPath });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.filesScanned).toBe(1);
        expect(result.value.violations).toHaveLength(1);
        expect(result.value.violations[0]?.file).toContain('guide.md');
        expect(result.value.valid).toBe(false);
      }
    );
  });

  /**
   * `audit-protected` globs the project's source tree for `harness-ignore`
   * annotations. Discriminator: `fileCount` of exactly 1. `packages/cli` has
   * hundreds of matching source files, so the wrong root cannot produce 1.
   */
  it('audit-protected scans the -c project', async () => {
    await withProject(
      { rootDir: './src', docsDir: './docs' },
      async (root) => {
        await writeFile(
          path.join(root, 'src/thing.ts'),
          '// harness-ignore complexity: fixture region\nexport const thing = 1;\n'
        );
      },
      async (configPath) => {
        const result = await runAuditProtected({ configPath });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.fileCount).toBe(1);
        expect(result.value.regions).toHaveLength(1);
        expect(result.value.regions[0]?.file).toBe('thing.ts');
      }
    );
  });

  /**
   * `check-deps` walks the project's module graph. Discriminator:
   * `modulesAnalyzed` of exactly 4 — the deterministic module count for this
   * two-file / two-layer fixture. `packages/cli` analyses hundreds, so a
   * single-digit count can only come from the fixture.
   */
  it('check-deps analyses the -c project', async () => {
    await withProject(
      {
        rootDir: './src',
        docsDir: './docs',
        layers: [
          { name: 'app', pattern: 'app/**', allowedDependencies: ['lib'] },
          { name: 'lib', pattern: 'lib/**', allowedDependencies: [] },
        ],
      },
      async (root) => {
        await mkdir(path.join(root, 'src/app'), { recursive: true });
        await mkdir(path.join(root, 'src/lib'), { recursive: true });
        await writeFile(
          path.join(root, 'src/app/main.ts'),
          "import { helper } from '../lib/helper';\nexport const main = () => helper();\n"
        );
        await writeFile(path.join(root, 'src/lib/helper.ts'), 'export const helper = () => 1;\n');
      },
      async (configPath) => {
        const result = await runCheckDeps({ configPath });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.modulesAnalyzed).toBe(4);
        expect(result.value.layersConfigured).toBe(2);
      }
    );
  });

  /**
   * `add` WRITES scaffolding, so the implied root decides which project gets the
   * new files. Discriminator: the created doc exists inside the fixture. The
   * wrong root would have written into `packages/cli/docs` — which is the real
   * reason this one matters most: it mutates a tree the caller did not name.
   */
  it('add scaffolds into the -c project', async () => {
    await withProject(
      { rootDir: '.', docsDir: './docs' },
      async () => {},
      async (configPath, root) => {
        const result = await runAdd('doc', 'fixturedoc', { configPath });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const written = path.join(root, 'docs', 'fixturedoc.md');
        await expect(readFile(written, 'utf-8')).resolves.toContain('fixturedoc');
        // Every created path is inside the fixture, none in the cwd.
        for (const created of result.value.created) {
          expect(path.resolve(root, created).startsWith(root)).toBe(true);
        }
      }
    );
  });
});

/**
 * Class guard. This is the test whose absence let #911 survive in a dozen
 * siblings: #911 fixed `check-arch`, the fix was copied inline rather than
 * shared, and nothing stopped the next command from pairing a `-c`-sourced
 * config load with a `process.cwd()` root again.
 *
 * The rule is narrow on purpose, so it has no false positives: a command that
 * loads its config from the `-c` option (`resolveConfig(options.configPath)`)
 * must not ALSO derive its project root from `process.cwd()`. Commands that
 * legitimately use `process.cwd()` are untouched by it — `init` / `init-minimal`
 * create the config, `mcp-guard`'s `--config` is `.mcp.json`, and `recommend` /
 * `advise-skills` / `cleanup-sessions` call `resolveConfig()` with no argument.
 * None of those match the conjunction.
 */
describe('class guard: no command may pair a -c config load with a process.cwd() root', () => {
  it('finds no command holding both halves of the defect', async () => {
    const { glob } = await import('glob');
    const { readFile } = await import('node:fs/promises');

    const commandsDir = path.join(__dirname, '../../src/commands');
    const files = await glob('**/*.ts', { cwd: commandsDir, ignore: ['**/*.test.ts'] });
    // Guard the premise: a glob that matched nothing would make this vacuous.
    expect(files.length).toBeGreaterThan(50);

    const LOADS_CONFIG_FROM_FLAG = /resolveConfig\(\s*(?:options|opts)\.configPath\s*\)/;
    const ROOTS_ON_CWD = /options\.cwd \?\? process\.cwd\(\)/;

    const offenders: string[] = [];
    for (const rel of files) {
      const source = await readFile(path.join(commandsDir, rel), 'utf-8');
      if (LOADS_CONFIG_FROM_FLAG.test(source) && ROOTS_ON_CWD.test(source)) {
        offenders.push(rel);
      }
    }

    expect(
      offenders,
      `These commands read their config from -c but root on process.cwd(), so -c selects the ` +
        `config FILE while the scan measures the current directory (#911's class). Use ` +
        `resolveProject(options.configPath, options.cwd) from src/config/loader.ts instead:\n` +
        offenders.map((f) => `  - src/commands/${f}`).join('\n')
    ).toEqual([]);
  });
});
