// packages/core/src/entropy/types/snapshot.ts
import type { AST, Import, Export } from '../../shared/parsers';
import type { DependencyGraph } from '../../constraints/types';
import type { EntropyConfig } from './config';
import type { PathAlias } from '../path-aliases';

export interface InternalSymbol {
  name: string;
  type: 'function' | 'class' | 'variable' | 'type';
  line: number;
  references: number;
  calledBy: string[];
}

export interface JSDocComment {
  content: string;
  line: number;
  associatedSymbol?: string;
}

export interface CodeBlock {
  language: string;
  content: string;
  line: number;
}

export interface InlineReference {
  reference: string;
  line: number;
  column: number;
}

export interface SourceFile {
  path: string;
  ast: AST;
  imports: Import[];
  exports: Export[];
  internalSymbols: InternalSymbol[];
  jsDocComments: JSDocComment[];
}

export interface DocumentationFile {
  path: string;
  type: 'markdown' | 'jsdoc' | 'typedoc' | 'text';
  content: string;
  codeBlocks: CodeBlock[];
  inlineRefs: InlineReference[];
}

export interface CodeReference {
  docFile: string;
  line: number;
  column: number;
  reference: string;
  context: 'code-block' | 'inline' | 'link' | 'jsdoc';
  resolvedTo?: string;
}

export interface ExportMap {
  byFile: Map<string, Export[]>;
  byName: Map<string, { file: string; export: Export }[]>;
}

/**
 * Import edges harvested from test files (`*.test.ts`, `*.spec.ts`).
 *
 * Test files are deliberately excluded from `files` so the classification
 * detectors (dead-file, pattern, complexity, coupling) never flag test code.
 * But an export imported *only* by its test is still live — omitting test
 * imports from the usage graph produced hundreds of dead-export false
 * positives (the dead-export detector was test-import-blind). The dead-export
 * detector consults these edges (path + imports only, no exports) so a test
 * importer marks its target live without ever classifying the test file itself.
 */
export interface TestImportSource {
  path: string;
  imports: Import[];
}

export interface CodebaseSnapshot {
  files: SourceFile[];
  /** Import edges from test files, consumed only by the dead-export detector. */
  testImports?: TestImportSource[];
  dependencyGraph: DependencyGraph;
  exportMap: ExportMap;
  docs: DocumentationFile[];
  codeReferences: CodeReference[];
  entryPoints: string[];
  rootDir: string;
  config: EntropyConfig;
  /**
   * Normalized tsconfig `paths` aliases used to resolve non-relative alias
   * imports (e.g. `@lib/*`) during reachability/usage analysis. Empty when the
   * project has no tsconfig `paths` (issue #1759).
   */
  pathAliases?: PathAlias[];
  buildTime: number;
}
