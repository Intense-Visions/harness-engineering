/**
 * JSON-transport shape of a design-pipeline result: the `exclusions` Set
 * becomes an array (always an array — `[]` when unmeasured; read
 * `exclusionsMeasured` for that). Shared by the CLI's `--json` output and the
 * `run_design_pipeline` MCP tool so the two surfaces cannot diverge. Kept out
 * of `index.ts` so callers that mock the orchestrator still get the real
 * serializer.
 */

import type { DesignPipelineContext } from './context.js';

export type SerializableDesignPipelineResult = Omit<DesignPipelineContext, 'exclusions'> & {
  exclusions: string[];
};

export function toSerializableResult(
  result: DesignPipelineContext
): SerializableDesignPipelineResult {
  return { ...result, exclusions: [...result.exclusions] };
}
