/**
 * Compaction module — strategies, pipeline, and envelope types for
 * reducing MCP tool response token consumption.
 */
export type { CompactionStrategy } from './strategies/structural';
export { StructuralStrategy } from './strategies/structural';

export { TruncationStrategy, DEFAULT_TOKEN_BUDGET } from './strategies/truncation';

export { CompactionPipeline } from './pipeline';

export type { PackedEnvelope } from './envelope';
export { serializeEnvelope, estimateTokens } from './envelope';

export type { PaginationMeta, PaginatedSlice } from './pagination';
export { paginate } from './pagination';

export type { BoundedItems } from './detail-ceiling';
export { boundItems, DEFAULT_GRAPH_DETAIL_CEILING } from './detail-ceiling';
