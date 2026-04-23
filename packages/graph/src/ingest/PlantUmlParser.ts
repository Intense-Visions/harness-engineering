/**
 * PlantUML diagram format parser.
 *
 * Parses PlantUML syntax into a normalized DiagramParseResult.
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

export class PlantUmlParser implements DiagramFormatParser {
  canParse(_content: string, ext: string): boolean {
    return ext === '.puml' || ext === '.plantuml';
  }

  parse(content: string, _filePath: string): DiagramParseResult {
    // Strip @startuml/@enduml wrappers
    const stripped = content
      .replace(/@startuml\b.*\n?/g, '')
      .replace(/@enduml\b.*\n?/g, '')
      .trim();

    const diagramType = this.detectDiagramType(stripped);
    const entities: DiagramEntity[] = [];
    const relationships: DiagramRelationship[] = [];

    switch (diagramType) {
      case 'class':
        this.parseClassDiagram(stripped, entities, relationships);
        break;
      case 'sequence':
        this.parseSequenceDiagram(stripped, entities, relationships);
        break;
      case 'component':
        this.parseComponentDiagram(stripped, entities, relationships);
        break;
      default:
        // Try class-style parsing as a fallback
        this.parseClassDiagram(stripped, entities, relationships);
        break;
    }

    // Deduplicate entities by id
    const seen = new Set<string>();
    const deduped = entities.filter((e) => {
      if (seen.has(e.id)) {
        return false;
      }
      seen.add(e.id);
      return true;
    });

    return {
      entities: deduped,
      relationships,
      metadata: {
        format: 'plantuml',
        diagramType,
      },
    };
  }

  private detectDiagramType(content: string): string {
    if (/\bclass\s+\w+/i.test(content) || /\binterface\s+\w+/i.test(content)) {
      return 'class';
    }
    if (/\bparticipant\s+/i.test(content) || /\bactor\s+/i.test(content)) {
      return 'sequence';
    }
    if (/\bcomponent\s+/i.test(content) || /\bpackage\s+/i.test(content)) {
      return 'component';
    }
    return 'unknown';
  }

  private parseClassDiagram(
    content: string,
    entities: DiagramEntity[],
    relationships: DiagramRelationship[]
  ): void {
    // Match class declarations
    const classRegex = /\bclass\s+(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = classRegex.exec(content)) !== null) {
      entities.push({ id: match[1]!, label: match[1]!, type: 'class' });
    }

    // Match interface declarations
    const interfaceRegex = /\binterface\s+(\w+)/g;
    while ((match = interfaceRegex.exec(content)) !== null) {
      entities.push({ id: match[1]!, label: match[1]!, type: 'interface' });
    }

    // Match relationships: (\w+) (-->|->|<|--|..>|--) (\w+) (: label)?
    const relRegex = /(\w+)\s*(?:-->|->|<\|--|\.\.>|--)\s*(\w+)(?:\s*:\s*(.+))?/g;
    while ((match = relRegex.exec(content)) !== null) {
      relationships.push({
        from: match[1]!,
        to: match[2]!,
        label: match[3]?.trim(),
      });
    }
  }

  private parseSequenceDiagram(
    content: string,
    entities: DiagramEntity[],
    relationships: DiagramRelationship[]
  ): void {
    // Match participant declarations
    const participantRegex = /\bparticipant\s+(\w+)(?:\s+as\s+"?(.+?)"?)?\s*$/gm;
    let match: RegExpExecArray | null;
    while ((match = participantRegex.exec(content)) !== null) {
      entities.push({
        id: match[1]!,
        label: match[2] ?? match[1]!,
        type: 'participant',
      });
    }

    // Match actor declarations
    const actorRegex = /\bactor\s+(\w+)/g;
    while ((match = actorRegex.exec(content)) !== null) {
      entities.push({ id: match[1]!, label: match[1]!, type: 'actor' });
    }

    // Match messages: (\w+) (-->|->|->>|-->) (\w+) : (.+)
    const messageRegex = /(\w+)\s*(?:-->|->|->>|-->>)\s*(\w+)\s*:\s*(.+)/g;
    while ((match = messageRegex.exec(content)) !== null) {
      relationships.push({
        from: match[1]!,
        to: match[2]!,
        label: match[3]?.trim(),
      });
    }
  }

  private parseComponentDiagram(
    content: string,
    entities: DiagramEntity[],
    relationships: DiagramRelationship[]
  ): void {
    // Match component declarations with "as" alias
    const componentRegex = /\bcomponent\s+"?(.+?)"?\s+as\s+(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = componentRegex.exec(content)) !== null) {
      entities.push({ id: match[2]!, label: match[1]!, type: 'component' });
    }

    // Match bracket-style component references [Name]
    const bracketRegex = /\[(.+?)\]/g;
    while ((match = bracketRegex.exec(content)) !== null) {
      entities.push({ id: match[1]!, label: match[1]!, type: 'component' });
    }

    // Match relationships (same as class)
    const relRegex = /(\w+)\s*(?:-->|->|<\|--|\.\.>|--)\s*(\w+)(?:\s*:\s*(.+))?/g;
    while ((match = relRegex.exec(content)) !== null) {
      relationships.push({
        from: match[1]!,
        to: match[2]!,
        label: match[3]?.trim(),
      });
    }
  }
}
