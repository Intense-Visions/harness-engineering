import { parse } from '@typescript-eslint/typescript-estree';
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

  extractImports(_ast: AST): Result<Import[], ParseError> {
    // Placeholder - will implement in next task
    return Ok([]);
  }

  extractExports(_ast: AST): Result<Export[], ParseError> {
    // Placeholder - will implement in next task
    return Ok([]);
  }

  async health(): Promise<Result<HealthCheckResult, ParseError>> {
    return Ok({ available: true, version: '7.0.0' });
  }
}
