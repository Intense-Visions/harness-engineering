/**
 * Framework detection — inspects import + global signatures to classify
 * a test file as vitest / jest / mocha / playwright / pytest. Falls back
 * to vitest when nothing matches (most common in TS projects + jest-with-
 * globals projects have AST-compatible describe/it shape).
 *
 * Source: docs/changes/craft-pipeline/test-craft/proposal.md
 *   (Technical Design → Framework detection).
 */

import type { TestFramework } from '../findings/schema.js';

export function detectFramework(source: string, file?: string): TestFramework {
  // Python test files are always pytest-shaped for extraction purposes
  // (pytest collects plain `def test_*` functions, unittest included).
  if (file !== undefined && file.endsWith('.py')) return 'pytest';
  // Order matters: check most-specific signatures first.
  if (/from\s+['"]@playwright\/test['"]/.test(source)) return 'playwright';
  if (/from\s+['"]@jest\/globals['"]/.test(source)) return 'jest';
  if (/from\s+['"]vitest['"]/.test(source)) return 'vitest';
  if (/^import\s+['"]mocha['"]/m.test(source)) return 'mocha';
  // Python signatures (when no file path is available to dispatch on).
  if (/^\s*(?:import\s+pytest|from\s+pytest\s+import)/m.test(source)) return 'pytest';
  if (/^\s*(?:async\s+)?def\s+test_\w+\s*\(/m.test(source)) return 'pytest';
  // Fallback: vitest. Most TS projects use it; jest-with-globals projects
  // have AST-compatible describe/it shape so extraction still works.
  return 'vitest';
}
