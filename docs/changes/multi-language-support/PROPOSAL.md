# Multi-Language Support — Technical Proposal

**Issue:** multi-language-suppo-96e1e6f3
**Backlog:** B1/B6
**Date:** 2026-04-17

## Problem

Harness Engineering has tree-sitter parsers and extraction strategies for Python, Go, Rust, and Java, but these are not fully wired into the constraint enforcement and graph ingestion systems. Specifically:

- **CodeIngestor** symbol extraction uses TS/JS-only regex patterns — Python `def`, Go `func`, Rust `fn`, Java class methods are not extracted
- **Constraint enforcement** (`resolveImportPath`) hardcodes `.ts`/`.tsx` extension resolution
- **Architecture collectors** use stub parsers or only request the TS parser from the registry
- **TreeSitterParser** `outline()` and `unfold()` return stubs despite full implementation existing in `code-nav/outline.ts`
- **`buildDependencyGraph()`** accepts a single parser — not multi-language aware

## What Already Works

- `SupportedLanguage` type includes all 6 languages
- `EXTENSION_MAP` maps all file extensions
- `GRAMMAR_MAP` maps all languages to WASM grammars
- Tree-sitter extraction strategies (import/export) exist for Python, Go, Rust, Java
- `ParserRegistry` registers all tree-sitter parsers
- `code-nav/outline.ts` has `TOP_LEVEL_TYPES` and `METHOD_TYPES` for all languages
- CodeIngestor `extractImportPaths()` has regex patterns for all languages
- CodeIngestor `SUPPORTED_EXTENSIONS` includes `.py`, `.go`, `.rs`, `.java`

## Remaining Gaps

### 1. CodeIngestor Symbol Extraction (graph package)
`extractSymbols()` regex patterns only match TS/JS constructs. Need language-specific patterns for:
- **Python**: `def funcname(`, `class ClassName:`
- **Go**: `func FuncName(`, `type StructName struct`, `func (r *Receiver) MethodName(`
- **Rust**: `fn func_name(`, `struct StructName`, `impl StructName`, `pub fn`
- **Java**: `public class ClassName`, `public void methodName(`, `private int fieldName`

### 2. Constraint `resolveImportPath()` (core package)
Lines 38-39 hardcode `.ts`/`.tsx`:
```typescript
if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx')) {
  resolved = resolved + '.ts';
}
```
Must resolve based on the importing file's language.

### 3. `buildDependencyGraph()` Single Parser
Takes one `LanguageParser` — needs to accept a registry or dispatch per-file.

### 4. Architecture Collectors
- `CircularDepsCollector`: Uses stub parser + `**/*.ts` glob
- `ForbiddenImportCollector`: Gets only TS parser from registry
- `LayerViolationCollector`: Gets only TS parser from registry

### 5. TreeSitterParser outline/unfold Stubs
`outline()` returns `{ symbols: [], error: '[parse-failed]' }` — should delegate to `code-nav/outline.ts` logic.

## Design

### A. Multi-language symbol extraction in CodeIngestor
Add language-dispatched regex patterns in `extractSymbols()` for Python, Go, Rust, Java — keeping existing TS/JS patterns as-is for backward compatibility.

### B. Language-aware import resolution
Modify `resolveImportPath()` in `dependencies.ts` to accept language context and resolve with the correct extension (`.py`, `.go`, `.rs`, `.java`).

### C. Multi-parser `buildDependencyGraph()`
Change to accept `ParserRegistry` instead of single `LanguageParser`, dispatching per-file based on extension.

### D. Architecture collector multi-language wiring
- Replace stub parser in `CircularDepsCollector` with real registry
- Change `**/*.ts` glob to `**/*.{ts,tsx,js,jsx,py,go,rs,java}`
- Update `ForbiddenImportCollector` and `LayerViolationCollector` to pass registry-aware config

### E. Wire TreeSitterParser outline/unfold
Delegate to `code-nav/outline.ts` `getOutline()` and `code-nav/unfold.ts` logic.

## Test Plan

- Add fixture files: `sample.py`, `sample.go`, `sample.rs`, `sample.java`
- CodeIngestor tests: verify symbol + import extraction for all languages
- Constraint tests: verify language-aware import resolution
- Architecture collector tests: verify multi-language constraint enforcement
- Integration test: mixed-language project with cross-language layer enforcement
