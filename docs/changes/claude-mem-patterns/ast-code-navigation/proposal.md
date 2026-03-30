# AST Code Navigation

**Parent:** [Claude-Mem Pattern Adoption](../proposal.md)
**Keywords:** ast, tree-sitter, code-outline, code-search, code-unfold, token-optimization, mcp-tools

## Overview

Three new MCP tools for AST-based code navigation, inspired by claude-mem's Smart Explore feature (smart_search, smart_outline, smart_unfold). These tools let skills understand code structure without reading entire files, achieving 4-18x token savings for exploration-heavy workflows.

## Problem

Exploration-heavy skills (brainstorming, code-review, debugging) read entire files to understand structure. A 500-line file at ~3 tokens/line costs ~1500 tokens when the skill only needs to know "what functions exist" or "show me this one function." This compounds across multi-file exploration.

## Design

### New MCP Tools

| Tool           | Input                                          | Output                                                                                                              | Token savings          |
| -------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `code_outline` | File path or directory glob                    | Structural skeleton: exports, classes, functions, types with signatures and line numbers. No implementation bodies. | 4-8x vs full read      |
| `code_search`  | Symbol name or pattern, scope (directory/glob) | Matching symbols with file, line, kind (function/class/type/export), and one-line context                           | 6-12x vs grep + read   |
| `code_unfold`  | File path + symbol name or line range          | Complete implementation of the specified symbol, extracted by AST boundary                                          | 2-4x vs full file read |

### Architecture

```
packages/core/src/code-nav/
├── parser.ts       # Tree-sitter initialization, language detection, parser cache
├── outline.ts      # Structural skeleton extraction
├── search.ts       # Cross-file symbol discovery
├── unfold.ts       # AST-bounded code extraction
└── types.ts        # Shared types (Symbol, Outline, SearchResult)

packages/cli/src/mcp/tools/code-nav.ts   # MCP tool registration
```

### Parser Strategy

- Tree-sitter for parsing — battle-tested, multi-language, incremental
- Parser instances cached per-language, lazy-loaded on first use
- Language detection from file extension (not content sniffing)
- Supported languages at launch: TypeScript, JavaScript, Python
- Additional languages additive — no architectural change needed

### Existing Infrastructure

A `LanguageParser` interface already exists in `packages/core/src/shared/parsers/` with a `TypeScriptParser` implementation that extracts imports and exports. The code-nav subsystem should:

- **Extend** the existing `LanguageParser` interface with `outline()`, `search()`, and `unfold()` methods rather than creating a parallel parser abstraction
- **Reuse** the existing TypeScript parser for TS/JS files where tree-sitter is not needed for basic operations
- **Add** tree-sitter as the multi-language backend behind the same interface, so the existing `TypeScriptParser` and new tree-sitter parsers are interchangeable
- **Preserve** the existing `parseFile()`, `extractImports()`, `extractExports()` contract — code-nav adds capabilities, it does not replace them

### Graceful Fallback

When tree-sitter parse fails for a file (unsupported language, syntax errors, binary file):

- `code_outline` returns file path with `[parse-failed]` marker
- `code_search` skips the file, includes it in a `skipped` list in the response
- `code_unfold` falls back to raw file content with a `[fallback: raw content]` warning
- Never block the calling skill — degraded output is better than an error

### Output Format

`code_outline` example output:

```
src/services/auth.ts (247 lines)
├── import { Request, Response } from 'express'    :1
├── interface AuthConfig                            :5
├── class AuthMiddleware                            :12
│   ├── constructor(config: AuthConfig)             :13
│   ├── authenticate(req: Request): Promise<User>   :24
│   ├── refreshToken(token: string): Promise<Token> :58
│   └── private validateJWT(jwt: string): boolean   :89
├── function createAuthMiddleware(config): AuthMiddleware  :120
└── export { AuthMiddleware, AuthConfig, createAuthMiddleware }  :247
```

### Scope Limitations

- Read-only tools — no code modification or refactoring
- No semantic analysis (e.g., "find all callers of X") — that requires a full language server
- No incremental parsing — each invocation parses from scratch (caching at the parser instance level, not the parse tree level)

## Success Criteria

1. `code_outline` for a 500-line TypeScript file returns structural skeleton in <150 tokens (vs ~1500 for full read)
2. `code_search` for a symbol name across a directory returns matching locations without reading full file contents
3. `code_unfold` for a specific function returns exactly that function's implementation (AST-bounded), not the entire file
4. All three tools gracefully fall back to raw file content if tree-sitter parsing fails — never block the calling skill
5. Supports at minimum: TypeScript, JavaScript, Python. Additional languages are additive.

## Implementation Order

1. Add tree-sitter dependency and parser cache (`parser.ts`)
2. Implement `code_outline` with structural skeleton extraction
3. Implement `code_search` with cross-file symbol discovery
4. Implement `code_unfold` with AST-bounded extraction
5. Register MCP tools in `code-nav.ts` and add graceful fallback
6. Test across TypeScript, JavaScript, Python files in the harness-engineering codebase
