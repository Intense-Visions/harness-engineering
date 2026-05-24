/**
 * Phase 2: DETECT — invoke detect-design-drift, populate
 * context.driftFindings.
 *
 * Source: docs/changes/design-pipeline/orchestrator/proposal.md
 *   (Technical Design → Phase 2: DETECT).
 */

import { runDetectDrift } from '../../mcp/tools/detect-drift.js';
import type { DesignPipelineContext } from '../context.js';

export interface DetectInput {
  projectRoot: string;
  context: DesignPipelineContext;
  mode: 'fast' | 'full';
  files?: string[];
  designStrictness?: 'strict' | 'standard' | 'permissive';
}

export async function runDetect(input: DetectInput): Promise<void> {
  const { projectRoot, context, mode, files, designStrictness } = input;
  try {
    const result = await runDetectDrift({
      path: projectRoot,
      mode,
      ...(files !== undefined && { files }),
      ...(designStrictness !== undefined && { designStrictness }),
    });
    context.driftFindings = [...result.findings];
    context.verifiersRun.push('detect-drift');
  } catch (err) {
    context.verifiersFailed.push({
      name: 'detect-drift',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
