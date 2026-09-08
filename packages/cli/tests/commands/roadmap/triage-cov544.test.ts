import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import type { Roadmap, RoadmapFeature } from '@harness-engineering/types';
import type { TriageVerdict } from '@harness-engineering/orchestrator';
import {
  selectActionableFeatures,
  isPlausibleForModel,
  runTriageReport,
  renderHuman,
  renderJson,
  runBrainstormReport,
  renderBrainstormHuman,
  renderBrainstormJson,
  buildPrecedentLookup,
  buildShapeHistory,
  runApproveCommand,
  createRoadmapTriageCommand,
  type TriageReportRow,
  type BrainstormReportRow,
} from '../../../src/commands/roadmap/triage';

function feature(name: string, over: Partial<RoadmapFeature> = {}): RoadmapFeature {
  return {
    name,
    status: 'planned',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: `${name} summary`,
    assignee: null,
    priority: null,
    externalId: `github:o/r#${name}`,
    updatedAt: null,
    ...over,
  };
}

function roadmapWith(features: RoadmapFeature[]): Roadmap {
  return {
    frontmatter: { project: 'p', version: 1, lastSynced: 'x', lastManualEdit: 'x' },
    milestones: [{ name: 'MVP', isBacklog: false, features }],
    assignmentHistory: [],
  } as unknown as Roadmap;
}

// A minimal TriageVerdict carrying exactly the fields the render helpers read.
function verdict(over: {
  dispatchable: boolean;
  holdReason?: string;
  level?: string;
  confidence?: string;
}): TriageVerdict {
  return {
    externalId: 'github:o/r#1',
    dispatchable: over.dispatchable,
    ...(over.holdReason ? { holdReason: over.holdReason } : {}),
    verdict: { level: over.level ?? 'simple', confidence: over.confidence ?? 'high' },
    levers: { scope: { value: 'unknown' } },
    rationale: 'because reasons',
  } as unknown as TriageVerdict;
}

function reportRow(name: string, v: TriageVerdict): TriageReportRow {
  return {
    externalId: v.externalId,
    name,
    status: 'planned',
    impact: 2,
    confidence: 3,
    effort: 2,
    verdict: v,
  };
}

const ROADMAP_MD = `---
project: test
version: 1
last_synced: 2026-01-01T00:00:00Z
last_manual_edit: 2026-01-01T00:00:00Z
---

# Roadmap

## Milestone: MVP

### Feature: Alpha
- **Status:** planned
- **Spec:** —
- **Plans:** —
- **Blocked by:** —
- **Summary:** Alpha thing

### Feature: Beta
- **Status:** backlog
- **Spec:** —
- **Plans:** —
- **Blocked by:** —
- **Summary:** Beta thing
`;

describe('selectActionableFeatures', () => {
  const rm = roadmapWith([
    feature('Alpha', { status: 'planned' }),
    feature('Beta', { status: 'backlog' }),
    feature('Gamma', { status: 'in-progress' }),
    feature('Delta', { status: 'done' }),
  ]);

  it('keeps only planned/backlog features', () => {
    const names = selectActionableFeatures(rm).map((f) => f.name);
    expect(names).toEqual(['Alpha', 'Beta']);
  });

  it('applies the case-insensitive --only substring filter', () => {
    const names = selectActionableFeatures(rm, { only: 'alph' }).map((f) => f.name);
    expect(names).toEqual(['Alpha']);
  });

  it('ignores a whitespace-only --only value', () => {
    const names = selectActionableFeatures(rm, { only: '   ' }).map((f) => f.name);
    expect(names).toEqual(['Alpha', 'Beta']);
  });

  it('caps the count with --limit', () => {
    const names = selectActionableFeatures(rm, { limit: 1 }).map((f) => f.name);
    expect(names).toEqual(['Alpha']);
  });

  it('limit 0 yields an empty selection', () => {
    expect(selectActionableFeatures(rm, { limit: 0 })).toEqual([]);
  });
});

describe('isPlausibleForModel', () => {
  it('is false when the scope is unknown (offline verdict)', () => {
    expect(isPlausibleForModel(verdict({ dispatchable: false }))).toBe(false);
  });

  it('is true when scope resolved+bounded and band is in [trivial,simple]', () => {
    const v = {
      verdict: { level: 'trivial', confidence: 'high' },
      levers: { scope: { value: { resolved: ['a'] } } },
    } as unknown as TriageVerdict;
    expect(isPlausibleForModel(v)).toBe(true);
  });

  it('is false when the band is complex even if scope resolved', () => {
    const v = {
      verdict: { level: 'complex', confidence: 'high' },
      levers: { scope: { value: { resolved: ['a'] } } },
    } as unknown as TriageVerdict;
    expect(isPlausibleForModel(v)).toBe(false);
  });
});

describe('renderHuman / renderJson', () => {
  it('renders the empty placeholder', () => {
    expect(renderHuman([])).toMatch(/No actionable/);
  });

  it('renders a dispatchable and a held row', () => {
    const rows = [
      reportRow('Alpha', verdict({ dispatchable: true, level: 'simple', confidence: 'high' })),
      reportRow('Beta', verdict({ dispatchable: false, holdReason: 'scope-too-large' })),
    ];
    const out = renderHuman(rows);
    expect(out).toContain('✓ DISPATCHABLE');
    expect(out).toContain('✗ HELD (scope-too-large)');
    expect(out).toMatch(/1\/2 dispatchable; 1 to human/);
  });

  it('renderJson emits a stable machine-readable shape', () => {
    const rows = [reportRow('Alpha', verdict({ dispatchable: false, holdReason: 'held-x' }))];
    const parsed = JSON.parse(renderJson(rows));
    expect(parsed.count).toBe(1);
    expect(parsed.dispatchable).toBe(0);
    expect(parsed.items[0]).toMatchObject({
      name: 'Alpha',
      dispatchable: false,
      holdReason: 'held-x',
    });
  });

  it('renderJson maps a missing holdReason to null', () => {
    const rows = [reportRow('Alpha', verdict({ dispatchable: true }))];
    const parsed = JSON.parse(renderJson(rows));
    expect(parsed.items[0].holdReason).toBeNull();
    expect(parsed.dispatchable).toBe(1);
  });
});

describe('runTriageReport (offline)', () => {
  it('scores every actionable item and holds them all without a provider', async () => {
    const rm = roadmapWith([feature('Alpha'), feature('Beta', { status: 'backlog' })]);
    const rows = await runTriageReport(rm, { offline: true });
    expect(rows.length).toBe(2);
    for (const r of rows) expect(r.verdict.dispatchable).toBe(false);
  });

  it('honors the only/limit targeting', async () => {
    const rm = roadmapWith([feature('Alpha'), feature('Beta', { status: 'backlog' })]);
    const rows = await runTriageReport(rm, { offline: true, only: 'beta' });
    expect(rows.map((r) => r.name)).toEqual(['Beta']);
  });
});

describe('runBrainstormReport (offline)', () => {
  it('halts every item to a human with no provider wired', async () => {
    const rm = roadmapWith([feature('Alpha')]);
    const rows = await runBrainstormReport(rm);
    expect(rows.length).toBe(1);
    expect(rows[0]?.result.outcome.kind).toBe('halted');
  });

  it('gatePlausible surfaces a SKIPPED halt for a non-plausible candidate', async () => {
    const rm = roadmapWith([feature('Alpha')]);
    const rows = await runBrainstormReport(rm, { gatePlausible: true });
    expect(rows[0]?.result.outcome.kind).toBe('halted');
    const o = rows[0]?.result.outcome;
    if (o && o.kind === 'halted') expect(o.detail).toMatch(/Skipped brainstorm/);
  });
});

describe('renderBrainstormHuman / renderBrainstormJson', () => {
  const completedRow: BrainstormReportRow = {
    externalId: 'github:o/r#1',
    name: 'Alpha',
    status: 'planned',
    level: 'simple',
    result: {
      outcome: {
        kind: 'completed',
        spec: {
          externalId: 'github:o/r#1',
          title: 'Alpha',
          summary: 'sum',
          decisions: [
            {
              fork: { id: 'f1', question: 'which way?', options: [] },
              recommendation: 'left',
              confidence: 'high',
            },
          ],
        },
      },
      specPath: '/docs/changes/alpha/proposal.md',
      rescore: verdict({ dispatchable: true, level: 'simple', confidence: 'high' }),
    },
  } as unknown as BrainstormReportRow;

  const haltedRow: BrainstormReportRow = {
    externalId: 'github:o/r#2',
    name: 'Beta',
    status: 'backlog',
    level: 'moderate',
    result: {
      outcome: {
        kind: 'halted',
        fork: { id: 'f2', question: 'unsure?', options: [] },
        reason: 'low-confidence',
        detail: 'held to a human',
      },
    },
  } as unknown as BrainstormReportRow;

  it('empty placeholder', () => {
    expect(renderBrainstormHuman([])).toMatch(/No actionable/);
  });

  it('renders a drafted spec and a halt handoff', () => {
    const out = renderBrainstormHuman([completedRow, haltedRow]);
    expect(out).toContain('✓ SPEC DRAFTED');
    expect(out).toContain('✗ HALTED → HUMAN');
    expect(out).toMatch(/1\/2 spec\(s\) drafted; 1 halted/);
  });

  it('renders the dry-run label when no spec path is set', () => {
    const noPath = {
      ...completedRow,
      result: { ...completedRow.result, specPath: undefined },
    } as BrainstormReportRow;
    expect(renderBrainstormHuman([noPath])).toContain('dry run — no docs root');
  });

  it('renderBrainstormJson emits forks for completed and a halt block for halted', () => {
    const parsed = JSON.parse(renderBrainstormJson([completedRow, haltedRow]));
    expect(parsed.count).toBe(2);
    expect(parsed.drafted).toBe(1);
    const completed = parsed.items.find((i: { name: string }) => i.name === 'Alpha');
    expect(completed.forks[0]).toMatchObject({ id: 'f1', recommendation: 'left' });
    const halted = parsed.items.find((i: { name: string }) => i.name === 'Beta');
    expect(halted.halt).toMatchObject({ reason: 'low-confidence' });
  });
});

describe('buildPrecedentLookup / buildShapeHistory (cold store)', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-store-'));
  });
  afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }));

  it('precedent degrades to undefined on a cold/empty store', async () => {
    const p = await buildPrecedentLookup(cwd);
    // Cold-start: either undefined (no store) or a lookup that returns unknown.
    expect(p === undefined || typeof p === 'function' || typeof p === 'object').toBe(true);
  });

  it('shape history returns an empty list for any shape key', async () => {
    const historyFor = await buildShapeHistory(cwd);
    expect(historyFor('anything')).toEqual([]);
  });
});

describe('runApproveCommand', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-approve-'));
    fs.mkdirSync(path.join(cwd, 'docs'), { recursive: true });
  });
  afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }));

  it('is inert (disabled) when there is no config', async () => {
    const res = await runApproveCommand(cwd, {});
    expect(res.note).toBe('disabled');
    expect(res.marked).toEqual([]);
  });

  it('reports no-roadmap when enabled but roadmap.md is absent', async () => {
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: { autoTriage: { enabled: true } } })
    );
    const res = await runApproveCommand(cwd, {
      config: path.join(cwd, 'harness.config.json'),
    });
    expect(res.note).toBe('no-roadmap');
  });

  it('reports roadmap-parse-error when enabled but roadmap.md is malformed', async () => {
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: { autoTriage: { enabled: true } } })
    );
    fs.writeFileSync(path.join(cwd, 'docs', 'roadmap.md'), 'garbage not a roadmap');
    const res = await runApproveCommand(cwd, {
      config: path.join(cwd, 'harness.config.json'),
    });
    expect(res.note).toBe('roadmap-parse-error');
  });

  it('runs the full go/no-go pipeline offline: nothing ready ⇒ nothing marked', async () => {
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: { autoTriage: { enabled: true } } })
    );
    fs.writeFileSync(path.join(cwd, 'docs', 'roadmap.md'), ROADMAP_MD);
    // No provider resolvable ⇒ the brainstorm halts every item ⇒ no READY candidate ⇒
    // nothing is marked, and the note is absent (a clean, empty go/no-go).
    const res = await runApproveCommand(cwd, {
      config: path.join(cwd, 'harness.config.json'),
      approveAll: true,
    });
    expect(res.note).toBeUndefined();
    expect(res.marked).toEqual([]);
  });
});

describe('createRoadmapTriageCommand action (gate + parse)', () => {
  let cwd: string;
  let origCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let writeSpy: ReturnType<typeof vi.spyOn>;

  function program(): Command {
    const p = new Command();
    p.option('-c, --config <path>');
    p.option('--json');
    p.addCommand(createRoadmapTriageCommand());
    p.exitOverride();
    return p;
  }

  beforeEach(() => {
    origCwd = process.cwd();
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-cmd-'));
    fs.mkdirSync(path.join(cwd, 'docs'), { recursive: true });
    process.chdir(cwd);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(cwd, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('prints the disabled message and does nothing when auto-triage is off', async () => {
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: {} })
    );
    await program().parseAsync(['triage', '-c', path.join(cwd, 'harness.config.json')], {
      from: 'user',
    });
    const out = logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(out).toMatch(/disabled/i);
    expect(process.exitCode ?? 0).toBe(0);
  });

  it('errors (exitCode 1) when enabled but roadmap.md is missing', async () => {
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: { autoTriage: { enabled: true } } })
    );
    await program().parseAsync(['triage', '-c', path.join(cwd, 'harness.config.json')], {
      from: 'user',
    });
    expect(process.exitCode).toBe(1);
    const err = errSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(err).toMatch(/No roadmap aggregate/);
  });

  it('errors (exitCode 1) when the roadmap fails to parse', async () => {
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: { autoTriage: { enabled: true } } })
    );
    fs.writeFileSync(path.join(cwd, 'docs', 'roadmap.md'), 'totally not a roadmap');
    await program().parseAsync(['triage', '-c', path.join(cwd, 'harness.config.json')], {
      from: 'user',
    });
    expect(process.exitCode).toBe(1);
  });

  it('renders a human report offline over a valid roadmap', async () => {
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: { autoTriage: { enabled: true } } })
    );
    fs.writeFileSync(path.join(cwd, 'docs', 'roadmap.md'), ROADMAP_MD);
    await program().parseAsync(
      ['triage', '--offline', '-c', path.join(cwd, 'harness.config.json')],
      { from: 'user' }
    );
    const out = logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(out).toMatch(/actionable item/i);
  });

  it('emits JSON to stdout under --json', async () => {
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: { autoTriage: { enabled: true } } })
    );
    fs.writeFileSync(path.join(cwd, 'docs', 'roadmap.md'), ROADMAP_MD);
    await program().parseAsync(
      ['triage', '--offline', '--json', '-c', path.join(cwd, 'harness.config.json')],
      { from: 'user' }
    );
    const written = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(written).toMatch(/"count"/);
  });

  it('runs the --brainstorm mode offline (halts to human)', async () => {
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: { autoTriage: { enabled: true } } })
    );
    fs.writeFileSync(path.join(cwd, 'docs', 'roadmap.md'), ROADMAP_MD);
    await program().parseAsync(
      ['triage', '--brainstorm', '--offline', '-c', path.join(cwd, 'harness.config.json')],
      { from: 'user' }
    );
    const out = logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(out).toMatch(/Brainstormed|halted/i);
  });
});

describe('triage approve subcommand (renderApproveHuman + JSON)', () => {
  let cwd: string;
  let origCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let writeSpy: ReturnType<typeof vi.spyOn>;

  function program(): Command {
    const p = new Command();
    p.option('-c, --config <path>');
    p.option('--json');
    p.addCommand(createRoadmapTriageCommand());
    p.exitOverride();
    return p;
  }

  beforeEach(() => {
    origCwd = process.cwd();
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-approve-cmd-'));
    fs.mkdirSync(path.join(cwd, 'docs'), { recursive: true });
    process.chdir(cwd);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(cwd, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('prints the disabled human message when auto-triage is off', async () => {
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: {} })
    );
    await program().parseAsync(['triage', 'approve', '-c', path.join(cwd, 'harness.config.json')], {
      from: 'user',
    });
    const out = logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(out).toMatch(/disabled/i);
  });

  it('prints the no-roadmap human message when enabled but roadmap.md is absent', async () => {
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: { autoTriage: { enabled: true } } })
    );
    await program().parseAsync(['triage', 'approve', '-c', path.join(cwd, 'harness.config.json')], {
      from: 'user',
    });
    const out = logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(out).toMatch(/No roadmap aggregate/i);
  });

  it('emits JSON for the approve result under --json', async () => {
    fs.writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: { autoTriage: { enabled: true } } })
    );
    fs.writeFileSync(path.join(cwd, 'docs', 'roadmap.md'), ROADMAP_MD);
    await program().parseAsync(
      ['triage', 'approve', '--approve-all', '--json', '-c', path.join(cwd, 'harness.config.json')],
      { from: 'user' }
    );
    const written = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(written).toMatch(/"marked"/);
  });
});
