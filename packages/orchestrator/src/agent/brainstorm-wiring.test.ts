// packages/orchestrator/src/agent/brainstorm-wiring.test.ts
//
// Roadmap Auto-Triage — Phase 2, Task 4: the brainstorm-wiring spec.
//
// Exercises the wiring against INJECTED seams — an injected ForkGenerator and, for the real
// generator path, an injected AnalysisProvider (never a live model). Confirms:
//   • a completed brainstorm writes a proposal-shaped spec to docs AND re-scores (SC4)
//   • a halted brainstorm writes NO spec and returns the halt (fork + reason)
//   • the real SEL generator downgrades a self-consistency FLIP to low → the runner halts
//   • the real SEL generator accepts a STABLE high-confidence fork
//   • a provider error surfaces as halted{reason:'error'} (the runner is total)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';
import { GraphStore } from '@harness-engineering/graph';
import type { GraphNode } from '@harness-engineering/graph';
import type { Issue } from '@harness-engineering/types';
import type {
  AnalysisProvider,
  AnalysisResponse,
  ForkDecision,
  ForkGenerator,
} from '@harness-engineering/intelligence';
import {
  runBrainstormForIssue,
  makeSelForkGenerator,
  brainstormInputFromIssue,
  renderSpecMarkdown,
  enrichIssueWithSpec,
  BRAINSTORM_RUBRIC,
} from './brainstorm-wiring.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'gh-1',
    identifier: 'CORE-1',
    title: 'Add a retry cap to the fetch client',
    description: 'Cap `BackendRouter` retries at a configurable maximum.',
    priority: null,
    state: 'open',
    branchName: null,
    url: null,
    labels: ['enhancement'],
    blockedBy: [],
    spec: null,
    plans: [],
    createdAt: null,
    updatedAt: null,
    externalId: 'github:acme/repo#1',
    ...overrides,
  };
}

function node(id: string, name: string): GraphNode {
  return { id, name, type: 'class', metadata: {} } as GraphNode;
}

function decision(id: string, confidence: ForkDecision['confidence']): ForkDecision {
  return {
    fork: { id, question: `Which approach for ${id}?`, options: ['A', 'B'] },
    recommendation: 'A',
    confidence,
    rationale: `${id}: A is the safe default.`,
  };
}

/** A generator over a fixed script (then null=done). */
function scriptedGenerator(script: readonly ForkDecision[]): ForkGenerator {
  return { next: (index: number) => script[index] ?? null };
}

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainstorm-wiring-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Completion → spec write + re-score (SC4).
// ---------------------------------------------------------------------------

describe('runBrainstormForIssue — completion writes a spec + re-scores (SC4)', () => {
  it('a clean completion writes a proposal.md and re-scores the enriched item', async () => {
    const store = new GraphStore();
    store.addNode(node('class:BackendRouter', 'BackendRouter'));

    const result = await runBrainstormForIssue(makeIssue(), 'simple', {
      generator: scriptedGenerator([decision('retry-cap', 'high')]),
      docsRoot: tmpDir,
      rescore: {
        graphStore: store,
        // A stub SEL provider so the re-score's semantic + open-decisions levers resolve.
        provider: stubProbeProvider({ level: 'trivial', confidence: 'medium' }),
        config: { boundedScopeMax: 40, dispatchConfidence: 'medium' },
      },
    });

    expect(result.outcome.kind).toBe('completed');
    // A spec file was written under changes/<slug>/proposal.md.
    expect(result.specPath).toBeDefined();
    expect(fs.existsSync(result.specPath as string)).toBe(true);
    const md = fs.readFileSync(result.specPath as string, 'utf-8');
    expect(md).toContain('# Add a retry cap to the fetch client');
    expect(md).toContain('Recommendation:');
    // SC4: the re-score ran over the enriched item and produced a verdict.
    expect(result.rescore).toBeDefined();
    expect(result.rescore?.externalId).toBe('github:acme/repo#1');
    expect(result.rescore?.levers.scope.value).not.toBe('unknown');
  });

  it('with no docsRoot the outcome still completes but no file is written (dry run)', async () => {
    const result = await runBrainstormForIssue(makeIssue(), 'simple', {
      generator: scriptedGenerator([decision('f0', 'high')]),
    });
    expect(result.outcome.kind).toBe('completed');
    expect(result.specPath).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Halt → no spec, halt handoff surfaced.
// ---------------------------------------------------------------------------

describe('runBrainstormForIssue — a halt writes no spec', () => {
  it('a low-confidence fork halts, writes NO proposal.md, and surfaces the fork+reason', async () => {
    const result = await runBrainstormForIssue(makeIssue(), 'simple', {
      generator: scriptedGenerator([decision('needs-human', 'medium')]),
      docsRoot: tmpDir,
    });
    expect(result.outcome.kind).toBe('halted');
    if (result.outcome.kind !== 'halted') throw new Error('expected halted');
    expect(result.outcome.reason).toBe('low-confidence');
    expect(result.outcome.fork.id).toBe('needs-human');
    expect(result.specPath).toBeUndefined();
    // No changes/ directory was created on a halt.
    expect(fs.existsSync(path.join(tmpDir, 'changes'))).toBe(false);
  });

  it('with neither a generator nor a provider, it halts (never a silent pass)', async () => {
    const result = await runBrainstormForIssue(makeIssue(), 'simple', {});
    expect(result.outcome.kind).toBe('halted');
    if (result.outcome.kind !== 'halted') throw new Error('expected halted');
    expect(result.outcome.reason).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// The real SEL generator: self-consistency + confidence gate (injected provider).
// ---------------------------------------------------------------------------

/**
 * A provider stub for the brainstorm ForkStep schema. It returns a scripted sequence of
 * per-CALL recommendations so we can simulate a self-consistency FLIP or STABLE run. Each
 * `analyze` call consumes the next scripted recommendation.
 */
function stubForkStepProvider(script: {
  recommendations: string[]; // consumed one per analyze() call
  confidence?: 'high' | 'medium' | 'low';
  done?: boolean;
  forkId?: string;
  /** Optional per-CALL forkId variation (drift). Falls back to `forkId` / 'storage'. */
  forkIds?: string[];
  /** Optional per-CALL question variation (drift). Falls back to a fixed question. */
  questions?: string[];
  /** Options offered on the fork — used to exercise the "not in options" guard. */
  options?: string[];
}): AnalysisProvider {
  let call = 0;
  return {
    async analyze<T>(request: { responseSchema: z.ZodType }): Promise<AnalysisResponse<T>> {
      const rec = script.recommendations[call] ?? script.recommendations.at(-1) ?? 'A';
      const forkId = script.forkIds?.[call] ?? script.forkIds?.at(-1) ?? script.forkId ?? 'storage';
      const question =
        script.questions?.[call] ?? script.questions?.at(-1) ?? 'Which storage backend?';
      call += 1;
      const payload = {
        done: script.done ?? false,
        forkId,
        question,
        options: script.options ?? ['sqlite', 'postgres'],
        recommendation: rec,
        confidence: script.confidence ?? 'high',
        rationale: 'because',
      };
      return {
        result: request.responseSchema.parse(payload) as T,
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        model: 'stub',
        latencyMs: 0,
      };
    },
  };
}

/** A provider stub for the RE-SCORE probe (complexity + open-decisions dual-shape). */
function stubProbeProvider(opts: {
  level?: 'trivial' | 'simple' | 'moderate' | 'complex';
  confidence?: 'high' | 'medium' | 'low';
  openDecisions?: { question: string }[];
}): AnalysisProvider {
  return {
    async analyze<T>(request: { responseSchema: z.ZodType }): Promise<AnalysisResponse<T>> {
      const complexity = {
        level: opts.level ?? 'trivial',
        confidence: opts.confidence ?? 'medium',
      };
      const decisions = { openDecisions: opts.openDecisions ?? [] };
      const asComplexity = request.responseSchema.safeParse(complexity);
      const result = asComplexity.success
        ? asComplexity.data
        : request.responseSchema.parse(decisions);
      return {
        result: result as T,
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        model: 'stub',
        latencyMs: 0,
      };
    },
  };
}

describe('makeSelForkGenerator — self-consistency + confidence gate', () => {
  const input = brainstormInputFromIssue(makeIssue(), 'simple');

  it('a STABLE high-confidence fork (same recommendation across samples) stays high', async () => {
    const provider = stubForkStepProvider({
      recommendations: ['sqlite', 'sqlite', 'sqlite'],
      confidence: 'high',
    });
    const gen = makeSelForkGenerator(provider, input, { samples: 3 });
    const d = await gen.next(0, []);
    expect(d).not.toBeNull();
    expect(d?.confidence).toBe('high');
    expect(d?.recommendation).toBe('sqlite');
  });

  it('a FLIP across samples is forced to low regardless of the reported enum', async () => {
    const provider = stubForkStepProvider({
      recommendations: ['sqlite', 'postgres', 'sqlite'], // unstable
      confidence: 'high', // model overconfident
    });
    const gen = makeSelForkGenerator(provider, input, { samples: 3 });
    const d = await gen.next(0, []);
    expect(d?.confidence).toBe('low'); // hardening downgrade
    expect(d?.rationale.toLowerCase()).toContain('unstable');
  });

  it('samples agree on the recommendation LABEL but drift to a different forkId → forced low', async () => {
    // SAFETY #1: the label is stable ('sqlite') across all samples, but the model drifted to a
    // DIFFERENT fork (forkId storage → cache). A shared label must NOT read as "stable → high".
    const provider = stubForkStepProvider({
      recommendations: ['sqlite', 'sqlite', 'sqlite'], // same label…
      forkIds: ['storage', 'cache', 'storage'], // …but different fork identity
      confidence: 'high', // model overconfident
    });
    const gen = makeSelForkGenerator(provider, input, { samples: 3 });
    const d = await gen.next(0, []);
    expect(d?.confidence).toBe('low'); // fork-identity drift downgrade
    expect(d?.rationale.toLowerCase()).toContain('drift');
  });

  it('samples agree on the label but drift the QUESTION → forced low', async () => {
    // SAFETY #1 (question variant): same forkId + label, but the decided question drifted.
    const provider = stubForkStepProvider({
      recommendations: ['sqlite', 'sqlite'],
      forkIds: ['storage', 'storage'],
      questions: ['Which storage backend?', 'Which cache backend?'],
      confidence: 'high',
    });
    const gen = makeSelForkGenerator(provider, input, { samples: 2 });
    const d = await gen.next(0, []);
    expect(d?.confidence).toBe('low');
    expect(d?.rationale.toLowerCase()).toContain('drift');
  });

  it('an empty recommendation with high confidence is forced to low', async () => {
    // SAFETY #2: a content-free recommendation is definitionally NOT a confident decision.
    const provider = stubForkStepProvider({
      recommendations: ['', '', ''],
      confidence: 'high', // model claims high on an empty rec
    });
    const gen = makeSelForkGenerator(provider, input, { samples: 3 });
    const d = await gen.next(0, []);
    expect(d?.confidence).toBe('low');
    expect(d?.rationale.toLowerCase()).toContain('empty');
  });

  it('a recommendation not among the fork options is forced to low', async () => {
    // SAFETY #2: the recommended value must be one of the offered options; 'mysql' is not.
    const provider = stubForkStepProvider({
      recommendations: ['mysql', 'mysql', 'mysql'], // stable, but not an offered option
      options: ['sqlite', 'postgres'],
      confidence: 'high',
    });
    const gen = makeSelForkGenerator(provider, input, { samples: 3 });
    const d = await gen.next(0, []);
    expect(d?.confidence).toBe('low');
    expect(d?.rationale.toLowerCase()).toContain('not one of');
  });

  it('end-to-end: forkId drift through the real generator halts the brainstorm', async () => {
    const provider = stubForkStepProvider({
      recommendations: ['sqlite', 'sqlite', 'sqlite'],
      forkIds: ['storage', 'cache', 'storage'],
      confidence: 'high',
    });
    const result = await runBrainstormForIssue(makeIssue(), 'simple', {
      provider,
      generatorOptions: { samples: 3 },
      docsRoot: tmpDir,
    });
    expect(result.outcome.kind).toBe('halted');
    if (result.outcome.kind !== 'halted') throw new Error('expected halted');
    expect(result.outcome.reason).toBe('low-confidence');
    expect(result.specPath).toBeUndefined();
    expect(fs.existsSync(path.join(tmpDir, 'changes'))).toBe(false);
  });

  it('end-to-end: an empty recommendation through the real generator halts the brainstorm', async () => {
    const provider = stubForkStepProvider({
      recommendations: ['', '', ''],
      confidence: 'high',
    });
    const result = await runBrainstormForIssue(makeIssue(), 'simple', {
      provider,
      generatorOptions: { samples: 3 },
      docsRoot: tmpDir,
    });
    expect(result.outcome.kind).toBe('halted');
    if (result.outcome.kind !== 'halted') throw new Error('expected halted');
    expect(result.outcome.reason).toBe('low-confidence');
    expect(result.specPath).toBeUndefined();
    expect(fs.existsSync(path.join(tmpDir, 'changes'))).toBe(false);
  });

  it('a done=true step ends the brainstorm (generator returns null)', async () => {
    const provider = stubForkStepProvider({ recommendations: ['x'], done: true });
    const gen = makeSelForkGenerator(provider, input, { samples: 2 });
    expect(await gen.next(0, [])).toBeNull();
  });

  it('end-to-end: a FLIP through the real generator halts the brainstorm at that fork', async () => {
    const provider = stubForkStepProvider({
      recommendations: ['sqlite', 'postgres', 'sqlite'],
      confidence: 'high',
    });
    const result = await runBrainstormForIssue(makeIssue(), 'simple', {
      provider,
      generatorOptions: { samples: 3 },
      docsRoot: tmpDir,
    });
    expect(result.outcome.kind).toBe('halted');
    if (result.outcome.kind !== 'halted') throw new Error('expected halted');
    expect(result.outcome.reason).toBe('low-confidence');
    expect(result.specPath).toBeUndefined();
  });

  it('a provider that throws surfaces as halted{reason:error} (runner is total)', async () => {
    const provider: AnalysisProvider = {
      analyze: () => Promise.reject(new Error('sel down')),
    };
    const result = await runBrainstormForIssue(makeIssue(), 'simple', {
      provider,
      generatorOptions: { samples: 2 },
    });
    expect(result.outcome.kind).toBe('halted');
    if (result.outcome.kind !== 'halted') throw new Error('expected halted');
    expect(result.outcome.reason).toBe('error');
  });

  it('the rubric names the human-only triggers', () => {
    expect(BRAINSTORM_RUBRIC.toLowerCase()).toContain('product');
    expect(BRAINSTORM_RUBRIC.toLowerCase()).toContain('irreversible');
    expect(BRAINSTORM_RUBRIC.toLowerCase()).toContain('security');
  });
});

// ---------------------------------------------------------------------------
// Pure renderers / enrichment.
// ---------------------------------------------------------------------------

describe('renderSpecMarkdown + enrichIssueWithSpec', () => {
  it('renders each accepted decision as an approach section', () => {
    const md = renderSpecMarkdown({
      externalId: 'ISS-1',
      title: 'T',
      summary: 'S',
      decisions: [decision('a', 'high')],
    });
    expect(md).toContain('# T');
    expect(md).toContain('Which approach for a?');
    expect(md).toContain('Recommendation:');
  });

  it('enrichIssueWithSpec folds the decisions into the description so the re-score reads substance', () => {
    const enriched = enrichIssueWithSpec(makeIssue({ description: 'orig' }), {
      externalId: 'ISS-1',
      title: 'T',
      summary: 'S',
      decisions: [decision('a', 'high')],
    });
    expect(enriched.description).toContain('orig');
    expect(enriched.description).toContain('Which approach for a?');
    expect(enriched.spec).toContain('proposal.md');
  });
});
