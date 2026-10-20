/**
 * design-pipeline orchestrator — composes detect-design-drift,
 * align-design-system, audit-component-anatomy, audit-brand-compliance,
 * and design-craft-elevator into a sequential pipeline with
 * convergence-based remediation.
 *
 * Mirrors harness-docs-pipeline in shape. AUDIT invokes every registered
 * Verifier<F> through one generic loop, but it routes each verifier's
 * findings into a NAMED bucket, so a 5th rule-based verifier is not free:
 * it needs a registration below, a bucket (DesignPipelineContext.auditFindings
 * + a routing branch in phases/audit.ts), and a count in phases/report.ts.
 * A registered verifier with no bucket is recorded as an abstention, which
 * fails the verdict (#2273) — loud by design, rather than its findings being
 * silently dropped.
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
  /**
   * @deprecated Accepted for compatibility and changes nothing. Every v1 run is
   * already non-interactive and FIX applies only safe codemods, which is all
   * `--ci` ever promised. Passing it records a notice on `warnings` so the
   * no-op is visible rather than silent.
   */
  ci?: boolean;
}

export const CI_OPTION_DEPRECATION =
  '`ci` / `--ci` is deprecated and has no effect: design-pipeline is always ' +
  'non-interactive and FIX applies only safe codemods. Drop the option.';

export async function runDesignPipeline(
  input: DesignPipelineInput
): Promise<DesignPipelineContext> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const mode = input.mode ?? 'fast';
  const context = newContext();
  if (input.ci === true) context.warnings.push(CI_OPTION_DEPRECATION);

  // Build the verifier registry. Registering a 5th verifier here is necessary
  // but NOT sufficient: AUDIT also needs a findings bucket for its name, and
  // REPORT must count that bucket, or every run fails with the verifier named
  // in `degradedBy` (see the header comment and phases/audit.ts).
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
