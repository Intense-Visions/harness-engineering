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
    it('flags both off-palette AND in-palette hex (different messages)', () => {
      const tokens = emptyTokens();
      tokens.colors.add('#0066cc');
      const findings = runTokenBypassRule({
        source: `const styles = { color: "#ff0000", border: "1px solid #0066cc" };`,
        file: 'src/Card.tsx',
        tokens,
        strictness: 'standard',
      });
      expect(findings).toHaveLength(2);
      const offPalette = findings.find((f) => f.message.includes('#ff0000'));
      const inPalette = findings.find((f) => f.message.includes('#0066cc'));
      expect(offPalette?.message).toMatch(/not in the design token palette/);
      expect(inPalette?.message).toMatch(/should use a token reference/);
    });

    it('flags hex values that ARE in the palette as "should use token reference" (align can codemod)', () => {
      const tokens = emptyTokens();
      tokens.colors.add('#ff0000');
      const findings = runTokenBypassRule({
        source: `const c = "#FF0000";`,
        file: 'a.ts',
        tokens,
        strictness: 'standard',
      });
      expect(findings).toHaveLength(1);
      expect(findings[0].code).toBe('DRIFT-T001');
      expect(findings[0].message).toMatch(/should use a token reference/);
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

  // Regression: #750 — hex-shaped strings inside comments / non-color
  // string-literal prose must not be flagged (context-aware matching), while
  // genuine in-code color literals MUST still flag.
  describe('DRIFT-T001 — comment / string-literal context (#750)', () => {
    it('does NOT flag an issue reference inside a JSDoc block comment (class 1)', () => {
      const findings = runTokenBypassRule({
        source: [
          '/**',
          ' * Drift gate disabled (#529) until path exclusions land.',
          ' */',
          'export const nothing = 1;',
        ].join('\n'),
        file: 'repro.ts',
        tokens: emptyTokens(),
        strictness: 'standard',
      });
      expect(findings.filter((f) => f.code === 'DRIFT-T001')).toHaveLength(0);
    });

    it('does NOT flag an issue reference inside a // line comment (class 1)', () => {
      const findings = runTokenBypassRule({
        source: `export const x = 1; // consumer queries (#504)`,
        file: 'a.ts',
        tokens: emptyTokens(),
        strictness: 'standard',
      });
      expect(findings.filter((f) => f.code === 'DRIFT-T001')).toHaveLength(0);
    });

    it('does NOT flag a hex value described in JSDoc prose (class 2)', () => {
      const findings = runTokenBypassRule({
        source:
          '/** Hex color string for the variant icon stroke (e.g. `#e63535`). */\nexport type T = string;',
        file: 'types.ts',
        tokens: emptyTokens(),
        strictness: 'standard',
      });
      expect(findings.filter((f) => f.code === 'DRIFT-T001')).toHaveLength(0);
    });

    it('does NOT flag an issue reference inside a string literal / test title (class 1b)', () => {
      const findings = runTokenBypassRule({
        source: `describe('AuthErrorScreen (#332 Tier-3) renders', () => {});`,
        file: 'a.test.ts',
        tokens: emptyTokens(),
        strictness: 'standard',
      });
      expect(findings.filter((f) => f.code === 'DRIFT-T001')).toHaveLength(0);
    });

    it('STILL flags a genuine hex color literal in real code (true positive preserved)', () => {
      const findings = runTokenBypassRule({
        source: `const styles = { color: '#e63535' };`,
        file: 'Card.tsx',
        tokens: emptyTokens(),
        strictness: 'standard',
      });
      const t001 = findings.filter((f) => f.code === 'DRIFT-T001');
      expect(t001).toHaveLength(1);
      expect(t001[0].message).toContain('#e63535');
    });

    it('STILL flags an all-numeric hex color literal in real code (#666 true positive preserved)', () => {
      const findings = runTokenBypassRule({
        source: `const styles = { background: '#666' };`,
        file: 'Card.tsx',
        tokens: emptyTokens(),
        strictness: 'standard',
      });
      const t001 = findings.filter((f) => f.code === 'DRIFT-T001');
      expect(t001).toHaveLength(1);
      expect(t001[0].message).toContain('#666');
    });

    it('STILL flags a bare CSS-value hex inside a template string (color: #333)', () => {
      const findings = runTokenBypassRule({
        source: 'const css = `body { color: #333; padding: 20px; }`;',
        file: 'templates.ts',
        tokens: emptyTokens(),
        strictness: 'standard',
      });
      const t001 = findings.filter((f) => f.code === 'DRIFT-T001');
      expect(t001).toHaveLength(1);
      expect(t001[0].message).toContain('#333');
    });

    it('does NOT flag a hex mentioned in a // comment even when real code precedes it on other lines', () => {
      const findings = runTokenBypassRule({
        source: [
          `const styles = { color: '#e63535' };`,
          `// legacy value was #e63535 before tokenization`,
        ].join('\n'),
        file: 'Card.tsx',
        tokens: emptyTokens(),
        strictness: 'standard',
      });
      // Only the real code literal on line 1 should flag, not the comment on line 2.
      const t001 = findings.filter((f) => f.code === 'DRIFT-T001');
      expect(t001).toHaveLength(1);
      expect(t001[0].line).toBe(1);
    });
  });

  // Regression: #1824 — an issue reference is hex-shaped (`0-9` are all valid hex
  // digits), so `#1824` / `#493` were reported as hardcoded colours. Reported at 143 of
  // 413 findings (35%) on first adoption. The fix requires a colour-bearing value position
  // (c) AND rejects an all-decimal match that has no colour carrier (b).
  describe('DRIFT-T001 — issue-reference false positives (#1824)', () => {
    const t001 = (source: string, file = 'a.ts') =>
      runTokenBypassRule({ source, file, tokens: emptyTokens(), strictness: 'standard' }).filter(
        (f) => f.code === 'DRIFT-T001'
      );

    it('does NOT flag an issue reference inside non-parenthesized string prose', () => {
      expect(t001(`export const note = 'see #1824 for the triage';`)).toHaveLength(0);
    });

    it('does NOT flag an issue reference in a thrown error message', () => {
      expect(t001(`throw new Error('token resolver drifted, see #493');`)).toHaveLength(0);
    });

    it('does NOT flag issue references in bare code/JSX text context', () => {
      expect(
        t001(`export const El = () => <p>Tracked as #1824 and #493</p>;`, 'El.tsx')
      ).toHaveLength(0);
    });

    it('does NOT flag a letter-bearing reference in prose (the case (b) alone misses)', () => {
      expect(t001(`export const sha = 'reverted in #abc123 — see the ADR';`)).toHaveLength(0);
    });

    it('does NOT flag CSS-invalid hex lengths (5 and 7 are never colours)', () => {
      expect(t001(`const a = '#12345'; const b = '#1234567';`)).toHaveLength(0);
    });

    it('STILL flags an all-decimal hex behind a colour carrier (context overrides (b))', () => {
      const found = t001(`.badge { color: #1824; }`, 'badge.css');
      expect(found).toHaveLength(1);
      expect(found[0].message).toContain('#1824');
    });

    it('STILL flags a colour inside a gradient / var() fallback', () => {
      const found = t001(
        'const css = `a { background: linear-gradient(to right, #fff, #000); }`;',
        'g.ts'
      );
      expect(found.map((f) => f.message).join(' ')).toContain('#fff');
      expect(found.map((f) => f.message).join(' ')).toContain('#000');
    });

    it('STILL flags an all-decimal hex behind a colour-named SCSS variable', () => {
      expect(t001(`$grey-700: #666;`, 'vars.scss')).toHaveLength(1);
    });
  });

  // Regression: #750 — spacing prose inside comments must not be flagged.
  describe('DRIFT-T003 — comment context (#750)', () => {
    it('does NOT flag a px value described in a block-comment prose line', () => {
      const tokens = emptyTokens();
      tokens.spacingPx.add(4).add(8).add(16);
      const findings = runTokenBypassRule({
        source: ['/**', ' *   - bottom: 5px progress bar inset', ' */', 'export const y = 1;'].join(
          '\n'
        ),
        file: 'a.ts',
        tokens,
        strictness: 'standard',
      });
      expect(findings.filter((f) => f.code === 'DRIFT-T003')).toHaveLength(0);
    });

    it('STILL flags a real off-scale px spacing literal in code', () => {
      const tokens = emptyTokens();
      tokens.spacingPx.add(4).add(8).add(16);
      const findings = runTokenBypassRule({
        source: `const s = { padding: '13px' };`,
        file: 'a.ts',
        tokens,
        strictness: 'standard',
      });
      expect(findings.filter((f) => f.code === 'DRIFT-T003')).toHaveLength(1);
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
