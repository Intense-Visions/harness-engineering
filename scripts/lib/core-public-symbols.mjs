/**
 * Public-symbol manifest for @harness-engineering/core (#2473 §3).
 *
 * The core barrel (packages/core/src/index.ts) is mostly `export * from './<dir>'`,
 * so diffing the barrel FILE says nothing about the public surface: appending
 * `export { buildClump } from './form'` to fleet/clumping/index.ts publishes a new
 * core symbol while the barrel text stays byte-identical. This module resolves the
 * barrel's actual export set through the TypeScript checker (following every
 * `export *` chain, dropping ambiguous star collisions exactly as tsc does) so the
 * `generate:barrels:check` gate can compare SYMBOL NAMES against a committed
 * manifest.
 */

import ts from 'typescript';

export const MANIFEST_HEADER = [
  '# AUTO-GENERATED — do not edit. Run `pnpm run generate:barrels` to regenerate.',
  '# The public symbol surface of @harness-engineering/core: every name its barrel',
  '# (src/index.ts) exports, resolved through `export *`. `pnpm run',
  '# generate:barrels:check` fails when this list and the source disagree, so a',
  '# public-API addition or removal is always a reviewed diff of this file.',
];

/**
 * Resolve the sorted, de-duplicated export names of `entry`.
 *
 * @param {{ entry: string, paths?: Record<string, string[]>, baseUrl?: string }} opts
 *   `paths` maps workspace package specifiers to their SOURCE entry so the result
 *   never depends on a (possibly stale or absent) dist build.
 * @returns {string[]}
 */
export function computePublicSymbols({ entry, paths, baseUrl }) {
  const program = ts.createProgram([entry], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    resolveJsonModule: true,
    allowJs: false,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    ...(baseUrl ? { baseUrl } : {}),
    ...(paths ? { paths } : {}),
  });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(entry);
  if (!sourceFile) throw new Error(`public-symbols: entry not found: ${entry}`);
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  // A file with no import/export is not a module; its export set is empty, which
  // must still be reported as a (likely wrong) empty surface, not crash.
  if (!moduleSymbol) return [];
  const names = checker.getExportsOfModule(moduleSymbol).map((s) => s.getName());
  return [...new Set(names)].sort();
}

/** @param {string[]} names */
export function renderManifest(names) {
  return [...MANIFEST_HEADER, ...names, ''].join('\n');
}

/** @param {string} text */
export function parseManifest(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
}

/**
 * @param {string[]} committed names in the committed manifest
 * @param {string[]} actual names the source currently exports
 * @returns {{ added: string[], removed: string[] }}
 */
export function diffSymbols(committed, actual) {
  const before = new Set(committed);
  const after = new Set(actual);
  return {
    added: actual.filter((n) => !before.has(n)).sort(),
    removed: committed.filter((n) => !after.has(n)).sort(),
  };
}
