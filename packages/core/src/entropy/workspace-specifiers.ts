import { resolve } from 'path';
import {
  loadWorkspacePackages,
  resolveWorkspaceSpecifier,
  splitBareSpecifier,
} from '../constraints/workspace-packages';
import type { SourceFile, TestImportSource } from './types';

/**
 * Resolve every bare specifier that names a workspace package (`@scope/pkg`,
 * `@scope/pkg/sub`) to the source file it denotes (issue #2189).
 *
 * The dead-code detector's resolver is synchronous and only followed relative
 * specifiers and tsconfig `paths` aliases, so in a monorepo a symbol exported by
 * one package and imported by another BY PACKAGE NAME was reported dead. The
 * workspace lookup ({@link resolveWorkspaceSpecifier}, shared with the layer
 * check — #2216) is async, so it runs once here at snapshot time over the
 * specifiers actually imported, and the detector reads the resulting map.
 *
 * Specifiers naming no workspace package (external `node_modules` packages)
 * are absent from the map and stay unresolved, exactly as before. Values are
 * platform-native absolute paths, matching snapshot file keys.
 */
export async function loadWorkspaceSpecifiers(
  rootDir: string,
  files: readonly SourceFile[],
  testImports: readonly TestImportSource[]
): Promise<Record<string, string>> {
  const packages = await loadWorkspacePackages(rootDir);
  if (packages.size === 0) return {};

  const specifiers = new Set<string>();
  const collect = (source: string | undefined): void => {
    if (!source) return;
    const split = splitBareSpecifier(source);
    if (split && packages.has(split.name)) specifiers.add(source);
  };
  for (const file of files) {
    for (const imp of file.imports) collect(imp.source);
    for (const exp of file.exports) if (exp.isReExport) collect(exp.source);
  }
  for (const test of testImports) {
    for (const imp of test.imports) collect(imp.source);
  }

  const resolved: Record<string, string> = {};
  for (const specifier of [...specifiers].sort()) {
    const target = await resolveWorkspaceSpecifier(specifier, packages);
    if (target) resolved[specifier] = resolve(target);
  }
  return resolved;
}
