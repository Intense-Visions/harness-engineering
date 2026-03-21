import * as crypto from 'node:crypto';
import type { IngestResult } from '../types.js';

/**
 * Content fingerprint for graph node IDs. Not used for security — truncated to
 * 8 hex chars (32 bits) for readability. Changed from MD5 to SHA-256; existing
 * persisted graph stores must be regenerated (`harness graph scan`).
 */
export function hash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);
}

export function mergeResults(...results: IngestResult[]): IngestResult {
  return {
    nodesAdded: results.reduce((s, r) => s + r.nodesAdded, 0),
    nodesUpdated: results.reduce((s, r) => s + r.nodesUpdated, 0),
    edgesAdded: results.reduce((s, r) => s + r.edgesAdded, 0),
    edgesUpdated: results.reduce((s, r) => s + r.edgesUpdated, 0),
    errors: results.flatMap((r) => r.errors),
    durationMs: results.reduce((s, r) => s + r.durationMs, 0),
  };
}

export function emptyResult(durationMs = 0): IngestResult {
  return { nodesAdded: 0, nodesUpdated: 0, edgesAdded: 0, edgesUpdated: 0, errors: [], durationMs };
}
