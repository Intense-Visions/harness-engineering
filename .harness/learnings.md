## 2026-04-23: Phase 5 Visual & Advanced — Cross-Layer Interface Re-declaration

When the `graph` package needs to accept an `AnalysisProvider` (from `intelligence`), re-declare a minimal interface locally rather than importing across layers. The `graph` → `intelligence` dependency would violate the layer architecture. The `ImageAnalysisExtractor` declares its own `AnalysisProvider` interface with matching shape, and callers (CLI, pipeline) inject the concrete provider.

## 2026-04-22: Default Directory Ignores for Code Scanning

When implementing directory traversal for code scanning/ingestion, ensure default ignore lists include common build output, dependency, and tool directories for all supported languages and ecosystems:

- **Node.js**: `node_modules`, `dist`, `.next`, `.turbo`
- **Java/Maven/Gradle**: `target`, `build`, `.gradle`, `.gradle-home`
- **Python**: `__pycache__`, `.venv`, `venv`
- **Go/PHP/Ruby/Elixir**: `vendor`, `deps`, `_build`
- **C#**: `bin`, `obj`
- **Rust**: `target`
- **Git**: `.git` (Crucial to avoid scanning internal git objects)
- **Tools**: `.vscode`, `.idea`, `.harness`
- **Test Artifacts**: `coverage`, `.nyc_output`
