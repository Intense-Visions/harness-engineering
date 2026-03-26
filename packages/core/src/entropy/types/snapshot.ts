// packages/core/src/entropy/types/snapshot.ts
import type { AST, Import, Export } from '../../shared/parsers';
import type { DependencyGraph } from '../../constraints/types';
import type { EntropyConfig } from './config';

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

export interface CodebaseSnapshot {
  files: SourceFile[];
  dependencyGraph: DependencyGraph;
  exportMap: ExportMap;
  docs: DocumentationFile[];
  codeReferences: CodeReference[];
  entryPoints: string[];
  rootDir: string;
  config: EntropyConfig;
  buildTime: number;
}
