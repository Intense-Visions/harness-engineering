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
import { saveLastBatch, loadLastBatch, hashContent } from './revert/state.js';
import { applyInverse } from './revert/inverse.js';

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
  /**
   * When true, inverse-applies the last batch persisted at
   * `.harness/align/last-batch.json` and exits — no detect / classify /
   * codemod work runs. Skips silently if no batch is recorded or files
   * have been edited externally since the apply (SC #27).
   */
  revert?: boolean;
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

  if (input.revert === true) {
    return runRevert(projectRoot, mode, dryRun, startedAt);
  }

  const findings = await loadFindings(projectRoot, input, mode);
  const tokenPaths = loadTokenPathIndex(projectRoot);
  const sourceCache = new Map<string, string>();
  const { outcomes, filesModified } = await applyAll({
    findings,
    fixBatch: input.fixBatch,
    tokenPaths,
    sourceCache,
    dryRun,
  });

  persistRunArtifacts({ projectRoot, mode, dryRun, outcomes, sourceCache });

  return aggregateOutput(outcomes, {
    mode,
    dryRun,
    tokensLoaded: tokenPaths !== null,
    durationMs: Date.now() - startedAt,
    filesModified: filesModified.size,
  });
}

interface ApplyAllInput {
  findings: DriftFinding[];
  fixBatch: string[] | undefined;
  tokenPaths: TokenPathIndex | null;
  sourceCache: Map<string, string>;
  dryRun: boolean;
}

async function applyAll(input: ApplyAllInput): Promise<{
  outcomes: FixOutcome[];
  filesModified: Set<string>;
}> {
  const outcomes: FixOutcome[] = [];
  const filesModified = new Set<string>();
  for (const finding of input.findings) {
    if (input.fixBatch !== undefined && !input.fixBatch.includes(findingKey(finding))) {
      continue;
    }
    const outcome = await processFindingSafely(
      finding,
      input.tokenPaths,
      input.sourceCache,
      input.dryRun
    );
    if (outcome.kind === 'applied') filesModified.add(outcome.diff.file);
    outcomes.push(outcome);
  }
  return { outcomes, filesModified };
}

async function processFindingSafely(
  finding: DriftFinding,
  tokenPaths: TokenPathIndex | null,
  sourceCache: Map<string, string>,
  dryRun: boolean
): Promise<FixOutcome> {
  try {
    return await processFinding(finding, tokenPaths, sourceCache, dryRun);
  } catch (err) {
    return {
      kind: 'failed',
      finding,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function persistRunArtifacts(args: {
  projectRoot: string;
  mode: AlignMode;
  dryRun: boolean;
  outcomes: FixOutcome[];
  sourceCache: Map<string, string>;
}): void {
  if (args.mode === 'pipeline') {
    writePipelineFixesApplied(args.projectRoot, args.outcomes);
  }
  if (args.dryRun) return;
  saveLastBatch(args.projectRoot, args.outcomes, args.mode, (file) => {
    const cached = args.sourceCache.get(file);
    if (cached !== undefined) return cached;
    return fs.readFileSync(file, 'utf-8');
  });
}

async function runRevert(
  projectRoot: string,
  mode: AlignMode,
  dryRun: boolean,
  startedAt: number
): Promise<AlignDesignSystemOutput> {
  const batch = loadLastBatch(projectRoot);
  if (batch === null) {
    return aggregateOutput([], {
      mode,
      dryRun,
      tokensLoaded: false,
      durationMs: Date.now() - startedAt,
      filesModified: 0,
      revert: true,
    });
  }

  const outcomes: FixOutcome[] = [];
  const filesModified = new Set<string>();
  // Sort entries by file then by descending line so multi-edit files
  // revert cleanly (later lines first means earlier line numbers stay
  // valid after each replacement).
  const ordered = [...batch.entries].sort((a, b) => {
    if (a.diff.file !== b.diff.file) return a.diff.file.localeCompare(b.diff.file);
    return b.diff.line - a.diff.line;
  });

  const sourceCache = new Map<string, string>();
  for (const entry of ordered) {
    const outcome = revertEntry(entry, sourceCache, dryRun);
    if (outcome.kind === 'applied') filesModified.add(outcome.diff.file);
    outcomes.push(outcome);
  }

  return aggregateOutput(outcomes, {
    mode,
    dryRun,
    tokensLoaded: false,
    durationMs: Date.now() - startedAt,
    filesModified: filesModified.size,
    revert: true,
  });
}

function revertEntry(
  entry: import('./revert/state.js').LastBatchEntry,
  sourceCache: Map<string, string>,
  dryRun: boolean
): FixOutcome {
  const source = readForRevert(entry.diff.file, sourceCache);
  if (source.kind === 'failed')
    return { kind: 'failed', finding: entry.finding, error: source.error };

  if (!sourceCache.has(entry.diff.file)) {
    // Content-hash check happens only the first time we touch the file.
    // Subsequent entries for the same file read the mutated cache, so
    // re-hashing would always mismatch. The first check is the gate.
    if (hashContent(source.text) !== entry.postApplySha256) {
      sourceCache.set(entry.diff.file, source.text);
      return {
        kind: 'skipped-unsafe',
        finding: entry.finding,
        reason: 'file changed externally since apply (content hash mismatch)',
      };
    }
    sourceCache.set(entry.diff.file, source.text);
  }

  const result = applyInverse(source.text, entry.diff);
  if (!result.ok) {
    return { kind: 'skipped-unsafe', finding: entry.finding, reason: result.reason };
  }

  if (!dryRun) {
    const writeErr = tryWrite(entry.diff.file, result.newSource);
    if (writeErr !== null) return { kind: 'failed', finding: entry.finding, error: writeErr };
  }
  sourceCache.set(entry.diff.file, result.newSource);
  return { kind: 'applied', finding: entry.finding, diff: result.invertedDiff };
}

function readForRevert(
  file: string,
  sourceCache: Map<string, string>
): { kind: 'ok'; text: string } | { kind: 'failed'; error: string } {
  const cached = sourceCache.get(file);
  if (cached !== undefined) return { kind: 'ok', text: cached };
  try {
    return { kind: 'ok', text: fs.readFileSync(file, 'utf-8') };
  } catch (err) {
    return {
      kind: 'failed',
      error: `cannot read source file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function tryWrite(file: string, content: string): string | null {
  try {
    fs.writeFileSync(file, content, 'utf-8');
    return null;
  } catch (err) {
    return `cannot write source file: ${err instanceof Error ? err.message : String(err)}`;
  }
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
    revert?: boolean;
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
      ...(meta.revert === true ? { revert: true as const } : {}),
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
