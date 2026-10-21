/**
 * Phase 1: FRESHEN — read-only check of input freshness.
 * Sets context.inputs.{designMdExists,tokensJsonExists,...} flags.
 * Bootstrap action is DEFERRED to FILL to keep phase responsibilities clean.
 *
 * The deprecated `graphAvailable` flag is NOT set here: it is probed by
 * `probeGraphAvailable` on every run, because tying it to this phase made it
 * report `false` under `--no-freshen` even with a graph on disk.
 *
 * Source: docs/changes/design-pipeline/orchestrator/proposal.md
 *   (Technical Design → Phase 1: FRESHEN).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveGraphDir } from '@harness-engineering/graph';
import type { DesignPipelineContext } from '../context.js';

/**
 * Whether a persisted knowledge graph (`graph.json`) exists for the project.
 * Backs the deprecated `graphAvailable` field; read-only and cheap, so it runs
 * regardless of `--no-freshen`.
 */
export function probeGraphAvailable(projectRoot: string): boolean {
  return fs.existsSync(path.join(resolveGraphDir(projectRoot), 'graph.json'));
}

export interface FreshenInput {
  projectRoot: string;
  context: DesignPipelineContext;
}

export function runFreshen(input: FreshenInput): void {
  const { projectRoot, context } = input;

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
