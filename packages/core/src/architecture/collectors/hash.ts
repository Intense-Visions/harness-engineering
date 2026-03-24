import { createHash } from 'node:crypto';

/**
 * Produce a stable violation ID.
 * Formula: sha256(relativePath + ':' + category + ':' + normalizedDetail)
 * Line numbers are excluded to keep IDs stable across unrelated edits.
 */
export function violationId(
  relativePath: string,
  category: string,
  normalizedDetail: string
): string {
  const path = relativePath.replace(/\\/g, '/');
  const input = `${path}:${category}:${normalizedDetail}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Produce a stable constraint rule ID.
 * Formula: sha256(category + ':' + scope + ':' + description)
 */
export function constraintRuleId(category: string, scope: string, description: string): string {
  const input = `${category}:${scope}:${description}`;
  return createHash('sha256').update(input).digest('hex');
}
