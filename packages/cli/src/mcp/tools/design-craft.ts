// packages/cli/src/mcp/tools/design-craft.ts
//
// MCP tool `mcp__harness__design_craft` — entry point for the
// harness-design-craft skill (sub-project #6 of the design-pipeline
// initiative).
//
// MVP scope (this commit):
//   - Definition + handler exported in the conventional shape used by all
//     other tools in this directory (validate.ts, skill.ts, etc.). The
//     handler is NOT yet wired into mcp/server.ts — that registration is
//     called out as a separate coordination commit by the user's scope
//     statement, mirroring the same posture the user took for
//     harness.config.json schema extension and DesignConstraintAdapter.
//   - CRITIQUE / POLISH / BENCHMARK phases all run end-to-end over the
//     seeded rubrics / patterns / exemplars.
//   - Mode 'fast' critiques source code; mode 'deep' critiques rendered
//     screenshots (`captures`) via the provider's vision channel. The CLI
//     does not render components itself — captures are caller-supplied.
//   - autoCapture 'prompt'/'auto' run a caller-configured `captureCommand`
//     (render+screenshot step) to obtain deep-mode captures when none are
//     supplied; 'skip' never runs it. The CLI ships no browser of its own.
//
// Honors:
//   - ADR 0018: phase selection respected; cost surfaced in summary.
//   - ADR 0019: findings carry the 3-axis trio as emitted by the LLM.
//   - ADR 0020: catalog provenance recorded in summary.catalog.
//   - ADR 0021 (detect-and-offer): structurally honored by the
//     autoCapture arg surface; offer payload is not yet constructed.
//
// Spec ref: docs/changes/design-pipeline/design-craft-elevator/proposal.md
//   section "MCP tool API" (lines ~205–221).

import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { Ok, Err } from '@harness-engineering/core';
import type { Result } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import type { McpToolResponse } from '../utils/result-adapter.js';
import { runCritique, runVisionCritique } from '../../design-craft/phases/critique.js';
import type { CritiqueTarget, VisionCritiqueTarget } from '../../design-craft/phases/critique.js';
import { runPolish } from '../../design-craft/phases/polish.js';
import type { PolishTarget } from '../../design-craft/phases/polish.js';
import { runBenchmark } from '../../design-craft/phases/benchmark.js';
import type { BenchmarkTarget } from '../../design-craft/phases/benchmark.js';
import { SEED_RUBRICS } from '../../design-craft/catalog/rubrics/index.js';
import { SEED_PATTERNS } from '../../design-craft/catalog/patterns/index.js';
import { SEED_EXEMPLARS } from '../../design-craft/catalog/exemplars/index.js';
import { getProvider } from '../../design-craft/llm/provider.js';
import type { LlmProvider } from '../../design-craft/llm/provider.js';
import type {
  CraftFinding,
  BenchmarkScore,
  DesignCraftOutput,
} from '../../design-craft/findings/schema.js';
import {
  recordTrigger,
  recordApply,
  recordCite,
  recordSignalEvent,
} from '../../design-craft/measurement/index.js';

type Phase = 'critique' | 'polish' | 'benchmark';
type Mode = 'fast' | 'deep';
type AutoCapture = 'prompt' | 'auto' | 'skip';

export interface DesignCraftInput {
  path: string;
  mode?: Mode;
  phases?: Phase[];
  files?: string[];
  autoCapture?: AutoCapture;
  designStrictness?: 'strict' | 'standard' | 'permissive';
  catalog?: {
    rubrics?: string[];
    patterns?: string[];
    exemplars?: string[];
  };
  /**
   * BENCHMARK target descriptors. Phase 2 increment: BENCHMARK needs a
   * `component` identifier (CRITIQUE/POLISH can infer one from the file
   * path; BENCHMARK matches by componentType so a richer target shape is
   * required). Optional — if absent, BENCHMARK is skipped even when the
   * phase is requested.
   */
  benchmarkTargets?: Array<{
    file: string;
    component: string;
    componentType?: string;
  }>;
  /**
   * Deep-mode (vision) captures: rendered screenshots of components to critique
   * visually. Required when `mode: 'deep'` and the critique phase runs — the CLI
   * does not render components itself (no browser), so the screenshots are
   * supplied by the caller (e.g. a Storybook/Playwright capture step).
   */
  captures?: VisionCritiqueTarget[];
  /**
   * Deep-mode auto-capture command. When `mode: 'deep'` needs captures and none
   * are supplied, this command is invoked (unless `autoCapture: 'skip'`) to
   * render the components and emit captures. The CLI has no browser of its own,
   * so the caller supplies the render+screenshot step (Storybook, Playwright,
   * etc.). Contract: the command receives the candidate file list via the
   * `HARNESS_DESIGN_CRAFT_FILES` env var (a JSON array) and must print a JSON
   * array of `{ file, image, component? }` to stdout.
   */
  captureCommand?: string;
  /**
   * Test seam — replace the capture-command executor. Receives `(command,
   * files)` and returns the command's stdout. NOT in the MCP schema.
   */
  __runCapture?: (command: string, files: string[]) => string;
  /**
   * Test seam — inject an LlmProvider directly (e.g. MockLlmProvider).
   * NOT documented in the MCP tool schema; used by integration tests so
   * deterministic CI works without touching the live provider factory.
   */
  __testProvider?: LlmProvider;
  /**
   * Test seam — disables file-backed measurement writes. Production
   * callers leave this `undefined` so the catalog usage counters + signal
   * feedback loop accumulate per ADR 0020. Set to `false` in tests that
   * don't want stray `.harness/design-craft/` artifacts in the workspace.
   */
  __recordMeasurement?: boolean;
}

const DEFAULT_PHASES: readonly Phase[] = ['critique', 'polish', 'benchmark'];

export const designCraftToolDefinition = {
  name: 'design_craft',
  description:
    "Run the harness-design-craft skill: CRITIQUE / POLISH / BENCHMARK phases over a project's components. Fast-mode CRITIQUE iterates the v1 seed of 10 rubrics (hierarchy-clarity, typography-craft, motion-quality, color-confidence, density-rhythm, restraint, polish-details, copy-voice, interaction-craft, brand-coherence), POLISH iterates the 7 seed patterns (spring-physics, skeleton-content-matched, stagger-timing, page-transition-crossfade, fluid-type-scale, progressive-corner-rounding, focus-ring-craft), BENCHMARK iterates the 8 seed exemplars covering EmptyState (Linear resolved register + Notion instructional register), LoadingState (Stripe preview register + Vercel narrative register), CommandPalette, ErrorState, Modal, and Button.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      mode: {
        type: 'string',
        enum: ['fast', 'deep'],
        description:
          'fast (code-only LLM critique) or deep (vision critique of rendered screenshots — ' +
          'requires `captures`).',
      },
      phases: {
        type: 'array',
        items: { type: 'string', enum: ['critique', 'polish', 'benchmark'] },
        description: 'Subset of phases to run. Defaults to all three.',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional file scoping. Each entry is a path relative to project root.',
      },
      autoCapture: {
        type: 'string',
        enum: ['prompt', 'auto', 'skip'],
        description:
          'Deep-mode capture behavior when no `captures` are supplied. "skip" never runs the ' +
          'capture command; "prompt"/"auto" run `captureCommand` when one is configured.',
      },
      captureCommand: {
        type: 'string',
        description:
          'Deep-mode render+screenshot command. Receives the candidate files via the ' +
          'HARNESS_DESIGN_CRAFT_FILES env var (JSON array) and must print a JSON array of ' +
          '{ file, image, component? } to stdout. Used to obtain captures without a built-in browser.',
      },
      designStrictness: {
        type: 'string',
        enum: ['strict', 'standard', 'permissive'],
        description: 'Overall design strictness (passed through to harness-design when chained).',
      },
      benchmarkTargets: {
        type: 'array',
        description:
          'BENCHMARK target descriptors. Each entry needs at minimum { file, component }; optional componentType narrows exemplar selection.',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string' },
            component: { type: 'string' },
            componentType: { type: 'string' },
          },
          required: ['file', 'component'],
        },
      },
      captures: {
        type: 'array',
        description:
          'Deep-mode (vision) captures: rendered component screenshots. Required when mode="deep" ' +
          'and the critique phase runs. Each entry: { file, image, component? }, where `image` is a ' +
          'path to a PNG/JPEG/WebP screenshot (the CLI does not render components itself).',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string' },
            image: { type: 'string' },
            component: { type: 'string' },
          },
          required: ['file', 'image'],
        },
      },
    },
    required: ['path'],
  },
};

function selectPhases(requested?: Phase[]): Phase[] {
  if (!requested || requested.length === 0) return [...DEFAULT_PHASES];
  const unique = Array.from(new Set(requested));
  return unique.filter((p): p is Phase => (DEFAULT_PHASES as readonly string[]).includes(p));
}

function buildTargetsFromFiles(files: string[] | undefined): CritiqueTarget[] {
  if (!files || files.length === 0) return [];
  return files.map((file) => ({ file }));
}

function buildPolishTargets(files: string[] | undefined): PolishTarget[] {
  if (!files || files.length === 0) return [];
  return files.map((file) => ({ file }));
}

function buildBenchmarkTargets(
  descriptors: DesignCraftInput['benchmarkTargets']
): BenchmarkTarget[] {
  if (!descriptors || descriptors.length === 0) return [];
  return descriptors.map((d) => ({
    file: d.file,
    component: d.component,
    ...(d.componentType !== undefined ? { componentType: d.componentType } : {}),
  }));
}

/**
 * Aggregate llmCalls summary from the provider. Mock provider tracks
 * its own cost ledger; real providers will surface this through their own
 * cost adapter.
 */
function summarizeLlmCalls(provider: LlmProvider): DesignCraftOutput['summary']['llmCalls'] {
  const maybeGetCosts = (provider as unknown as { getCosts?: () => Array<{ costUsd: number }> })
    .getCosts;
  const costs = typeof maybeGetCosts === 'function' ? maybeGetCosts.call(provider) : [];
  const costUsd = costs.reduce((sum, c) => sum + (c.costUsd ?? 0), 0);
  return {
    provider: provider.providerId,
    model: provider.model,
    count: costs.length,
    costUsd,
  };
}

/**
 * Programmatic entry point for the design-craft skill — exported so the
 * check-design CLI command (design-pipeline #4) can compose this without
 * routing through MCP wrapping. Same contract as handleDesignCraft but
 * returns the Result directly instead of an MCP-wrapped response.
 */
export async function runDesignCraft(
  input: DesignCraftInput
): Promise<Result<DesignCraftOutput, { message: string }>> {
  return runPipeline(input);
}

/**
 * Invoke the caller-configured capture command and parse its `{ file, image }`
 * manifest. The command is the project's render+screenshot step (Storybook,
 * Playwright, etc.) — it receives the candidate files via the
 * `HARNESS_DESIGN_CRAFT_FILES` env var and prints a JSON array to stdout. This
 * is how deep mode obtains screenshots without the CLI owning a browser.
 */
export function runCaptureCommand(
  command: string,
  files: string[],
  exec?: (command: string, files: string[]) => string
): Result<VisionCritiqueTarget[], { message: string }> {
  let stdout: string;
  try {
    stdout = exec
      ? exec(command, files)
      : execSync(command, {
          encoding: 'utf-8',
          env: { ...process.env, HARNESS_DESIGN_CRAFT_FILES: JSON.stringify(files) },
          maxBuffer: 16 * 1024 * 1024,
        });
  } catch (err) {
    return Err({
      message: `design-craft capture command failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return Err({
      message:
        'design-craft capture command did not emit valid JSON. Expected `[{ "file": "...", "image": "..." }]` on stdout.',
    });
  }
  if (!Array.isArray(parsed)) {
    return Err({
      message: 'design-craft capture command output must be a JSON array of { file, image }.',
    });
  }

  const captures: VisionCritiqueTarget[] = [];
  for (const item of parsed) {
    if (
      item !== null &&
      typeof item === 'object' &&
      typeof (item as { file?: unknown }).file === 'string' &&
      typeof (item as { image?: unknown }).image === 'string'
    ) {
      const entry = item as { file: string; image: string; component?: unknown };
      const capture: VisionCritiqueTarget = { file: entry.file, image: entry.image };
      if (typeof entry.component === 'string') capture.component = entry.component;
      captures.push(capture);
    }
  }
  if (captures.length === 0) {
    return Err({
      message: 'design-craft capture command produced no valid { file, image } entries.',
    });
  }
  return Ok(captures);
}

async function runPipeline(
  input: DesignCraftInput
): Promise<Result<DesignCraftOutput, { message: string }>> {
  const mode: Mode = input.mode ?? 'fast';
  const phases = selectPhases(input.phases);

  // Deep mode critiques rendered screenshots via the provider's vision channel.
  // The CLI does not render components itself, so captures are either supplied
  // explicitly (`captures`) or produced by a caller-configured `captureCommand`.
  const autoCapture: AutoCapture = input.autoCapture ?? 'prompt';
  let captures = input.captures ?? [];
  const needsCaptures = mode === 'deep' && phases.includes('critique') && captures.length === 0;

  if (needsCaptures && input.captureCommand && autoCapture !== 'skip') {
    const captured = runCaptureCommand(input.captureCommand, input.files ?? [], input.__runCapture);
    if (!captured.ok) return captured;
    captures = captured.value;
  }

  if (mode === 'deep' && phases.includes('critique') && captures.length === 0) {
    return Err({
      message:
        'design-craft deep mode critiques rendered screenshots — supply `captures` ' +
        '([{ file, image }]) or configure `captureCommand` to render them (the CLI does not ' +
        'render components itself). Or use mode: "fast".',
    });
  }

  const provider = input.__testProvider ?? getProvider();
  const critiqueTargets = buildTargetsFromFiles(input.files);
  const polishTargets = buildPolishTargets(input.files);
  const benchmarkTargets = buildBenchmarkTargets(input.benchmarkTargets);
  const recordMeasurement = input.__recordMeasurement ?? true;
  const measurementRoot = input.path;

  const startedAt = Date.now();
  const findings: CraftFinding[] = [];
  const scores: BenchmarkScore[] = [];

  let rubricsApplied: string[] = [];
  if (phases.includes('critique')) {
    const rubrics = [...SEED_RUBRICS];
    // Deep mode → vision critique over the rendered captures; fast mode → the
    // code-only critique over the source files.
    const critiqueFindings =
      mode === 'deep'
        ? await runVisionCritique({ targets: captures, rubrics, provider })
        : critiqueTargets.length > 0
          ? await runCritique({ targets: critiqueTargets, rubrics, provider })
          : [];
    if (critiqueFindings.length > 0 || mode === 'deep') {
      rubricsApplied = rubrics.map((r) => r.id);
    }
    findings.push(...critiqueFindings);
    if (recordMeasurement && critiqueFindings.length > 0) {
      for (const rubric of rubrics) recordTrigger(rubric.id, measurementRoot);
      for (const f of critiqueFindings) recordSignalEvent(f, measurementRoot, measurementRoot);
    }
  }

  let patternsApplied: string[] = [];
  if (phases.includes('polish') && polishTargets.length > 0) {
    const patterns = [...SEED_PATTERNS];
    patternsApplied = patterns.map((p) => p.id);
    const polishFindings = await runPolish({ targets: polishTargets, patterns, provider });
    findings.push(...polishFindings);
    if (recordMeasurement) {
      for (const f of polishFindings) {
        recordApply(f.cite.rubricOrPatternId, measurementRoot);
        recordSignalEvent(f, measurementRoot, measurementRoot);
      }
    }
  }

  let exemplarsCited: string[] = [];
  if (phases.includes('benchmark') && benchmarkTargets.length > 0) {
    const exemplars = [...SEED_EXEMPLARS];
    const benchmarkScores = await runBenchmark({
      targets: benchmarkTargets,
      exemplars,
      provider,
    });
    scores.push(...benchmarkScores);
    exemplarsCited = Array.from(new Set(benchmarkScores.flatMap((s) => s.exemplars)));
    if (recordMeasurement) {
      for (const id of exemplarsCited) recordCite(id, measurementRoot);
    }
  }

  const output: DesignCraftOutput = {
    findings,
    scores,
    summary: {
      phaseRun: phases,
      mode,
      durationMs: Date.now() - startedAt,
      llmCalls: summarizeLlmCalls(provider),
      catalog: {
        rubricsApplied,
        patternsApplied,
        exemplarsCited,
      },
      preconditions: {
        // Real precondition probing lands with resolvers/preconditions.ts.
        // For MVP we report `false` so consumers don't mistakenly assume
        // intent-anchored critique ran.
        aestheticIntentDeclared: false,
        designMdExists: false,
        tokensExist: false,
      },
      deferralsToHarnessDesign: 0,
      runId: crypto.randomUUID(),
    },
  };

  return Ok(output);
}

export async function handleDesignCraft(input: DesignCraftInput): Promise<McpToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return resultToMcpResponse(Err({ message: 'design_craft: `path` is required' }));
  }
  try {
    const result = await runPipeline(input);
    return resultToMcpResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return resultToMcpResponse(Err({ message: `design_craft failed: ${message}` }));
  }
}
