import { dirname, isAbsolute, resolve, sep } from 'path';
import { fileExists, readFileContent } from '../shared/fs-utils';

/**
 * A resolved tsconfig `paths` alias.
 *
 * TypeScript path mappings look like `"@lib/*": ["src/lib/*"]`. Each mapping is
 * normalized here into a prefix/suffix around an optional `*` wildcard plus the
 * target templates already resolved to absolute paths (against the effective
 * `baseUrl`). An import specifier is matched against `prefix`/`suffix`; the
 * captured wildcard segment is substituted into each target template to yield
 * candidate absolute paths, which the dead-code resolver then runs through its
 * normal extension/index resolution.
 *
 * See issue #1759: without this, any file reached only through an alias import
 * was falsely reported dead because the resolver treated every non-relative
 * specifier as an external package.
 */
export interface PathAlias {
  /** Text before the `*` (or the whole pattern when non-wildcard). */
  prefix: string;
  /** Text after the `*` (empty for non-wildcard patterns). */
  suffix: string;
  /** Whether the pattern contains a `*` wildcard. */
  isWildcard: boolean;
  /** Absolute target templates; wildcard templates contain a single `*`. */
  targets: AliasTarget[];
}

interface AliasTarget {
  /** Absolute text before the `*` (or the whole absolute target when non-wildcard). */
  prefix: string;
  /** Absolute text after the `*` (empty for non-wildcard targets). */
  suffix: string;
  isWildcard: boolean;
}

interface CompilerOptions {
  baseUrl?: string;
  paths?: Record<string, string[]>;
}

// Matches a JSON double-quoted string (with escapes) OR a `//` line comment OR a
// `/* */` block comment. Strings are the first alternative so a `//` inside a
// string is preserved, not stripped.
const JSONC_TOKEN_RE = /("(?:\\.|[^"\\])*")|\/\/[^\n\r]*|\/\*[\s\S]*?\*\//g;

/** Strip `//` line and block comments and trailing commas so tsconfig JSONC parses as JSON. */
function stripJsonComments(input: string): string {
  const withoutComments = input.replace(
    JSONC_TOKEN_RE,
    (_match, stringLiteral) => stringLiteral ?? ''
  );
  // Remove trailing commas before `}` or `]`.
  return withoutComments.replace(/,(\s*[}\]])/g, '$1');
}

function parseTsconfig(content: string): Record<string, unknown> | null {
  try {
    return JSON.parse(stripJsonComments(content)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Load a tsconfig's compiler options, following a bounded `extends` chain.
 * Nearer configs win; the directory that declared `baseUrl` / `paths` is tracked
 * so each is resolved against the correct config location (TS resolves `baseUrl`
 * relative to the config that specifies it, and `paths` relative to `baseUrl` —
 * or, when `baseUrl` is absent (TS 5+), relative to the config that declared
 * `paths`).
 */
async function loadCompilerOptions(
  tsconfigPath: string,
  depth = 0
): Promise<{
  baseUrl?: string;
  baseUrlDir?: string;
  paths?: Record<string, string[]>;
  pathsDir?: string;
} | null> {
  if (depth > 10) return null;
  const content = await readFileContent(tsconfigPath);
  if (!content.ok) return null;
  const parsed = parseTsconfig(content.value);
  if (!parsed) return null;

  const configDir = dirname(tsconfigPath);
  const compilerOptions = (parsed.compilerOptions ?? {}) as CompilerOptions;

  let inherited: Awaited<ReturnType<typeof loadCompilerOptions>> = null;
  if (typeof parsed.extends === 'string' && parsed.extends.length > 0) {
    const extendsPath = resolveExtendsPath(configDir, parsed.extends);
    if (extendsPath) inherited = await loadCompilerOptions(extendsPath, depth + 1);
  }

  const result = { ...(inherited ?? {}) } as {
    baseUrl?: string;
    baseUrlDir?: string;
    paths?: Record<string, string[]>;
    pathsDir?: string;
  };

  if (typeof compilerOptions.baseUrl === 'string') {
    result.baseUrl = compilerOptions.baseUrl;
    result.baseUrlDir = configDir;
  }
  if (compilerOptions.paths && typeof compilerOptions.paths === 'object') {
    result.paths = compilerOptions.paths;
    result.pathsDir = configDir;
  }

  return result;
}

/** Resolve a tsconfig `extends` reference to a file path (relative form only; bare package specifiers are skipped). */
function resolveExtendsPath(configDir: string, extendsValue: string): string | null {
  if (extendsValue.startsWith('.') || isAbsolute(extendsValue)) {
    const base = isAbsolute(extendsValue) ? extendsValue : resolve(configDir, extendsValue);
    return base.endsWith('.json') ? base : base + '.json';
  }
  // Bare package extends (e.g. "@tsconfig/node20/tsconfig.json") are not resolved.
  return null;
}

function splitPattern(pattern: string): { prefix: string; suffix: string; isWildcard: boolean } {
  const star = pattern.indexOf('*');
  if (star === -1) return { prefix: pattern, suffix: '', isWildcard: false };
  return { prefix: pattern.slice(0, star), suffix: pattern.slice(star + 1), isWildcard: true };
}

function normalizeTargets(targets: string[], baseDir: string): AliasTarget[] {
  return targets.map((target) => {
    const abs = isAbsolute(target) ? target : resolve(baseDir, target);
    const { prefix, suffix, isWildcard } = splitPattern(abs);
    return { prefix, suffix, isWildcard };
  });
}

/**
 * Load and normalize the tsconfig `paths` aliases for a project root. Returns an
 * empty list when no tsconfig / no `paths` are present, so callers can treat the
 * feature as opt-in with zero configuration.
 */
export async function loadPathAliases(rootDir: string): Promise<PathAlias[]> {
  const tsconfigPath = resolve(rootDir, 'tsconfig.json');
  if (!(await fileExists(tsconfigPath))) return [];

  const options = await loadCompilerOptions(tsconfigPath);
  if (!options?.paths) return [];

  const baseDir = effectivePathsBaseDir(options, rootDir);
  return Object.entries(options.paths).flatMap(([pattern, targets]) => {
    if (!Array.isArray(targets) || targets.length === 0) return [];
    const { prefix, suffix, isWildcard } = splitPattern(pattern);
    return [{ prefix, suffix, isWildcard, targets: normalizeTargets(targets, baseDir) }];
  });
}

/**
 * Effective base directory for `paths` targets: `baseUrl` (resolved relative to
 * the config that set it) when present, otherwise the directory of the config
 * that declared `paths` (TS 5+ baseUrl-optional semantics).
 */
function effectivePathsBaseDir(
  options: { baseUrl?: string; baseUrlDir?: string; pathsDir?: string },
  rootDir: string
): string {
  if (options.baseUrl) return resolve(options.baseUrlDir ?? rootDir, options.baseUrl);
  return options.pathsDir ?? rootDir;
}

/**
 * Match an import specifier against the alias table, returning candidate absolute
 * base paths (without extension resolution — the caller applies that). More
 * specific patterns (longer prefixes) are tried first, mirroring TS resolution.
 */
export function resolveAliasCandidates(importSource: string, aliases: PathAlias[]): string[] {
  const candidates: string[] = [];
  const matched = aliases
    .map((alias) => ({ alias, capture: matchAlias(importSource, alias) }))
    .filter((m): m is { alias: PathAlias; capture: string } => m.capture !== null)
    // Longest prefix wins (most specific alias first).
    .sort((a, b) => b.alias.prefix.length - a.alias.prefix.length);

  for (const { alias, capture } of matched) {
    // The captured wildcard segment comes from the import specifier, which always
    // uses `/` (e.g. `@lib/foo/bar` → `foo/bar`). Target prefixes/suffixes were
    // built with `path.resolve`, so they use the platform separator. Convert the
    // capture to the platform separator before concatenation so the candidate is
    // separator-consistent with the snapshot's file keys on Windows too (#1759).
    const nativeCapture = sep === '/' ? capture : capture.split('/').join(sep);
    for (const target of alias.targets) {
      candidates.push(
        target.isWildcard ? target.prefix + nativeCapture + target.suffix : target.prefix
      );
    }
  }
  return candidates;
}

/** Return the captured wildcard segment when `importSource` matches the alias, else null. */
function matchAlias(importSource: string, alias: PathAlias): string | null {
  if (!alias.isWildcard) {
    return importSource === alias.prefix ? '' : null;
  }
  if (
    importSource.length >= alias.prefix.length + alias.suffix.length &&
    importSource.startsWith(alias.prefix) &&
    importSource.endsWith(alias.suffix)
  ) {
    return importSource.slice(alias.prefix.length, importSource.length - alias.suffix.length);
  }
  return null;
}
