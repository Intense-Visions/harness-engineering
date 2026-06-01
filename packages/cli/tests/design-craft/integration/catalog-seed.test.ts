// packages/cli/tests/design-craft/integration/catalog-seed.test.ts
//
// Phase 2 catalog increment guard tests.
//
// Coverage:
//   1. SEED_PATTERNS exposes the seven Phase 2 patterns in code order
//      (CRAFT-P001 .. P007) with the right tier x impact pairs asserted
//      from the proposal:
//         spring-physics              polish x medium
//         skeleton-content-matched    polish x large
//         stagger-timing              polish x small
//         page-transition-crossfade   foundational x medium
//         fluid-type-scale            polish x large
//         progressive-corner-rounding polish x small
//         focus-ring-craft            foundational x large
//      This locks the catalog's tier-vs-impact independence — adding a
//      new pattern that conflates the two would surface here. P004 is
//      the first foundational-tier polish pattern in the seed; P005
//      opens the typography sub-category; P006 opens the layout
//      sub-category; P007 opens the interaction sub-category.
//   2. SEED_EXEMPLARS exposes the five seed exemplars across five
//      component types (EmptyState, LoadingState, CommandPalette,
//      ErrorState, Modal) so BENCHMARK fans out across every canonical
//      v1 component type from the seed (per the CRAFT-B001..B005 anchor
//      reservations in finding-codes.md).
//   3. Every entry carries the ADR 0020 provenance fields (id, version,
//      status, authoredAt, contributors[], source.ref).
//   4. End-to-end: a fixture that matches the skeleton pattern's
//      applicableTo filter routes through the POLISH phase and emits a
//      CRAFT-P002 finding when the LLM returns applies: true. Proves the
//      new pattern is genuinely wired, not just imported.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SEED_PATTERNS } from '../../../src/design-craft/catalog/patterns/index.js';
import {
  SEED_EXEMPLARS,
  vercelErrorStateExemplar,
  stripePayButtonExemplar,
  notionEmptyDatabaseExemplar,
  vercelBuildProgressExemplar,
} from '../../../src/design-craft/catalog/exemplars/index.js';
import { runBenchmark } from '../../../src/design-craft/phases/benchmark.js';
import { MockLlmProvider } from '../../../src/design-craft/llm/provider.js';
import { handleDesignCraft } from '../../../src/mcp/tools/design-craft.js';

describe('design-craft Phase 2 catalog seed — patterns', () => {
  it('SEED_PATTERNS contains the seven Phase 2 patterns in stable order', () => {
    const ids = SEED_PATTERNS.map((p) => p.id);
    expect(ids).toEqual([
      'pattern-spring-physics',
      'pattern-skeleton-content-matched',
      'pattern-stagger-timing',
      'pattern-page-transition-crossfade',
      'pattern-fluid-type-scale',
      'pattern-progressive-corner-rounding',
      'pattern-focus-ring-craft',
    ]);
  });

  it('each pattern declares the tier x impact pair from the proposal', () => {
    const byId = new Map(SEED_PATTERNS.map((p) => [p.id, p]));
    expect(byId.get('pattern-spring-physics')?.findingTemplate).toMatchObject({
      code: 'CRAFT-P001',
      tier: 'polish',
      impact: 'medium',
      phase: 'polish',
    });
    expect(byId.get('pattern-skeleton-content-matched')?.findingTemplate).toMatchObject({
      code: 'CRAFT-P002',
      tier: 'polish',
      impact: 'large',
      phase: 'polish',
    });
    expect(byId.get('pattern-stagger-timing')?.findingTemplate).toMatchObject({
      code: 'CRAFT-P003',
      tier: 'polish',
      impact: 'small',
      phase: 'polish',
    });
    expect(byId.get('pattern-page-transition-crossfade')?.findingTemplate).toMatchObject({
      code: 'CRAFT-P004',
      tier: 'foundational',
      impact: 'medium',
      phase: 'polish',
    });
    expect(byId.get('pattern-fluid-type-scale')?.findingTemplate).toMatchObject({
      code: 'CRAFT-P005',
      tier: 'polish',
      impact: 'large',
      phase: 'polish',
    });
    expect(byId.get('pattern-progressive-corner-rounding')?.findingTemplate).toMatchObject({
      code: 'CRAFT-P006',
      tier: 'polish',
      impact: 'small',
      phase: 'polish',
    });
    expect(byId.get('pattern-focus-ring-craft')?.findingTemplate).toMatchObject({
      code: 'CRAFT-P007',
      tier: 'foundational',
      impact: 'large',
      phase: 'polish',
    });
  });

  it('the widened seed spans both foundational and polish tiers', () => {
    // P004 is the first foundational-tier polish pattern. Asserting this
    // explicitly defends against a regression that would collapse the
    // seed back into a single tier and lose the floor-vs-elevation
    // distinction proven by ADR 0019.
    const tiers = new Set(SEED_PATTERNS.map((p) => p.findingTemplate.tier));
    expect(tiers.has('foundational')).toBe(true);
    expect(tiers.has('polish')).toBe(true);
  });

  it('every pattern carries the ADR 0020 provenance fields', () => {
    for (const p of SEED_PATTERNS) {
      expect(p.id).toMatch(/^pattern-[a-z0-9-]+$/);
      expect(p.version).toBeGreaterThan(0);
      expect(['stable', 'draft', 'deprecated']).toContain(p.status);
      expect(p.authoredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.contributors.length).toBeGreaterThan(0);
      expect(p.source.ref).toBeTruthy();
      expect(p.applicableTo.length).toBeGreaterThan(0);
      expect(p.before.length).toBeGreaterThan(0);
      expect(p.after.length).toBeGreaterThan(0);
    }
  });
});

describe('design-craft Phase 2 catalog seed — exemplars', () => {
  it('SEED_EXEMPLARS spans the eight seed exemplars in stable componentType order', () => {
    const types = SEED_EXEMPLARS.map((e) => e.componentType);
    expect(types).toEqual([
      'EmptyState',
      'LoadingState',
      'CommandPalette',
      'ErrorState',
      'Modal',
      'Button',
      'EmptyState',
      'LoadingState',
    ]);
  });

  it('every canonical componentType from the 50-exemplar plan is anchored', () => {
    // Spec calls out 5 canonical componentTypes (EmptyState / LoadingState /
    // ErrorState / Modal / Button). CommandPalette is the informal sixth
    // anchor inherited from the Phase 0 spike. Assert every canonical type
    // appears so future increments grow horizontally (per-type) rather
    // than introducing a new type without an exemplar.
    const types = new Set(SEED_EXEMPLARS.map((e) => e.componentType));
    for (const required of ['EmptyState', 'LoadingState', 'ErrorState', 'Modal', 'Button']) {
      expect(types.has(required)).toBe(true);
    }
  });

  it('SEED_EXEMPLARS aligns with the CRAFT-B001..B008 anchor identifiers in finding-codes.md', () => {
    const ids = SEED_EXEMPLARS.map((e) => e.id);
    expect(ids).toEqual([
      'exemplar-linear-empty-list',
      'exemplar-stripe-loading-state',
      'exemplar-raycast-command-palette',
      'exemplar-vercel-error-state',
      'exemplar-linear-issue-modal',
      'exemplar-stripe-pay-button',
      'exemplar-notion-empty-database',
      'exemplar-vercel-build-progress',
    ]);
  });

  it('EmptyState and LoadingState now each carry a second register-distinct anchor', () => {
    // B007 (Notion empty database) opens the horizontal-growth phase by
    // adding a second EmptyState anchor in the INSTRUCTIONAL register
    // opposite Linear's RESOLVED register. B008 (Vercel build progress)
    // pairs with it as a second LoadingState anchor in the NARRATIVE
    // register opposite Stripe's PREVIEW (content-matched skeleton)
    // register. Assert both component types are represented twice so
    // BENCHMARK can score targets against the right tonal model rather
    // than collapsing every empty/loading state toward a single anchor.
    const counts = SEED_EXEMPLARS.reduce<Record<string, number>>((acc, e) => {
      acc[e.componentType] = (acc[e.componentType] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts.EmptyState).toBe(2);
    expect(counts.LoadingState).toBe(2);
  });

  it('every exemplar carries the ADR 0020 provenance fields and a complete radarReference', () => {
    for (const e of SEED_EXEMPLARS) {
      expect(e.id).toMatch(/^exemplar-[a-z0-9-]+$/);
      expect(e.version).toBeGreaterThan(0);
      expect(['stable', 'draft', 'deprecated']).toContain(e.status);
      expect(e.authoredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.contributors.length).toBeGreaterThan(0);
      expect(e.source.ref).toBeTruthy();
      // Radar scores live in [0, 100] independently per dimension.
      for (const dim of [
        e.radarReference.philosophicalCoherence,
        e.radarReference.hierarchy,
        e.radarReference.craftExecution,
        e.radarReference.function,
        e.radarReference.innovation,
      ]) {
        expect(dim).toBeGreaterThanOrEqual(0);
        expect(dim).toBeLessThanOrEqual(100);
      }
      expect(e.citationCount).toBe(0);
    }
  });
});

const SKELETON_SOURCE = `
// Fixture: an inbox that loads with a generic Spinner.
export function Inbox() {
  if (isLoading) return <Spinner />;
  return <List items={data} />;
}
`;

const SKELETON_APPLIES_RESPONSE = [
  '```json',
  JSON.stringify(
    {
      applies: true,
      tier: 'polish',
      impact: 'large',
      confidence: 'high',
      message:
        'Spinner gives no preview of the about-to-appear list — replace with a content-matched skeleton.',
    },
    null,
    2
  ),
  '```',
].join('\n');

describe('design-craft skeleton pattern wired end-to-end', () => {
  it('emits a CRAFT-P002 finding when the LLM judges the pattern applies', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-craft-skeleton-'));
    const fixturePath = path.join(tmpDir, 'Inbox.tsx');
    fs.writeFileSync(fixturePath, SKELETON_SOURCE, 'utf8');

    const provider = new MockLlmProvider([
      // The skeleton-content-matched pattern's prompt references the target
      // identifier "Inbox" derived from the file's basename.
      { promptIncludes: 'Inbox', response: SKELETON_APPLIES_RESPONSE },
    ]);

    const result = await handleDesignCraft({
      path: tmpDir,
      mode: 'fast',
      phases: ['polish'],
      files: [fixturePath],
      autoCapture: 'skip',
      __testProvider: provider,
      __recordMeasurement: false,
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      findings: Array<{ code: string; tier: string; impact: string; before?: string }>;
    };
    const p002 = payload.findings.find((f) => f.code === 'CRAFT-P002');
    expect(p002).toBeTruthy();
    expect(p002?.tier).toBe('polish');
    expect(p002?.impact).toBe('large');
    expect(p002?.before).toContain('Spinner');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

const ERROR_STATE_SOURCE = `
// Fixture: a deploy-error surface that follows the four-part anatomy.
export function DeployError(props: { message: string; logUrl: string }) {
  return (
    <section>
      <h2>Build failed</h2>
      <p>{props.message}</p>
      <a href={props.logUrl}>View build log</a>
    </section>
  );
}
`;

const ERROR_STATE_RADAR_RESPONSE = [
  '```json',
  JSON.stringify(
    {
      philosophicalCoherence: {
        score: 80,
        confidence: 'medium',
        notes:
          'Voice is calm and recovery-led; misses the diagnostic-recess layering of the exemplar.',
      },
      hierarchy: {
        score: 85,
        confidence: 'high',
        notes: 'Headline -> body -> action reads in order; no competing focal point.',
      },
      craftExecution: {
        score: 70,
        confidence: 'medium',
        notes: 'Typography roles unset; default link styling on the recovery action.',
      },
      function: {
        score: 90,
        confidence: 'high',
        notes: 'Names the failure and offers the canonical recovery; fit-for-purpose.',
      },
      innovation: {
        score: 55,
        confidence: 'medium',
        notes: 'Conventional shape; no signature move beyond the four-part anatomy.',
      },
      gaps: [
        'No collapsed diagnostics layer — log link is the only escalation path.',
        'Recovery action rendered as a plain link rather than a tuned CTA.',
      ],
    },
    null,
    2
  ),
  '```',
].join('\n');

describe('design-craft Vercel error-state exemplar wired end-to-end', () => {
  it('scores an ErrorState target against the CRAFT-B004 exemplar', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'DeployError', response: ERROR_STATE_RADAR_RESPONSE },
    ]);

    const [score] = await runBenchmark({
      targets: [
        {
          file: 'fixtures/DeployError.tsx',
          component: 'DeployError',
          source: ERROR_STATE_SOURCE,
          componentType: 'ErrorState',
        },
      ],
      exemplars: [vercelErrorStateExemplar],
      provider,
    });

    expect(score).toBeTruthy();
    expect(score?.exemplars).toEqual(['exemplar-vercel-error-state']);
    // Mean of 80/85/70/90/55 = 76
    expect(score?.overall.score).toBe(76);
    // Min confidence of medium/high/medium/high/medium = medium
    expect(score?.overall.confidence).toBe('medium');
    expect(score?.gaps[0]).toContain('diagnostics');
  });
});

const BUTTON_SOURCE = `
// Fixture: a primary commit-value button modeled on the four-state rhythm.
export function PayButton(props: { amount: string; onPay: () => void }) {
  return (
    <button type="submit" onClick={props.onPay} className="primary">
      Pay {props.amount}
    </button>
  );
}
`;

const BUTTON_RADAR_RESPONSE = [
  '```json',
  JSON.stringify(
    {
      philosophicalCoherence: {
        score: 80,
        confidence: 'medium',
        notes:
          'Label carries the commit value; visual treatment relies on a single class without the state rhythm of the exemplar.',
      },
      hierarchy: {
        score: 85,
        confidence: 'high',
        notes: 'Single focal action; no competing secondary actions in the fixture surface.',
      },
      craftExecution: {
        score: 65,
        confidence: 'medium',
        notes:
          'Hover / press / loading / disabled / focus states are not defined; relies on default browser focus ring.',
      },
      function: {
        score: 90,
        confidence: 'high',
        notes: 'Names the action and the amount together; commits a specific transaction.',
      },
      innovation: {
        score: 50,
        confidence: 'medium',
        notes: 'Conventional shape; no signature move beyond the commit-value label.',
      },
      gaps: [
        'No defined hover / press / loading / disabled / focus state rhythm — only the resting style is set.',
        'Focus ring relies on the browser default rather than the three-layer pattern (`CRAFT-P007`).',
      ],
    },
    null,
    2
  ),
  '```',
].join('\n');

describe('design-craft Stripe pay-button exemplar wired end-to-end', () => {
  it('scores a Button target against the CRAFT-B006 exemplar', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'PayButton', response: BUTTON_RADAR_RESPONSE },
    ]);

    const [score] = await runBenchmark({
      targets: [
        {
          file: 'fixtures/PayButton.tsx',
          component: 'PayButton',
          source: BUTTON_SOURCE,
          componentType: 'Button',
        },
      ],
      exemplars: [stripePayButtonExemplar],
      provider,
    });

    expect(score).toBeTruthy();
    expect(score?.exemplars).toEqual(['exemplar-stripe-pay-button']);
    // Mean of 80/85/65/90/50 = 74
    expect(score?.overall.score).toBe(74);
    // Min confidence of medium/high/medium/high/medium = medium
    expect(score?.overall.confidence).toBe('medium');
    expect(score?.gaps[0]).toContain('state rhythm');
  });
});

const INSTRUCTIONAL_EMPTY_STATE_SOURCE = `
// Fixture: a fresh-database empty surface that prompts a system gesture.
export function FreshDatabase() {
  return (
    <div className="page">
      <p className="prompt">Press / for commands</p>
    </div>
  );
}
`;

const INSTRUCTIONAL_EMPTY_STATE_RADAR_RESPONSE = [
  '```json',
  JSON.stringify(
    {
      philosophicalCoherence: {
        score: 78,
        confidence: 'medium',
        notes:
          'Prompt reads as an inline cue rather than a separate chrome surface; aligned with the instructional register of the exemplar.',
      },
      hierarchy: {
        score: 82,
        confidence: 'high',
        notes: 'Single focal element (the prompt); no competing chrome around emptiness.',
      },
      craftExecution: {
        score: 68,
        confidence: 'medium',
        notes:
          'Prompt typography untuned; relies on default body styles rather than the content typeface and tuned weight.',
      },
      function: {
        score: 86,
        confidence: 'high',
        notes:
          'Names the input gesture (slash) and the destination action surface; teaches the system rather than describing intent.',
      },
      innovation: {
        score: 60,
        confidence: 'medium',
        notes:
          'Conventional inline-prompt shape; no signature move beyond the gesture-naming label.',
      },
      gaps: [
        'No keyboard-first escape path defined for the empty surface — the prompt names slash but the surrounding navigation is not addressed.',
        'Prompt typography relies on default body styles rather than the tuned content-typeface register the exemplar carries.',
      ],
    },
    null,
    2
  ),
  '```',
].join('\n');

describe('design-craft Notion empty-database exemplar wired end-to-end', () => {
  it('scores an EmptyState target against the CRAFT-B007 exemplar', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'FreshDatabase', response: INSTRUCTIONAL_EMPTY_STATE_RADAR_RESPONSE },
    ]);

    const [score] = await runBenchmark({
      targets: [
        {
          file: 'fixtures/FreshDatabase.tsx',
          component: 'FreshDatabase',
          source: INSTRUCTIONAL_EMPTY_STATE_SOURCE,
          componentType: 'EmptyState',
        },
      ],
      exemplars: [notionEmptyDatabaseExemplar],
      provider,
    });

    expect(score).toBeTruthy();
    expect(score?.exemplars).toEqual(['exemplar-notion-empty-database']);
    // Mean of 78/82/68/86/60 = 74.8 → rounds to 75
    expect(score?.overall.score).toBe(75);
    // Min confidence of medium/high/medium/high/medium = medium
    expect(score?.overall.confidence).toBe('medium');
    expect(score?.gaps[0]).toContain('keyboard-first');
  });
});

const NARRATIVE_LOADING_STATE_SOURCE = `
// Fixture: a build-progress surface that streams phase names and log lines.
export function BuildProgress(props: { phase: string; logLines: string[] }) {
  return (
    <section>
      <header>Building {props.phase}</header>
      <pre>
        {props.logLines.join('\\n')}
      </pre>
    </section>
  );
}
`;

const NARRATIVE_LOADING_STATE_RADAR_RESPONSE = [
  '```json',
  JSON.stringify(
    {
      philosophicalCoherence: {
        score: 70,
        confidence: 'medium',
        notes:
          'Surface names a single phase rather than the full journey; misses the at-a-glance stepper register of the exemplar.',
      },
      hierarchy: {
        score: 72,
        confidence: 'medium',
        notes:
          'Active phase reads as a single header; no stepper across completed / active / future phases.',
      },
      craftExecution: {
        score: 64,
        confidence: 'medium',
        notes:
          'Log region uses raw <pre> typography; no tabular-figure timestamps, no auto-tail behavior, no reduced-motion handling.',
      },
      function: {
        score: 82,
        confidence: 'high',
        notes: 'The progress is legible; the user can follow what the build is doing right now.',
      },
      innovation: {
        score: 50,
        confidence: 'medium',
        notes: 'Conventional single-phase shape; no signature move beyond the streaming log.',
      },
      gaps: [
        'No stepper across the full journey — only the active phase is named, so the user cannot see what comes next.',
        'Log region lacks the auto-tail + pause-on-scroll behavior the exemplar uses to respect the user during failure investigation.',
      ],
    },
    null,
    2
  ),
  '```',
].join('\n');

describe('design-craft Vercel build-progress exemplar wired end-to-end', () => {
  it('scores a LoadingState target against the CRAFT-B008 exemplar', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'BuildProgress', response: NARRATIVE_LOADING_STATE_RADAR_RESPONSE },
    ]);

    const [score] = await runBenchmark({
      targets: [
        {
          file: 'fixtures/BuildProgress.tsx',
          component: 'BuildProgress',
          source: NARRATIVE_LOADING_STATE_SOURCE,
          componentType: 'LoadingState',
        },
      ],
      exemplars: [vercelBuildProgressExemplar],
      provider,
    });

    expect(score).toBeTruthy();
    expect(score?.exemplars).toEqual(['exemplar-vercel-build-progress']);
    // Mean of 70/72/64/82/50 = 67.6 → rounds to 68
    expect(score?.overall.score).toBe(68);
    // Min confidence of medium/medium/medium/high/medium = medium
    expect(score?.overall.confidence).toBe('medium');
    expect(score?.gaps[0]).toContain('stepper');
  });
});
