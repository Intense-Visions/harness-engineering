import { describe, it, expect } from 'vitest';
import { runTokenBypassRule } from '../../../src/drift/rules/token-bypass-rule';
import type { TokenSet } from '../../../src/drift/resolvers/tokens';

function emptyTokens(): TokenSet {
  return {
    colors: new Set(),
    fontFamilies: new Set(),
    spacingPx: new Set(),
    deprecatedTokens: new Set(),
  };
}

describe('runTokenBypassRule', () => {
  describe('DRIFT-T001 — hex color outside palette', () => {
    it('flags a hardcoded hex that is not in the palette', () => {
      const tokens = emptyTokens();
      tokens.colors.add('#0066cc'); // palette has brand color
      const findings = runTokenBypassRule({
        source: `const styles = { color: "#ff0000", border: "1px solid #0066cc" };`,
        file: 'src/Card.tsx',
        tokens,
        strictness: 'standard',
      });
      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe('DRIFT-T001');
      expect(findings[0].severity).toBe('error');
      expect(findings[0].message).toContain('#ff0000');
    });

    it('does not flag hex values that ARE in the palette (case-insensitive)', () => {
      const tokens = emptyTokens();
      tokens.colors.add('#ff0000');
      const findings = runTokenBypassRule({
        source: `const c = "#FF0000";`,
        file: 'a.ts',
        tokens,
        strictness: 'standard',
      });
      expect(findings).toHaveLength(0);
    });

    it('deduplicates repeated hex bypasses on the same line', () => {
      const tokens = emptyTokens();
      const findings = runTokenBypassRule({
        source: `const s = { a: "#ff0000", b: "#ff0000" };`,
        file: 'a.ts',
        tokens,
        strictness: 'standard',
      });
      expect(findings).toHaveLength(1);
    });
  });

  describe('DRIFT-T002 — font-family outside palette', () => {
    it('flags a font-family not in the typography palette', () => {
      const tokens = emptyTokens();
      tokens.fontFamilies.add('inter');
      const findings = runTokenBypassRule({
        source: `const t = { fontFamily: "Comic Sans MS" };`,
        file: 'src/Title.tsx',
        tokens,
        strictness: 'standard',
      });
      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe('DRIFT-T002');
      expect(findings[0].message).toContain('Comic Sans MS');
    });

    it('allows system fallback families (sans-serif, system-ui, etc.)', () => {
      const tokens = emptyTokens();
      const findings = runTokenBypassRule({
        source: `const t = { fontFamily: "system-ui" };`,
        file: 'a.ts',
        tokens,
        strictness: 'standard',
      });
      expect(findings).toHaveLength(0);
    });
  });

  describe('DRIFT-T003 — pixel spacing outside scale', () => {
    it('flags px values not in the spacing scale', () => {
      const tokens = emptyTokens();
      tokens.spacingPx.add(4).add(8).add(16);
      const findings = runTokenBypassRule({
        source: `const s = { padding: "13px" };`,
        file: 'a.ts',
        tokens,
        strictness: 'standard',
      });
      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe('DRIFT-T003');
      expect(findings[0].severity).toBe('warn');
    });

    it('skips the rule entirely when no spacing tokens are defined', () => {
      const tokens = emptyTokens();
      const findings = runTokenBypassRule({
        source: `const s = { padding: "13px" };`,
        file: 'a.ts',
        tokens,
        strictness: 'standard',
      });
      expect(findings.filter((f) => f.code === 'DRIFT-T003')).toHaveLength(0);
    });
  });

  describe('DRIFT-T004 — deprecated token reference', () => {
    it('flags string literal references to deprecated tokens', () => {
      const tokens = emptyTokens();
      tokens.deprecatedTokens.add('color.brand.500');
      const findings = runTokenBypassRule({
        source: `const c = useToken("color.brand.500");`,
        file: 'a.ts',
        tokens,
        strictness: 'standard',
      });
      expect(findings.some((f) => f.code === 'DRIFT-T004')).toBe(true);
    });

    it('flags css-var-kebab references to deprecated tokens', () => {
      const tokens = emptyTokens();
      tokens.deprecatedTokens.add('color.brand.500');
      const findings = runTokenBypassRule({
        source: `.x { color: var(--color-brand-500); }`,
        file: 'a.css',
        tokens,
        strictness: 'standard',
      });
      expect(findings.some((f) => f.code === 'DRIFT-T004')).toBe(true);
    });
  });

  describe('strictness modifiers', () => {
    it('strict mode: all findings → error', () => {
      const tokens = emptyTokens();
      tokens.spacingPx.add(8);
      const findings = runTokenBypassRule({
        source: `const s = { padding: "13px" };`,
        file: 'a.ts',
        tokens,
        strictness: 'strict',
      });
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('error');
    });

    it('permissive mode: all findings → info', () => {
      const tokens = emptyTokens();
      const findings = runTokenBypassRule({
        source: `const s = { color: "#ff0000" };`,
        file: 'a.ts',
        tokens,
        strictness: 'permissive',
      });
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('info');
    });
  });
});
