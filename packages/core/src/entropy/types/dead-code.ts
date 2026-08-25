// packages/core/src/entropy/types/dead-code.ts

export interface DeadExport {
  file: string;
  name: string;
  line: number;
  type: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum';
  isDefault: boolean;
  /**
   * - `NO_IMPORTERS` — a non-public export nothing imports; safe to delete.
   * - `IMPORTERS_ALSO_DEAD` — imported only by other dead/unreachable code.
   * - `PUBLIC_API_UNUSED` — an export re-exported through the package barrel /
   *   public surface with zero real (non-test) importers across the workspace
   *   after re-export following (issue #1479). Advisory only: deletion is a
   *   breaking change for adopters, so the recommendation is *wire or deprecate*,
   *   never *remove*. Suppress an intentionally-public export with a
   *   `@public` / `@publicApi` annotation or `DeadCodeConfig.publicApiAllowlist`.
   */
  reason: 'NO_IMPORTERS' | 'IMPORTERS_ALSO_DEAD' | 'PUBLIC_API_UNUSED';
}

export interface DeadFile {
  path: string;
  /**
   * - `NO_IMPORTERS` — unreachable from entry points; a genuine dead file.
   * - `UNREFERENCED_ENTRY_POINT` — unreachable, but the path matches a build
   *   entry-point convention (config file, framework module root). Remediation is
   *   to declare it in `entropy.entryPoints`, NOT to delete it (issue #1325).
   */
  reason: 'NO_IMPORTERS' | 'UNREFERENCED_ENTRY_POINT' | 'NOT_ENTRY_POINT' | 'ALL_EXPORTS_DEAD';
  exportCount: number;
  lineCount: number;
}

export interface DeadInternal {
  file: string;
  name: string;
  line: number;
  type: 'function' | 'class' | 'variable';
  reason: 'NEVER_CALLED' | 'ONLY_CALLED_BY_DEAD';
}

export interface UnusedImport {
  file: string;
  line: number;
  source: string;
  specifiers: string[];
  isFullyUnused: boolean;
}

export interface ReachabilityNode {
  file: string;
  reachable: boolean;
  importedBy: string[];
  imports: string[];
}

export interface DeadCodeReport {
  deadExports: DeadExport[];
  deadFiles: DeadFile[];
  deadInternals: DeadInternal[];
  unusedImports: UnusedImport[];
  stats: {
    filesAnalyzed: number;
    entryPointsUsed: string[];
    totalExports: number;
    deadExportCount: number;
    totalFiles: number;
    deadFileCount: number;
    estimatedDeadLines: number;
  };
  reachabilityTree?: ReachabilityNode;
}
