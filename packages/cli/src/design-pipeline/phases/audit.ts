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
      // Store findings under the verifier-named bucket. v1 maps two known
      // names. This name branch is the documented contract, not an Iron Law
      // violation: the Iron Law forbids importing per-verifier RULE logic, and
      // the registry makes invocation generic, but findings collection is
      // per-name. A new verifier needs a bucket here, a field on
      // `auditFindings`, and a count in REPORT.
      //
      // A name with no bucket is an ABSTENTION, not a success. The comment
      // that used to sit here claimed unknown names were "stashed under
      // audit-anatomy by default", but the branch below had no `else`: the
      // findings were dropped on the floor while `verifiersRun` recorded the
      // verifier as having contributed, so a 5th registered verifier could
      // report thousands of violations and the run would still read clean.
      // Same bug class as the verdict in #2273 — a summary field (here
      // `verifiersRun`) computed independently of whether any evidence was
      // actually absorbed. Recording it on `verifiersFailed` makes the
      // omission loud, and REPORT then refuses to call the run a pass.
      if (verifier.name === 'audit-anatomy') {
        context.auditFindings.anatomy = result.findings as AnatomyFinding[];
      } else if (verifier.name === 'audit-brand') {
        context.auditFindings.brand = result.findings as BrandFinding[];
      } else {
        context.verifiersFailed.push({
          name: verifier.name,
          error:
            `Verifier '${verifier.name}' ran and returned ${result.findings.length} finding(s), ` +
            'but the AUDIT phase has no findings bucket for that name, so they were not ' +
            'collected. Registering a verifier is not enough on its own: add a findings ' +
            'bucket to DesignPipelineContext.auditFindings (context.ts), a routing branch ' +
            'for it in packages/cli/src/design-pipeline/phases/audit.ts, and count that ' +
            'bucket in phases/report.ts so its findings reach the verdict.',
        });
        continue;
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
