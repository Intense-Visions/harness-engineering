import path from 'node:path';
import { DEFAULT_GRAPH_DETAIL_CEILING } from '@harness-engineering/core';
import { resolveConfig } from '../../../config/loader.js';

export function graphNotFoundError() {
  return {
    content: [
      {
        type: 'text' as const,
        text: 'No graph found. Run `harness graph scan` or use `ingest_source` tool first.',
      },
    ],
    isError: true,
  };
}

/**
 * Resolve the detailed-mode item ceiling for graph retrieval tools from
 * `graph.detailedMode.maxItems` in the project's harness.config.json.
 *
 * Fail-open: any failure (missing file, invalid config, unset key) yields
 * {@link DEFAULT_GRAPH_DETAIL_CEILING} so detailed-mode output is always
 * bounded even in zero-config projects (issue #1591).
 */
export function resolveDetailCeiling(projectPath: string): number {
  try {
    const resolved = resolveConfig(path.join(projectPath, 'harness.config.json'));
    if (!resolved.ok) return DEFAULT_GRAPH_DETAIL_CEILING;
    const maxItems = resolved.value.graph?.detailedMode?.maxItems;
    return typeof maxItems === 'number' && Number.isFinite(maxItems) && maxItems > 0
      ? maxItems
      : DEFAULT_GRAPH_DETAIL_CEILING;
  } catch {
    return DEFAULT_GRAPH_DETAIL_CEILING;
  }
}
