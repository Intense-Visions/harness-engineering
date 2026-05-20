// src/utils/path-utils.ts
import * as path from 'path';
import { minimatch } from 'minimatch';
import type { Layer } from './schema';

/**
 * Resolve an import path relative to the importing file
 * Returns path relative to project root.
 *
 * When `projectRoot` is provided and the resolved file lives under it, the
 * project-root-relative path is returned (preserves package identity in
 * monorepos). Otherwise falls back to the `/src/` heuristic for
 * single-package projects.
 */
export function resolveImportPath(
  importPath: string,
  importingFile: string,
  projectRoot?: string
): string {
  // External/absolute imports stay as-is
  if (!importPath.startsWith('.')) {
    return importPath;
  }

  // Resolve relative to importing file's directory
  const importingDir = path.dirname(importingFile);
  const resolved = path.resolve(importingDir, importPath);
  const normalized = resolved.replace(/\\/g, '/');

  // Preferred: anchor to project root (monorepo-safe)
  if (projectRoot) {
    const root = projectRoot.replace(/\\/g, '/').replace(/\/$/, '');
    if (normalized.startsWith(root + '/')) {
      return normalized.slice(root.length + 1);
    }
  }

  // Legacy fallback: /src/ heuristic for single-package projects and any
  // caller not threading a project root through.
  const srcIndex = normalized.indexOf('/src/'); // eslint-disable-line @harness-engineering/no-hardcoded-path-separator -- platform-safe
  if (srcIndex !== -1) {
    return normalized.slice(srcIndex + 1); // Remove leading /
  }

  // Fallback: return as-is if no src/ found
  return importPath;
}

/**
 * Check if a file path matches a glob pattern
 */
export function matchesPattern(filePath: string, pattern: string): boolean {
  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  return minimatch(normalizedPath, normalizedPattern, { matchBase: false });
}

/**
 * Find which layer a file belongs to
 */
export function getLayerForFile(filePath: string, layers: Layer[]): string | null {
  for (const layer of layers) {
    if (matchesPattern(filePath, layer.pattern)) {
      return layer.name;
    }
  }
  return null;
}

/**
 * Get layer definition by name
 */
export function getLayerByName(name: string, layers: Layer[]): Layer | undefined {
  return layers.find((l) => l.name === name);
}

/**
 * Normalize a file path to project-relative format.
 *
 * When `projectRoot` is provided and the file lives under it, returns the
 * project-relative path (preserves package prefix in monorepos). Otherwise
 * falls back to the `/src/` heuristic for single-package projects.
 */
export function normalizePath(filePath: string, projectRoot?: string): string {
  const normalized = filePath.replace(/\\/g, '/');

  if (projectRoot) {
    const root = projectRoot.replace(/\\/g, '/').replace(/\/$/, '');
    if (normalized.startsWith(root + '/')) {
      return normalized.slice(root.length + 1);
    }
  }

  const srcIndex = normalized.indexOf('/src/'); // eslint-disable-line @harness-engineering/no-hardcoded-path-separator -- platform-safe
  if (srcIndex !== -1) {
    return normalized.slice(srcIndex + 1);
  }
  return filePath;
}
