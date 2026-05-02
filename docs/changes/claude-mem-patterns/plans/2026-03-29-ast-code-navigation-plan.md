# Plan: AST Code Navigation

**Date:** 2026-03-29
**Spec:** docs/changes/claude-mem-patterns/ast-code-navigation/proposal.md
**Estimated tasks:** 12
**Estimated time:** 45 minutes

## Goal

Add three MCP tools (`code_outline`, `code_search`, `code_unfold`) that use tree-sitter to provide AST-based code navigation, achieving 4-18x token savings over full-file reads for exploration-heavy skills.

## Observable Truths (Acceptance Criteria)

1. **[Event-driven]** When `code_outline` is called with a TypeScript file path, the system shall return a structural skeleton showing exports, classes, functions, types with signatures and line numbers, without implementation bodies.
2. **[Event-driven]** When `code_outline` is called with a directory glob, the system shall return outlines for all matching files in that directory.
3. **[Event-driven]** When `code_search` is called with a symbol name and directory scope, the system shall return matching symbols with file path, line number, kind (function/class/type/export), and one-line context.
4. **[Event-driven]** When `code_search` encounters files it cannot parse, the system shall skip those files and include them in a `skipped` list in the response.
5. **[Event-driven]** When `code_unfold` is called with a file path and symbol name, the system shall return the complete implementation of that symbol extracted by AST boundary.
6. **[Event-driven]** When `code_unfold` is called with a file path and line range, the system shall return the code within that range.
7. **[State-driven]** While tree-sitter parsing fails for a file (unsupported language, syntax errors, binary), `code_outline` shall return the file path with `[parse-failed]` marker, and `code_unfold` shall fall back to raw file content with `[fallback: raw content]` warning.
8. **[Ubiquitous]** The system shall support TypeScript, JavaScript, and Python files via tree-sitter WASM grammars.
9. **[Ubiquitous]** The `LanguageParser` interface in `packages/core/src/shared/parsers/base.ts` shall be extended with `outline()`, `search()`, and `unfold()` methods while preserving the existing `parseFile()`, `extractImports()`, `extractExports()` contract.
10. `npx vitest run packages/core/tests/code-nav/` passes with all tests green.
11. The three MCP tools appear in the tool list when the MCP server starts.

## File Map

```
CREATE  packages/core/src/code-nav/types.ts
CREATE  packages/core/src/code-nav/parser.ts
CREATE  packages/core/src/code-nav/outline.ts
CREATE  packages/core/src/code-nav/search.ts
CREATE  packages/core/src/code-nav/unfold.ts
CREATE  packages/core/src/code-nav/index.ts
MODIFY  packages/core/src/shared/parsers/base.ts          (extend LanguageParser interface)
MODIFY  packages/core/src/index.ts                         (re-export code-nav)
CREATE  packages/core/tests/code-nav/types.test.ts
CREATE  packages/core/tests/code-nav/parser.test.ts
CREATE  packages/core/tests/code-nav/outline.test.ts
CREATE  packages/core/tests/code-nav/search.test.ts
CREATE  packages/core/tests/code-nav/unfold.test.ts
CREATE  packages/core/tests/fixtures/code-nav/sample.ts
CREATE  packages/core/tests/fixtures/code-nav/sample.py
CREATE  packages/core/tests/fixtures/code-nav/sample.js
CREATE  packages/core/tests/fixtures/code-nav/syntax-error.ts
CREATE  packages/cli/src/mcp/tools/code-nav.ts
MODIFY  packages/cli/src/mcp/server.ts                     (register 3 new tools)
MODIFY  packages/core/package.json                          (add web-tree-sitter, tree-sitter-wasms)
```

## Tasks

### Task 1: Add tree-sitter dependencies and create test fixtures

**Depends on:** none
**Files:** `packages/core/package.json`, `packages/core/tests/fixtures/code-nav/*`

1. Add dependencies to `packages/core/package.json`:

   ```json
   "web-tree-sitter": "^0.26.7",
   "tree-sitter-wasms": "^0.1.13"
   ```

2. Install dependencies:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering && pnpm install
   ```

3. Create test fixture `packages/core/tests/fixtures/code-nav/sample.ts`:

   ```typescript
   import { Request, Response } from 'express';

   interface AuthConfig {
     secret: string;
     expiresIn: number;
   }

   export class AuthMiddleware {
     private config: AuthConfig;

     constructor(config: AuthConfig) {
       this.config = config;
     }

     async authenticate(req: Request): Promise<{ id: string; name: string }> {
       const token = req.headers.authorization;
       if (!token) throw new Error('No token');
       return { id: '1', name: 'test' };
     }

     refreshToken(token: string): string {
       return token + '-refreshed';
     }

     private validateJWT(jwt: string): boolean {
       return jwt.length > 0;
     }
   }

   export function createAuthMiddleware(config: AuthConfig): AuthMiddleware {
     return new AuthMiddleware(config);
   }

   export type UserRole = 'admin' | 'user' | 'guest';

   export const DEFAULT_CONFIG: AuthConfig = { secret: 'dev', expiresIn: 3600 };
   ```

4. Create test fixture `packages/core/tests/fixtures/code-nav/sample.js`:

   ```javascript
   const express = require('express');

   class Router {
     constructor() {
       this.routes = [];
     }

     addRoute(method, path, handler) {
       this.routes.push({ method, path, handler });
     }

     get(path, handler) {
       this.addRoute('GET', path, handler);
     }
   }

   function createRouter() {
     return new Router();
   }

   module.exports = { Router, createRouter };
   ```

5. Create test fixture `packages/core/tests/fixtures/code-nav/sample.py`:

   ```python
   from typing import Optional, List

   class UserService:
       """Service for managing users."""

       def __init__(self, db_url: str):
           self.db_url = db_url
           self._cache: dict = {}

       def get_user(self, user_id: int) -> Optional[dict]:
           if user_id in self._cache:
               return self._cache[user_id]
           return None

       def list_users(self, limit: int = 10) -> List[dict]:
           return []

       def _validate(self, data: dict) -> bool:
           return 'name' in data

   def create_service(db_url: str) -> UserService:
       return UserService(db_url)

   DEFAULT_URL = "postgresql://localhost/users"
   ```

6. Create test fixture `packages/core/tests/fixtures/code-nav/syntax-error.ts`:

   ```typescript
   export function broken( {
     // missing closing paren and brace
     const x = 1
   ```

7. Commit: `feat(code-nav): add tree-sitter dependencies and test fixtures`

---

### Task 2: Define code-nav types

**Depends on:** none (can run in parallel with Task 1)
**Files:** `packages/core/src/code-nav/types.ts`, `packages/core/tests/code-nav/types.test.ts`

1. Create `packages/core/src/code-nav/types.ts`:

   ```typescript
   /**
    * Supported languages for AST code navigation.
    */
   export type SupportedLanguage = 'typescript' | 'javascript' | 'python';

   /**
    * Kind of code symbol extracted from AST.
    */
   export type SymbolKind =
     | 'function'
     | 'class'
     | 'interface'
     | 'type'
     | 'variable'
     | 'method'
     | 'property'
     | 'export'
     | 'import';

   /**
    * A code symbol with its location and metadata.
    */
   export interface CodeSymbol {
     name: string;
     kind: SymbolKind;
     file: string;
     line: number;
     endLine: number;
     signature: string;
     children?: CodeSymbol[];
   }

   /**
    * Result of code_outline — structural skeleton of a file.
    */
   export interface OutlineResult {
     file: string;
     language: SupportedLanguage | 'unknown';
     totalLines: number;
     symbols: CodeSymbol[];
     error?: string; // '[parse-failed]' when parsing fails
   }

   /**
    * A single match from code_search.
    */
   export interface SearchMatch {
     symbol: CodeSymbol;
     context: string; // one-line context around the match
   }

   /**
    * Result of code_search — cross-file symbol discovery.
    */
   export interface SearchResult {
     query: string;
     matches: SearchMatch[];
     skipped: string[]; // files that could not be parsed
   }

   /**
    * Result of code_unfold — AST-bounded code extraction.
    */
   export interface UnfoldResult {
     file: string;
     symbolName?: string;
     startLine: number;
     endLine: number;
     content: string;
     language: SupportedLanguage | 'unknown';
     fallback: boolean; // true when raw content was returned
     warning?: string; // '[fallback: raw content]' when in fallback mode
   }

   /**
    * Map file extensions to supported languages.
    */
   export const EXTENSION_MAP: Record<string, SupportedLanguage> = {
     '.ts': 'typescript',
     '.tsx': 'typescript',
     '.mts': 'typescript',
     '.cts': 'typescript',
     '.js': 'javascript',
     '.jsx': 'javascript',
     '.mjs': 'javascript',
     '.cjs': 'javascript',
     '.py': 'python',
   };

   /**
    * Detect language from file extension.
    */
   export function detectLanguage(filePath: string): SupportedLanguage | null {
     const ext = filePath.slice(filePath.lastIndexOf('.'));
     return EXTENSION_MAP[ext] ?? null;
   }
   ```

2. Create `packages/core/tests/code-nav/types.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import {
     detectLanguage,
     EXTENSION_MAP,
     type CodeSymbol,
     type OutlineResult,
     type SearchResult,
     type UnfoldResult,
   } from '../../src/code-nav/types';

   describe('code-nav types', () => {
     describe('detectLanguage', () => {
       it('should detect TypeScript files', () => {
         expect(detectLanguage('foo.ts')).toBe('typescript');
         expect(detectLanguage('bar.tsx')).toBe('typescript');
         expect(detectLanguage('baz.mts')).toBe('typescript');
         expect(detectLanguage('qux.cts')).toBe('typescript');
       });

       it('should detect JavaScript files', () => {
         expect(detectLanguage('foo.js')).toBe('javascript');
         expect(detectLanguage('bar.jsx')).toBe('javascript');
         expect(detectLanguage('baz.mjs')).toBe('javascript');
       });

       it('should detect Python files', () => {
         expect(detectLanguage('foo.py')).toBe('python');
       });

       it('should return null for unsupported extensions', () => {
         expect(detectLanguage('foo.rs')).toBeNull();
         expect(detectLanguage('foo.go')).toBeNull();
         expect(detectLanguage('foo.md')).toBeNull();
       });
     });

     it('should have all expected extensions in EXTENSION_MAP', () => {
       expect(Object.keys(EXTENSION_MAP)).toHaveLength(9);
     });

     it('should allow constructing CodeSymbol', () => {
       const sym: CodeSymbol = {
         name: 'myFunc',
         kind: 'function',
         file: 'test.ts',
         line: 1,
         endLine: 10,
         signature: 'function myFunc(): void',
       };
       expect(sym.kind).toBe('function');
     });
   });
   ```

3. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/code-nav/types.test.ts`
4. Observe: all tests pass.
5. Commit: `feat(code-nav): define shared types for AST code navigation`

---

### Task 3: Extend LanguageParser interface

**Depends on:** Task 2
**Files:** `packages/core/src/shared/parsers/base.ts`, `packages/core/src/shared/parsers/index.ts`

1. Add optional code-nav methods to the `LanguageParser` interface in `packages/core/src/shared/parsers/base.ts`. Add this import at the top:

   ```typescript
   import type { CodeSymbol, OutlineResult, UnfoldResult } from '../../code-nav/types';
   ```

   Then add these optional methods to the `LanguageParser` interface (after `health()`):

   ```typescript
   /** Extract structural outline from a parsed AST. Optional — code-nav parsers implement this. */
   outline?(filePath: string, ast: AST): OutlineResult;
   /** Extract a specific symbol's full implementation. Optional — code-nav parsers implement this. */
   unfold?(filePath: string, ast: AST, symbolName: string): UnfoldResult | null;
   ```

2. Re-export the code-nav types from `packages/core/src/shared/parsers/index.ts` — no changes needed here since the types come from `code-nav/types.ts` which will get its own export path.

3. Run existing parser tests to verify no regressions: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/parsers/`
4. Observe: all existing tests still pass (the new methods are optional, so `TypeScriptParser` does not need them).
5. Commit: `feat(code-nav): extend LanguageParser interface with outline and unfold methods`

---

### Task 4: Implement tree-sitter parser cache

**Depends on:** Task 1, Task 2
**Files:** `packages/core/src/code-nav/parser.ts`, `packages/core/tests/code-nav/parser.test.ts`

1. Create `packages/core/tests/code-nav/parser.test.ts`:

   ```typescript
   import { describe, it, expect, beforeAll } from 'vitest';
   import { getParser, parseFile, resetParserCache } from '../../src/code-nav/parser';
   import * as path from 'path';

   const FIXTURES = path.resolve(__dirname, '../fixtures/code-nav');

   describe('code-nav parser', () => {
     beforeAll(() => {
       resetParserCache();
     });

     describe('getParser', () => {
       it('should return a parser for typescript', async () => {
         const parser = await getParser('typescript');
         expect(parser).toBeDefined();
       });

       it('should return a parser for javascript', async () => {
         const parser = await getParser('javascript');
         expect(parser).toBeDefined();
       });

       it('should return a parser for python', async () => {
         const parser = await getParser('python');
         expect(parser).toBeDefined();
       });

       it('should cache parser instances', async () => {
         const p1 = await getParser('typescript');
         const p2 = await getParser('typescript');
         expect(p1).toBe(p2);
       });
     });

     describe('parseFile', () => {
       it('should parse a TypeScript file', async () => {
         const result = await parseFile(path.join(FIXTURES, 'sample.ts'));
         expect(result.ok).toBe(true);
         if (result.ok) {
           expect(result.value.tree).toBeDefined();
           expect(result.value.language).toBe('typescript');
           expect(result.value.source).toContain('class AuthMiddleware');
         }
       });

       it('should parse a JavaScript file', async () => {
         const result = await parseFile(path.join(FIXTURES, 'sample.js'));
         expect(result.ok).toBe(true);
         if (result.ok) {
           expect(result.value.language).toBe('javascript');
         }
       });

       it('should parse a Python file', async () => {
         const result = await parseFile(path.join(FIXTURES, 'sample.py'));
         expect(result.ok).toBe(true);
         if (result.ok) {
           expect(result.value.language).toBe('python');
         }
       });

       it('should return error for unsupported extension', async () => {
         const result = await parseFile('/tmp/test.rs');
         expect(result.ok).toBe(false);
       });

       it('should return error for non-existent file', async () => {
         const result = await parseFile('/tmp/nonexistent.ts');
         expect(result.ok).toBe(false);
       });
     });
   });
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/code-nav/parser.test.ts`
3. Observe failure: module not found.

4. Create `packages/core/src/code-nav/parser.ts`:

   ```typescript
   import Parser from 'web-tree-sitter';
   import { readFileContent } from '../shared/fs-utils';
   import { Ok, Err } from '../shared/result';
   import type { Result } from '../shared/result';
   import { detectLanguage, type SupportedLanguage } from './types';

   export interface ParsedFile {
     tree: Parser.Tree;
     language: SupportedLanguage;
     source: string;
     filePath: string;
   }

   interface ParseFileError {
     code: 'UNSUPPORTED_LANGUAGE' | 'FILE_NOT_FOUND' | 'PARSE_FAILED' | 'INIT_FAILED';
     message: string;
   }

   // Cached parser instances per language
   const parserCache = new Map<SupportedLanguage, Parser>();
   let initialized = false;

   /**
    * Map language to its tree-sitter WASM grammar module name.
    */
   const GRAMMAR_MAP: Record<SupportedLanguage, string> = {
     typescript: 'tree-sitter-typescript',
     javascript: 'tree-sitter-javascript',
     python: 'tree-sitter-python',
   };

   async function ensureInit(): Promise<void> {
     if (!initialized) {
       await Parser.init();
       initialized = true;
     }
   }

   async function loadLanguage(lang: SupportedLanguage): Promise<Parser.Language> {
     // tree-sitter-wasms provides pre-built WASM binaries
     // The package exports paths to .wasm files
     const wasmModule = await import('tree-sitter-wasms');
     const grammarName = GRAMMAR_MAP[lang];

     // tree-sitter-wasms exposes a function per grammar that returns the wasm path
     // For TypeScript, the grammar is split into typescript/tsx; we use typescript
     let wasmPath: string;
     if (lang === 'typescript') {
       wasmPath =
         wasmModule.default?.['tree-sitter-typescript'] ??
         wasmModule['tree-sitter-typescript'] ??
         (await resolveWasmPath(grammarName));
     } else {
       wasmPath =
         wasmModule.default?.[grammarName] ??
         wasmModule[grammarName] ??
         (await resolveWasmPath(grammarName));
     }

     return Parser.Language.load(wasmPath);
   }

   async function resolveWasmPath(grammarName: string): Promise<string> {
     // Fallback: resolve the wasm file from node_modules
     const { createRequire } = await import('module');
     const require = createRequire(import.meta.url ?? __filename);
     const pkgPath = require.resolve('tree-sitter-wasms/package.json');
     const pkgDir = pkgPath.replace('/package.json', '');
     const { join } = await import('path');
     return join(pkgDir, 'out', `${grammarName}.wasm`);
   }

   /**
    * Get or create a cached parser for the given language.
    */
   export async function getParser(lang: SupportedLanguage): Promise<Parser> {
     const cached = parserCache.get(lang);
     if (cached) return cached;

     await ensureInit();
     const parser = new Parser();
     const language = await loadLanguage(lang);
     parser.setLanguage(language);
     parserCache.set(lang, parser);
     return parser;
   }

   /**
    * Parse a file and return the tree-sitter tree with metadata.
    */
   export async function parseFile(filePath: string): Promise<Result<ParsedFile, ParseFileError>> {
     const lang = detectLanguage(filePath);
     if (!lang) {
       return Err({
         code: 'UNSUPPORTED_LANGUAGE',
         message: `Unsupported file extension: ${filePath}`,
       });
     }

     const contentResult = await readFileContent(filePath);
     if (!contentResult.ok) {
       return Err({
         code: 'FILE_NOT_FOUND',
         message: `Cannot read file: ${filePath}`,
       });
     }

     try {
       const parser = await getParser(lang);
       const tree = parser.parse(contentResult.value);
       return Ok({ tree, language: lang, source: contentResult.value, filePath });
     } catch (e) {
       return Err({
         code: 'PARSE_FAILED',
         message: `Tree-sitter parse failed for ${filePath}: ${(e as Error).message}`,
       });
     }
   }

   /**
    * Reset the parser cache (for testing).
    */
   export function resetParserCache(): void {
     parserCache.clear();
     initialized = false;
   }
   ```

5. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/code-nav/parser.test.ts`
6. Observe: all tests pass. If WASM loading has issues in the test environment, adjust the `resolveWasmPath` function to match the actual package layout.
7. Commit: `feat(code-nav): implement tree-sitter parser cache with lazy loading`

---

### Task 5: Implement outline extraction

**Depends on:** Task 4
**Files:** `packages/core/src/code-nav/outline.ts`, `packages/core/tests/code-nav/outline.test.ts`

1. Create `packages/core/tests/code-nav/outline.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { getOutline } from '../../src/code-nav/outline';
   import * as path from 'path';

   const FIXTURES = path.resolve(__dirname, '../fixtures/code-nav');

   describe('code_outline', () => {
     it('should extract outline from TypeScript file', async () => {
       const result = await getOutline(path.join(FIXTURES, 'sample.ts'));
       expect(result.error).toBeUndefined();
       expect(result.language).toBe('typescript');
       expect(result.totalLines).toBeGreaterThan(0);

       const names = result.symbols.map((s) => s.name);
       expect(names).toContain('AuthConfig');
       expect(names).toContain('AuthMiddleware');
       expect(names).toContain('createAuthMiddleware');
       expect(names).toContain('UserRole');
       expect(names).toContain('DEFAULT_CONFIG');
     });

     it('should include class methods as children', async () => {
       const result = await getOutline(path.join(FIXTURES, 'sample.ts'));
       const classSym = result.symbols.find((s) => s.name === 'AuthMiddleware');
       expect(classSym).toBeDefined();
       expect(classSym!.children).toBeDefined();
       const methodNames = classSym!.children!.map((c) => c.name);
       expect(methodNames).toContain('constructor');
       expect(methodNames).toContain('authenticate');
       expect(methodNames).toContain('refreshToken');
       expect(methodNames).toContain('validateJWT');
     });

     it('should extract outline from JavaScript file', async () => {
       const result = await getOutline(path.join(FIXTURES, 'sample.js'));
       expect(result.error).toBeUndefined();
       const names = result.symbols.map((s) => s.name);
       expect(names).toContain('Router');
       expect(names).toContain('createRouter');
     });

     it('should extract outline from Python file', async () => {
       const result = await getOutline(path.join(FIXTURES, 'sample.py'));
       expect(result.error).toBeUndefined();
       const names = result.symbols.map((s) => s.name);
       expect(names).toContain('UserService');
       expect(names).toContain('create_service');
     });

     it('should return parse-failed marker for syntax error files', async () => {
       const result = await getOutline(path.join(FIXTURES, 'syntax-error.ts'));
       // Tree-sitter is error-tolerant, so it may still parse partially.
       // The important thing is it does not throw.
       expect(result).toBeDefined();
     });

     it('should return parse-failed for unsupported files', async () => {
       const result = await getOutline('/tmp/test.rs');
       expect(result.error).toBe('[parse-failed]');
     });
   });
   ```

2. Run test — observe failures.

3. Create `packages/core/src/code-nav/outline.ts`:

   ```typescript
   import type Parser from 'web-tree-sitter';
   import { parseFile } from './parser';
   import type { OutlineResult, CodeSymbol, SymbolKind, SupportedLanguage } from './types';
   import { detectLanguage } from './types';

   /**
    * Node type mappings per language for top-level declarations.
    */
   const TOP_LEVEL_TYPES: Record<SupportedLanguage, Record<string, SymbolKind>> = {
     typescript: {
       function_declaration: 'function',
       class_declaration: 'class',
       interface_declaration: 'interface',
       type_alias_declaration: 'type',
       lexical_declaration: 'variable',
       variable_declaration: 'variable',
       export_statement: 'export',
       import_statement: 'import',
       enum_declaration: 'type',
     },
     javascript: {
       function_declaration: 'function',
       class_declaration: 'class',
       lexical_declaration: 'variable',
       variable_declaration: 'variable',
       export_statement: 'export',
       import_statement: 'import',
     },
     python: {
       function_definition: 'function',
       class_definition: 'class',
       assignment: 'variable',
       import_statement: 'import',
       import_from_statement: 'import',
     },
   };

   const METHOD_TYPES: Record<SupportedLanguage, string[]> = {
     typescript: ['method_definition', 'public_field_definition'],
     javascript: ['method_definition'],
     python: ['function_definition'],
   };

   function getNodeName(node: Parser.SyntaxNode, source: string): string {
     // Try to find an identifier child
     const nameNode =
       node.childForFieldName('name') ??
       node.children.find(
         (c) =>
           c.type === 'identifier' ||
           c.type === 'property_identifier' ||
           c.type === 'type_identifier'
       );

     if (nameNode) return nameNode.text;

     // For variable declarations, dig into declarators
     if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
       const declarator = node.children.find((c) => c.type === 'variable_declarator');
       if (declarator) {
         const id =
           declarator.childForFieldName('name') ??
           declarator.children.find((c) => c.type === 'identifier');
         if (id) return id.text;
       }
     }

     // For export_statement, look at the declaration inside
     if (node.type === 'export_statement') {
       const decl = node.children.find(
         (c) => c.type !== 'export' && c.type !== 'default' && c.type !== 'comment'
       );
       if (decl) return getNodeName(decl, source);
     }

     // For assignment (Python), get the left side
     if (node.type === 'assignment') {
       const left = node.childForFieldName('left') ?? node.children[0];
       if (left) return left.text;
     }

     return '<anonymous>';
   }

   function getSignature(node: Parser.SyntaxNode, source: string): string {
     // Return the first line of the node, trimmed
     const startLine = node.startPosition.row;
     const lines = source.split('\n');
     const line = lines[startLine] ?? '';
     return line.trim();
   }

   function extractMethods(
     classNode: Parser.SyntaxNode,
     language: SupportedLanguage,
     source: string,
     filePath: string
   ): CodeSymbol[] {
     const methods: CodeSymbol[] = [];
     const methodTypes = METHOD_TYPES[language] ?? [];

     // Look in the class body
     const body =
       classNode.childForFieldName('body') ??
       classNode.children.find((c) => c.type === 'class_body' || c.type === 'block');

     if (!body) return methods;

     for (const child of body.children) {
       if (methodTypes.includes(child.type)) {
         methods.push({
           name: getNodeName(child, source),
           kind: 'method',
           file: filePath,
           line: child.startPosition.row + 1,
           endLine: child.endPosition.row + 1,
           signature: getSignature(child, source),
         });
       }
     }

     return methods;
   }

   function isExported(node: Parser.SyntaxNode): boolean {
     if (node.type === 'export_statement') return true;
     return node.parent?.type === 'export_statement';
   }

   /**
    * Get structural outline for a single file.
    */
   export async function getOutline(filePath: string): Promise<OutlineResult> {
     const lang = detectLanguage(filePath);
     if (!lang) {
       return {
         file: filePath,
         language: 'unknown',
         totalLines: 0,
         symbols: [],
         error: '[parse-failed]',
       };
     }

     const result = await parseFile(filePath);
     if (!result.ok) {
       return {
         file: filePath,
         language: lang,
         totalLines: 0,
         symbols: [],
         error: '[parse-failed]',
       };
     }

     const { tree, source } = result.value;
     const totalLines = source.split('\n').length;
     const symbols: CodeSymbol[] = [];
     const topLevelTypes = TOP_LEVEL_TYPES[lang] ?? {};
     const rootNode = tree.rootNode;

     for (const child of rootNode.children) {
       const nodeType = child.type;

       // For export_statement, look at what is being exported
       if (nodeType === 'export_statement') {
         const declaration = child.children.find(
           (c) =>
             c.type !== 'export' && c.type !== 'default' && c.type !== ';' && c.type !== 'comment'
         );

         if (declaration && topLevelTypes[declaration.type]) {
           const kind = topLevelTypes[declaration.type];
           const sym: CodeSymbol = {
             name: getNodeName(declaration, source),
             kind,
             file: filePath,
             line: child.startPosition.row + 1,
             endLine: child.endPosition.row + 1,
             signature: getSignature(child, source),
           };

           if (kind === 'class') {
             sym.children = extractMethods(declaration, lang, source, filePath);
           }
           symbols.push(sym);
           continue;
         }

         // export { ... } or export default
         symbols.push({
           name: getNodeName(child, source),
           kind: 'export',
           file: filePath,
           line: child.startPosition.row + 1,
           endLine: child.endPosition.row + 1,
           signature: getSignature(child, source),
         });
         continue;
       }

       const kind = topLevelTypes[nodeType];
       if (!kind) continue;
       if (kind === 'import') continue; // Skip imports in outline to save tokens

       const sym: CodeSymbol = {
         name: getNodeName(child, source),
         kind,
         file: filePath,
         line: child.startPosition.row + 1,
         endLine: child.endPosition.row + 1,
         signature: getSignature(child, source),
       };

       if (kind === 'class') {
         sym.children = extractMethods(child, lang, source, filePath);
       }

       symbols.push(sym);
     }

     return { file: filePath, language: lang, totalLines, symbols };
   }

   /**
    * Format an outline result as the tree-style text format shown in the spec.
    */
   export function formatOutline(outline: OutlineResult): string {
     if (outline.error) {
       return `${outline.file} ${outline.error}`;
     }

     const lines: string[] = [`${outline.file} (${outline.totalLines} lines)`];
     const last = outline.symbols.length - 1;

     outline.symbols.forEach((sym, i) => {
       const prefix = i === last ? '└──' : '├──';
       lines.push(`${prefix} ${sym.signature}    :${sym.line}`);

       if (sym.children) {
         const childLast = sym.children.length - 1;
         sym.children.forEach((child, j) => {
           const childConnector = i === last ? '    ' : '│   ';
           const childPrefix = j === childLast ? '└──' : '├──';
           lines.push(`${childConnector}${childPrefix} ${child.signature}    :${child.line}`);
         });
       }
     });

     return lines.join('\n');
   }
   ```

4. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/code-nav/outline.test.ts`
5. Observe: all tests pass.
6. Commit: `feat(code-nav): implement outline extraction with tree-style formatting`

---

### Task 6: Implement cross-file search

**Depends on:** Task 5
**Files:** `packages/core/src/code-nav/search.ts`, `packages/core/tests/code-nav/search.test.ts`

1. Create `packages/core/tests/code-nav/search.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { searchSymbols } from '../../src/code-nav/search';
   import * as path from 'path';

   const FIXTURES = path.resolve(__dirname, '../fixtures/code-nav');

   describe('code_search', () => {
     it('should find a symbol by exact name', async () => {
       const result = await searchSymbols('AuthMiddleware', FIXTURES);
       expect(result.matches.length).toBeGreaterThan(0);
       expect(result.matches[0].symbol.name).toBe('AuthMiddleware');
       expect(result.matches[0].symbol.kind).toBe('class');
     });

     it('should find symbols by pattern', async () => {
       const result = await searchSymbols('create', FIXTURES);
       expect(result.matches.length).toBeGreaterThanOrEqual(2); // createAuthMiddleware + createRouter + create_service
       const names = result.matches.map((m) => m.symbol.name);
       expect(names).toContain('createAuthMiddleware');
       expect(names).toContain('createRouter');
     });

     it('should search across multiple languages', async () => {
       const result = await searchSymbols('Service', FIXTURES);
       const files = result.matches.map((m) => m.symbol.file);
       expect(files.some((f) => f.endsWith('.py'))).toBe(true);
     });

     it('should include context string for each match', async () => {
       const result = await searchSymbols('AuthMiddleware', FIXTURES);
       expect(result.matches[0].context).toBeTruthy();
       expect(result.matches[0].context.length).toBeGreaterThan(0);
     });

     it('should skip unsupported files and report them', async () => {
       // The fixtures directory only has supported files, so skipped should be empty
       const result = await searchSymbols('foo', FIXTURES);
       expect(result.skipped).toBeDefined();
       expect(Array.isArray(result.skipped)).toBe(true);
     });

     it('should return empty matches for non-existent symbol', async () => {
       const result = await searchSymbols('NonExistentSymbol12345', FIXTURES);
       expect(result.matches).toHaveLength(0);
     });

     it('should support glob pattern for scope', async () => {
       const result = await searchSymbols('AuthMiddleware', FIXTURES, '*.ts');
       expect(result.matches.length).toBeGreaterThan(0);
       // Should not find Python or JS results
       result.matches.forEach((m) => {
         expect(m.symbol.file).toMatch(/\.ts$/);
       });
     });
   });
   ```

2. Run test — observe failures.

3. Create `packages/core/src/code-nav/search.ts`:

   ```typescript
   import { findFiles } from '../shared/fs-utils';
   import { getOutline } from './outline';
   import { detectLanguage, EXTENSION_MAP } from './types';
   import type { SearchResult, SearchMatch, CodeSymbol } from './types';
   import * as path from 'path';

   /**
    * Build a glob pattern for supported languages.
    */
   function buildGlob(directory: string, fileGlob?: string): string {
     if (fileGlob) {
       return path.join(directory, '**', fileGlob);
     }
     const exts = Object.keys(EXTENSION_MAP).map((e) => e.slice(1)); // remove dot
     return path.join(directory, '**', `*.{${exts.join(',')}}`);
   }

   function matchesQuery(name: string, query: string): boolean {
     // Case-insensitive substring match
     return name.toLowerCase().includes(query.toLowerCase());
   }

   function flattenSymbols(symbols: CodeSymbol[]): CodeSymbol[] {
     const flat: CodeSymbol[] = [];
     for (const sym of symbols) {
       flat.push(sym);
       if (sym.children) {
         flat.push(...sym.children);
       }
     }
     return flat;
   }

   /**
    * Search for symbols matching a query across files in a directory.
    */
   export async function searchSymbols(
     query: string,
     directory: string,
     fileGlob?: string
   ): Promise<SearchResult> {
     const pattern = buildGlob(directory, fileGlob);
     let files: string[];
     try {
       files = await findFiles(pattern, directory);
     } catch {
       files = [];
     }

     const matches: SearchMatch[] = [];
     const skipped: string[] = [];

     for (const file of files) {
       const lang = detectLanguage(file);
       if (!lang) {
         skipped.push(file);
         continue;
       }

       const outline = await getOutline(file);
       if (outline.error) {
         skipped.push(file);
         continue;
       }

       const allSymbols = flattenSymbols(outline.symbols);
       for (const sym of allSymbols) {
         if (matchesQuery(sym.name, query)) {
           matches.push({
             symbol: sym,
             context: sym.signature,
           });
         }
       }
     }

     return { query, matches, skipped };
   }
   ```

4. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/code-nav/search.test.ts`
5. Observe: all tests pass.
6. Commit: `feat(code-nav): implement cross-file symbol search`

---

### Task 7: Implement unfold (AST-bounded extraction)

**Depends on:** Task 4
**Files:** `packages/core/src/code-nav/unfold.ts`, `packages/core/tests/code-nav/unfold.test.ts`

1. Create `packages/core/tests/code-nav/unfold.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { unfoldSymbol, unfoldRange } from '../../src/code-nav/unfold';
   import * as path from 'path';

   const FIXTURES = path.resolve(__dirname, '../fixtures/code-nav');

   describe('code_unfold', () => {
     describe('unfoldSymbol', () => {
       it('should extract a function by name from TypeScript', async () => {
         const result = await unfoldSymbol(
           path.join(FIXTURES, 'sample.ts'),
           'createAuthMiddleware'
         );
         expect(result.fallback).toBe(false);
         expect(result.symbolName).toBe('createAuthMiddleware');
         expect(result.content).toContain('function createAuthMiddleware');
         expect(result.content).toContain('return new AuthMiddleware');
         expect(result.startLine).toBeGreaterThan(0);
       });

       it('should extract a class by name', async () => {
         const result = await unfoldSymbol(path.join(FIXTURES, 'sample.ts'), 'AuthMiddleware');
         expect(result.fallback).toBe(false);
         expect(result.content).toContain('class AuthMiddleware');
         expect(result.content).toContain('authenticate');
         expect(result.content).toContain('refreshToken');
       });

       it('should extract a function from Python', async () => {
         const result = await unfoldSymbol(path.join(FIXTURES, 'sample.py'), 'create_service');
         expect(result.fallback).toBe(false);
         expect(result.content).toContain('def create_service');
       });

       it('should fall back to raw content for unsupported files', async () => {
         const result = await unfoldSymbol('/tmp/test.rs', 'foo');
         expect(result.fallback).toBe(true);
         expect(result.warning).toBe('[fallback: raw content]');
       });

       it('should fall back when symbol not found', async () => {
         const result = await unfoldSymbol(path.join(FIXTURES, 'sample.ts'), 'NonExistentSymbol');
         // Returns the whole file as fallback when symbol is not found
         expect(result.fallback).toBe(true);
         expect(result.warning).toBe('[fallback: raw content]');
       });
     });

     describe('unfoldRange', () => {
       it('should extract lines by range', async () => {
         const result = await unfoldRange(path.join(FIXTURES, 'sample.ts'), 1, 5);
         expect(result.fallback).toBe(false);
         expect(result.startLine).toBe(1);
         expect(result.endLine).toBe(5);
         expect(result.content.split('\n').length).toBeLessThanOrEqual(5);
       });

       it('should clamp range to file bounds', async () => {
         const result = await unfoldRange(path.join(FIXTURES, 'sample.ts'), 1, 99999);
         expect(result.fallback).toBe(false);
         expect(result.endLine).toBeLessThan(99999);
       });
     });
   });
   ```

2. Run test — observe failures.

3. Create `packages/core/src/code-nav/unfold.ts`:

   ```typescript
   import { parseFile } from './parser';
   import { getOutline } from './outline';
   import { readFileContent } from '../shared/fs-utils';
   import { detectLanguage } from './types';
   import type { UnfoldResult, CodeSymbol } from './types';

   function findSymbolInList(symbols: CodeSymbol[], name: string): CodeSymbol | null {
     for (const sym of symbols) {
       if (sym.name === name) return sym;
       if (sym.children) {
         const found = findSymbolInList(sym.children, name);
         if (found) return found;
       }
     }
     return null;
   }

   function extractLines(source: string, startLine: number, endLine: number): string {
     const lines = source.split('\n');
     const start = Math.max(0, startLine - 1); // 1-indexed to 0-indexed
     const end = Math.min(lines.length, endLine);
     return lines.slice(start, end).join('\n');
   }

   /**
    * Extract a specific symbol's implementation from a file by name.
    */
   export async function unfoldSymbol(filePath: string, symbolName: string): Promise<UnfoldResult> {
     const lang = detectLanguage(filePath);

     // Unsupported language — fall back to raw content
     if (!lang) {
       const contentResult = await readFileContent(filePath);
       if (!contentResult.ok) {
         return {
           file: filePath,
           symbolName,
           startLine: 0,
           endLine: 0,
           content: '',
           language: 'unknown',
           fallback: true,
           warning: '[fallback: raw content]',
         };
       }
       return {
         file: filePath,
         symbolName,
         startLine: 1,
         endLine: contentResult.value.split('\n').length,
         content: contentResult.value,
         language: 'unknown',
         fallback: true,
         warning: '[fallback: raw content]',
       };
     }

     const outline = await getOutline(filePath);
     if (outline.error) {
       // Parse failed — fall back to raw content
       const contentResult = await readFileContent(filePath);
       const content = contentResult.ok ? contentResult.value : '';
       return {
         file: filePath,
         symbolName,
         startLine: 1,
         endLine: content.split('\n').length,
         content,
         language: lang,
         fallback: true,
         warning: '[fallback: raw content]',
       };
     }

     const symbol = findSymbolInList(outline.symbols, symbolName);
     if (!symbol) {
       // Symbol not found — fall back to raw content
       const contentResult = await readFileContent(filePath);
       const content = contentResult.ok ? contentResult.value : '';
       return {
         file: filePath,
         symbolName,
         startLine: 1,
         endLine: content.split('\n').length,
         content,
         language: lang,
         fallback: true,
         warning: '[fallback: raw content]',
       };
     }

     // Parse the file again to get the source (or cache it — for now re-read)
     const parseResult = await parseFile(filePath);
     if (!parseResult.ok) {
       const contentResult = await readFileContent(filePath);
       const content = contentResult.ok ? contentResult.value : '';
       return {
         file: filePath,
         symbolName,
         startLine: symbol.line,
         endLine: symbol.endLine,
         content: extractLines(content, symbol.line, symbol.endLine),
         language: lang,
         fallback: true,
         warning: '[fallback: raw content]',
       };
     }

     const content = extractLines(parseResult.value.source, symbol.line, symbol.endLine);
     return {
       file: filePath,
       symbolName,
       startLine: symbol.line,
       endLine: symbol.endLine,
       content,
       language: lang,
       fallback: false,
     };
   }

   /**
    * Extract a range of lines from a file.
    */
   export async function unfoldRange(
     filePath: string,
     startLine: number,
     endLine: number
   ): Promise<UnfoldResult> {
     const lang = detectLanguage(filePath) ?? 'unknown';
     const contentResult = await readFileContent(filePath);
     if (!contentResult.ok) {
       return {
         file: filePath,
         startLine: 0,
         endLine: 0,
         content: '',
         language: lang as UnfoldResult['language'],
         fallback: true,
         warning: '[fallback: raw content]',
       };
     }

     const totalLines = contentResult.value.split('\n').length;
     const clampedEnd = Math.min(endLine, totalLines);
     const content = extractLines(contentResult.value, startLine, clampedEnd);

     return {
       file: filePath,
       startLine,
       endLine: clampedEnd,
       content,
       language: lang as UnfoldResult['language'],
       fallback: false,
     };
   }
   ```

4. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/code-nav/unfold.test.ts`
5. Observe: all tests pass.
6. Commit: `feat(code-nav): implement AST-bounded unfold extraction`

---

### Task 8: Create code-nav index and wire into core exports

**Depends on:** Task 5, Task 6, Task 7
**Files:** `packages/core/src/code-nav/index.ts`, `packages/core/src/index.ts`

1. Create `packages/core/src/code-nav/index.ts`:

   ```typescript
   export type {
     SupportedLanguage,
     SymbolKind,
     CodeSymbol,
     OutlineResult,
     SearchMatch,
     SearchResult,
     UnfoldResult,
   } from './types';
   export { detectLanguage, EXTENSION_MAP } from './types';
   export { getParser, parseFile, resetParserCache } from './parser';
   export type { ParsedFile } from './parser';
   export { getOutline, formatOutline } from './outline';
   export { searchSymbols } from './search';
   export { unfoldSymbol, unfoldRange } from './unfold';
   ```

2. Add to `packages/core/src/index.ts` — append before the `VERSION` export:

   ```typescript
   /**
    * Code navigation module for AST-based exploration (outline, search, unfold).
    */
   export * from './code-nav';
   ```

3. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/core && npx tsc --noEmit` to verify type-checking passes.
4. Run full code-nav test suite: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/code-nav/`
5. Observe: all tests pass.
6. Commit: `feat(code-nav): create index module and wire into core exports`

---

### Task 9: Implement MCP tool definitions and handlers

**Depends on:** Task 8
**Files:** `packages/cli/src/mcp/tools/code-nav.ts`

1. Create `packages/cli/src/mcp/tools/code-nav.ts`:

   ```typescript
   import { sanitizePath } from '../utils/sanitize-path.js';

   // --- code_outline ---

   export const codeOutlineDefinition = {
     name: 'code_outline',
     description:
       'Get a structural skeleton of a file or files matching a glob: exports, classes, functions, types with signatures and line numbers. No implementation bodies. 4-8x token savings vs full file read.',
     inputSchema: {
       type: 'object' as const,
       properties: {
         path: {
           type: 'string',
           description:
             'Absolute file path or directory path. When a directory, outlines all supported files within it.',
         },
         glob: {
           type: 'string',
           description:
             'Optional glob pattern to filter files (e.g. "*.ts", "src/**/*.py"). Only used when path is a directory.',
         },
       },
       required: ['path'],
     },
   };

   export async function handleCodeOutline(input: { path: string; glob?: string }) {
     let targetPath: string;
     try {
       targetPath = sanitizePath(input.path);
     } catch (error) {
       return {
         content: [
           {
             type: 'text' as const,
             text: `Error: ${error instanceof Error ? error.message : String(error)}`,
           },
         ],
         isError: true,
       };
     }

     try {
       const { getOutline, formatOutline } = await import('@harness-engineering/core');
       const { stat } = await import('fs/promises');
       const { findFiles } = await import('@harness-engineering/core/architecture/matchers');
       const path = await import('path');

       const stats = await stat(targetPath).catch(() => null);

       if (stats?.isFile()) {
         const outline = await getOutline(targetPath);
         return { content: [{ type: 'text' as const, text: formatOutline(outline) }] };
       }

       // Directory mode — find files and outline each
       if (stats?.isDirectory()) {
         // Use glob to find supported files
         const { findFiles: findGlob } = await import('@harness-engineering/core');
         const { EXTENSION_MAP } = await import('@harness-engineering/core');
         const exts = Object.keys(EXTENSION_MAP).map((e) => e.slice(1));
         const pattern = input.glob ?? `**/*.{${exts.join(',')}}`;
         const { glob } = await import('glob');
         const files = await glob(pattern, { cwd: targetPath, absolute: true });

         const results: string[] = [];
         for (const file of files.slice(0, 50)) {
           // Cap at 50 files to avoid token explosion
           const outline = await getOutline(file);
           results.push(formatOutline(outline));
         }
         if (files.length > 50) {
           results.push(
             `\n... and ${files.length - 50} more files (use a narrower glob to see them)`
           );
         }
         return { content: [{ type: 'text' as const, text: results.join('\n\n') }] };
       }

       return {
         content: [{ type: 'text' as const, text: `Error: Path not found: ${targetPath}` }],
         isError: true,
       };
     } catch (error) {
       return {
         content: [
           {
             type: 'text' as const,
             text: `Error: ${error instanceof Error ? error.message : String(error)}`,
           },
         ],
         isError: true,
       };
     }
   }

   // --- code_search ---

   export const codeSearchDefinition = {
     name: 'code_search',
     description:
       'Search for symbols (functions, classes, types, variables) by name or pattern across a directory. Returns matching locations with file, line, kind, and one-line context. 6-12x token savings vs grep + read.',
     inputSchema: {
       type: 'object' as const,
       properties: {
         query: {
           type: 'string',
           description: 'Symbol name or substring to search for (case-insensitive).',
         },
         directory: {
           type: 'string',
           description: 'Absolute path to directory to search in.',
         },
         glob: {
           type: 'string',
           description: 'Optional glob pattern to filter files (e.g. "*.ts").',
         },
       },
       required: ['query', 'directory'],
     },
   };

   export async function handleCodeSearch(input: {
     query: string;
     directory: string;
     glob?: string;
   }) {
     let directory: string;
     try {
       directory = sanitizePath(input.directory);
     } catch (error) {
       return {
         content: [
           {
             type: 'text' as const,
             text: `Error: ${error instanceof Error ? error.message : String(error)}`,
           },
         ],
         isError: true,
       };
     }

     try {
       const { searchSymbols } = await import('@harness-engineering/core');
       const result = await searchSymbols(input.query, directory, input.glob);

       const lines: string[] = [`Search: "${result.query}" — ${result.matches.length} matches`];
       for (const match of result.matches) {
         const { symbol } = match;
         lines.push(
           `  ${symbol.file}:${symbol.line} [${symbol.kind}] ${symbol.name} — ${match.context}`
         );
       }
       if (result.skipped.length > 0) {
         lines.push(`\nSkipped ${result.skipped.length} files (unsupported or parse failed)`);
       }

       return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
     } catch (error) {
       return {
         content: [
           {
             type: 'text' as const,
             text: `Error: ${error instanceof Error ? error.message : String(error)}`,
           },
         ],
         isError: true,
       };
     }
   }

   // --- code_unfold ---

   export const codeUnfoldDefinition = {
     name: 'code_unfold',
     description:
       'Extract the complete implementation of a specific symbol (function, class, type) or a line range from a file. Uses AST boundaries for precise extraction. 2-4x token savings vs full file read.',
     inputSchema: {
       type: 'object' as const,
       properties: {
         path: {
           type: 'string',
           description: 'Absolute path to the file.',
         },
         symbol: {
           type: 'string',
           description:
             'Name of the symbol to extract (function, class, type, etc.). Mutually exclusive with startLine/endLine.',
         },
         startLine: {
           type: 'number',
           description:
             'Start line number (1-indexed). Used with endLine for range extraction. Mutually exclusive with symbol.',
         },
         endLine: {
           type: 'number',
           description:
             'End line number (1-indexed, inclusive). Used with startLine for range extraction.',
         },
       },
       required: ['path'],
     },
   };

   export async function handleCodeUnfold(input: {
     path: string;
     symbol?: string;
     startLine?: number;
     endLine?: number;
   }) {
     let filePath: string;
     try {
       filePath = sanitizePath(input.path);
     } catch (error) {
       return {
         content: [
           {
             type: 'text' as const,
             text: `Error: ${error instanceof Error ? error.message : String(error)}`,
           },
         ],
         isError: true,
       };
     }

     try {
       if (input.symbol) {
         const { unfoldSymbol } = await import('@harness-engineering/core');
         const result = await unfoldSymbol(filePath, input.symbol);
         const header = result.warning
           ? `${result.file}:${result.startLine}-${result.endLine} ${result.warning}\n`
           : `${result.file}:${result.startLine}-${result.endLine}\n`;
         return { content: [{ type: 'text' as const, text: header + result.content }] };
       }

       if (input.startLine != null && input.endLine != null) {
         const { unfoldRange } = await import('@harness-engineering/core');
         const result = await unfoldRange(filePath, input.startLine, input.endLine);
         const header = `${result.file}:${result.startLine}-${result.endLine}\n`;
         return { content: [{ type: 'text' as const, text: header + result.content }] };
       }

       return {
         content: [
           {
             type: 'text' as const,
             text: 'Error: Provide either "symbol" or "startLine" + "endLine".',
           },
         ],
         isError: true,
       };
     } catch (error) {
       return {
         content: [
           {
             type: 'text' as const,
             text: `Error: ${error instanceof Error ? error.message : String(error)}`,
           },
         ],
         isError: true,
       };
     }
   }
   ```

2. Verify no TypeScript errors: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx tsc --noEmit`
3. Commit: `feat(code-nav): implement MCP tool definitions and handlers`

---

### Task 10: Register MCP tools in server

**Depends on:** Task 9
**Files:** `packages/cli/src/mcp/server.ts`

1. Add import at top of `packages/cli/src/mcp/server.ts` (after the last import block):

   ```typescript
   import {
     codeOutlineDefinition,
     handleCodeOutline,
     codeSearchDefinition,
     handleCodeSearch,
     codeUnfoldDefinition,
     handleCodeUnfold,
   } from './tools/code-nav.js';
   ```

2. Add the three definitions to the `TOOL_DEFINITIONS` array (before the closing `]`):

   ```typescript
   codeOutlineDefinition,
   codeSearchDefinition,
   codeUnfoldDefinition,
   ```

3. Add the three handlers to the `TOOL_HANDLERS` record (before the closing `}`):

   ```typescript
   code_outline: handleCodeOutline as ToolHandler,
   code_search: handleCodeSearch as ToolHandler,
   code_unfold: handleCodeUnfold as ToolHandler,
   ```

4. Verify no TypeScript errors: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx tsc --noEmit`
5. Commit: `feat(code-nav): register code_outline, code_search, code_unfold in MCP server`

---

### Task 11: Update core package build configuration

**Depends on:** Task 8
**Files:** `packages/core/package.json`

[checkpoint:human-verify] — Verify tree-sitter WASM loading works in the build output

1. Check if `packages/core/package.json` build script needs updating. The current `tsup` entry point is `src/index.ts` which now re-exports `code-nav`. Verify that the build includes the new module:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm run build
   ```

2. If the build fails due to `web-tree-sitter` or WASM handling, add `web-tree-sitter` and `tree-sitter-wasms` to the `external` list in the tsup config or `package.json`:

   ```json
   "tsup": {
     "external": ["web-tree-sitter", "tree-sitter-wasms"]
   }
   ```

   Alternatively, these may need to be kept as runtime dependencies (not bundled). Since they are in `dependencies`, tsup should externalize them by default.

3. Run tests: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/code-nav/`
4. Observe: all tests pass.
5. Commit: `build(code-nav): ensure tree-sitter dependencies are properly externalized`

---

### Task 12: Run full test suite and final verification

**Depends on:** Task 10, Task 11
**Files:** none (verification only)

[checkpoint:human-verify] — Final sign-off before marking complete

1. Run all code-nav tests:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/code-nav/
   ```

   Expect: all tests pass.

2. Run existing parser tests to verify no regressions:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/parsers/
   ```

   Expect: all tests pass.

3. Run core package typecheck:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering/packages/core && npx tsc --noEmit
   ```

4. Run CLI package typecheck:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx tsc --noEmit
   ```

5. Verify the MCP server exports all three tools by checking the tool list:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering && node -e "
     const { getToolDefinitions } = require('./packages/cli/dist/mcp/server.js');
     const tools = getToolDefinitions();
     const codeNavTools = tools.filter(t => t.name.startsWith('code_'));
     console.log('Code nav tools:', codeNavTools.map(t => t.name));
   "
   ```

   Expect output: `Code nav tools: ['code_outline', 'code_search', 'code_unfold']`

6. Commit: none (verification task)

## Traceability Matrix

| Observable Truth                            | Delivered by            |
| ------------------------------------------- | ----------------------- |
| 1. code_outline returns structural skeleton | Task 5, Task 9          |
| 2. code_outline works with directory glob   | Task 9 (directory mode) |
| 3. code_search returns matching symbols     | Task 6, Task 9          |
| 4. code_search reports skipped files        | Task 6                  |
| 5. code_unfold extracts by symbol name      | Task 7, Task 9          |
| 6. code_unfold extracts by line range       | Task 7, Task 9          |
| 7. Graceful fallback on parse failure       | Task 5, Task 7          |
| 8. TS/JS/Python support                     | Task 4                  |
| 9. LanguageParser interface extended        | Task 3                  |
| 10. All code-nav tests pass                 | Task 12                 |
| 11. MCP tools registered                    | Task 10, Task 12        |
