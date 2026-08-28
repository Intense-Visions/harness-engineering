/**
 * Static-extraction adapter for the compiled-comprehension substrate.
 *
 * This is the cli-side concrete `ExtractStatic` (D1/D5): core stays pure and
 * receives the extractor injected. The render helpers below are pure and
 * deterministic (dedup + sort), and never fabricate a surface — an empty input
 * yields an empty section so an unsupported/parse-degraded module produces a
 * static-degraded (semantic-only) unit rather than a faked one.
 */

import * as path from 'node:path';
import { TypeScriptParser } from '@harness-engineering/core';
import type {
  ExtractStatic,
  ComprehensionSourceFile,
  StaticExtraction,
} from '@harness-engineering/core';

const BARREL_BASENAMES = new Set([
  'index.ts',
  'index.tsx',
  'index.js',
  'index.jsx',
  'index.mjs',
  'index.cjs',
]);

/** The extensions the AST static extractor can parse (TS/JS family). */
export const STATIC_SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

const STATIC_SUPPORTED_SET = new Set<string>(STATIC_SUPPORTED_EXTENSIONS);

/** Whether the given file extension is statically parseable by this adapter. */
export function isStaticSupported(ext: string): boolean {
  return STATIC_SUPPORTED_SET.has(ext);
}

/**
 * Render the exported-symbol interface contract: one `export <name>` line per
 * distinct symbol, deterministically sorted, de-duplicated by name. An empty
 * surface renders as `''` (empty section, never faked).
 */
export function renderInterfaceContract(exports: ReadonlyArray<{ name: string }>): string {
  const names = [...new Set(exports.map((e) => e.name))].sort();
  return names.map((name) => `export ${name}`).join('\n');
}

/**
 * Render the imports-out dependency slice: one `import ... from '<source>'` line
 * per distinct source, sorted by source, with each source's named specifiers
 * (plus any default/namespace binding) folded in and de-duplicated. An empty
 * input renders as `''`. Importers-in (reverse edges) is out of scope this
 * phase — the extractor only sees the module's own source.
 */
export function renderDependencySlice(
  imports: ReadonlyArray<{
    source: string;
    specifiers?: string[];
    default?: string;
    namespace?: string;
  }>
): string {
  // Group by source, accumulating the distinct binding fragments.
  const bySource = new Map<string, Set<string>>();
  for (const imp of imports) {
    const bucket = bySource.get(imp.source) ?? new Set<string>();
    if (imp.default) bucket.add(imp.default);
    if (imp.namespace) bucket.add(`* as ${imp.namespace}`);
    for (const spec of imp.specifiers ?? []) bucket.add(`{ ${spec} }`);
    bySource.set(imp.source, bucket);
  }

  const lines: string[] = [];
  for (const source of [...bySource.keys()].sort()) {
    const bindings = [...(bySource.get(source) as Set<string>)].sort();
    // Merge the collected named specifiers into a single brace group for a
    // compact, readable slice line.
    const named = bindings.filter((b) => b.startsWith('{ ')).map((b) => b.slice(2, -2).trim());
    const nonNamed = bindings.filter((b) => !b.startsWith('{ '));
    const parts = [...nonNamed];
    if (named.length > 0) parts.push(`{ ${[...new Set(named)].sort().join(', ')} }`);
    const binding = parts.length > 0 ? `${parts.join(', ')} ` : '';
    lines.push(`import ${binding}from '${source}'`);
  }
  return lines.join('\n');
}

/** Minimal structural view of a parsed member's static surface. */
interface MemberSurface {
  exports: Array<{ name: string }>;
  imports: Array<{ source: string; specifiers?: string[]; default?: string; namespace?: string }>;
}

/**
 * Parse one module member with core's AST parser and pull its exports/imports.
 * Returns `null` for an unparseable member (degrade, never fake). `wantExports`
 * is false for non-surface files so only the barrel/union surface contributes
 * the public interface, while every member still contributes imports-out.
 */
async function parseMember(
  parser: TypeScriptParser,
  abs: string,
  wantExports: boolean
): Promise<MemberSurface | null> {
  const ast = await parser.parseFile(abs);
  if (!ast.ok) return null;
  const surface: MemberSurface = { exports: [], imports: [] };
  if (wantExports) {
    const ex = parser.extractExports(ast.value);
    if (ex.ok) surface.exports = ex.value.map((e) => ({ name: e.name }));
  }
  const im = parser.extractImports(ast.value);
  if (im.ok) {
    // Conditional keys (exactOptionalPropertyTypes): never assign an explicit
    // `undefined` to an optional field.
    surface.imports = im.value.map((i) => ({
      source: i.source,
      specifiers: i.specifiers,
      ...(i.default !== undefined ? { default: i.default } : {}),
      ...(i.namespace !== undefined ? { namespace: i.namespace } : {}),
    }));
  }
  return surface;
}

/**
 * Concrete, language-aware `ExtractStatic` (D1/D5). Module-bound: reconstructs
 * each canonical member's absolute path (`projectRoot/module/basename`) and
 * parses it with core's AST `TypeScriptParser`. The public surface is
 * barrel-anchored on `index.*` when present, else the union of all members'
 * top-level exports. Unsupported languages yield EMPTY static sections
 * (semantic-only), never faked. Non-recursive by construction: it visits only
 * the passed `sourceFiles` (the canonical D3 member set).
 */
export function createStaticExtractor(opts: {
  projectRoot: string;
  module: string;
}): ExtractStatic {
  const parser = new TypeScriptParser();
  return async (sourceFiles: ComprehensionSourceFile[]): Promise<StaticExtraction> => {
    const supported = sourceFiles.filter((f) => isStaticSupported(path.extname(f.path)));
    if (supported.length === 0) return { interfaceContract: '', dependencySlice: '' };

    const barrel = supported.find((f) => BARREL_BASENAMES.has(f.path));
    const surfaceFiles = new Set(barrel ? [barrel] : supported);

    const exports: Array<{ name: string }> = [];
    const imports: MemberSurface['imports'] = [];
    for (const f of supported) {
      const abs = path.join(opts.projectRoot, opts.module, f.path);
      const surface = await parseMember(parser, abs, surfaceFiles.has(f));
      if (!surface) continue; // unparseable member: skip (degrade), never fake
      exports.push(...surface.exports);
      imports.push(...surface.imports);
    }

    return {
      interfaceContract: renderInterfaceContract(exports),
      dependencySlice: renderDependencySlice(imports),
    };
  };
}
