import { describe, it, expect } from 'vitest';
import { classifyFinding } from '../../../src/align/classifier/pre-flight';
import type { DriftFinding } from '../../../src/drift/findings/finding';
import type { TokenPathIndex } from '../../../src/drift/resolvers/tokens';

function makeFinding(
  code: DriftFinding['code'],
  message: string,
  line: number | null = 5,
  file = 'src/X.ts'
): DriftFinding {
  return {
    code,
    severity: 'error',
    file,
    line,
    message,
    evidence: { snippet: '' },
    rule: {
      id: code,
      category: code.startsWith('DRIFT-T') ? 'token-bypass' : 'primitive-adoption',
    },
    fix: { kind: 'codemod-todo', description: '' },
  };
}

function makePaths(
  opts: {
    colors?: Array<[string, string[]]>;
    fonts?: Array<[string, string[]]>;
    spacing?: Array<[number, string[]]>;
  } = {}
): TokenPathIndex {
  return {
    colorPath: new Map(opts.colors ?? []),
    fontFamilyPath: new Map(opts.fonts ?? []),
    spacingPath: new Map(opts.spacing ?? []),
  };
}

const TOKEN_IMPORT = `import { tokens } from '@/design-system/tokens';\n`;

describe('classifyFinding', () => {
  describe('always-suggestion paths', () => {
    it('DRIFT-T004 is always a suggestion', () => {
      const c = classifyFinding({
        finding: makeFinding('DRIFT-T004', 'Token "color.brand.500" is deprecated'),
        source: TOKEN_IMPORT,
        tokenPaths: makePaths({ colors: [['#ff0000', ['color.brand.500']]] }),
      });
      expect(c.kind).toBe('suggestion');
    });

    it('all DRIFT-P* codes are suggestions (no source inspection)', () => {
      for (const code of ['DRIFT-P001', 'DRIFT-P002', 'DRIFT-P003', 'DRIFT-P004'] as const) {
        const c = classifyFinding({
          finding: makeFinding(code as DriftFinding['code'], 'Raw element'),
          source: '',
          tokenPaths: null,
        });
        expect(c.kind).toBe('suggestion');
      }
    });
  });

  describe('T001 hex classification', () => {
    it('returns safe-codemod when token import present + exact-match palette entry', () => {
      const c = classifyFinding({
        finding: makeFinding(
          'DRIFT-T001',
          'Hardcoded color "#ff0000" is not in the design token palette'
        ),
        source: `${TOKEN_IMPORT}const c = "#ff0000";\n`,
        tokenPaths: makePaths({ colors: [['#ff0000', ['color.brand.primary']]] }),
      });
      expect(c.kind).toBe('safe-codemod');
      if (c.kind === 'safe-codemod') {
        expect(c.tokenPath).toBe('color.brand.primary');
      }
    });

    it('downgrades to suggestion when token import is absent', () => {
      const c = classifyFinding({
        finding: makeFinding('DRIFT-T001', 'Hardcoded color "#ff0000"'),
        source: `const c = "#ff0000";\n`,
        tokenPaths: makePaths({ colors: [['#ff0000', ['color.brand.primary']]] }),
      });
      expect(c.kind).toBe('suggestion');
      if (c.kind === 'suggestion') {
        expect(c.reason).toMatch(/no recognized token import/);
      }
    });

    it('downgrades when tokenPaths is null', () => {
      const c = classifyFinding({
        finding: makeFinding('DRIFT-T001', 'Hardcoded color "#ff0000"'),
        source: TOKEN_IMPORT,
        tokenPaths: null,
      });
      expect(c.kind).toBe('suggestion');
    });

    it('downgrades when no palette token matches', () => {
      const c = classifyFinding({
        finding: makeFinding('DRIFT-T001', 'Hardcoded color "#ff0000"'),
        source: `${TOKEN_IMPORT}const c = "#ff0000";\n`,
        tokenPaths: makePaths({ colors: [] }),
      });
      expect(c.kind).toBe('suggestion');
      if (c.kind === 'suggestion') {
        expect(c.reason).toMatch(/no token matches/);
      }
    });

    it('downgrades when multiple tokens share the same value (ambiguous)', () => {
      const c = classifyFinding({
        finding: makeFinding('DRIFT-T001', 'Hardcoded color "#ff0000"'),
        source: `${TOKEN_IMPORT}const c = "#ff0000";\n`,
        tokenPaths: makePaths({ colors: [['#ff0000', ['color.a', 'color.b']]] }),
      });
      expect(c.kind).toBe('suggestion');
      if (c.kind === 'suggestion') {
        expect(c.reason).toMatch(/multiple tokens share/);
      }
    });

    it('downgrades when hex appears in a template literal', () => {
      const c = classifyFinding({
        finding: makeFinding('DRIFT-T001', 'Hardcoded color "#ff0000"', 2),
        source: `${TOKEN_IMPORT}const c = \`color: \${'#ff0000'}\`;\n`,
        tokenPaths: makePaths({ colors: [['#ff0000', ['color.brand']]] }),
      });
      expect(c.kind).toBe('suggestion');
    });
  });

  describe('T002 font-family classification', () => {
    it('returns safe-codemod for clean string-literal context', () => {
      const c = classifyFinding({
        finding: makeFinding(
          'DRIFT-T002',
          'Font-family "Comic Sans" is not in the typography token palette',
          2
        ),
        source: `${TOKEN_IMPORT}const t = { fontFamily: "Comic Sans" };\n`,
        tokenPaths: makePaths({ fonts: [['comic sans', ['typography.fun.fontFamily']]] }),
      });
      expect(c.kind).toBe('safe-codemod');
    });

    it('downgrades when font-family not in palette', () => {
      const c = classifyFinding({
        finding: makeFinding(
          'DRIFT-T002',
          'Font-family "Comic Sans" is not in the typography token palette',
          2
        ),
        source: `${TOKEN_IMPORT}const t = { fontFamily: "Comic Sans" };\n`,
        tokenPaths: makePaths({ fonts: [] }),
      });
      expect(c.kind).toBe('suggestion');
    });
  });

  describe('T003 px-spacing classification', () => {
    it('returns safe-codemod when px value exactly matches a token', () => {
      const c = classifyFinding({
        finding: makeFinding('DRIFT-T003', 'Spacing value 16px is not in the spacing scale', 2),
        source: `${TOKEN_IMPORT}const s = { padding: "16px" };\n`,
        tokenPaths: makePaths({ spacing: [[16, ['space.md']]] }),
      });
      expect(c.kind).toBe('safe-codemod');
    });

    it('downgrades when px appears in arithmetic', () => {
      const c = classifyFinding({
        finding: makeFinding('DRIFT-T003', 'Spacing value 16px is not in the spacing scale', 2),
        source: `${TOKEN_IMPORT}const s = { gap: 16px + 4px };\n`,
        tokenPaths: makePaths({ spacing: [[16, ['space.md']]] }),
      });
      expect(c.kind).toBe('suggestion');
    });

    it('downgrades when no exact match (no rounding in v1)', () => {
      const c = classifyFinding({
        finding: makeFinding('DRIFT-T003', 'Spacing value 13px is not in the spacing scale', 2),
        source: `${TOKEN_IMPORT}const s = { padding: "13px" };\n`,
        tokenPaths: makePaths({
          spacing: [
            [8, ['space.sm']],
            [16, ['space.md']],
          ],
        }),
      });
      expect(c.kind).toBe('suggestion');
    });
  });
});
