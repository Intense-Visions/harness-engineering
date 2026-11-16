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
  context.inputs = probeInputs(projectRoot);
}

/**
 * Read-only probe of which design-system inputs exist on disk. FRESHEN records
 * the result as `context.inputs`; the orchestrator also takes it before FILL
 * on every run, so the verdict can read input *presence* rather than whether
 * FILL happened to bootstrap something (#1960).
 */
export function probeInputs(projectRoot: string): DesignPipelineContext['inputs'] {
  const designMdPath = path.join(projectRoot, 'design-system', 'DESIGN.md');
  const tokensJsonPath = path.join(projectRoot, 'design-system', 'tokens.json');

  const designMdExists = fs.existsSync(designMdPath);
  const tokensJsonExists = fs.existsSync(tokensJsonPath);
  let componentRegistryExists = false;
  let brandRulesExist = false;
  if (designMdExists) {
    const content = readFileSafe(designMdPath);
    componentRegistryExists = content !== null && /^##\s+component\s+registry\b/im.test(content);
    brandRulesExist = content !== null && /^##\s+brand\s+rules\b/im.test(content);
  }
  return { designMdExists, tokensJsonExists, componentRegistryExists, brandRulesExist };
}

/**
 * The inputs a probe found missing, named as a reader would look for them.
 * A missing DESIGN.md implies its sections are missing too, so they are not
 * listed separately.
 */
export function listMissingInputs(inputs: DesignPipelineContext['inputs']): string[] {
  const missing: string[] = [];
  if (!inputs.designMdExists) {
    missing.push('design-system/DESIGN.md');
  } else {
    if (!inputs.componentRegistryExists) missing.push('DESIGN.md "## Component Registry" section');
    if (!inputs.brandRulesExist) missing.push('DESIGN.md "## Brand Rules" section');
  }
  if (!inputs.tokensJsonExists) missing.push('design-system/tokens.json');
  return missing;
}

function readFileSafe(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}
