/**
 * design-pipeline orchestrator — composes detect-design-drift,
 * align-design-system, audit-component-anatomy, audit-brand-compliance,
 * and design-craft-elevator into a sequential pipeline with
 * convergence-based remediation.
 *
 * Mirrors harness-docs-pipeline in shape. Consumes the just-extracted
 * Verifier<F> interface generically so a 5th rule-based verifier
 * composes for free (zero orchestrator changes).
 *
 * Source: docs/changes/design-pipeline/orchestrator/proposal.md
 *   (Technical Design → Module layout).
 */

import { sanitizePath } from '../mcp/utils/sanitize-path.js';
import { runAudit as runAnatomyAudit } from '../mcp/tools/audit-anatomy.js';
import { runAuditBrand } from '../mcp/tools/audit-brand.js';
import { newContext, type DesignPipelineContext } from './context.js';
import { VerifierRegistry } from './registry.js';
import { runFreshen } from './phases/freshen.js';
import { runDetect } from './phases/detect.js';
import { runFix } from './phases/fix.js';
import { runAudit } from './phases/audit.js';
import { runFill } from './phases/fill.js';
import { runReport } from './phases/report.js';

export interface DesignPipelineInput {
  path: string;
  mode?: 'fast' | 'full';
  files?: string[];
  designStrictness?: 'strict' | 'standard' | 'permissive';
  fix?: boolean;
  noFreshen?: boolean;
  noFill?: boolean;
  ci?: boolean;
}

export async function runDesignPipeline(
  input: DesignPipelineInput
): Promise<DesignPipelineContext> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const mode = input.mode ?? 'fast';
  const context = newContext();

  // Build the verifier registry. Adding a 5th verifier here is the only
  // orchestrator change required to compose a new rule-based audit.
  // design-craft-elevator is NOT registered — different output shape;
  // dispatched in FILL phase.
  const registry = new VerifierRegistry();
  registry.register('audit-anatomy', runAnatomyAudit);
  registry.register('audit-brand', runAuditBrand);

  // PHASE 1: FRESHEN (skipped if --no-freshen)
  if (input.noFreshen !== true) {
    runFreshen({ projectRoot, context });
  }

  // PHASE 2: DETECT
  await runDetect({
    projectRoot,
    context,
    mode,
    ...(input.files !== undefined && { files: input.files }),
    ...(input.designStrictness !== undefined && { designStrictness: input.designStrictness }),
  });

  // PHASE 3: FIX (only when --fix is set)
  if (input.fix === true) {
    await runFix({
      projectRoot,
      context,
      mode,
      ...(input.files !== undefined && { files: input.files }),
      ...(input.designStrictness !== undefined && { designStrictness: input.designStrictness }),
    });
  }

  // PHASE 4: AUDIT (generic registry loop)
  await runAudit({
    projectRoot,
    context,
    registry,
    mode,
    ...(input.files !== undefined && { files: input.files }),
    ...(input.designStrictness !== undefined && { designStrictness: input.designStrictness }),
  });

  // PHASE 5: FILL (skipped if --no-fill)
  if (input.noFill !== true) {
    await runFill({
      projectRoot,
      context,
      mode,
      ...(input.files !== undefined && { files: input.files }),
    });
  }

  // PHASE 6: REPORT
  runReport({ context });

  context.summary.durationMs = Date.now() - startedAt;
  return context;
}

export type { DesignPipelineContext, Verdict } from './context.js';
