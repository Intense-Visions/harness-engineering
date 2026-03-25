/**
 * Parses a roadmap from its string representation (Markdown or JSON).
 */
export { parseRoadmap } from './parse';

/**
 * Serializes a roadmap object back to its string representation.
 */
export { serializeRoadmap } from './serialize';

/**
 * Synchronizes the project roadmap with the current state of the codebase and issues.
 */
export { syncRoadmap } from './sync';

/**
 * Type definitions for roadmap synchronization and changes.
 */
export type { SyncChange, SyncOptions } from './sync';
