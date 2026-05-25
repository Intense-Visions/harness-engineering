/**
 * Phase 4: AUDIT — invoke registered rule-based verifiers generically
 * via the Verifier<F> registry.
 *
 * Iron Law: orchestrator does NOT import per-verifier rule logic.
 * Each registered runner is the verifier's public entry point.
 *
 * design-craft-elevator is NOT registered here — it has a different
 * output shape (tier/impact/confidence vs severity) and is dispatched
 * in FILL phase instead.
 *
 * Source: docs/changes/design-pipeline/orchestrator/proposal.md
 *   (Technical Design → Phase 4: AUDIT).
 */

import type { DesignPipelineContext } from '../context.js';
import type { VerifierRegistry } from '../registry.js';
import type { AnatomyFinding } from '../../audit/component-anatomy/findings/finding.js';
import type { BrandFinding } from '../../brand/findings/finding.js';

export interface AuditInput {
  projectRoot: string;
  context: DesignPipelineContext;
  registry: VerifierRegistry;
  mode: 'fast' | 'full';
  files?: string[];
  designStrictness?: 'strict' | 'standard' | 'permissive';
}

export async function runAudit(input: AuditInput): Promise<void> {
  const { projectRoot, context, registry, mode, files, designStrictness } = input;

  for (const verifier of registry.list()) {
    try {
      const result = await verifier.runner({
        path: projectRoot,
        mode,
        ...(files !== undefined && { files }),
        ...(designStrictness !== undefined && { designStrictness }),
      });
      // Store findings under verifier-named bucket. v1 maps two known
      // names; unknown verifier names are stashed under audit-anatomy
      // by default (the most likely shape match) — additive future
      // verifiers should declare their bucket explicitly.
      if (verifier.name === 'audit-anatomy') {
        context.auditFindings.anatomy = result.findings as AnatomyFinding[];
      } else if (verifier.name === 'audit-brand') {
        context.auditFindings.brand = result.findings as BrandFinding[];
      }
      context.verifiersRun.push(verifier.name);
    } catch (err) {
      context.verifiersFailed.push({
        name: verifier.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
