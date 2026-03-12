import { parse } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { Result } from '../result';
import { Ok, Err } from '../result';
import { readFileContent } from '../fs-utils';
import type {
  AST,
  Import,
  Export,
  ParseError,
  LanguageParser,
  HealthCheckResult,
} from './base';
import { createParseError } from './base';

function walk(node: unknown, visitor: (node: TSESTree.Node) => void): void {
  if (!node || typeof node !== 'object') return;
  if ('type' in node) {
    visitor(node as TSESTree.Node);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach(v => walk(v, visitor));
    } else {
      walk(value, visitor);
    }
  }
}

export class TypeScriptParser implements LanguageParser {
  name = 'typescript';
  extensions = ['.ts', '.tsx', '.mts', '.cts'];

  async parseFile(path: string): Promise<Result<AST, ParseError>> {
    const contentResult = await readFileContent(path);
    if (!contentResult.ok) {
      return Err(
        createParseError(
          'NOT_FOUND',
          `File not found: ${path}`,
          { path },
          ['Check that the file exists', 'Verify the path is correct']
        )
      );
    }

    try {
      const ast = parse(contentResult.value, {
        loc: true,
        range: true,
        jsx: path.endsWith('.tsx'),
        errorOnUnknownASTType: false,
      });

      return Ok({
        type: 'Program',
        body: ast,
        language: 'typescript',
      });
    } catch (e) {
      const error = e as Error;
      return Err(
        createParseError(
          'SYNTAX_ERROR',
          `Failed to parse ${path}: ${error.message}`,
          { path },
          ['Check for syntax errors in the file', 'Ensure valid TypeScript syntax']
        )
      );
    }
  }

  extractImports(ast: AST): Result<Import[], ParseError> {
    const imports: Import[] = [];
    const program = ast.body as TSESTree.Program;

    walk(program, (node) => {
      if (node.type === 'ImportDeclaration') {
        const importDecl = node as TSESTree.ImportDeclaration;
        const imp: Import = {
          source: importDecl.source.value as string,
          specifiers: [],
          location: {
            file: '',
            line: importDecl.loc?.start.line ?? 0,
            column: importDecl.loc?.start.column ?? 0,
          },
          kind: importDecl.importKind === 'type' ? 'type' : 'value',
        };

        for (const spec of importDecl.specifiers) {
          if (spec.type === 'ImportDefaultSpecifier') {
            imp.default = spec.local.name;
          } else if (spec.type === 'ImportNamespaceSpecifier') {
            imp.namespace = spec.local.name;
          } else if (spec.type === 'ImportSpecifier') {
            imp.specifiers.push(spec.local.name);
            // Check if this specific import is type-only
            if (spec.importKind === 'type') {
              imp.kind = 'type';
            }
          }
        }

        imports.push(imp);
      }

      // Handle dynamic imports
      if (node.type === 'ImportExpression') {
        const importExpr = node as TSESTree.ImportExpression;
        if (importExpr.source.type === 'Literal' && typeof importExpr.source.value === 'string') {
          imports.push({
            source: importExpr.source.value,
            specifiers: [],
            location: {
              file: '',
              line: importExpr.loc?.start.line ?? 0,
              column: importExpr.loc?.start.column ?? 0,
            },
            kind: 'value',
          });
        }
      }
    });

    return Ok(imports);
  }

  extractExports(_ast: AST): Result<Export[], ParseError> {
    // Placeholder - will implement in next task
    return Ok([]);
  }

  async health(): Promise<Result<HealthCheckResult, ParseError>> {
    return Ok({ available: true, version: '7.0.0' });
  }
}
