/**
 * align-design-system orchestrator — consumes DRIFT-* findings and
 * produces FixOutcome[] either by applying codemods (T001/T002/T003 when
 * the pre-flight classifier says safe) or emitting precise suggestions
 * (T004 + all P*, or any T001-T003 the classifier downgrades).
 *
 * Runs in two modes:
 *   - standalone: runs detect-design-drift internally to gather findings
 *   - pipeline:   reads pre-classified findings from .harness/handoff.json
 *
 * Source: docs/changes/design-pipeline/align-design-system/proposal.md
 *   (Technical Design → Standalone vs pipeline mode).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { sanitizePath } from '../mcp/utils/sanitize-path.js';
import { runDetectDrift } from '../drift/index.js';
import type { DriftFinding, DriftStrictness } from '../drift/findings/finding.js';
import { loadTokenPathIndex } from '../drift/resolvers/tokens.js';
import type { TokenPathIndex } from '../drift/resolvers/tokens.js';
import { classifyFinding } from './classifier/pre-flight.js';
import { applyT001Codemod } from './codemods/t001-hex.js';
import { applyT002Codemod } from './codemods/t002-font-family.js';
import { applyT003Codemod } from './codemods/t003-px-spacing.js';
import { emitT004Suggestion } from './suggestions/t004-deprecated.js';
import { emitPrimitiveSuggestion } from './suggestions/p-primitives.js';
import type { AlignDesignSystemOutput, AlignMode, FixOutcome } from './findings/outcome.js';

export interface AlignInput {
  path: string;
  dryRun?: boolean;
  files?: string[];
  designStrictness?: DriftStrictness;
  /**
   * When set, align operates in pipeline mode: reads findings from
   * .harness/handoff.json's pipeline.driftFindings field instead of
   * running detect-design-drift. Writes pipeline.fixesApplied back.
   */
  mode?: AlignMode;
  /** Pipeline-mode: limit to specific finding code-line keys */
  fixBatch?: string[];
}

const HANDOFF_PATH = '.harness/handoff.json';

interface PipelineHandoff {
  pipeline?: {
    driftFindings?: DriftFinding[];
    fixBatch?: string[];
    fixesApplied?: FixOutcome[];
  };
  [key: string]: unknown;
}

export async function runAlignDesignSystem(input: AlignInput): Promise<AlignDesignSystemOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const mode: AlignMode = input.mode ?? 'standalone';
  const dryRun = input.dryRun === true;

  const findings = await loadFindings(projectRoot, input, mode);
  const tokenPaths = loadTokenPathIndex(projectRoot);
  const outcomes: FixOutcome[] = [];
  const filesModified = new Set<string>();

  // Cache file source between fixes on the same file
  const sourceCache = new Map<string, string>();

  for (const finding of findings) {
    if (input.fixBatch !== undefined && !input.fixBatch.includes(findingKey(finding))) {
      continue;
    }
    try {
      const outcome = await processFinding(finding, tokenPaths, sourceCache, dryRun);
      if (outcome.kind === 'applied') filesModified.add(outcome.diff.file);
      outcomes.push(outcome);
    } catch (err) {
      outcomes.push({
        kind: 'failed',
        finding,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (mode === 'pipeline') {
    writePipelineFixesApplied(projectRoot, outcomes);
  }

  return aggregateOutput(outcomes, {
    mode,
    dryRun,
    tokensLoaded: tokenPaths !== null,
    durationMs: Date.now() - startedAt,
    filesModified: filesModified.size,
  });
}

async function loadFindings(
  projectRoot: string,
  input: AlignInput,
  mode: AlignMode
): Promise<DriftFinding[]> {
  if (mode === 'pipeline') {
    const handoffPath = path.join(projectRoot, HANDOFF_PATH);
    if (!fs.existsSync(handoffPath)) return [];
    try {
      const raw = fs.readFileSync(handoffPath, 'utf-8');
      const parsed = JSON.parse(raw) as PipelineHandoff;
      return parsed.pipeline?.driftFindings ?? [];
    } catch {
      return [];
    }
  }
  // standalone — run detect internally
  const driftInput: {
    path: string;
    mode: 'fast';
    files?: string[];
    designStrictness?: DriftStrictness;
  } = {
    path: projectRoot,
    mode: 'fast',
  };
  if (input.files !== undefined) driftInput.files = input.files;
  if (input.designStrictness !== undefined) driftInput.designStrictness = input.designStrictness;
  const detectOut = await runDetectDrift(driftInput);
  return detectOut.findings;
}

async function processFinding(
  finding: DriftFinding,
  tokenPaths: TokenPathIndex | null,
  sourceCache: Map<string, string>,
  dryRun: boolean
): Promise<FixOutcome> {
  // Suggestion-only paths (T004 + P*)
  if (finding.code === 'DRIFT-T004') {
    return { kind: 'suggestion', finding, suggestion: emitT004Suggestion(finding) };
  }
  if (finding.code.startsWith('DRIFT-P')) {
    return { kind: 'suggestion', finding, suggestion: emitPrimitiveSuggestion(finding) };
  }

  // T001/T002/T003 — read source, classify, attempt codemod
  let source: string;
  try {
    source = sourceCache.get(finding.file) ?? fs.readFileSync(finding.file, 'utf-8');
    sourceCache.set(finding.file, source);
  } catch (err) {
    return {
      kind: 'failed',
      finding,
      error: `cannot read source file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const classification = classifyFinding({ finding, source, tokenPaths });
  if (classification.kind === 'suggestion') {
    return {
      kind: 'suggestion',
      finding,
      suggestion: {
        description: `${finding.fix.description}\n\n[downgraded from auto-fix: ${classification.reason}]`,
        preview: '(suggestion only — pre-flight classifier blocked auto-fix)',
      },
    };
  }

  const result = applyCodemod(finding, source, classification);
  if (!result.ok) {
    return { kind: 'skipped-unsafe', finding, reason: result.reason };
  }

  if (!dryRun) {
    try {
      fs.writeFileSync(finding.file, result.newSource, 'utf-8');
      sourceCache.set(finding.file, result.newSource);
    } catch (err) {
      return {
        kind: 'failed',
        finding,
        error: `cannot write source file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  return { kind: 'applied', finding, diff: result.diff };
}

function applyCodemod(
  finding: DriftFinding,
  source: string,
  classification: Extract<ReturnType<typeof classifyFinding>, { kind: 'safe-codemod' }>
):
  | { ok: true; newSource: string; diff: import('./findings/outcome.js').FixDiff }
  | { ok: false; reason: string } {
  if (finding.code === 'DRIFT-T001') return applyT001Codemod(source, finding, classification);
  if (finding.code === 'DRIFT-T002') return applyT002Codemod(source, finding, classification);
  if (finding.code === 'DRIFT-T003') return applyT003Codemod(source, finding, classification);
  return { ok: false, reason: `no codemod registered for ${finding.code}` };
}

function aggregateOutput(
  outcomes: FixOutcome[],
  meta: {
    mode: AlignMode;
    dryRun: boolean;
    tokensLoaded: boolean;
    durationMs: number;
    filesModified: number;
  }
): AlignDesignSystemOutput {
  const codesApplied = new Set<string>();
  const codesSuggested = new Set<string>();
  let applied = 0;
  let suggestions = 0;
  let skipped = 0;
  let failed = 0;
  for (const o of outcomes) {
    if (o.kind === 'applied') {
      applied++;
      codesApplied.add(o.finding.code);
    } else if (o.kind === 'suggestion') {
      suggestions++;
      codesSuggested.add(o.finding.code);
    } else if (o.kind === 'skipped-unsafe') {
      skipped++;
    } else {
      failed++;
    }
  }
  return {
    outcomes,
    summary: {
      totalFindings: outcomes.length,
      applied,
      suggestions,
      skipped,
      failed,
      filesModified: meta.filesModified,
      durationMs: meta.durationMs,
    },
    catalog: {
      codemodApplied: [...codesApplied].sort(),
      suggestionsEmitted: [...codesSuggested].sort(),
    },
    meta: {
      mode: meta.mode,
      dryRun: meta.dryRun,
      tokensLoaded: meta.tokensLoaded,
    },
  };
}

function writePipelineFixesApplied(projectRoot: string, outcomes: FixOutcome[]): void {
  const handoffPath = path.join(projectRoot, HANDOFF_PATH);
  let handoff: PipelineHandoff = {};
  if (fs.existsSync(handoffPath)) {
    try {
      handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf-8')) as PipelineHandoff;
    } catch {
      handoff = {};
    }
  }
  handoff.pipeline = handoff.pipeline ?? {};
  handoff.pipeline.fixesApplied = outcomes;
  fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
  fs.writeFileSync(handoffPath, JSON.stringify(handoff, null, 2) + '\n', 'utf-8');
}

function findingKey(finding: DriftFinding): string {
  return `${finding.code}@${finding.file}:${finding.line ?? '?'}`;
}

export type { FixOutcome, AlignDesignSystemOutput } from './findings/outcome.js';
