import { describe, it, expect } from 'vitest';
import { runTokenMisuseRule } from '../../../src/brand/rules/token-misuse-rule';
import type { BrandTokenIndex } from '../../../src/brand/resolvers/token-extensions';

function makeIndex(
  entries: Array<{ path: string; forbidden: string[]; approved?: string[] }>
): BrandTokenIndex {
  const byPath = new Map();
  for (const e of entries) {
    byPath.set(e.path, {
      path: e.path,
      approvedContexts: e.approved ?? [],
      forbiddenContexts: e.forbidden,
    });
  }
  return { byPath };
}

describe('runTokenMisuseRule (BRAND-T001)', () => {
  it('fires on tokens.X.Y reference in forbidden context', () => {
    const findings = runTokenMisuseRule({
      source: `// data-visualization region\nconst c = tokens.color.brand.500;\n`,
      file: 'src/Chart.ts',
      brandTokens: makeIndex([{ path: 'color.brand.500', forbidden: ['data-visualization'] }]),
      strictness: 'standard',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('BRAND-T001');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toContain('data-visualization');
  });

  it('fires on var(--x-y-z) reference in forbidden context', () => {
    const findings = runTokenMisuseRule({
      source: `.chart-decorative { background: var(--color-brand-500); }\n`,
      file: 'src/Chart.css',
      brandTokens: makeIndex([{ path: 'color.brand.500', forbidden: ['decorative'] }]),
      strictness: 'standard',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('BRAND-T001');
  });

  it('fires on string-literal reference "X.Y.Z" in forbidden context', () => {
    const findings = runTokenMisuseRule({
      source: `// background gradient\nconst c = resolveToken('color.brand.500');\n`,
      file: 'src/Chart.ts',
      brandTokens: makeIndex([{ path: 'color.brand.500', forbidden: ['background'] }]),
      strictness: 'standard',
    });
    expect(findings).toHaveLength(1);
  });

  it('does NOT fire when token referenced in an approved context', () => {
    const findings = runTokenMisuseRule({
      source: `// CTA button\nconst c = tokens.color.brand.500;\n`,
      file: 'src/Cta.tsx',
      brandTokens: makeIndex([
        { path: 'color.brand.500', forbidden: ['data-visualization'], approved: ['cta'] },
      ]),
      strictness: 'standard',
    });
    expect(findings).toHaveLength(0);
  });

  it('does NOT fire when token has empty forbiddenContexts (even if referenced)', () => {
    const findings = runTokenMisuseRule({
      source: `// data-visualization\nconst c = tokens.color.x;\n`,
      file: 'src/X.ts',
      brandTokens: makeIndex([{ path: 'color.x', forbidden: [] }]),
      strictness: 'standard',
    });
    expect(findings).toHaveLength(0);
  });

  it('deduplicates references on the same line (one finding per token per line)', () => {
    const findings = runTokenMisuseRule({
      source: `// data-visualization\nconst s = { a: tokens.color.brand.500, b: tokens.color.brand.500 };\n`,
      file: 'src/X.ts',
      brandTokens: makeIndex([{ path: 'color.brand.500', forbidden: ['data-visualization'] }]),
      strictness: 'standard',
    });
    expect(findings).toHaveLength(1);
  });

  it('strictness modifies severity (strict → error; permissive → info)', () => {
    const strict = runTokenMisuseRule({
      source: `// data-visualization\nconst c = tokens.color.brand.500;\n`,
      file: 'a.ts',
      brandTokens: makeIndex([{ path: 'color.brand.500', forbidden: ['data-visualization'] }]),
      strictness: 'strict',
    });
    const permissive = runTokenMisuseRule({
      source: `// data-visualization\nconst c = tokens.color.brand.500;\n`,
      file: 'a.ts',
      brandTokens: makeIndex([{ path: 'color.brand.500', forbidden: ['data-visualization'] }]),
      strictness: 'permissive',
    });
    expect(strict[0].severity).toBe('error');
    expect(permissive[0].severity).toBe('info');
  });
});
