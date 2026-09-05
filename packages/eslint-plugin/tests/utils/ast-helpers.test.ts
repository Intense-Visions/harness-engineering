// tests/utils/ast-helpers.test.ts
import { describe, it, expect } from 'vitest';
import { hasJSDocComment, hasZodValidation, isTestModifierCall } from '../../src/utils/ast-helpers';
import { parse } from '@typescript-eslint/parser';
import type { TSESTree } from '@typescript-eslint/utils';

function parseCode(code: string): TSESTree.Program {
  return parse(code, {
    ecmaVersion: 2020,
    sourceType: 'module',
    range: true,
    comment: true,
  }) as TSESTree.Program;
}

describe('ast-helpers', () => {
  describe('hasJSDocComment', () => {
    it('detects JSDoc comment', () => {
      const code = `
/** This is JSDoc */
export function foo() {}
`;
      const ast = parseCode(code);
      const exportDecl = ast.body[0] as TSESTree.ExportNamedDeclaration;
      expect(hasJSDocComment(exportDecl, code)).toBe(true);
    });

    it('returns false for regular comment', () => {
      const code = `
// Not JSDoc
export function foo() {}
`;
      const ast = parseCode(code);
      const exportDecl = ast.body[0] as TSESTree.ExportNamedDeclaration;
      expect(hasJSDocComment(exportDecl, code)).toBe(false);
    });

    it('returns false for no comment', () => {
      const code = `export function foo() {}`;
      const ast = parseCode(code);
      const exportDecl = ast.body[0] as TSESTree.ExportNamedDeclaration;
      expect(hasJSDocComment(exportDecl, code)).toBe(false);
    });
  });

  describe('hasZodValidation', () => {
    it('detects schema.parse() call', () => {
      const code = `
export function handler(input: unknown) {
  const data = schema.parse(input);
  return data;
}
`;
      const ast = parseCode(code);
      const exportDecl = ast.body[0] as TSESTree.ExportNamedDeclaration;
      const funcDecl = exportDecl.declaration as TSESTree.FunctionDeclaration;
      expect(hasZodValidation(funcDecl.body!)).toBe(true);
    });

    it('detects z.object().parse() call', () => {
      const code = `
export function handler(input: unknown) {
  const data = z.object({ name: z.string() }).parse(input);
  return data;
}
`;
      const ast = parseCode(code);
      const exportDecl = ast.body[0] as TSESTree.ExportNamedDeclaration;
      const funcDecl = exportDecl.declaration as TSESTree.FunctionDeclaration;
      expect(hasZodValidation(funcDecl.body!)).toBe(true);
    });

    it('detects safeParse() call', () => {
      const code = `
export function handler(input: unknown) {
  const result = schema.safeParse(input);
  return result;
}
`;
      const ast = parseCode(code);
      const exportDecl = ast.body[0] as TSESTree.ExportNamedDeclaration;
      const funcDecl = exportDecl.declaration as TSESTree.FunctionDeclaration;
      expect(hasZodValidation(funcDecl.body!)).toBe(true);
    });

    it('returns false when no validation', () => {
      const code = `
export function handler(input: unknown) {
  return input;
}
`;
      const ast = parseCode(code);
      const exportDecl = ast.body[0] as TSESTree.ExportNamedDeclaration;
      const funcDecl = exportDecl.declaration as TSESTree.FunctionDeclaration;
      expect(hasZodValidation(funcDecl.body!)).toBe(false);
    });
  });

  describe('isTestModifierCall', () => {
    // Mirrors what ESLint hands a `CallExpression` visitor: optional-chained
    // calls parse as a ChainExpression wrapping the call, and the visitor is
    // invoked with the inner CallExpression.
    function firstCall(code: string): TSESTree.CallExpression {
      const ast = parseCode(code);
      const stmt = ast.body[0] as TSESTree.ExpressionStatement;
      const expr = stmt.expression;
      return (expr.type === 'ChainExpression' ? expr.expression : expr) as TSESTree.CallExpression;
    }

    const matches = (code: string) => isTestModifierCall(firstCall(code), 'skip');

    it.each([
      // Flat Jest/Mocha spellings — the shape that already worked
      `describe.skip('s', () => {});`,
      `it.skip('t', () => {});`,
      `test.skip('t', () => {});`,
      // Playwright namespaces its API, so the callee's object is itself a
      // MemberExpression. This is the #1812 regression — and it mutes a
      // WHOLE block, strictly more than the flat test.skip above.
      `test.describe.skip('s', () => {});`,
      // Playwright modifier chains are deeper still
      `test.describe.serial.skip('s', () => {});`,
      `test.describe.parallel.skip('s', () => {});`,
    ])('matches %s', (code) => {
      expect(matches(code)).toBe(true);
    });

    it.each([
      // No modifier at the end of the chain
      `test.describe('s', () => {});`,
      `test.describe.serial('s', () => {});`,
      // `skip` is not the FINAL link
      `test.skip.describe('s', () => {});`,
      // Chain root is not a test global — someone else's .skip
      `rateLimiter.skip('token');`,
      `queue.batch.skip();`,
      // Bare identifier call, no chain at all
      `skip('t', () => {});`,
    ])('does not match %s', (code) => {
      expect(matches(code)).toBe(false);
    });

    it('matches only the requested modifier', () => {
      expect(isTestModifierCall(firstCall(`test.describe.only('s', () => {});`), 'skip')).toBe(
        false
      );
      expect(isTestModifierCall(firstCall(`test.describe.only('s', () => {});`), 'only')).toBe(
        true
      );
    });

    // Documented boundary, not an endorsement: resolution is limited to
    // statically written, non-computed dotted paths. Computed access and
    // optional chaining are a pre-existing gap with a different root cause
    // than #1812 (`describe['skip']()` was never matched either) and are
    // deliberately out of scope. Pinned here so a future change to widen the
    // contract is deliberate rather than accidental.
    it.each([`test.describe['skip']('s', () => {});`, `test?.describe?.skip('s', () => {});`])(
      'does not resolve non-static chain %s (known gap, see #1812)',
      (code) => {
        expect(matches(code)).toBe(false);
      }
    );
  });
});
