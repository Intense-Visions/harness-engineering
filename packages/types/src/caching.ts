/**
 * Stability classification for prompt caching.
 *
 * - `static`    -- changes only on deploy/update (skills index, tool definitions, SKILL.md)
 * - `session`   -- stable within a session, varies between sessions (graph context, project state)
 * - `ephemeral` -- changes per call (tool responses, diff content, file reads)
 */
export type StabilityTier = 'static' | 'session' | 'ephemeral';

/**
 * Metadata describing a content block's caching stability.
 */
export interface StabilityMetadata {
  /** The stability classification of this content */
  stability: StabilityTier;
  /** Advisory TTL hint (e.g., '1h', '5m') -- provider adapters decide actual TTL */
  ttlHint?: string;
}
