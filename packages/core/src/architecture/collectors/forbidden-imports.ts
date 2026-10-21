import { dirname, resolve } from 'path';
import { minimatch } from 'minimatch';
import type {
  Collector,
  ArchConfig,
  ArchForbiddenImportRule,
  MetricResult,
  Violation,
  ConstraintRule,
} from '../types';
import { violationId, constraintRuleId } from './hash';
import { findFiles, relativePosix } from '../../shared/fs-utils';
import { getDefaultRegistry } from '../../shared/parsers/registry';
import type { Import } from '../../shared/parsers';
import { resolveExcludePatterns } from '../exclude';

/** Languages whose import specifiers this collector can resolve and match. */
const JS_TS_LANGUAGES = new Set(['typescript', 'javascript']);

/**
 * The import's match target: a relative specifier resolved to a
 * rootDir-relative POSIX path, anything else (a package or a `node:` builtin)
 * as written. Mirrors `resolveImportPath` in the ESLint `no-forbidden-imports`
 * rule so the collector and the lint rule agree on what a rule matches.
 */
function importTarget(specifier: string, fromFile: string, rootDir: string): string {
  if (!specifier.startsWith('.')) return specifier;
  return relativePosix(rootDir, resolve(dirname(fromFile), specifier));
}

function isDisallowed(specifier: string, target: string, disallow: readonly string[]): boolean {
  return disallow.some(
    (pattern) =>
      specifier === pattern || minimatch(target, pattern) || minimatch(specifier, pattern)
  );
}

/** Thrown out of the scan when the parser cannot run at all (#2267). */
class ParserUnavailable extends Error {}

async function readImports(file: string): Promise<Import[] | null> {
  const parser = getDefaultRegistry().getForFile(file);
  if (!parser || !JS_TS_LANGUAGES.has(parser.name)) return null;
  const ast = await parser.parseFile(file);
  if (!ast.ok) {
    // One unparseable file is skipped; a parser that cannot run stops the scan
    // so the measurement names the cause instead of an unexplained
    // `filesAnalyzed: 0`.
    if (ast.error.code === 'PARSER_UNAVAILABLE') throw new ParserUnavailable(ast.error.message);
    return null;
  }
  const imports = parser.extractImports(ast.value);
  return imports.ok ? imports.value : null;
}

interface ScanState {
  violations: Violation[];
  seen: Set<string>;
  analyzed: Set<string>;
}

async function scanRule(
  rule: ArchForbiddenImportRule,
  rootDir: string,
  exclude: readonly string[],
  category: Violation['category'],
  state: ScanState
): Promise<void> {
  for (const file of await findFiles(rule.from, rootDir, exclude)) {
    const imports = await readImports(file);
    if (!imports) continue;
    state.analyzed.add(file);
    const relFile = relativePosix(rootDir, file);
    for (const imp of imports) {
      const target = importTarget(imp.source, file, rootDir);
      // One finding per import even when several rules disallow it — the
      // ESLint rule likewise reports the first matching rule only.
      const key = `${relFile}:${imp.location.line}:${imp.source}`;
      if (state.seen.has(key) || !isDisallowed(imp.source, target, rule.disallow)) continue;
      state.seen.add(key);
      const detail = `forbidden import: ${relFile} -> ${target}`;
      state.violations.push({
        id: violationId(relFile, category ?? '', detail),
        file: relFile,
        category,
        detail,
        severity: 'error',
      });
    }
  }
}

export class ForbiddenImportCollector implements Collector {
  readonly category = 'forbidden-imports' as const;

  getRules(_config: ArchConfig, _rootDir: string): ConstraintRule[] {
    const description = 'No forbidden imports allowed';
    return [
      {
        id: constraintRuleId(this.category, 'project', description),
        category: this.category,
        description,
        scope: 'project',
      },
    ];
  }

  /**
   * Match every import in the files each `forbiddenImports` rule covers against
   * that rule's `disallow` globs. Before issue #2235 this collector filtered
   * `validateDependencies` output for `FORBIDDEN_IMPORT`, a reason that engine
   * never emits, over `layers: []` — so it could not fire. It now applies the
   * configured rules itself, package and builtin specifiers included.
   */
  async collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
    const rules = config.forbiddenImports ?? [];
    const exclude = resolveExcludePatterns(config);
    const state: ScanState = { violations: [], seen: new Set(), analyzed: new Set() };
    try {
      for (const rule of rules) {
        await scanRule(rule, rootDir, exclude, this.category, state);
      }
    } catch (e) {
      if (!(e instanceof ParserUnavailable)) throw e;
      return [
        {
          category: this.category,
          scope: 'project',
          value: 0,
          violations: [],
          metadata: { rulesConfigured: rules.length, error: e.message },
        },
      ];
    }

    return [
      {
        category: this.category,
        scope: 'project',
        value: state.violations.length,
        violations: state.violations,
        // Denominator: no rules, or rules that matched no file, is an abstention.
        metadata: { rulesConfigured: rules.length, filesAnalyzed: state.analyzed.size },
      },
    ];
  }
}
