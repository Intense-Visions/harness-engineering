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

/** Parse a single relationship match into a DiagramRelationship. */
function parseRelationshipMatch(match: RegExpExecArray): DiagramRelationship | null {
  const from = match[1] ?? '';
  const to = match[2] ?? '';
  if (!from || !to) return null;

  const label = match[3]?.trim();
  return { from, to, ...(label ? { label } : {}) };
}

/** Collect all regex matches from body into relationships. */
function collectRelationshipMatches(body: string, regex: RegExp): DiagramRelationship[] {
  const results: DiagramRelationship[] = [];
  let match = regex.exec(body);
  while (match !== null) {
    const rel = parseRelationshipMatch(match);
    if (rel) results.push(rel);
    match = regex.exec(body);
  }
  return results;
}

/** Extract relationships (various arrow styles) from body. */
function extractRelationships(body: string): DiagramRelationship[] {
  return collectRelationshipMatches(
    body,
    /(\w+)\s*(?:-->|->|<--|<-|\.\.>|--)\s*(\w+)(?:\s*:\s*(.+))?/g
  );
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
