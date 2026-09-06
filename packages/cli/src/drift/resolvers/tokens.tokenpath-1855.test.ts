/**
 * Regression test for #1855 — `design.tokenPath` is declared and type-validated
 * by the config schema but was never read: both token resolvers hardcoded
 * `design-system/tokens.json`.
 *
 * The pre-existing coverage (`tests/config/design-schema.test.ts`) asserts only
 * that `tokenPath` *must be a string if provided* — that is a test of the schema
 * shape, not of the value being honoured. The key was covered by a passing test
 * and still completely inert. These tests therefore assert BEHAVIOUR: that a
 * non-default configured path is actually read, that the DRIFT-T00x token-bypass
 * rules run against tokens loaded from it, and that the unset-key fallback is
 * unchanged.
 *
 * Both previously-hardcoded call sites are exercised:
 *   - `loadTokenSet`       (was tokens.ts:53) — feeds runDetectDrift's DRIFT-T* rules
 *   - `loadTokenPathIndex` (was tokens.ts:88) — feeds align-design-system's codemods
 *
 * Colocated in `src/` rather than under `packages/cli/tests/` because that tree is
 * region-locked by a concurrent PR; `src/**\/*.test.ts` is an established include
 * in this package's vitest config.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadTokenSet, loadTokenPathIndex } from './tokens.js';
import { runDetectDrift } from '../index.js';

const TOKENS = {
  color: { brand: { primary: { $type: 'color', $value: '#FF6600' } } },
  space: { md: { $type: 'dimension', $value: '16px' } },
};

describe('design.tokenPath is honoured by the drift token resolvers (#1855)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tokenpath-1855-'));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  function writeConfig(design: Record<string, unknown>): void {
    fs.writeFileSync(path.join(projectRoot, 'harness.config.json'), JSON.stringify({ design }));
  }

  function writeTokensAt(relOrAbs: string, tokens: unknown = TOKENS): string {
    const target = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(projectRoot, relOrAbs);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(tokens));
    return target;
  }

  describe('a configured non-default tokenPath IS read', () => {
    // The failing-before / passing-after case. Before the fix both resolvers
    // built `<root>/design-system/tokens.json` and returned null here.
    beforeEach(() => {
      writeConfig({ tokenPath: 'custom/design/my-tokens.json' });
      writeTokensAt('custom/design/my-tokens.json');
    });

    it('loadTokenSet reads tokens from the configured path (site :53)', () => {
      const tokens = loadTokenSet(projectRoot);
      expect(tokens).not.toBeNull();
      expect(tokens!.colors.has('#ff6600')).toBe(true);
      expect(tokens!.spacingPx.has(16)).toBe(true);
    });

    it('loadTokenPathIndex reads tokens from the configured path (site :88)', () => {
      const index = loadTokenPathIndex(projectRoot);
      expect(index).not.toBeNull();
      expect(index!.colorPath.get('#ff6600')).toEqual(['color.brand.primary']);
      expect(index!.spacingPath.get(16)).toEqual(['space.md']);
    });

    it('the DRIFT-T00x token-bypass rules actually run against them', async () => {
      fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(projectRoot, 'src', 'Button.tsx'),
        `export const Button = () => <button style={{ color: '#FF6600' }}>Go</button>;\n`
      );

      const result = await runDetectDrift({ path: projectRoot, mode: 'full' });

      // A silent skip and a clean scan are indistinguishable from the finding
      // list alone, so assert the rule *ran* as well as what it found.
      expect(result.meta.tokensLoaded).toBe(true);
      expect(result.catalog.rulesApplied).toContain('token-bypass');
      const t001 = result.findings.filter((f) => f.code === 'DRIFT-T001');
      expect(t001).toHaveLength(1);
      // Palette-aware message proves the CUSTOM-PATH palette reached the rule:
      // an empty/absent palette yields the "outside the design system" variant.
      expect(t001[0]!.message).toContain('token reference');
    });
  });

  it('honours an absolute configured tokenPath', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'tokenpath-1855-abs-'));
    try {
      const abs = writeTokensAt(path.join(outside, 'tokens.json'));
      writeConfig({ tokenPath: abs });
      expect(loadTokenSet(projectRoot)!.colors.has('#ff6600')).toBe(true);
      expect(loadTokenPathIndex(projectRoot)!.colorPath.has('#ff6600')).toBe(true);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  describe('unset tokenPath still falls back to design-system/tokens.json', () => {
    it('falls back when harness.config.json has no tokenPath key', () => {
      writeConfig({ enabled: true });
      writeTokensAt('design-system/tokens.json');
      expect(loadTokenSet(projectRoot)!.colors.has('#ff6600')).toBe(true);
      expect(loadTokenPathIndex(projectRoot)!.colorPath.has('#ff6600')).toBe(true);
    });

    it('falls back when there is no harness.config.json at all', () => {
      writeTokensAt('design-system/tokens.json');
      expect(loadTokenSet(projectRoot)!.colors.has('#ff6600')).toBe(true);
      expect(loadTokenPathIndex(projectRoot)!.colorPath.has('#ff6600')).toBe(true);
    });

    it('treats a blank/whitespace-only tokenPath as unset', () => {
      writeConfig({ tokenPath: '   ' });
      writeTokensAt('design-system/tokens.json');
      expect(loadTokenSet(projectRoot)!.colors.has('#ff6600')).toBe(true);
      expect(loadTokenPathIndex(projectRoot)!.colorPath.has('#ff6600')).toBe(true);
    });

    it('does not fall back when tokenPath IS configured — the default path is ignored', () => {
      writeConfig({ tokenPath: 'custom/tokens.json' });
      writeTokensAt('design-system/tokens.json');
      expect(loadTokenSet(projectRoot)).toBeNull();
      expect(loadTokenPathIndex(projectRoot)).toBeNull();
    });
  });

  describe('missing-file behaviour is deliberately unchanged (F2)', () => {
    // #1855 suggests, *separately*, making an explicitly-configured-but-missing
    // tokens file a loud failure. That is an adopter-visible behaviour change and
    // is out of scope here; this test pins the current null-on-missing contract so
    // a future change to it is a deliberate, visible edit rather than a drift.
    it('returns null when the configured tokenPath does not exist', () => {
      writeConfig({ tokenPath: 'custom/nope.json' });
      expect(loadTokenSet(projectRoot)).toBeNull();
      expect(loadTokenPathIndex(projectRoot)).toBeNull();
    });

    it('returns null when the configured tokenPath is not valid JSON', () => {
      writeConfig({ tokenPath: 'custom/tokens.json' });
      const target = path.join(projectRoot, 'custom', 'tokens.json');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, '{ not: valid');
      expect(loadTokenSet(projectRoot)).toBeNull();
      expect(loadTokenPathIndex(projectRoot)).toBeNull();
    });

    it('falls back to the default path when harness.config.json is malformed', () => {
      fs.writeFileSync(path.join(projectRoot, 'harness.config.json'), '{ not: valid');
      writeTokensAt('design-system/tokens.json');
      expect(loadTokenSet(projectRoot)!.colors.has('#ff6600')).toBe(true);
      expect(loadTokenPathIndex(projectRoot)!.colorPath.has('#ff6600')).toBe(true);
    });
  });
});
