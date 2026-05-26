/**
 * Framework detection — inspects import + global signatures to classify
 * a test file as vitest / jest / mocha / playwright. Falls back to
 * vitest when nothing matches (most common in TS projects + jest-with-
 * globals projects have AST-compatible describe/it shape).
 *
 * Source: docs/changes/craft-pipeline/test-craft/proposal.md
 *   (Technical Design → Framework detection).
 */

import type { TestFramework } from '../findings/schema.js';

export function detectFramework(source: string): TestFramework {
  // Order matters: check most-specific signatures first.
  if (/from\s+['"]@playwright\/test['"]/.test(source)) return 'playwright';
  if (/from\s+['"]@jest\/globals['"]/.test(source)) return 'jest';
  if (/from\s+['"]vitest['"]/.test(source)) return 'vitest';
  if (/^import\s+['"]mocha['"]/m.test(source)) return 'mocha';
  // Fallback: vitest. Most TS projects use it; jest-with-globals projects
  // have AST-compatible describe/it shape so extraction still works.
  return 'vitest';
}
