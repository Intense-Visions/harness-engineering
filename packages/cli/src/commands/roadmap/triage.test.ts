// packages/cli/src/commands/roadmap/triage.test.ts
//
// Roadmap Auto-Triage — Phase 1, Task 6: the read-only report core (SC1 shape, SC8 gating).
//
// Exercises the pure report core offline (no live model, no graph): every actionable item
// gets a verdict, non-actionable items are excluded, ranking is applied, and the renderers
// produce human + JSON. The gating (SC8) is enforced in the command action; here we pin the
// pure core's behavior.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { GraphStore } from '@harness-engineering/graph';
import type { GraphNode } from '@harness-engineering/graph';
import type { Roadmap, RoadmapFeature } from '@harness-engineering/types';
import type { ForkGenerator } from '@harness-engineering/intelligence';
import {
  isActionable,
  featureToIssue,
  runTriageReport,
  renderHuman,
  renderJson,
  runBrainstormReport,
  renderBrainstormHuman,
  renderBrainstormJson,
  createRoadmapTriageCommand,
  buildPrecedentLookup,
} from './triage';

function feature(overrides: Partial<RoadmapFeature>): RoadmapFeature {
  return {
    name: 'Rename BackendRouter',
    status: 'planned',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: 'Rename the `BackendRouter` symbol.',
    assignee: null,
    priority: null,
    externalId: 'github:acme/repo#1',
    updatedAt: null,
    ...overrides,
  };
}

function roadmapWith(features: RoadmapFeature[]): Roadmap {
  return {
    frontmatter: {} as Roadmap['frontmatter'],
    milestones: [{ name: 'MVP', isBacklog: false, features }],
    assignmentHistory: [],
  } as Roadmap;
}

function node(id: string, name: string): GraphNode {
  return { id, name, type: 'class', metadata: {} } as GraphNode;
}

describe('isActionable', () => {
  it('accepts planned + backlog, rejects in-progress/done/blocked/needs-human', () => {
    expect(isActionable(feature({ status: 'planned' }))).toBe(true);
    expect(isActionable(feature({ status: 'backlog' }))).toBe(true);
    expect(isActionable(feature({ status: 'in-progress' }))).toBe(false);
    expect(isActionable(feature({ status: 'done' }))).toBe(false);
    expect(isActionable(feature({ status: 'blocked' }))).toBe(false);
    expect(isActionable(feature({ status: 'needs-human' }))).toBe(false);
  });
});

describe('featureToIssue', () => {
  it('maps name/summary/status/externalId onto the Issue model', () => {
    const issue = featureToIssue(feature({}));
    expect(issue.title).toBe('Rename BackendRouter');
    expect(issue.description).toContain('BackendRouter');
    expect(issue.externalId).toBe('github:acme/repo#1');
  });
});

describe('runTriageReport — SC1 (N items → N verdicts) + actionable filter', () => {
  it('emits one verdict per actionable item and excludes non-actionable ones', async () => {
    const rm = roadmapWith([
      feature({ name: 'A', status: 'planned' }),
      feature({ name: 'B', status: 'done' }), // excluded
      feature({ name: 'C', status: 'backlog' }),
    ]);
    const rows = await runTriageReport(rm); // offline, no graph
    expect(rows.map((r) => r.name).sort()).toEqual(['A', 'C']);
    for (const row of rows) {
      expect(row.verdict.levers).toBeDefined();
      expect(typeof row.verdict.dispatchable).toBe('boolean');
    }
  });

  it('offline (no graph) holds everything to human as unresolved-scope (fail-safe)', async () => {
    const rm = roadmapWith([feature({ name: 'A' })]);
    const rows = await runTriageReport(rm);
    expect(rows[0]?.verdict.dispatchable).toBe(false);
    expect(rows[0]?.verdict.holdReason).toBe('unresolved-scope');
  });

  it('with a graph that resolves the entity, the scope lever produces a real estimate', async () => {
    const store = new GraphStore();
    store.addNode(node('class:BackendRouter', 'BackendRouter'));
    const rm = roadmapWith([feature({ name: 'Rename BackendRouter' })]);
    const rows = await runTriageReport(rm, { graphStore: store });
    expect(rows[0]?.verdict.levers.scope.value).not.toBe('unknown');
  });

  it('ranks rows deterministically (higher pilot score first)', async () => {
    const rm = roadmapWith([
      feature({ name: 'low', priority: 'P3' }),
      feature({ name: 'high', priority: 'P0' }),
    ]);
    const rows = await runTriageReport(rm);
    // Equal (offline) confidence/effort ⇒ impact from priority drives the order.
    expect(rows[0]?.name).toBe('high');
  });
});

// ===========================================================================
// Phase 4 (FIX 1 / SC5): the REAL precedent lever readback — buildPrecedentLookup +
// its wiring into runTriageReport. The OVERRIDING safety constraint: with an EMPTY
// store, behavior MUST be byte-identical to today (empty precedent ⇒ `unknown` ⇒ the
// gate stays conservative). These tests PIN cold-start invariance; the lever may only
// change behavior once real graded outcomes accrue.
// ===========================================================================

describe('buildPrecedentLookup — SC5 cold-start invariance', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-precedent-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('empty store ⇒ a lookup that returns `unknown` for every shape (never a rate)', async () => {
    const lookup = await buildPrecedentLookup(tmp);
    // The store has no events at all → no outcome-bearing records → `unknown` (the P1
    // degrade-empty path). A `rate` here would be a cold-start regression.
    expect(lookup?.rateForShape('|dispatchable|simple').kind).toBe('unknown');
    expect(lookup?.rateForShape('anything|guided-change|complex').kind).toBe('unknown');
  });

  it('empty store ⇒ runTriageReport GATE VERDICTS are IDENTICAL with vs without the lever', async () => {
    // The load-bearing invariant: the GATE decision (dispatchable + holdReason + level) must
    // be indifferent to an empty precedent lever. Passing the cold-start lookup must not shift
    // a single verdict vs omitting it entirely — cold-start behavior is byte-identical.
    //
    // NOTE: the internal `levers.precedent.value` diagnostic differs in REPRESENTATION between
    // the two paths (the no-lever path yields the string `'unknown'`; the cold-lookup path
    // yields the `PrecedentRate` object `{kind:'unknown'}`) — a pre-existing quirk of the pure
    // probe. That representation is NOT load-bearing: the gate's precedent check
    // (`kind === 'rate'`) treats BOTH as non-blocking, so the verdict is unchanged. This test
    // pins the verdict (what the operator/orchestrator acts on), and separately asserts the
    // lever never manufactures a `rate` (hence never a block) at cold-start.
    const store = new GraphStore();
    store.addNode(node('class:BackendRouter', 'BackendRouter'));
    const rm = roadmapWith([
      feature({ name: 'Rename BackendRouter', priority: 'P0' }),
      feature({ name: 'Offline item', priority: 'P2' }), // no graph node ⇒ unresolved-scope
    ]);

    const withoutLever = await runTriageReport(rm, { graphStore: store });
    const coldLookup = await buildPrecedentLookup(tmp);
    const withColdLever = await runTriageReport(rm, {
      graphStore: store,
      ...(coldLookup ? { precedent: coldLookup } : {}),
    });

    // Byte-identical GATE verdict slices — the fields the caller acts on.
    const slim = (rows: Awaited<ReturnType<typeof runTriageReport>>) =>
      rows.map((r) => ({
        name: r.name,
        dispatchable: r.verdict.dispatchable,
        holdReason: r.verdict.holdReason ?? null,
        level: r.verdict.verdict.level,
      }));
    expect(slim(withColdLever)).toEqual(slim(withoutLever));
    // And the precedent lever never resolved to a `rate` on either path (cold-start ⇒ never a
    // block, whether `'unknown'` the string or `{kind:'unknown'}` the object).
    for (const row of [...withColdLever, ...withoutLever]) {
      const v = row.verdict.levers.precedent.value;
      const kind = v === 'unknown' ? 'unknown' : v.kind;
      expect(kind).toBe('unknown');
      // The gate only blocks on a `rate` — pin that no cold-start row can carry one.
      expect(row.verdict.holdReason).not.toBe('precedent-contradicts');
    }
  });
});

describe('renderers', () => {
  it('renderHuman includes a per-item badge and a summary line', async () => {
    const rm = roadmapWith([feature({ name: 'A' })]);
    const out = renderHuman(await runTriageReport(rm));
    expect(out).toContain('A');
    expect(out).toMatch(/dispatchable/i);
  });

  it('renderJson emits a stable machine-readable shape', async () => {
    const rm = roadmapWith([feature({ name: 'A' })]);
    const json = JSON.parse(renderJson(await runTriageReport(rm)));
    expect(json.count).toBe(1);
    expect(json.items[0].name).toBe('A');
    expect(json.items[0]).toHaveProperty('holdReason');
    expect(json.items[0]).toHaveProperty('levers');
  });

  it('renderHuman handles the empty case', () => {
    expect(renderHuman([])).toContain('No actionable');
  });
});

// ===========================================================================
// Phase 2, Task 5: the --brainstorm mode (docs only, no dispatch, default-off).
// ===========================================================================

/** A fork generator over a fixed script (then null = done). */
function scriptedGenerator(
  script: readonly { id: string; confidence: 'high' | 'medium' | 'low' }[]
): ForkGenerator {
  return {
    next(index: number) {
      const step = script[index];
      if (!step) return null;
      return {
        fork: { id: step.id, question: `Which approach for ${step.id}?`, options: ['A', 'B'] },
        recommendation: 'A',
        confidence: step.confidence,
        rationale: `${step.id}: A is the safe default.`,
      };
    },
  };
}

describe('runBrainstormReport — brainstorm per candidate (docs only)', () => {
  it('offline (no provider, no generator) halts every actionable item to a human', async () => {
    const rm = roadmapWith([feature({ name: 'A' }), feature({ name: 'B', status: 'done' })]);
    const rows = await runBrainstormReport(rm); // no provider ⇒ generator absent ⇒ halt
    expect(rows.map((r) => r.name)).toEqual(['A']); // 'done' excluded
    expect(rows[0]?.result.outcome.kind).toBe('halted');
  });

  it('with an injected generator, a completed brainstorm writes a spec under docsRoot', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-brainstorm-'));
    try {
      const store = new GraphStore();
      store.addNode(node('class:BackendRouter', 'BackendRouter'));
      const rm = roadmapWith([feature({ name: 'Rename BackendRouter' })]);
      const rows = await runBrainstormReport(rm, {
        graphStore: store,
        generator: scriptedGenerator([{ id: 'f0', confidence: 'high' }]),
        docsRoot: tmp,
      });
      expect(rows[0]?.result.outcome.kind).toBe('completed');
      expect(rows[0]?.result.specPath).toBeDefined();
      expect(fs.existsSync(rows[0]?.result.specPath as string)).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('an injected generator that halts writes NO spec and surfaces the fork+reason', async () => {
    const rm = roadmapWith([feature({ name: 'A' })]);
    const rows = await runBrainstormReport(rm, {
      generator: scriptedGenerator([{ id: 'needs-human', confidence: 'medium' }]),
    });
    const o = rows[0]?.result.outcome;
    expect(o?.kind).toBe('halted');
    if (o?.kind !== 'halted') throw new Error('expected halted');
    expect(o.reason).toBe('low-confidence');
    expect(rows[0]?.result.specPath).toBeUndefined();
  });

  it('renderers produce human + JSON for both completed and halted rows', async () => {
    const rm = roadmapWith([feature({ name: 'A' })]);
    const rows = await runBrainstormReport(rm, {
      generator: scriptedGenerator([{ id: 'f0', confidence: 'medium' }]),
    });
    expect(renderBrainstormHuman(rows)).toMatch(/HALTED/);
    const json = JSON.parse(renderBrainstormJson(rows));
    expect(json.count).toBe(1);
    expect(json.items[0].outcome).toBe('halted');
    expect(json.items[0].halt.reason).toBe('low-confidence');
  });

  it('renderBrainstormHuman handles the empty case', () => {
    expect(renderBrainstormHuman([])).toContain('No actionable');
  });
});

// ===========================================================================
// REV-S1: the command ACTION — gating (disabled → info + no report + exit 0) and
// --json (parseable JSON to stdout). Exercises the real commander action via parseAsync
// against a temp cwd, spying console.log/console.error + process.exitCode.
// ===========================================================================

describe('roadmap triage command action (REV-S1)', () => {
  let tmpCwd: string;
  let origCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  /**
   * Build a root program with the --config/--json globals, a `roadmap` parent, and the
   * triage subcommand — mirroring the real CLI hierarchy so `optsWithGlobals()` resolves.
   */
  function programWithTriage(): Command {
    const program = new Command('harness')
      .option('-c, --config <path>', 'Path to config file')
      .option('--json', 'Output as JSON');
    const roadmap = new Command('roadmap');
    roadmap.addCommand(createRoadmapTriageCommand());
    program.addCommand(roadmap);
    return program;
  }

  function writeConfig(enabled: boolean): void {
    fs.writeFileSync(
      path.join(tmpCwd, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: { autoTriage: { enabled } } }),
      'utf-8'
    );
  }

  function writeRoadmap(): void {
    fs.mkdirSync(path.join(tmpCwd, 'docs'), { recursive: true });
    // A minimal, PARSER-VALID roadmap (frontmatter + one planned feature). Mirrors the
    // core roadmap fixture format (### heading + `- **Status:**` bullets).
    const md = [
      '---',
      'project: test',
      'version: 1',
      'last_synced: 2026-03-21T14:30:00Z',
      'last_manual_edit: 2026-03-21T15:00:00Z',
      '---',
      '',
      '# Roadmap',
      '',
      '## MVP',
      '',
      '### Add a widget',
      '',
      '- **Status:** planned',
      '- **Spec:** —',
      '- **Summary:** Add a widget to the thing.',
      '- **Blockers:** —',
      '- **Plan:** —',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(tmpCwd, 'docs', 'roadmap.md'), md, 'utf-8');
  }

  beforeEach(() => {
    origCwd = process.cwd();
    tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-action-'));
    process.chdir(tmpCwd);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.chdir(origCwd);
    logSpy.mockRestore();
    errSpy.mockRestore();
    process.exitCode = undefined;
    fs.rmSync(tmpCwd, { recursive: true, force: true });
  });

  it('(a) disabled config → info log, no report, exit 0', async () => {
    writeConfig(false);
    writeRoadmap();
    await programWithTriage().parseAsync(['roadmap', 'triage'], { from: 'user' });
    // An info line explaining it is disabled; no error; a clean (undefined/0) exit code.
    const logged = logSpy.mock.calls.map((c: unknown[]) => String(c[1] ?? c[0])).join('\n');
    expect(logged.toLowerCase()).toContain('disabled');
    expect(errSpy).not.toHaveBeenCalled();
    expect(process.exitCode ?? 0).toBe(0);
  });

  it('(b) enabled + --json → parseable JSON on stdout', async () => {
    writeConfig(true);
    writeRoadmap();
    // Capture raw stdout (renderJson goes to process.stdout.write, not the logger).
    const chunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: string | Uint8Array
    ) => {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      return true;
    }) as typeof process.stdout.write);
    try {
      await programWithTriage().parseAsync(['--json', 'roadmap', 'triage'], { from: 'user' });
      const out = chunks.join('');
      const parsed = JSON.parse(out);
      expect(parsed).toHaveProperty('count');
      expect(parsed).toHaveProperty('items');
      expect(Array.isArray(parsed.items)).toBe(true);
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});
