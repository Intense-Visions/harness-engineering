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
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';

/**
 * Pass-through recorder around core's `EntropyAnalyzer`. Behaviour is the REAL
 * analyzer's; the only addition is that each construction's config is kept so a
 * test can assert which entry points a command actually handed the analysis.
 * Needed by the `check-perf` case: the perf detectors never consume entry
 * points, so the only place a leaked entry-point set is observable is at this
 * boundary (#2293).
 */
const analyzerConfigs = vi.hoisted(() => [] as Array<{ rootDir: string; entryPoints?: string[] }>);
vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  class RecordingEntropyAnalyzer extends actual.EntropyAnalyzer {
    constructor(config: ConstructorParameters<typeof actual.EntropyAnalyzer>[0]) {
      super(config);
      analyzerConfigs.push({
        rootDir: config.rootDir,
        ...(config.entryPoints ? { entryPoints: [...config.entryPoints] } : {}),
      });
    }
  }
  return { ...actual, EntropyAnalyzer: RecordingEntropyAnalyzer };
});

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

/**
 * Compare absolute paths platform-neutrally: the globbers behind the entropy
 * and design scanners return forward slashes, while `path.join` uses `\\` on
 * win32, so a raw equality on a joined path fails only on Windows CI.
 */
const toPosix = (p: string): string => p.replaceAll('\\', '/');

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
   * A roadmap `parseRoadmap` actually accepts: YAML frontmatter with the four
   * required keys, then `## <milestone>` / `### <item>` with the item's fields.
   * An earlier version of this fixture used a markdown table, which the parser
   * rejects outright with "Missing or malformed YAML frontmatter" — so triage
   * never read the row and the test below asserted only absences. A review
   * defeated it by planting a `packages/cli/docs/roadmap.md` and reverting the
   * fix, at which point it passed against the wrong tree. Hence the positive
   * assertion on the row's own name.
   */
  const FIXTURE_ROADMAP = [
    '---',
    'project: fixture',
    'version: 1',
    'last_synced: 2026-01-01T00:00:00.000Z',
    'last_manual_edit: 2026-01-01T00:00:00.000Z',
    '---',
    '',
    '# Roadmap',
    '',
    '## Intake',
    '',
    '### Fixture-only row',
    '',
    '- **Status:** planned',
    '- **Spec:** —',
    '- **Summary:** A row that exists only in the tmpdir fixture.',
    '- **Blockers:** —',
    '- **Plan:** —',
    '- **Assignee:** —',
    '- **Priority:** P2',
    '- **Milestone:** —',
    '- **External-ID:** —',
    '',
  ].join('\n');

  /**
   * `roadmap triage` — the first mis-cleared instance. It took the
   * `roadmap.autoTriage.enabled` gate from `-c` and then read
   * `path.join(process.cwd(), 'docs', 'roadmap.md')`, so it applied one
   * project's gate to another project's rows.
   *
   * Discriminator is POSITIVE and unconditional: triage must name **the
   * fixture's own row** in its report. `Fixture-only row` exists nowhere else
   * in this repo, so the assertion cannot be satisfied by any other tree —
   * including a `packages/cli/docs/roadmap.md` planted by a reviewer, which is
   * exactly the configuration that defeated the previous absence-only version.
   */
  it('roadmap triage reports the rows of the -c project', async () => {
    await withProject(
      { rootDir: '.', docsDir: './docs', roadmap: { autoTriage: { enabled: true } } },
      async (root) => {
        await writeFile(path.join(root, 'docs/roadmap.md'), FIXTURE_ROADMAP);
      },
      async (configPath) => {
        const { createRoadmapCommand } = await import('../../src/commands/roadmap');
        const program = new Command();
        program.option('-c, --config <path>', 'Config');
        program.option('--json', 'JSON');
        program.addCommand(createRoadmapCommand());

        const logs: string[] = [];
        const push = (m: unknown): void => {
          logs.push(String(m));
        };
        const spies = [
          vi.spyOn(logger, 'info').mockImplementation(push),
          vi.spyOn(logger, 'error').mockImplementation(push),
          vi.spyOn(logger, 'warn').mockImplementation(push),
          vi.spyOn(console, 'log').mockImplementation(push),
        ];
        try {
          // `--offline` keeps this on the deterministic static path (no provider).
          await program.parseAsync([
            'node',
            'test',
            '-c',
            configPath,
            'roadmap',
            'triage',
            '--offline',
          ]);
        } catch {
          // the action may exit; the assertion is on what it REPORTED
        } finally {
          for (const spy of spies) spy.mockRestore();
        }

        const all = logs.join('\n');
        // POSITIVE: the fixture's own row, by name. Unique to the fixture.
        expect(all).toContain('Fixture-only row');
        // The roadmap actually parsed — a parse failure would make the above
        // unreachable for the right reason and mask a root regression.
        expect(all).not.toContain('Failed to parse roadmap');
        // And the gate was taken from the fixture's config, not defaulted off.
        expect(all).not.toContain('auto-triage is disabled');
      }
    );
  });

  /**
   * `check-perf` — two halves of one split. The action handler called
   * `runCheckPerf(process.cwd(), ...)` (the ROOT half, fixed under #2285), and it
   * never forwarded `-c`, so `resolveConfiguredEntryPoints(undefined)` walked up
   * from `process.cwd()` and used THIS repo's nine `packages/**` entry points
   * against the fixture's root (the ENTRY-POINT half, #2293).
   *
   * The previous version of this test asserted `issues: []`. That is exactly the
   * value the entry-point leak produced: nine unresolvable entry points against a
   * one-file tree analysed nothing of consequence and reported a clean pass. A
   * zero cannot discriminate a defect whose symptom is a zero.
   *
   * Discriminators, both positive:
   *   1. The analyzer was handed the FIXTURE's configured entry point — a
   *      non-conventional path (`src/app/boot.ts`) that auto-detection cannot
   *      find, so it can only have come from the fixture's `performance` block —
   *      rooted at the fixture. Under the leak it receives this repo's nine
   *      `packages/**` paths.
   *   2. The fixture's own seeded finding is reported: a 7-parameter function in
   *      that entry file, a `parameterCount` warning naming a path that exists
   *      only in the tmpdir. That proves the analysis actually ran over the
   *      fixture rather than abstaining.
   */
  it("check-perf analyses the -c project with the -c project's entry points", async () => {
    await withProject(
      { rootDir: '.', docsDir: './docs', performance: { entryPoints: ['src/app/boot.ts'] } },
      async (root) => {
        await mkdir(path.join(root, 'src/app'), { recursive: true });
        await writeFile(
          path.join(root, 'src/app/boot.ts'),
          'export function widen(a: number, b: number, c: number, d: number, e: number, f: number, g: number): number {\n' +
            '  return a + b + c + d + e + f + g;\n}\n'
        );
      },
      async (configPath, root) => {
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

        analyzerConfigs.length = 0;
        try {
          await program.parseAsync(['node', 'test', '--json', '-c', configPath, 'check-perf']);
        } catch (e) {
          if (e !== exitError) throw e;
        } finally {
          exitSpy.mockRestore();
          logSpy.mockRestore();
        }

        // 1. The entry points came from the -c project, and the root is its root.
        expect(analyzerConfigs).toHaveLength(1);
        expect(analyzerConfigs[0]!.rootDir).toBe(path.resolve(root));
        expect(analyzerConfigs[0]!.entryPoints).toEqual(['src/app/boot.ts']);

        // 2. The analysis ran over the fixture and found the fixture's finding.
        const payload = JSON.parse(
          logs.find((l) => l.includes('valid')) ?? '{"valid":null,"issues":[]}'
        ) as { valid: boolean | null; issues: Array<{ file: string; message: string }> };

        const fixtureFile = toPosix(path.join(root, 'src/app/boot.ts'));
        const seeded = payload.issues.filter(
          (i) => toPosix(i.file) === fixtureFile && i.message.includes('"widen" has 7 parameters')
        );
        expect(seeded, JSON.stringify(payload.issues)).toHaveLength(1);
        // Nothing outside the fixture, and no analysis-error row.
        expect(payload.issues.every((i) => toPosix(i.file).startsWith(toPosix(root)))).toBe(true);
        // A parameterCount finding is a warning, so the verdict stays passing.
        expect(payload.valid).toBe(true);
        expect(codes).toContain(0);
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
   * `snapshot trends` / `snapshot list` — the sixth unpinned fix a review
   * measured. Both previously did `new TimelineManager(process.cwd())` and
   * ignored `-c` outright, so they listed another project's snapshots. They are
   * read-only, so this is milder than `capture`, but it is a real fix and it
   * now has a real pin: mutating `timelineRoot` alone used to leave the entire
   * suite green.
   *
   * Discriminator: a seeded timeline whose single snapshot carries a commit
   * hash that exists nowhere else (`fixturehash`). `packages/cli` has no
   * `.harness/arch/timeline.json` at all, so the wrong root yields zero
   * snapshots — 1 vs 0, and a name no other tree can produce.
   */
  it('snapshot list reads the timeline of the -c project', async () => {
    await withProject(
      { rootDir: './src', docsDir: './docs' },
      async (root) => {
        await mkdir(path.join(root, '.harness', 'arch'), { recursive: true });
        await writeFile(
          path.join(root, '.harness', 'arch', 'timeline.json'),
          JSON.stringify({
            version: 1,
            snapshots: [
              {
                capturedAt: '2026-01-01T00:00:00.000Z',
                commitHash: 'fixturehash',
                stabilityScore: 42,
                metrics: {},
              },
            ],
          })
        );
      },
      async (configPath) => {
        const { createSnapshotCommand } = await import('../../src/commands/snapshot');
        const program = new Command();
        program.option('-c, --config <path>', 'Config');
        program.option('--json', 'JSON');
        program.addCommand(createSnapshotCommand());

        const out: string[] = [];
        const logSpy = vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
          out.push(String(m));
        });
        try {
          await program.parseAsync([
            'node',
            'test',
            '--json',
            '-c',
            configPath,
            'snapshot',
            'list',
          ]);
        } finally {
          logSpy.mockRestore();
        }

        const payload = JSON.parse(
          out.find((l) => l.includes('snapshots')) ?? '{"snapshots":[]}'
        ) as {
          snapshots: Array<{ commitHash: string }>;
        };
        expect(payload.snapshots).toHaveLength(1);
        expect(payload.snapshots[0]?.commitHash).toBe('fixturehash');
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

  /**
   * The five cases below close #2287. #2285 fixed nineteen commands; eleven of
   * them are pinned by the cases above (`check-docs`, the twelfth, is pinned in
   * its own suite), and these five were not — measured, not assumed: applying
   * `options.cwd ?? process.cwd()` to all five sites at once left the whole
   * `packages/cli` suite green. Re-measured on this base: 8953 passed / 2
   * skipped before, and with the five mutations applied together the only
   * failures are these five cases.
   *
   * FIXTURE-VALUE CHOICE, shared by all five. Each one asserts an ABSOLUTE
   * PATH, a git object, or a config field that exists ONLY in the tmpdir, so
   * the wrong root cannot produce it.
   *
   * Every DISCRIMINATING assertion is positive — the thing that exists at the
   * fixture path — because the review that defeated the earlier `roadmap
   * triage` case did it by planting the file whose absence that test depended
   * on. Precisely two assertions below are absences and NEITHER is a
   * discriminator: the `.entropy-backups` hygiene check in `fix-drift` (which
   * compares against the pre-run state, not against `false`) and
   * `inv.unbounded` in `release-inventory` (implied by the positive
   * `lastRelease` assertion on the line above it). There are no conditional
   * (`if (x) expect(...)`) assertions anywhere, and no loop runs without its
   * denominator being asserted non-zero first.
   *
   * The four cases whose discriminator is an absolute path cannot be defeated
   * by planting, because the asserted value names the tmpdir. The fifth
   * (`check-operational-drift`) can, for a reason intrinsic to that command's
   * return shape — see its own note; do not read the robustness of the other
   * four onto it.
   *
   * Three of the five also use a `rootDir` of `./fixtureapp`, which does not
   * exist in `packages/cli`; that is a SAFETY property, not the discriminator
   * (it keeps a reverted `fix-drift` from rewriting this repo), and each
   * case's discriminator is stated in its own comment.
   *
   * Paths are compared through {@link toPosix} because the globbers return
   * forward slashes while `path.join` does not on win32.
   */

  /**
   * `fix-drift` — the one that matters most of the five, because it WRITES.
   * The root decides which tree gets rewritten, and reverting the sibling
   * `add`/`comprehend` fixes during #2285's development created files inside
   * this repo on four separate occasions.
   *
   * Discriminator: WHERE THE WRITE LANDED. The fixture's single source file
   * has one unused import, which `fix-drift --no-dry-run` removes; the test
   * asserts the rewritten file content at the fixture path AND the one applied
   * fix naming that path. Both are positive, and `fixes` is non-empty, so a
   * zero-denominator abstention (#1146) cannot satisfy it.
   *
   * The fixture yields exactly ONE `delete-lines` fix and no `delete-file`
   * fix, deliberately: `applyFixes` backs a deleted file up to
   * `.entropy-backups` resolved against `process.cwd()` rather than the
   * project root, so a `delete-file` fix escapes into the caller's tree even
   * when the root IS correct. That is a live residual defect, out of scope
   * here, and the fixture is shaped to not trip it (asserted below).
   */
  it('fix-drift rewrites the -c project, and writes only there', async () => {
    await withProject(
      {
        rootDir: './fixtureapp',
        docsDir: './fixturedocs',
        entropy: { entryPoints: ['fixtureapp/main.ts'] },
      },
      async (root) => {
        await mkdir(path.join(root, 'fixtureapp'), { recursive: true });
        await writeFile(
          path.join(root, 'fixtureapp/main.ts'),
          "import { readFileSync } from 'node:fs';\nexport const main = (): number => 1;\n"
        );
      },
      async (configPath, root) => {
        const { runFixDrift } = await import('../../src/commands/fix-drift');
        const backupDir = path.join(process.cwd(), '.entropy-backups');
        const backupDirExistedBefore = existsSync(backupDir);
        const result = await runFixDrift({ configPath, dryRun: false });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const target = path.join(root, 'fixtureapp', 'main.ts');
        // POSITIVE: the write landed at the fixture path, and the rewritten
        // body is still there (so this is "the import line was removed", not
        // "the file vanished").
        await expect(readFile(target, 'utf-8')).resolves.toBe(
          'export const main = (): number => 1;\n'
        );
        // POSITIVE: exactly one fix, applied, naming the fixture's file.
        expect(result.value.fixes).toHaveLength(1);
        expect(result.value.fixes[0]?.action).toBe('delete-lines');
        expect(result.value.fixes[0]?.applied).toBe(true);
        expect(toPosix(result.value.fixes[0]?.file ?? '')).toBe(toPosix(target));
        // Every suggestion is inside the fixture too — no path from any other
        // tree leaked into the report. Guard the denominator first: an empty
        // `suggestions` would make the loop run zero assertions and pass
        // vacuously, which is the shape this file exists to avoid.
        expect(result.value.suggestions.length).toBeGreaterThan(0);
        for (const s of result.value.suggestions) {
          expect(toPosix(s.file).startsWith(toPosix(root))).toBe(true);
        }
        // Hygiene only, NOT a discriminator: prove this test did not itself
        // litter `.entropy-backups` into the caller's tree (see the note
        // above). Compared against the pre-run state rather than against
        // `false`, so a directory some other process left behind cannot red
        // this case for a reason that has nothing to do with the root.
        expect(existsSync(backupDir)).toBe(backupDirExistedBefore);
      }
    );
  });

  /**
   * `cleanup` reports entropy findings, so the root decides which tree is
   * diagnosed.
   *
   * Discriminator: a pattern violation whose `file` is the fixture's ABSOLUTE
   * path, plus the violation COUNT. `-t patterns` with one configured
   * `must-export` rule flags every source file missing the export, so the
   * count is the project's scanned-file count: 1 for this fixture, 763 for
   * `packages/cli` — right and wrong answers differ by three orders of
   * magnitude and NEITHER IS ZERO, so no #1146 abstention can produce either.
   */
  it('cleanup reports the entropy findings of the -c project', async () => {
    await withProject(
      {
        // `.`, not `./fixtureapp`: this one deliberately lets the WRONG root be
        // a real, populated tree, so the revert probe fails on the count (1 vs
        // 763) rather than on the scan erroring out. The fixture root still
        // holds exactly one `.ts` file.
        rootDir: '.',
        docsDir: './fixturedocs',
        entropy: {
          // Explicit, because a one-file tmpdir has no language manifest for
          // `resolveEntryPoints` to discover and the analyzer refuses to run
          // without one. `resolveEntryPoints` only resolves the path (it never
          // stats it), so this stays inert under the revert probe — the wrong
          // root's file walk, not this list, is what produces 763 violations.
          entryPoints: ['fixtureapp/main.ts'],
          patterns: {
            patterns: [
              {
                name: 'fixture-must-export',
                description: 'Fixture-only rule for the -c project-root test.',
                severity: 'error',
                files: ['**/*.ts'],
                rule: { type: 'must-export', names: ['zorblaxOnly'] },
              },
            ],
          },
        },
      },
      async (root) => {
        await mkdir(path.join(root, 'fixtureapp'), { recursive: true });
        await writeFile(path.join(root, 'fixtureapp/main.ts'), 'export const main = 1;\n');
      },
      async (configPath, root) => {
        const { runCleanup } = await import('../../src/commands/cleanup');
        const result = await runCleanup({ configPath, type: 'patterns' });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.value.patternViolations).toHaveLength(1);
        expect(result.value.patternViolations[0]?.pattern).toBe('fixture-must-export');
        expect(toPosix(result.value.patternViolations[0]?.file ?? '')).toBe(
          toPosix(path.join(root, 'fixtureapp', 'main.ts'))
        );
        expect(result.value.totalIssues).toBe(1);
      }
    );
  });

  /**
   * `release-inventory` reads BOTH git (tags, unreleased commits) and the
   * filesystem (`.changeset/`) through ports rooted on the resolved project,
   * so the root decides which repository is inventoried. Neither port is
   * stubbed here, on purpose: injecting them would bypass the very `cwd` the
   * fix threads.
   *
   * Discriminator: a real git repository is initialised INSIDE the fixture
   * with a tag, a commit subject and a changeset filename that exist nowhere
   * else. Every assertion is a positive match on one of those names. This
   * repo has zero `v*` tags, so the wrong root reports `unbounded` with no
   * last release at all.
   */
  it('release-inventory inventories the -c project', async () => {
    await withProject(
      { rootDir: '.', docsDir: './docs' },
      async (root) => {
        await mkdir(path.join(root, '.changeset'), { recursive: true });
        // Named `gitExec`, not `git`: a call spelled `git(` makes the literal
        // `it(` a substring, which a duplicate-test-name audit over
        // `grep -oE "it\\('[^']*'"` reads as an extra test name. The audit is
        // right to be loose; the fixture helper can simply not collide.
        const gitExec = (...args: string[]): void => {
          execFileSync('git', args, {
            cwd: root,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        };
        gitExec('init', '-q', '-b', 'main');
        gitExec('config', 'user.email', 'fixture@example.invalid');
        gitExec('config', 'user.name', 'Fixture');
        gitExec('config', 'commit.gpgsign', 'false');
        await writeFile(path.join(root, 'README.md'), '# fixture\n');
        gitExec('add', '-A');
        gitExec('commit', '-q', '-m', 'fixture: released commit');
        gitExec('tag', 'v9.9.9-fixture');
        await writeFile(
          path.join(root, '.changeset/zorblax-fixture-only.md'),
          "---\n'@fixture/pkg': minor\n---\n\nA changeset that exists only in the tmpdir fixture.\n"
        );
        gitExec('add', '-A');
        gitExec('commit', '-q', '-m', 'fixture: unreleased commit');
      },
      async (configPath) => {
        const { runReleaseInventory } = await import('../../src/commands/release-inventory');
        const result = await runReleaseInventory({ configPath });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const inv = result.value.inventory;

        // POSITIVE: the fixture repo's own tag, commit and changeset.
        expect(inv.lastRelease?.name).toBe('v9.9.9-fixture');
        expect(inv.unbounded).toBe(false);
        expect(inv.unreleasedCommits.map((c) => c.subject)).toEqual(['fixture: unreleased commit']);
        expect(inv.pendingChangesets.map((c) => c.file)).toEqual([
          '.changeset/zorblax-fixture-only.md',
        ]);
        expect(inv.pendingChangesets[0]?.bumps).toEqual([
          { package: '@fixture/pkg', level: 'minor' },
        ]);
      }
    );
  });

  /**
   * `check-design` composes four verifiers, each handed the resolved root as
   * its scan path, so the root decides which tree is audited.
   *
   * Discriminator: a `DRIFT-T001` token-bypass finding whose `file` is the
   * fixture's ABSOLUTE path, produced by a hardcoded hex colour absent from
   * the fixture's own `design-system/tokens.json`. `packages/cli` has no
   * tokens file, so the wrong root loads no token set and the token-bypass
   * rule cannot fire there at all.
   */
  it('check-design audits the -c project', async () => {
    await withProject(
      { rootDir: './fixtureapp', docsDir: './fixturedocs' },
      async (root) => {
        await mkdir(path.join(root, 'fixtureapp'), { recursive: true });
        await mkdir(path.join(root, 'design-system'), { recursive: true });
        await writeFile(
          path.join(root, 'design-system/tokens.json'),
          JSON.stringify({ color: { brand: { $type: 'color', $value: '#112233' } } })
        );
        await writeFile(
          path.join(root, 'fixtureapp/zorblax-card.tsx'),
          "export const ZorblaxCard = () => <div style={{ color: '#ff00aa' }}>hi</div>;\n"
        );
      },
      async (configPath, root) => {
        const { runCheckDesign } = await import('../../src/commands/check-design');
        const result = await runCheckDesign({ configPath, mode: 'fast' });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const drift = result.value.findingsByVerifier.drift;
        expect(drift).toHaveLength(1);
        expect(drift[0]?.code).toBe('DRIFT-T001');
        expect(drift[0]?.message).toContain('#ff00aa');
        expect(toPosix(drift[0]?.file ?? '')).toBe(
          toPosix(path.join(root, 'fixtureapp', 'zorblax-card.tsx'))
        );
        expect(result.value.summary.byCode['DRIFT-T001']).toBe(1);
        expect(result.value.summary.totalFindings).toBe(1);
      }
    );
  });

  /**
   * `check-operational-drift` reads the HEAD side of its threshold diff off
   * disk at the resolved root (`readJsonFromDisk(cwd, policy.configFile)`),
   * while the base side comes from git. The root therefore decides whose
   * config thresholds are compared.
   *
   * Git is stubbed through the command's own `runGit` seam so the diff is
   * deterministic and no real repository is consulted; the `cwd` under test is
   * untouched by that stub.
   *
   * Discriminator: the surface of the single finding names
   * `fixtureOnlyThresholds.watched`, a field that exists only in the fixture's
   * `zorblax-fixture-only.json`. Two threshold paths are watched and the
   * fixture differs from the base on exactly one of them, so the right answer
   * is a specific named field rather than "something changed".
   *
   * WEAKEST OF THE FIVE, stated plainly. `CheckOperationalDriftResult` carries
   * no absolute path — `surface` is repo-RELATIVE — so unlike the other four
   * this discriminator cannot encode the fixture root, and it is therefore
   * content-based: any tree holding a `zorblax-fixture-only.json` with
   * `alsoWatched: 1` and `watched !== 7` satisfies it. A review defeated the
   * earlier version of this case with an 84-byte plant at
   * `packages/cli/harness.config.json`, which is a plausible filename. The
   * watched file is therefore named `zorblax-fixture-only.json`: the plant that
   * would still defeat it has to be an obviously synthetic, non-schema file at a
   * path nothing in this repo uses. That raises the bar; it does not remove the
   * ceiling, and the ceiling is a property of the command's return shape rather
   * than of this test.
   */
  it('check-operational-drift diffs the config of the -c project', async () => {
    // Deliberately NOT `harness.config.json`: see the note above.
    const POLICY_FILE = 'zorblax-fixture-only.json';
    const baseConfig = JSON.stringify({
      fixtureOnlyThresholds: { watched: 7, alsoWatched: 1 },
    });
    await withProject(
      {
        rootDir: './fixtureapp',
        docsDir: './fixturedocs',
        operationalPolicy: {
          watchedPaths: [],
          configFile: POLICY_FILE,
          configThresholdPaths: [
            'fixtureOnlyThresholds.watched',
            'fixtureOnlyThresholds.alsoWatched',
          ],
        },
      },
      async (root) => {
        // The watched file is its own artifact, not harness.config.json, so the
        // thresholds never go near the config schema (no `ignored unknown key`
        // advisory) and the file the command must read is one only this fixture
        // has any reason to contain.
        await writeFile(
          path.join(root, POLICY_FILE),
          JSON.stringify({ fixtureOnlyThresholds: { watched: 42, alsoWatched: 1 } })
        );
      },
      async (configPath) => {
        const { runCheckOperationalDrift } =
          await import('../../src/commands/check-operational-drift');
        const runGit = (args: string[]): string => {
          if (args[0] === 'diff') return POLICY_FILE;
          if (args[0] === 'ls-files') return '';
          if (args[0] === 'show' && args[1] === `FIXTUREBASE:${POLICY_FILE}`) return baseConfig;
          throw new Error(`unexpected git invocation: ${args.join(' ')}`);
        };
        const result = await runCheckOperationalDrift({
          configPath,
          base: 'FIXTUREBASE',
          runGit,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // POSITIVE: the one changed field, named. The undiffable fallback a
        // wrong root produces has a different surface and detail.
        expect(result.value.operationalChanges).toEqual([
          {
            surface: `${POLICY_FILE}:fixtureOnlyThresholds.watched`,
            detail: `threshold/policy field "fixtureOnlyThresholds.watched" changed in ${POLICY_FILE}`,
          },
        ]);
        expect(result.value.flagged).toBe(true);
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
/**
 * Strip block and line comments, so prose mentioning `process.cwd()` — of which
 * this PR added a lot — never counts as *using* it.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/**
 * The three conjuncts of the guard's rule. Shared by the guard and by the
 * exemption-staleness test, so the two can never drift apart.
 *
 * NOTE on reach: the cwd half (`TOUCHES_CWD`) is structural — any spelling of
 * `process.cwd()`. The CONFIG half is still three literals, because that is how
 * the global `-c` is actually read in this codebase. A command that reached the
 * flag by some fourth spelling would not be seen. `roadmap/triage.ts` is caught
 * via its `globalOpts.config` read, not via its `configPath` parameter.
 */
const READS_CONFIG_FLAG = /globalOpts\.config\b|options\.configPath\b|opts\.configPath\b/;
const TOUCHES_CWD = /process\.cwd\(\)/;
const USES_HELPER = /resolveProject\s*\(/;

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
    // future regression in that file. Checks the SAME three conjuncts as the
    // main guard, over comment-stripped source, so an exemption that starts
    // calling `resolveProject` — or whose only `process.cwd()` is in a comment
    // — fails here instead of silently over-permitting.
    const { readFile } = await import('node:fs/promises');
    const commandsDir = path.join(__dirname, '../../src/commands');
    for (const rel of JUSTIFIED) {
      const source = stripComments(await readFile(path.join(commandsDir, rel), 'utf-8'));
      const stillMatches =
        READS_CONFIG_FLAG.test(source) && TOUCHES_CWD.test(source) && !USES_HELPER.test(source);
      expect(
        stillMatches,
        `src/commands/${rel} is in JUSTIFIED but no longer matches the guard's rule ` +
          `(reads -c: ${READS_CONFIG_FLAG.test(source)}, touches cwd: ${TOUCHES_CWD.test(source)}, ` +
          `uses resolveProject: ${USES_HELPER.test(source)}) — remove it from JUSTIFIED`
      ).toBe(true);
    }
  });
});
