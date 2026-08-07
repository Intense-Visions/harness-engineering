import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HOOK_SUPPORT_FILES, supportFilesFor } from './support-files';
import { HOOK_SCRIPTS } from './profiles';

/**
 * Behavior guard for the hook support-file registry. supportFilesFor() resolves
 * the deduplicated basenames of support modules that the installer must ship and
 * preserve alongside a set of active hooks. These tests pin the current registry
 * contract and the resolve/dedupe semantics (unknown hooks contribute nothing,
 * duplicates collapse, first-seen order is preserved).
 */
describe('HOOK_SUPPORT_FILES registry', () => {
  it('maps the format-check-dependent hooks to their shared support module', () => {
    expect(HOOK_SUPPORT_FILES['quality-warner']).toEqual(['format-check.js']);
    expect(HOOK_SUPPORT_FILES['strict-quality-gate']).toEqual(['format-check.js']);
  });

  it('maps the read-hook-stdin-dependent hooks to their shared support module', () => {
    // Extracted in #994; each hook below `import`s './read-hook-stdin.js'.
    for (const name of [
      'block-no-verify',
      'protect-config',
      'cost-tracker',
      'sentinel-pre',
      'sentinel-post',
      'adoption-tracker',
      'pre-compact-state',
      'telemetry-reporter',
    ]) {
      expect(HOOK_SUPPORT_FILES[name], `${name} must ship read-hook-stdin.js`).toEqual([
        'read-hook-stdin.js',
      ]);
    }
  });

  it('does not register a support module as a hook entry-point', () => {
    // Support modules are shipped because a hook needs them, never installed as
    // hooks in their own right, so they must not appear as registry keys.
    expect(HOOK_SUPPORT_FILES['format-check.js']).toBeUndefined();
    expect(HOOK_SUPPORT_FILES['read-hook-stdin.js']).toBeUndefined();
  });
});

/**
 * Registry↔import drift guard. This is the invariant that #994 violated: a hook
 * whose source statically `import`s a sibling `./x.js` module MUST list that
 * basename in HOOK_SUPPORT_FILES, or the installer copies the hook without its
 * dependency and Node fails the hook at load with ERR_MODULE_NOT_FOUND in the
 * adopter. Deriving the expectation from the hook sources (not a hardcoded list)
 * means a future extraction that adds a new sibling import fails here until the
 * registry is updated.
 */
describe('registry covers every sibling import in the hook sources', () => {
  const hooksDir = __dirname;
  const siblingImport = /from\s+['"]\.\/([^'"]+)['"]/g;

  for (const script of HOOK_SCRIPTS) {
    it(`${script.name} declares every sibling module it imports`, () => {
      const srcFile = path.join(hooksDir, `${script.name}.js`);
      expect(fs.existsSync(srcFile), `${srcFile} should exist`).toBe(true);
      const source = fs.readFileSync(srcFile, 'utf-8');
      const imported = [...source.matchAll(siblingImport)].map((m) => m[1]);
      const declared = HOOK_SUPPORT_FILES[script.name] ?? [];
      for (const dep of imported) {
        expect(declared, `${script.name} imports './${dep}' but does not ship it`).toContain(dep);
      }
    });
  }
});

describe('supportFilesFor', () => {
  it('returns the support files for a single registered hook', () => {
    expect(supportFilesFor(['quality-warner'])).toEqual(['format-check.js']);
    expect(supportFilesFor(['block-no-verify'])).toEqual(['read-hook-stdin.js']);
  });

  it('deduplicates support files shared across multiple active hooks', () => {
    // Both hooks depend on the same support module; the installer should be told
    // to ship it exactly once.
    expect(supportFilesFor(['quality-warner', 'strict-quality-gate'])).toEqual(['format-check.js']);
    expect(supportFilesFor(['block-no-verify', 'protect-config', 'sentinel-pre'])).toEqual([
      'read-hook-stdin.js',
    ]);
  });

  it('ignores hook names that have no registry entry', () => {
    expect(supportFilesFor(['nonexistent-hook'])).toEqual([]);
  });

  it('collects the distinct support files from a mixed set, first-seen order', () => {
    const result = supportFilesFor(['quality-warner', 'block-no-verify']);
    expect(result).toEqual(['format-check.js', 'read-hook-stdin.js']);
  });

  it('returns an empty array for no active hooks', () => {
    expect(supportFilesFor([])).toEqual([]);
  });

  it('preserves first-seen order across distinct support files', () => {
    // Derive expectations from the registry itself so this test tracks the real
    // source of truth rather than a hardcoded ordering. The registry spans
    // multiple distinct support files (format-check.js, read-hook-stdin.js, and
    // the session-retrospect core + per-agent entry scripts); assert the
    // resolved union preserves first-seen order deterministically.
    const registered = Object.entries(HOOK_SUPPORT_FILES);
    const withFiles = registered.filter(([, files]) => files.length > 0);
    const distinct = [...new Set(withFiles.flatMap(([, files]) => files))];
    expect(supportFilesFor(withFiles.map(([name]) => name))).toEqual(distinct);
  });

  it('does not mutate the underlying registry entries', () => {
    const before = [...HOOK_SUPPORT_FILES['quality-warner']!];
    const result = supportFilesFor(['quality-warner']);
    result.push('injected.js');
    expect(HOOK_SUPPORT_FILES['quality-warner']).toEqual(before);
  });
});
