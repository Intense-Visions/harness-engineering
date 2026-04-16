import { randomUUID } from 'node:crypto';
import type { RawWorkItem } from '../types.js';

/**
 * Manual input shape — accepts free-text with optional metadata.
 */
export interface ManualInput {
  title: string;
  description?: string;
  labels?: string[];
}

/**
 * Convert a manual text input into a generic RawWorkItem.
 * Generates a unique ID with a `manual-` prefix.
 */
export function manualToRawWorkItem(input: ManualInput): RawWorkItem {
  return {
    id: `manual-${randomUUID()}`,
    title: input.title,
    description: input.description ?? null,
    labels: input.labels ?? [],
    metadata: {},
    linkedItems: [],
    comments: [],
    source: 'manual',
  };
}
