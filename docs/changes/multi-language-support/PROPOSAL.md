# Multi-Language Support — Technical Proposal

**Issue:** multi-language-suppo-96e1e6f3
**Backlog:** B1/B6
**Date:** 2026-04-17

## Problem

Harness Engineering currently supports TypeScript, JavaScript, and Python for code navigation (tree-sitter), but only TypeScript/JavaScript for graph ingestion (regex-based CodeIngestor). Architecture constraint enforcement via the ESLint plugin is inherently JS/TS-only. Projects using Go, Rust, or Java cannot benefit from harness's structural analysis, constraint enforcement, or knowledge graph.

## Goals

1. **Tree-sitter parsing** for Go, Rust, and Java (WASM grammars already available in `tree-sitter-wasms`)
2. **Language-agnostic constraint enforcement** — architectural rules (layer boundaries, forbidden imports) work regardless of implementation language
3. **Cross-language dependency tracking** in the knowledge graph — CodeIngestor supports all six languages
4. **Same architectural rules apply** regardless of implementation language

## Design

### 1. Extend Language Registry (`packages/core/src/code-nav/types.ts`)

Add `'go' | 'rust' | 'java'` to `SupportedLanguage` union type. Add extension mappings:

- `.go` → `go`
- `.rs` → `rust`
- `.java` → `java`

### 2. Add Grammar Mappings (`packages/core/src/code-nav/parser.ts`)

Map new languages to their WASM grammar files:

- `go` → `tree-sitter-go`
- `rust` → `tree-sitter-rust`
- `java` → `tree-sitter-java`

### 3. Add Outline Node Type Mappings (`packages/core/src/code-nav/outline.ts`)

Each language needs `TOP_LEVEL_TYPES` and `METHOD_TYPES` mappings that map tree-sitter AST node types to harness `SymbolKind`:

- **Go**: `function_declaration`, `type_declaration` (struct/interface), `method_declaration`, `var_declaration`, `const_declaration`, `import_declaration`
- **Rust**: `function_item`, `struct_item`, `impl_item`, `trait_item`, `enum_item`, `mod_item`, `use_declaration`, `const_item`, `static_item`
- **Java**: `class_declaration`, `interface_declaration`, `method_declaration`, `field_declaration`, `import_declaration`, `enum_declaration`

### 4. Tree-Sitter LanguageParser Implementations (`packages/core/src/shared/parsers/`)

Create `TreeSitterParser` — a generic tree-sitter-based `LanguageParser` implementation that:

- Uses the existing `getParser()` from code-nav/parser.ts for tree-sitter parsing
- Implements `extractImports()` and `extractExports()` via tree-sitter AST queries per language
- Provides `health()` checks based on WASM grammar availability

Language-specific import/export extraction patterns:

- **Go**: `import_declaration` → import paths; exported = capitalized identifiers
- **Rust**: `use_declaration` → import paths; `pub` keyword for exports
- **Java**: `import_declaration` → import paths; `public` modifier for exports
- **Python**: `import_statement`, `import_from_statement`; no explicit export (all top-level)

### 5. Parser Registry (`packages/core/src/shared/parsers/registry.ts`)

Create a `ParserRegistry` that maps file extensions to `LanguageParser` implementations:

- `getParserForFile(filePath)` → returns the right parser
- `getSupportedExtensions()` → returns all registered extensions
- Pre-registers TypeScript (existing ESTree parser) and tree-sitter parsers for all new languages
- Used by architecture collectors instead of stub parsers

### 6. CodeIngestor Multi-Language Upgrade (`packages/graph/src/ingest/CodeIngestor.ts`)

- Replace hardcoded `/\.(ts|tsx|js|jsx)$/` filter with registry-aware extension check
- Replace regex-based `extractSymbols()` with tree-sitter-based extraction for new languages (keep regex for TS/JS backward compat)
- Add language-specific import extraction patterns for Go, Rust, Java
- Update `detectLanguage()` to handle all supported languages
- Update `resolveImportPath()` with language-appropriate extension resolution

### 7. Architecture Collector Wiring (`packages/core/src/architecture/collectors/`)

Replace stub parsers in `forbidden-imports.ts` and `layer-violations.ts` with real parser from the registry. This enables constraint enforcement across all supported languages.

## Scope Boundaries

**In scope:**

- Tree-sitter parsing + code navigation for Go, Rust, Java
- Import/export extraction for graph ingestion
- Language detection and extension mapping
- Architectural constraint enforcement via parser registry

**Out of scope (future work):**

- ESLint rules for non-JS languages (these are inherently JS/TS)
- Language-specific linting rules
- Type system analysis for Go/Rust/Java
- Cross-language call graph analysis (e.g., Go calling Rust via FFI)

## Test Plan

- Add fixture files: `sample.go`, `sample.rs`, `sample.java`
- Parser tests: parse each fixture, verify language detection
- Outline tests: verify symbol extraction for each language
- Import extraction tests: verify cross-file dependency detection
- CodeIngestor tests: verify multi-language file discovery and graph ingestion
- Architecture collector tests: verify constraint enforcement works across languages
