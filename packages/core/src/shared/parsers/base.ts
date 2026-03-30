import type { BaseError } from '../errors';
import type { Result } from '../result';
import type { OutlineResult, UnfoldResult } from '../../code-nav/types';

/**
 * Abstract Syntax Tree representation
 */
export interface AST {
  type: string;
  body: unknown;
  language: string;
}

/**
 * Source code location
 */
export interface Location {
  file: string;
  line: number;
  column: number;
}

/**
 * Import declaration extracted from source
 */
export interface Import {
  source: string; // './module' or '@pkg/lib'
  specifiers: string[]; // Named imports
  default?: string; // Default import name
  namespace?: string; // import * as X
  location: Location;
  kind: 'value' | 'type'; // Distinguish type-only imports
}

/**
 * Export declaration extracted from source
 */
export interface Export {
  name: string;
  type: 'named' | 'default' | 'namespace';
  location: Location;
  isReExport: boolean;
  source?: string; // Re-export source
}

/**
 * Parser error with structured details
 */
export interface ParseError extends BaseError {
  code: 'TIMEOUT' | 'SUBPROCESS_FAILED' | 'SYNTAX_ERROR' | 'NOT_FOUND' | 'PARSER_UNAVAILABLE';
  details: {
    exitCode?: number;
    stderr?: string;
    path?: string;
    parser?: string;
  };
}

/**
 * Health check result indicating parser availability
 */
export interface HealthCheckResult {
  available: boolean;
  version?: string;
  message?: string;
}

/**
 * Language-agnostic parser interface
 * Implementations provide language-specific parsing
 */
export interface LanguageParser {
  name: string;
  extensions: string[]; // ['.ts', '.tsx']
  parseFile(path: string): Promise<Result<AST, ParseError>>;
  extractImports(ast: AST): Result<Import[], ParseError>;
  extractExports(ast: AST): Result<Export[], ParseError>;
  health(): Promise<Result<HealthCheckResult, ParseError>>;
  /** Extract structural outline from a parsed AST. Optional — code-nav parsers implement this. */
  outline?(filePath: string, ast: AST): OutlineResult;
  /** Extract a specific symbol's full implementation. Optional — code-nav parsers implement this. */
  unfold?(filePath: string, ast: AST, symbolName: string): UnfoldResult | null;
}

/**
 * Create a ParseError with standard structure
 */
export function createParseError(
  code: ParseError['code'],
  message: string,
  details: ParseError['details'] = {},
  suggestions: string[] = []
): ParseError {
  return { code, message, details, suggestions };
}
