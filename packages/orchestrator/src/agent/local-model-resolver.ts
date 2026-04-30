import type { LocalModelStatus } from '@harness-engineering/types';

/**
 * Normalize the `agent.localModel` config (string | string[] | undefined) into a string[].
 *
 * - `undefined` -> `[]` (no candidates configured)
 * - `'name'`    -> `['name']`
 * - `[]`        -> throws (config validation must catch this; the resolver does not silently accept it)
 * - `[a, b]`    -> `[a, b]`
 */
export function normalizeLocalModel(input: string | string[] | undefined): string[] {
  if (input === undefined) return [];
  if (typeof input === 'string') return [input];
  if (input.length === 0) {
    throw new Error('localModel array must be non-empty when provided');
  }
  return [...input];
}

// LocalModelResolver class added in Task 4.
export type { LocalModelStatus };
