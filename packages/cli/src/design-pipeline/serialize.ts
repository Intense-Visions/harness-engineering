/**
 * JSON-transport shape of a design-pipeline result: the `exclusions` Set
 * becomes an array, and stays `null` when DETECT did not measure. Shared by
 * the CLI's `--json` output and the `run_design_pipeline` MCP tool so the two
 * surfaces cannot diverge. Kept out of `index.ts` so callers that mock the
 * orchestrator still get the real serializer.
 */

import type { DesignPipelineContext } from './context.js';

export type SerializableDesignPipelineResult = Omit<DesignPipelineContext, 'exclusions'> & {
  exclusions: string[] | null;
};

export function toSerializableResult(
  result: DesignPipelineContext
): SerializableDesignPipelineResult {
  return { ...result, exclusions: result.exclusions === null ? null : [...result.exclusions] };
}
