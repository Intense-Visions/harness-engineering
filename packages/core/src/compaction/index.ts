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
