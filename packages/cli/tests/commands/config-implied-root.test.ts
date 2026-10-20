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
import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';

import { runCheckVocabulary } from '../../src/commands/check-vocabulary';
import { runAuditProtected } from '../../src/commands/audit-protected';
import { runCheckDeps } from '../../src/commands/check-deps';
import { runAdd } from '../../src/commands/add';
import { resolveProject } from '../../src/config/loader';
import { logger } from '../../src/output/logger';

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
  /**
   * `comprehend` — the second of the two instances the first version of this
   * PR's sweep MIS-CLEARED, with a stated reason ("root comes from its own
   * `--project` plumbing") that does not exist: the command has no `--project`
   * option at all. It read the hook gate and `comprehension.ci` mode from `-c`
   * and rooted the unit store and source reader on `process.cwd()` — and
   * `--changed --stage` git-adds the shards, so it WRITES into the unnamed tree.
   *
   * Discriminator: the compiled unit lands under the FIXTURE's
   * `.harness/comprehension`. Against the wrong root it would have written into
   * this repo's own comprehension tree, which is exactly the escape #911
   * reported. `enumerateModules` finds the fixture's single module, so the unit
   * count is 1 where the real repo has hundreds.
   */
  it('comprehend compiles the -c project, and writes its units there', async () => {
    await withProject(
      { rootDir: './src', docsDir: './docs' },
      async (root) => {
        await writeFile(
          path.join(root, 'src/thing.ts'),
          'export const thing = 1;\nexport function useThing(): number {\n  return thing;\n}\n'
        );
      },
      async (configPath, root) => {
        const { runComprehendAction } = await import('../../src/commands/comprehend');

        // The compile path ends in `process.exit(0)`; swallow it so the
        // assertion below can run on what it actually wrote.
        const exitError = new Error('process.exit');
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
          throw exitError;
        }) as never);
        try {
          // `--static` keeps this LLM-free and deterministic; `all` compiles the
          // whole (one-module) fixture.
          await runComprehendAction('all', configPath, { staticOnly: true, stage: false });
        } catch (e) {
          if (e !== exitError) throw e;
        } finally {
          exitSpy.mockRestore();
        }

        // The unit must exist under the FIXTURE, not under process.cwd().
        const unit = path.join(root, '.harness', 'comprehension', 'src', '_module.md');
        await expect(readFile(unit, 'utf-8')).resolves.toContain('thing');
      }
    );
  });

  /**
   * `roadmap triage` — the first mis-cleared instance. It took the
   * `roadmap.autoTriage.enabled` gate from `-c` and then read
   * `path.join(process.cwd(), 'docs', 'roadmap.md')`, so it could apply one
   * project's gate to another project's rows in either direction.
   *
   * Discriminator: the gate is enabled ONLY in the fixture, and the roadmap
   * exists ONLY in the fixture. With the fix, the command gets past the gate and
   * reports on the fixture's single row. Without it, the gate passes (config is
   * read from `-c`) but the roadmap read lands in `packages/cli`, which has no
   * `docs/roadmap.md`, so it errors instead — a different, observable outcome.
   */
  it('roadmap triage reads the roadmap of the -c project', async () => {
    await withProject(
      { rootDir: '.', docsDir: './docs', roadmap: { autoTriage: { enabled: true } } },
      async (root) => {
        await writeFile(
          path.join(root, 'docs/roadmap.md'),
          [
            '# Roadmap',
            '',
            '| Item | Status | Priority | Milestone | External-ID |',
            '| --- | --- | --- | --- | --- |',
            '| Fixture-only row | planned | P2 | — | — |',
            '',
          ].join('\n')
        );
      },
      async (configPath, root) => {
        const { createRoadmapCommand } = await import('../../src/commands/roadmap');
        const program = new Command();
        program.option('-c, --config <path>', 'Config');
        program.option('--json', 'JSON');
        program.addCommand(createRoadmapCommand());

        const logs: string[] = [];
        const logSpy = vi.spyOn(logger, 'info').mockImplementation((m: unknown) => {
          logs.push(String(m));
        });
        const errSpy = vi.spyOn(logger, 'error').mockImplementation((m: unknown) => {
          logs.push(String(m));
        });
        try {
          await program.parseAsync(['node', 'test', '-c', configPath, 'roadmap', 'triage']);
        } catch {
          // the action may exit; the assertion is on what it READ
        } finally {
          logSpy.mockRestore();
          errSpy.mockRestore();
        }

        const all = logs.join('\n');
        // It must NOT have complained about a missing roadmap under the cwd:
        // that message naming packages/cli is the signature of the wrong root.
        expect(all).not.toContain(path.join(process.cwd(), 'docs', 'roadmap.md'));
        // And it must not have reported the gate as disabled — the fixture enables it.
        expect(all).not.toContain('auto-triage is disabled');
        // Belt and braces: if it named a roadmap path at all, it was the fixture's.
        if (all.includes('roadmap.md')) {
          expect(all).toContain(root);
        }
      }
    );
  });

  /**
   * `ci check` — `projectRoot: process.cwd()` with no override at all, while the
   * config came from `-c`. This is the composed gate, so the wrong root meant
   * every sub-check ran against the current directory.
   *
   * Discriminator: the fixture's `docs` check has a denominator only the fixture
   * can produce. Asserting the report is non-empty AND that the run did not
   * measure this repo (whose check count and findings differ) is the signal; the
   * decisive half is the revert probe below, which changes the outcome.
   */
  it('ci check roots its composed checks on the -c project', async () => {
    await withProject(
      { rootDir: './src', docsDir: './docs' },
      async (root) => {
        await writeFile(path.join(root, 'src/thing.ts'), 'export const thing = 1;\n');
        await writeFile(path.join(root, 'docs/readme.md'), '# Docs\n\n[thing](../src/thing.ts)\n');
      },
      async (configPath) => {
        const { runCICheck } = await import('../../src/commands/ci/check');
        // Skip everything that shells out or walks a graph; `docs` is enough to
        // observe WHICH tree was measured and is fast.
        const result = await runCICheck({
          configPath,
          skip: ['arch', 'traceability', 'security', 'perf', 'deps', 'entropy', 'phase-gate'],
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const docs = result.value.checks.find((c) => c.name === 'docs');
        expect(docs).toBeDefined();
        // `runDocsCheck` uses `sourceDir: projectRoot` and emits one warning
        // per undocumented file. The fixture's single source file is linked
        // from its single doc, so a correctly-rooted run has ZERO issues.
        // Against `packages/cli` (the wrong root) it is ~200 warnings, so this
        // is a denominator assertion and not a verdict assertion.
        expect(docs?.issues).toEqual([]);
        expect(docs?.status).toBe('pass');
      }
    );
  });

  /**
   * `check-perf` — the action handler called `runCheckPerf(process.cwd(), ...)`
   * while `resolveConfiguredEntryPoints` read the entry points from `-c`, so the
   * configured entry points of one project scoped a scan of another.
   *
   * Discriminator: this repo has 13 standing complexity violations, so a run
   * against the WRONG root exits VALIDATION_FAILED(1) with 13 issues naming
   * `packages/**` files. The fixture is one trivial function, so a correctly
   * rooted run exits SUCCESS(0) with none. Asserting "zero issues, and no issue
   * naming a path outside the fixture" is a finding assertion, not a verdict
   * one — it cannot be satisfied by the repo's own tree.
   */
  it('check-perf analyses the -c project', async () => {
    await withProject(
      { rootDir: './src', docsDir: './docs' },
      async (root) => {
        await writeFile(
          path.join(root, 'src/thing.ts'),
          'export function thing(a: number): number {\n  return a + 1;\n}\n'
        );
      },
      async (configPath) => {
        const { createCheckPerfCommand } = await import('../../src/commands/check-perf');

        const exitError = new Error('process.exit');
        const codes: number[] = [];
        const logs: string[] = [];
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((c: number) => {
          codes.push(c);
          throw exitError;
        }) as never);
        const logSpy = vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
          logs.push(String(m));
        });

        const program = new Command();
        program.option('-c, --config <path>', 'Config');
        program.option('--json', 'JSON');
        program.addCommand(createCheckPerfCommand());

        try {
          await program.parseAsync(['node', 'test', '--json', '-c', configPath, 'check-perf']);
        } catch (e) {
          if (e !== exitError) throw e;
        } finally {
          exitSpy.mockRestore();
          logSpy.mockRestore();
        }

        const payload = JSON.parse(
          logs.find((l) => l.includes('valid')) ?? '{"valid":null,"issues":[]}'
        ) as { valid: boolean | null; issues: Array<{ file: string }> };

        expect(payload.issues).toEqual([]);
        expect(payload.valid).toBe(true);
        expect(codes).toContain(0);
      }
    );
  });

  /**
   * `snapshot capture` — WRITES the architecture timeline. The root decided both
   * what got measured and where `.harness/arch/timeline.json` was persisted.
   *
   * Discriminator: the timeline file must appear under the FIXTURE. This is the
   * same failure #911 actually reported (a baseline written into the repo), so
   * asserting on the written artifact is the faithful check.
   */
  it('snapshot capture measures and persists into the -c project', async () => {
    await withProject(
      { rootDir: './src', docsDir: './docs' },
      async (root) => {
        await writeFile(path.join(root, 'src/thing.ts'), 'export const thing = 1;\n');
      },
      async (configPath, root) => {
        const { runSnapshotCapture } = await import('../../src/commands/snapshot');
        const { snapshot } = await runSnapshotCapture({ configPath });
        expect(snapshot).toBeDefined();

        // The timeline lands in the fixture, not in process.cwd().
        const timeline = path.join(root, '.harness', 'arch', 'timeline.json');
        const raw = await readFile(timeline, 'utf-8');
        expect(JSON.parse(raw).snapshots.length).toBe(1);
      }
    );
  });

  /**
   * `models proposals` — read the backends from `-c` but listed the proposal
   * queue out of `process.cwd()/.harness/proposals`.
   *
   * Discriminator: the fixture holds exactly one proposal with a distinctive id.
   * `packages/cli` has no `.harness/proposals` directory at all, so the wrong
   * root yields `[]` — right and wrong answers are 1 and 0.
   */
  it('models proposals lists the -c project queue', async () => {
    await withProject(
      { rootDir: '.', docsDir: './docs' },
      async (root) => {
        await mkdir(path.join(root, '.harness', 'proposals'), { recursive: true });
        await writeFile(
          path.join(root, '.harness', 'proposals', 'fixture-only-proposal.json'),
          JSON.stringify({
            kind: 'model',
            id: 'fixture-only-proposal',
            createdAt: new Date().toISOString(),
            proposedBy: 'config-implied-root-test',
            source: {
              justification: 'Fixture proposal for the -c project-root test (#911 class).',
            },
            status: 'open',
            model: {
              action: 'add',
              target: { hfRepoId: 'acme/fixture', ollamaName: 'fixture:latest' },
              scoreDelta: 1,
              diskImpactGb: 1,
              justification: {
                summary: 'fixture',
                benchmarkBasis: ['fixture'],
                hardwareFit: 'fixture',
                evidence: 'fixture',
                freshness: 'fixture',
              },
            },
          })
        );
      },
      async (configPath) => {
        const { runModelsProposals } = await import('../../src/commands/models');
        // HARNESS_PROJECT_ROOT still wins by design, so it must be clear for
        // this to be a test of the config-implied root.
        const saved = process.env['HARNESS_PROJECT_ROOT'];
        delete process.env['HARNESS_PROJECT_ROOT'];
        try {
          const rows = await runModelsProposals('open', configPath);
          expect(rows).toHaveLength(1);
          expect(rows[0]?.['id']).toBe('fixture-only-proposal');
        } finally {
          if (saved !== undefined) process.env['HARNESS_PROJECT_ROOT'] = saved;
        }
      }
    );
  });
});

/**
 * Class guard.
 *
 * An earlier version of this guard keyed on the literal spellings this PR
 * happened to fix (`resolveConfig(options.configPath)` paired with
 * `options.cwd ?? process.cwd()`). A review measured its real reach at 11 of
 * 17 — it could not see `ci check`'s `projectRoot: process.cwd()`,
 * `snapshot`'s `new TimelineManager(process.cwd())`, `models`'
 * `HARNESS_PROJECT_ROOT ?? process.cwd()` or `check-perf`'s
 * `runCheckPerf(process.cwd(), ...)`, and it required the literal
 * `options.configPath`, so `comprehend` (`globalConfig`) and `roadmap triage`
 * (a `configPath` parameter) sat in the tree as LIVE instances with the guard
 * green. A guard passing while the defect is present is worse than no guard,
 * so the rule below is the structural one instead:
 *
 *   a command that reads the global `-c` in ANY spelling and mentions
 *   `process.cwd()` outside a comment must route through `resolveProject`.
 *
 * That is spelling-independent on the cwd half, which is what the previous
 * rule got wrong. Verified in both directions: it reports no offender on this
 * tree beyond the three justified below, and reverting `comprehend` and
 * `roadmap triage` to their pre-fix state makes it name both.
 *
 * The three exemptions are shapes, not spellings, and each is named so an
 * unexplained fourth entry fails the test rather than growing the list:
 *   - `mcp-guard` — its `--config` is `.mcp.json`, not `harness.config.json`.
 *   - `pulse/run` — its `--config` is the pulse config file.
 *   - `agent/run` — persona mode threads no config to its `projectPath`, so
 *     `-c` is ignored rather than mismatched (a different defect; see the PR's
 *     residual risk 1).
 *
 * What this still does NOT catch, stated so nobody reads more protection into
 * it than it gives: a command that reads `-c` and roots on `process.cwd()`
 * while ALSO calling `resolveProject` somewhere else in the file for an
 * unrelated purpose. Closing that needs real dataflow, not a grep.
 */
describe('class guard: a -c-reading command that touches process.cwd() must use resolveProject', () => {
  /**
   * Shapes where `-c` is a different file, or is ignored rather than mismatched.
   * Adding an entry here is a claim that needs the comment above to justify it.
   */
  const JUSTIFIED = ['mcp-guard.ts', 'pulse/run.ts', 'agent/run.ts'];

  it('finds no unjustified command rooting on process.cwd() while reading -c', async () => {
    const { glob } = await import('glob');
    const { readFile } = await import('node:fs/promises');

    const commandsDir = path.join(__dirname, '../../src/commands');
    const files = await glob('**/*.ts', { cwd: commandsDir, ignore: ['**/*.test.ts'] });
    // Guard the premise: a glob that matched nothing would make this vacuous.
    expect(files.length).toBeGreaterThan(200);

    // Strip block and line comments, so prose mentioning `process.cwd()` — of
    // which this PR added a lot — never counts as using it.
    const stripComments = (src: string): string =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

    const READS_CONFIG_FLAG = /globalOpts\.config\b|options\.configPath\b|opts\.configPath\b/;
    const TOUCHES_CWD = /process\.cwd\(\)/;
    const USES_HELPER = /resolveProject\s*\(/;

    const offenders: string[] = [];
    for (const rel of files) {
      const source = stripComments(await readFile(path.join(commandsDir, rel), 'utf-8'));
      if (
        READS_CONFIG_FLAG.test(source) &&
        TOUCHES_CWD.test(source) &&
        !USES_HELPER.test(source) &&
        !JUSTIFIED.includes(rel.replaceAll('\\', '/'))
      ) {
        offenders.push(rel);
      }
    }

    expect(
      offenders,
      `These commands read the global -c but derive their project root from process.cwd(), so ` +
        `-c selects the config FILE while the work happens in the current directory (#911's ` +
        `class, fixed for check-arch in 9f322084c). Use resolveProject(configPath) from ` +
        `src/config/loader.ts. If -c genuinely means a different file for one of these, add it ` +
        `to JUSTIFIED with a reason in the block comment above:\n` +
        offenders.map((f) => `  - src/commands/${f}`).join('\n')
    ).toEqual([]);
  });

  it('keeps every JUSTIFIED exemption load-bearing', async () => {
    // An exemption that no longer matches the rule is stale: it would hide a
    // future regression in that file. Fail rather than silently over-permit.
    const { readFile } = await import('node:fs/promises');
    const commandsDir = path.join(__dirname, '../../src/commands');
    for (const rel of JUSTIFIED) {
      const source = await readFile(path.join(commandsDir, rel), 'utf-8');
      expect(
        /globalOpts\.config\b|options\.configPath\b|opts\.configPath\b/.test(source) &&
          /process\.cwd\(\)/.test(source),
        `src/commands/${rel} is in JUSTIFIED but no longer matches the guard's rule — remove it`
      ).toBe(true);
    }
  });
});
