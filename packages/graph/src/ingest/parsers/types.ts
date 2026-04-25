/**
 * Shared types for diagram format parsers.
 */

export interface DiagramEntity {
  readonly id: string;
  readonly label: string;
  readonly type?: string;
}

export interface DiagramRelationship {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
}

export interface DiagramParseResult {
  readonly entities: readonly DiagramEntity[];
  readonly relationships: readonly DiagramRelationship[];
  readonly metadata: {
    readonly format: 'mermaid' | 'd2' | 'plantuml';
    readonly diagramType: string;
  };
}

export interface DiagramFormatParser {
  canParse(content: string, ext: string): boolean;
  parse(content: string, filePath: string): DiagramParseResult;
}
