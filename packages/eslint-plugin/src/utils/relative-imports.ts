// src/utils/relative-imports.ts
//
// Filesystem helpers for `no-circular-deps`: resolve a relative specifier to
// the real file it names, and read a file's runtime relative imports from disk
// without linting it.
//
// Both are synchronous (ESLint rules are sync), best-effort, and memoised per
// lint process. Anything that cannot be resolved or read yields "no edge",
// never an exception: a missed edge can only hide a cycle, never invent one.
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import type * as TS from 'typescript';

/** Extensions tried, in order, after the exact path and for directory `index.*`. */
const SOURCE_EXTS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * TS-ESM writes the *output* extension in specifiers (`./b.js` for `b.ts`),
 * so a JS-family specifier is also tried against its TypeScript sources.
 */
const TS_SOURCE_FOR: Record<string, string[]> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};

/** Files larger than this are not parsed when loaded lazily. */
const MAX_LAZY_FILE_BYTES = 1024 * 1024;

const isFileCache = new Map<string, boolean>();
const resolveCache = new Map<string, string | null>();
const importsCache = new Map<string, string[]>();

/** Reset every memo (tests, and long-lived processes that want fresh reads). */
export function clearRelativeImportCaches(): void {
  isFileCache.clear();
  resolveCache.clear();
  importsCache.clear();
}

/** Absolute, forward-slash path: the graph key for a file. */
export function toGraphKey(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function isFile(candidate: string): boolean {
  let hit = isFileCache.get(candidate);
  if (hit === undefined) {
    try {
      hit = fs.statSync(candidate).isFile();
    } catch {
      hit = false;
    }
    isFileCache.set(candidate, hit);
  }
  return hit;
}

function candidatesFor(base: string): string[] {
  const out = [base];
  const ext = path.extname(base);
  const tsExts = TS_SOURCE_FOR[ext];
  if (tsExts) {
    const stem = base.slice(0, -ext.length);
    out.push(...tsExts.map((e) => stem + e));
  }
  out.push(...SOURCE_EXTS.map((e) => base + e));
  out.push(...SOURCE_EXTS.map((e) => path.join(base, 'index' + e)));
  return out;
}

/**
 * Resolve a relative specifier (`./x`, `../y.js`) imported from `fromFile` to
 * the graph key of an existing file, or `null` for bare specifiers and
 * anything that does not exist.
 */
export function resolveRelativeImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  let hit = resolveCache.get(base);
  if (hit === undefined) {
    const found = candidatesFor(base).find(isFile);
    hit = found ? toGraphKey(found) : null;
    resolveCache.set(base, hit);
  }
  return hit;
}

let tsModule: typeof TS | null | undefined;

/** `typescript` is a peer dependency; load it only when a lazy read needs it. */
function loadTypeScript(): typeof TS | null {
  if (tsModule === undefined) {
    try {
      tsModule = createRequire(import.meta.url)('typescript') as typeof TS;
    } catch {
      tsModule = null;
    }
  }
  return tsModule;
}

function scriptKindFor(ts: typeof TS, file: string): TS.ScriptKind {
  const ext = path.extname(file);
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.jsx') return ts.ScriptKind.JSX;
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** True when every element is `type`-qualified (and there is at least one). */
function allTypeOnly(elements: ReadonlyArray<{ isTypeOnly: boolean }>): boolean {
  return elements.length > 0 && elements.every((el) => el.isTypeOnly);
}

function literalText(ts: typeof TS, expr: TS.Expression | undefined): string | null {
  return expr !== undefined && ts.isStringLiteral(expr) ? expr.text : null;
}

/** `import … from` is runtime unless `import type` or `import { type A, type B }`. */
function importSpecifier(ts: typeof TS, stmt: TS.ImportDeclaration): string | null {
  const clause = stmt.importClause;
  if (clause?.isTypeOnly) return null;
  const bindings = clause?.namedBindings;
  const typeOnlyNamed =
    clause?.name === undefined &&
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    allTypeOnly(bindings.elements);
  return typeOnlyNamed ? null : literalText(ts, stmt.moduleSpecifier);
}

/** `export … from` is runtime unless `export type` or every element is `type`. */
function exportSpecifier(ts: typeof TS, stmt: TS.ExportDeclaration): string | null {
  if (stmt.isTypeOnly) return null;
  const clause = stmt.exportClause;
  if (clause !== undefined && ts.isNamedExports(clause) && allTypeOnly(clause.elements)) {
    return null;
  }
  return literalText(ts, stmt.moduleSpecifier);
}

/** `import x = require('./y')` is runtime unless `import type x = require(…)`. */
function importEqualsSpecifier(ts: typeof TS, stmt: TS.ImportEqualsDeclaration): string | null {
  const ref = stmt.moduleReference;
  if (stmt.isTypeOnly || !ts.isExternalModuleReference(ref)) return null;
  return literalText(ts, ref.expression);
}

/** Specifier of a top-level statement that creates a runtime edge, else null. */
function runtimeSpecifier(ts: typeof TS, stmt: TS.Statement): string | null {
  if (ts.isImportDeclaration(stmt)) return importSpecifier(ts, stmt);
  if (ts.isExportDeclaration(stmt)) return exportSpecifier(ts, stmt);
  if (ts.isImportEqualsDeclaration(stmt)) return importEqualsSpecifier(ts, stmt);
  return null;
}

/**
 * Graph keys of the files `file` imports at runtime via relative static
 * imports and re-exports, read from disk. Type-only imports and exports are
 * skipped. Unreadable, oversized or unparsable files yield `[]`.
 */
export function readRelativeImports(file: string): string[] {
  const cached = importsCache.get(file);
  if (cached) return cached;
  let edges: string[] = [];
  const ts = loadTypeScript();
  try {
    if (ts && fs.statSync(file).size <= MAX_LAZY_FILE_BYTES) {
      const text = fs.readFileSync(file, 'utf8');
      const sf = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        false,
        scriptKindFor(ts, file)
      );
      const found = new Set<string>();
      for (const stmt of sf.statements) {
        const spec = runtimeSpecifier(ts, stmt);
        const target = spec === null ? null : resolveRelativeImport(file, spec);
        if (target) found.add(target);
      }
      edges = [...found];
    }
  } catch {
    edges = [];
  }
  importsCache.set(file, edges);
  return edges;
}
