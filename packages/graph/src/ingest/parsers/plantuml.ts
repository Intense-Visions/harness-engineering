/**
 * PlantUML diagram format parser.
 *
 * Handles .puml and .plantuml files, supporting class and component diagram types.
 */

import type {
  DiagramEntity,
  DiagramRelationship,
  DiagramParseResult,
  DiagramFormatParser,
} from './types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function emptyResult(): DiagramParseResult {
  return {
    entities: [],
    relationships: [],
    metadata: { format: 'plantuml', diagramType: 'unknown' },
  };
}

/** Detect PlantUML diagram type from content heuristics. */
function detectDiagramType(content: string): string {
  if (/class\s+\w+/.test(content)) return 'class';
  if (/\[.+\]/.test(content) || /component\s+/.test(content)) return 'component';
  if (/participant\s+/.test(content) || /actor\s+/.test(content)) return 'sequence';
  return 'unknown';
}

/** Strip @startuml/@enduml wrappers from content. */
function stripWrappers(content: string): string {
  return content
    .replace(/@startuml\b.*\n?/, '')
    .replace(/@enduml\b.*/, '')
    .trim();
}

/** Extract class entities from body. */
function extractClasses(body: string, entities: Map<string, DiagramEntity>): void {
  const classRegex = /class\s+(\w+)/g;
  let match = classRegex.exec(body);
  while (match !== null) {
    const id = match[1] ?? '';
    if (id && !entities.has(id)) {
      entities.set(id, { id, label: id });
    }
    match = classRegex.exec(body);
  }
}

/** Extract component entities ([Name]) from body. */
function extractComponents(body: string, entities: Map<string, DiagramEntity>): void {
  const componentRegex = /\[([^\]]+)\]/g;
  let match = componentRegex.exec(body);
  while (match !== null) {
    const label = (match[1] ?? '').trim();
    if (label) {
      const id = label.replace(/\s+/g, '_');
      if (!entities.has(id)) {
        entities.set(id, { id, label });
      }
    }
    match = componentRegex.exec(body);
  }
}

/** Extract relationships (various arrow styles) from body. */
function extractRelationships(body: string): DiagramRelationship[] {
  const relationships: DiagramRelationship[] = [];
  const relRegex = /(\w+)\s*(?:-->|->|<--|<-|\.\.>|--)\s*(\w+)(?:\s*:\s*(.+))?/g;

  let match = relRegex.exec(body);
  while (match !== null) {
    const from = match[1] ?? '';
    const to = match[2] ?? '';
    const label = match[3]?.trim();
    if (from && to) {
      relationships.push({ from, to, ...(label ? { label } : {}) });
    }
    match = relRegex.exec(body);
  }

  return relationships;
}

// ─── PlantUmlParser class ───────────────────────────────────────────────────

export class PlantUmlParser implements DiagramFormatParser {
  canParse(_content: string, ext: string): boolean {
    return ext === '.puml' || ext === '.plantuml';
  }

  parse(content: string, _filePath: string): DiagramParseResult {
    const trimmed = content.trim();
    if (!trimmed) return emptyResult();

    const diagramType = detectDiagramType(trimmed);
    const entities = new Map<string, DiagramEntity>();
    const body = stripWrappers(trimmed);

    extractClasses(body, entities);
    extractComponents(body, entities);
    const relationships = extractRelationships(body);

    return {
      entities: Array.from(entities.values()),
      relationships,
      metadata: { format: 'plantuml', diagramType },
    };
  }
}
