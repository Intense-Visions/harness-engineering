import type { Violation } from './types';

/**
 * Extract the structural layer-pair pattern from a violation detail.
 * E.g., "core -> cli: src/core/foo.ts imports src/cli/bar.ts" => "core -> cli"
 */
function extractLayerPair(detail: string): string {
  const match = detail.match(/^(\S+)\s*->\s*(\S+):/);
  if (match) return `${match[1]} -> ${match[2]}`;
  return detail;
}

const NORMALIZERS: Record<string, (detail: string) => string> = {
  'layer-violations': extractLayerPair,
  'forbidden-imports': extractLayerPair,
  'circular-deps': () => 'circular-dep-cycle',
  complexity: () => 'complexity-exceeded',
  coupling: () => 'coupling-exceeded',
  'module-size': () => 'module-size-exceeded',
  'dependency-depth': () => 'depth-exceeded',
};

/**
 * Normalize a violation's detail into a structural pattern for clustering.
 * Strips file-specific information while preserving architectural meaning.
 */
export function normalizeViolationPattern(violation: Violation): string {
  const category = violation.category ?? '';
  const normalizer = NORMALIZERS[category];
  if (normalizer) return normalizer(violation.detail);
  return violation.detail;
}

/**
 * Extract the parent directory scope from a file path.
 * E.g., "src/services/auth.ts" => "src/services/"
 */
export function extractDirectoryScope(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash === -1) return './';
  return filePath.slice(0, lastSlash + 1);
}
