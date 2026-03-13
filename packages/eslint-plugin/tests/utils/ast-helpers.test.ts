// tests/utils/ast-helpers.test.ts
import { describe, it, expect } from 'vitest';
import { hasJSDocComment, hasZodValidation } from '../../src/utils/ast-helpers';
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
});
