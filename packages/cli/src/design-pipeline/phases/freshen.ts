/**
 * Phase 1: FRESHEN — read-only check of input freshness.
 * Sets context.inputs.{designMdExists,tokensJsonExists,...} flags
 * and context.graphAvailable. Bootstrap action is DEFERRED to FILL
 * to keep phase responsibilities clean.
 *
 * Source: docs/changes/design-pipeline/orchestrator/proposal.md
 *   (Technical Design → Phase 1: FRESHEN).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DesignPipelineContext } from '../context.js';

export interface FreshenInput {
  projectRoot: string;
  context: DesignPipelineContext;
}

export function runFreshen(input: FreshenInput): void {
  const { projectRoot, context } = input;

  context.graphAvailable = fs.existsSync(path.join(projectRoot, '.harness', 'graph'));

  const designMdPath = path.join(projectRoot, 'design-system', 'DESIGN.md');
  const tokensJsonPath = path.join(projectRoot, 'design-system', 'tokens.json');

  context.inputs.designMdExists = fs.existsSync(designMdPath);
  context.inputs.tokensJsonExists = fs.existsSync(tokensJsonPath);

  if (context.inputs.designMdExists) {
    const content = readFileSafe(designMdPath);
    context.inputs.componentRegistryExists =
      content !== null && /^##\s+component\s+registry\b/im.test(content);
    context.inputs.brandRulesExist = content !== null && /^##\s+brand\s+rules\b/im.test(content);
  }
}

function readFileSafe(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}
