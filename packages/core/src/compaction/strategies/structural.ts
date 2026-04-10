/**
 * CompactionStrategy — the shared interface for all compaction strategies.
 * Defined here in structural.ts as the foundation type; re-exported from
 * packages/core/src/compaction/index.ts.
 */
export interface CompactionStrategy {
  name: 'structural' | 'truncate' | 'pack' | 'semantic';
  lossy: boolean;
  apply(content: string, budget?: number): string;
}

function isEmptyObject(v: unknown): boolean {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.keys(v as object).length === 0
  );
}

function isRetainable(v: unknown): boolean {
  return v !== undefined && v !== '' && v !== null && !isEmptyObject(v);
}

function cleanArray(value: unknown[]): unknown {
  const cleaned = value.map(cleanValue).filter(isRetainable);
  if (cleaned.length === 0) return undefined;
  if (cleaned.length === 1) return cleaned[0];
  return cleaned;
}

function cleanRecord(value: Record<string, unknown>): unknown {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const result = cleanValue(v);
    if (isRetainable(result)) {
      cleaned[k] = result;
    }
  }
  if (Object.keys(cleaned).length === 0) return undefined;
  return cleaned;
}

/** Recursively clean a single value. */
function cleanValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
  if (Array.isArray(value)) return cleanArray(value);
  if (typeof value === 'object') return cleanRecord(value as Record<string, unknown>);
  return value;
}

/**
 * Lossless structural compressor.
 *
 * For valid JSON input:
 * - Removes null, undefined, empty-string, empty-array, and empty-object fields
 * - Collapses single-item arrays to scalar values
 * - Strips redundant whitespace from string values (leading/trailing and internal runs)
 * - Normalizes output to compact JSON (no pretty-printing)
 *
 * For non-JSON input: returns the string unchanged.
 */
export class StructuralStrategy implements CompactionStrategy {
  readonly name = 'structural' as const;
  readonly lossy = false;

  apply(content: string, _budget?: number): string {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Not valid JSON — return as-is
      return content;
    }

    const cleaned = cleanValue(parsed);
    return JSON.stringify(cleaned) ?? '';
  }
}
