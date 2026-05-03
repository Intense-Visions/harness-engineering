/**
 * Domain inference for graph nodes.
 *
 * Precedence (highest to lowest):
 *   1. node.metadata.domain (explicit)
 *   2. extraPatterns (config-provided)
 *   3. DEFAULT_PATTERNS (built-in)
 *   4. Generic first non-blocklisted path segment
 *   5. KnowledgeLinker connector source (path-less facts)
 *   6. 'unknown'
 *
 * Pattern format: 'prefix/<dir>'. Single-segment prefix only. <dir> captures
 * the segment immediately after the prefix.
 */

export interface DomainInferenceOptions {
  /** Additional patterns beyond the built-in defaults. Format: 'prefix/<dir>'. */
  extraPatterns?: readonly string[];
  /** Additional blocklisted segments beyond the built-in defaults. */
  extraBlocklist?: readonly string[];
}

export const DEFAULT_PATTERNS: readonly string[] = [
  'packages/<dir>',
  'apps/<dir>',
  'services/<dir>',
  'src/<dir>',
  'lib/<dir>',
];

export const DEFAULT_BLOCKLIST: ReadonlySet<string> = new Set([
  'node_modules',
  '.harness',
  'dist',
  'build',
  '.git',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  'out',
  'tmp',
]);

/**
 * Known code-file extensions that should be stripped when <dir> happens to be
 * a leaf filename (e.g., 'lib/parser.ts' → 'parser'). Directories with dots
 * in their names (e.g., 'foo.bar') are preserved.
 */
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/**
 * Match a single pattern of the form 'prefix/<dir>' against a path.
 * Returns the captured `<dir>` segment, or null if no match.
 *
 * Empty leading segments (from leading '/' or './') are skipped so
 * '/packages/cli/foo' and 'packages/cli/foo' produce the same result.
 */
function matchPattern(filePath: string, pattern: string): string | null {
  const patternParts = pattern.split('/').filter((s) => s.length > 0);
  if (patternParts.length !== 2 || patternParts[1] !== '<dir>') {
    return null;
  }
  const prefix = patternParts[0]!;
  const pathParts = filePath.split('/').filter((s) => s.length > 0);
  if (pathParts.length < 2) return null;
  if (pathParts[0] !== prefix) return null;
  let dir = pathParts[1]!;
  if (dir.length === 0) return null;
  // Strip file extension when <dir> happens to be a leaf filename
  // (e.g., 'lib/parser.ts' → 'parser'). Only strip known code extensions
  // so directories with dots in their names (e.g., 'foo.bar') are preserved.
  if (CODE_EXTENSIONS.some((ext) => dir.endsWith(ext))) {
    const dotIdx = dir.lastIndexOf('.');
    if (dotIdx > 0) dir = dir.slice(0, dotIdx);
  }
  if (dir.length === 0) return null;
  return dir;
}

export function inferDomain(
  node: { path?: string; metadata?: Record<string, unknown> },
  options: DomainInferenceOptions = {}
): string {
  // 1. Explicit metadata.domain wins.
  if (
    node.metadata?.domain &&
    typeof node.metadata.domain === 'string' &&
    node.metadata.domain.length > 0
  ) {
    return node.metadata.domain;
  }

  const filePath = typeof node.path === 'string' ? node.path : '';

  // Build effective blocklist (defaults + extraBlocklist).
  const blocklist = new Set<string>(DEFAULT_BLOCKLIST);
  if (options.extraBlocklist) {
    for (const seg of options.extraBlocklist) {
      if (seg && seg.length > 0) blocklist.add(seg);
    }
  }

  if (filePath.length > 0) {
    // 2. extraPatterns first (config wins over built-ins). If a pattern
    //    matches but captures a blocklisted segment, return 'unknown'
    //    immediately — symmetric with the leading-segment-blocklisted
    //    case below. Explicit metadata.domain is the escape hatch.
    const extraPatterns = options.extraPatterns ?? [];
    for (const pattern of extraPatterns) {
      const dir = matchPattern(filePath, pattern);
      if (dir !== null) {
        if (blocklist.has(dir)) return 'unknown';
        return dir;
      }
    }

    // 3. Built-in patterns. Same blocklist-on-capture semantics as above.
    for (const pattern of DEFAULT_PATTERNS) {
      const dir = matchPattern(filePath, pattern);
      if (dir !== null) {
        if (blocklist.has(dir)) return 'unknown';
        return dir;
      }
    }

    // 4. Generic first-segment fallback. If the leading segment is
    //    blocklisted, do NOT peer through — fall through to 'unknown'.
    const segments = filePath.split('/').filter((s) => s.length > 0);
    if (segments.length > 0) {
      const first = segments[0]!;
      if (!blocklist.has(first)) return first;
    }
  }

  // 5. KnowledgeLinker connector source (path-less facts).
  const source = node.metadata?.source;
  if (source === 'knowledge-linker' || source === 'connector') {
    const connector = node.metadata?.connectorName;
    if (typeof connector === 'string' && connector.length > 0) return connector;
    return 'general';
  }

  // 6. Final fallback.
  return 'unknown';
}
