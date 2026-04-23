/**
 * D2 diagram format parser.
 *
 * Parses D2 syntax into a normalized DiagramParseResult.
 * Types are defined locally to avoid coupling with the concurrently-created
 * DiagramParser.ts. Task 3 will unify imports.
 */

export interface DiagramEntity {
  readonly id: string;
  readonly label: string;
  readonly type?: string | undefined;
}

export interface DiagramRelationship {
  readonly from: string;
  readonly to: string;
  readonly label?: string | undefined;
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

const SHAPE_DECL = /^([a-zA-Z0-9_-]+)\s*:\s*(.+?)(?:\s*\{)?\s*$/;
const CONNECTION = /^([a-zA-Z0-9_.-]+)\s*->\s*([a-zA-Z0-9_.-]+)(?:\s*:\s*(.+?))?\s*$/;
const SHAPE_PROP = /^\s*shape\s*:\s*(\S+)\s*$/;

export class D2Parser implements DiagramFormatParser {
  canParse(_content: string, ext: string): boolean {
    return ext === '.d2';
  }

  parse(content: string, _filePath: string): DiagramParseResult {
    const entities: DiagramEntity[] = [];
    const relationships: DiagramRelationship[] = [];
    const entityTypes = new Map<string, string>();

    const lines = content.split('\n');
    let braceDepth = 0;
    let currentEntityId: string | undefined;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }

      // Track closing braces
      if (trimmed === '}') {
        braceDepth = Math.max(0, braceDepth - 1);
        if (braceDepth === 0) {
          currentEntityId = undefined;
        }
        continue;
      }

      // Inside a nested block — look for shape properties
      if (braceDepth > 0) {
        const shapePropMatch = trimmed.match(SHAPE_PROP);
        if (shapePropMatch && currentEntityId) {
          entityTypes.set(currentEntityId, shapePropMatch[1]!);
        }
        // Check for additional opening/closing braces within nested content
        if (trimmed.endsWith('{')) {
          braceDepth++;
        }
        continue;
      }

      // At depth 0: check for connection
      const connectionMatch = trimmed.match(CONNECTION);
      if (connectionMatch) {
        relationships.push({
          from: connectionMatch[1]!,
          to: connectionMatch[2]!,
          label: connectionMatch[3]?.trim(),
        });
        continue;
      }

      // At depth 0: check for shape declaration
      const shapeMatch = trimmed.match(SHAPE_DECL);
      if (shapeMatch) {
        const id = shapeMatch[1]!;
        const label = shapeMatch[2]!.trim();
        entities.push({ id, label });
        // If the line ends with `{`, enter nested block
        if (trimmed.endsWith('{')) {
          braceDepth++;
          currentEntityId = id;
        }
        continue;
      }
    }

    // Apply shape types discovered in nested blocks
    const entitiesWithTypes: DiagramEntity[] = entities.map((entity) => {
      const shapeType = entityTypes.get(entity.id);
      if (shapeType) {
        return { ...entity, type: shapeType };
      }
      return entity;
    });

    return {
      entities: entitiesWithTypes,
      relationships,
      metadata: {
        format: 'd2',
        diagramType: 'declarative',
      },
    };
  }
}
