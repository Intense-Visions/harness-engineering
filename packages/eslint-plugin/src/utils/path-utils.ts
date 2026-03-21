// src/utils/path-utils.ts
import * as path from 'path';
import { minimatch } from 'minimatch';
import type { Layer } from './schema';

/**
 * Resolve an import path relative to the importing file
 * Returns path relative to project root (assumes /project/ prefix)
 */
export function resolveImportPath(importPath: string, importingFile: string): string {
  // External/absolute imports stay as-is
  if (!importPath.startsWith('.')) {
    return importPath;
  }

  // Resolve relative to importing file's directory
  const importingDir = path.dirname(importingFile);
  const resolved = path.resolve(importingDir, importPath);

  // Extract path relative to project root
  // Assumes paths like /project/src/... or /path/to/project/src/...
  const normalized = resolved.replace(/\\/g, '/');
  const srcIndex = normalized.indexOf('/src/');
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
 * Normalize a file path to project-relative format
 * Extracts path from /any/path/src/... to src/...
 */
export function normalizePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const srcIndex = normalized.indexOf('/src/');
  if (srcIndex !== -1) {
    return normalized.slice(srcIndex + 1);
  }
  return filePath;
}
