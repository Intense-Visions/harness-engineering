/**
 * Phase 3: FIX — convergence loop with align-design-system.
 *
 * Loop bounded at 5 iterations (matches docs-pipeline). Stops when
 * align applies 0 fixes (converged) or when total drift count fails
 * to decrease (no progress).
 *
 * Source: docs/changes/design-pipeline/orchestrator/proposal.md
 *   (Technical Design → Phase 3: FIX).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runAlignDesignSystem } from '../../mcp/tools/align-design-system.js';
import { runDetectDrift } from '../../mcp/tools/detect-drift.js';
import type { DesignPipelineContext } from '../context.js';
import type { DriftFinding } from '../../drift/findings/finding.js';

const MAX_ITERATIONS = 5;

export interface FixInput {
  projectRoot: string;
  context: DesignPipelineContext;
  mode: 'fast' | 'full';
  files?: string[];
  designStrictness?: 'strict' | 'standard' | 'permissive';
}

/**
 * `summary.iterationsRun` counts passes when they START, so every exit —
 * converged, no progress, align or re-detect failure — reports the passes that
 * ran. Incrementing only on the progress path reported `iterationsRun: 0`
 * beside `fixesApplied > 0` for a pass that applied fixes and then hit the
 * no-progress stop: a summary contradicting its own evidence.
 */
export async function runFix(input: FixInput): Promise<void> {
  const { projectRoot, context, mode, files, designStrictness } = input;

  if (context.driftFindings.length === 0) return;

  let iteration = 0;
  let previousCount = context.driftFindings.length;

  while (iteration < MAX_ITERATIONS) {
    iteration++; // counted at pass START — see the note above runFix

    // Write pipeline handoff so align reads pre-classified findings
    writePipelineHandoff(projectRoot, context);

    let applied: number;
    try {
      const result = await runAlignDesignSystem({
        path: projectRoot,
        mode: 'pipeline',
      });
      context.fixesApplied.push(...result.outcomes);
      applied = result.summary.applied;
    } catch (err) {
      context.verifiersFailed.push({
        name: 'align-design-system',
        error: err instanceof Error ? err.message : String(err),
      });
      break;
    }

    if (applied === 0) break; // converged

    // Re-run detect to see if fixes revealed/resolved drift
    const detectResult = await safelyRedetect(projectRoot, mode, files, designStrictness);
    if (!detectResult.ok) {
      // The re-detect could not run. Breaking out silently here left
      // `verifiersFailed` empty, so the pipeline reported a converged fix loop
      // whose last iteration was never verified — the only one of the seven
      // detect-drift call sites where the abstention vanished (#2070).
      context.verifiersFailed.push({ name: 'detect-drift', error: detectResult.error });
      break;
    }
    context.driftFindings = detectResult.findings;

    const newCount = detectResult.findings.length;
    if (newCount >= previousCount) break; // no progress
    previousCount = newCount;
  }
  context.summary.iterationsRun = iteration;
}

/**
 * Re-run detect-drift inside the fix loop, reporting WHY it could not run
 * rather than collapsing every failure to `null`. The caller records the reason
 * on `verifiersFailed`; swallowing it let a loop that stopped because it could
 * not verify look like a loop that stopped because it converged.
 */
async function safelyRedetect(
  projectRoot: string,
  mode: 'fast' | 'full',
  files: string[] | undefined,
  designStrictness: 'strict' | 'standard' | 'permissive' | undefined
): Promise<{ ok: true; findings: DriftFinding[] } | { ok: false; error: string }> {
  try {
    const result = await runDetectDrift({
      path: projectRoot,
      mode,
      ...(files !== undefined && { files }),
      ...(designStrictness !== undefined && { designStrictness }),
    });
    return { ok: true, findings: [...result.findings] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function writePipelineHandoff(projectRoot: string, context: DesignPipelineContext): void {
  const handoffPath = path.join(projectRoot, '.harness', 'handoff.json');
  let handoff: Record<string, unknown> = {};
  if (fs.existsSync(handoffPath)) {
    try {
      handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf-8'));
    } catch {
      handoff = {};
    }
  }
  handoff.pipeline = {
    driftFindings: context.driftFindings,
  };
  fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
  fs.writeFileSync(handoffPath, JSON.stringify(handoff, null, 2) + '\n');
}
