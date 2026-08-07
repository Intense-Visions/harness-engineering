import { readFileSync } from 'node:fs';

import type { BurnPaths } from './config';
import type { Summary } from './types';

/**
 * Read the cached summary, or null.
 *
 * Missing and corrupt collapse to the same answer on purpose: both mean the HUD
 * cannot say anything about usage, and every consumer must render that as
 * stated ignorance rather than as a comfortable green.
 */
export function readSummary(paths: BurnPaths): Summary | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(paths.summary, 'utf8'));
    if (parsed === null || typeof parsed !== 'object') return null;
    return parsed as Summary;
  } catch {
    return null;
  }
}
