/**
 * Mermaid diagram format parser.
 *
 * Handles .mmd and .mermaid files, supporting flowchart and sequence diagram types.
 */

import type {
  DiagramEntity,
  DiagramRelationship,
  DiagramParseResult,
  DiagramFormatParser,
} from './types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function emptyResult(diagramType: string = 'unknown'): DiagramParseResult {
  return {
    entities: [],
    relationships: [],
    metadata: { format: 'mermaid', diagramType },
  };
}

/** Detect diagram type from the first non-empty line. */
function detectDiagramType(content: string): string {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^(?:graph|flowchart)\b/i.test(trimmed)) return 'flowchart';
    if (/^sequenceDiagram\b/.test(trimmed)) return 'sequence';
    if (/^classDiagram\b/.test(trimmed)) return 'class';
    if (/^erDiagram\b/.test(trimmed)) return 'er';
    break;
  }
  return 'unknown';
}

/** Check if a node is defined with {…} syntax (diamond/decision shape). */
function isDecisionNode(content: string, nodeId: string): boolean {
  const decisionRegex = new RegExp(`${nodeId}\\s*\\{`);
  return decisionRegex.test(content);
}

// ─── Flowchart extraction helpers ───────────────────────────────────────────

/** Build a DiagramEntity from a node regex match. */
function buildFlowchartEntity(
  content: string,
  match: RegExpExecArray
): { id: string; entity: DiagramEntity } | null {
  const id = match[1] ?? '';
  const label = (match[2] ?? '').trim();
  if (!id) return null;

  const decision = isDecisionNode(content, id);
  const entity: DiagramEntity = {
    id,
    label,
    ...(decision ? { type: 'decision' as const } : {}),
  };
  return { id, entity };
}

/** Extract node entities from flowchart content. */
function extractFlowchartNodes(content: string): Map<string, DiagramEntity> {
  const entities = new Map<string, DiagramEntity>();
  const nodeRegex = /([A-Za-z0-9_]+)\s*[[({]([^\])}]+)[\])}]/g;

  let match = nodeRegex.exec(content);
  while (match !== null) {
    const parsed = buildFlowchartEntity(content, match);
    if (parsed && !entities.has(parsed.id)) {
      entities.set(parsed.id, parsed.entity);
    }
    match = nodeRegex.exec(content);
  }

  return entities;
}

/** Parse a single labeled edge match into an edge key and relationship. */
function parseLabeledEdgeMatch(
  match: RegExpExecArray
): { key: string; rel: DiagramRelationship } | null {
  const from = match[1] ?? '';
  const label = (match[2] ?? '').trim();
  const to = match[3] ?? '';
  if (!from || !to) return null;
  return { key: `${from}->${to}:${label}`, rel: { from, to, label } };
}

/** Extract labeled edges (A -->|label| B) from stripped content. */
function extractLabeledEdges(stripped: string, edgeKeys: Set<string>): DiagramRelationship[] {
  const relationships: DiagramRelationship[] = [];
  const labeledEdgeRegex = /([A-Za-z0-9_]+)\s*--+>?\|([^|]+)\|\s*([A-Za-z0-9_]+)/g;

  let match = labeledEdgeRegex.exec(stripped);
  while (match !== null) {
    const parsed = parseLabeledEdgeMatch(match);
    if (parsed && !edgeKeys.has(parsed.key)) {
      edgeKeys.add(parsed.key);
      relationships.push(parsed.rel);
    }
    match = labeledEdgeRegex.exec(stripped);
  }

  return relationships;
}

/** Check whether a labeled edge already covers the given from->to pair. */
function hasLabeledEdgeBetween(
  labeledEdges: readonly DiagramRelationship[],
  from: string,
  to: string
): boolean {
  return labeledEdges.some((r) => r.from === from && r.to === to);
}

/** Extract unlabeled edges (A --> B) from stripped content. */
function extractUnlabeledEdges(
  stripped: string,
  edgeKeys: Set<string>,
  labeledEdges: readonly DiagramRelationship[]
): DiagramRelationship[] {
  const relationships: DiagramRelationship[] = [];
  const unlabeledEdgeRegex = /([A-Za-z0-9_]+)\s*--+>?\s+([A-Za-z0-9_]+)/g;

  let match = unlabeledEdgeRegex.exec(stripped);
  while (match !== null) {
    const from = match[1] ?? '';
    const to = match[2] ?? '';
    const key = `${from}->${to}`;

    if (from && to && !hasLabeledEdgeBetween(labeledEdges, from, to) && !edgeKeys.has(key)) {
      edgeKeys.add(key);
      relationships.push({ from, to });
    }
    match = unlabeledEdgeRegex.exec(stripped);
  }

  return relationships;
}

/** Parse a complete flowchart diagram. */
function parseFlowchart(content: string, diagramType: string): DiagramParseResult {
  const entities = extractFlowchartNodes(content);

  // Strip node shape definitions to simplify edge extraction
  // A[Auth Service] --> B{Valid Token?} becomes A --> B
  const stripped = content.replace(/[[({][^\])}]*[\])}]/g, '');

  const edgeKeys = new Set<string>();
  const labeledEdges = extractLabeledEdges(stripped, edgeKeys);
  const unlabeledEdges = extractUnlabeledEdges(stripped, edgeKeys, labeledEdges);

  return {
    entities: Array.from(entities.values()),
    relationships: [...labeledEdges, ...unlabeledEdges],
    metadata: { format: 'mermaid', diagramType },
  };
}

// ─── Sequence extraction helpers ────────────────────────────────────────────

/** Extract participants from a sequence diagram. */
function extractParticipants(content: string): DiagramEntity[] {
  const entities: DiagramEntity[] = [];
  const seenParticipants = new Set<string>();
  const participantRegex = /participant\s+(\w+)(?:\s+as\s+(.+))?/g;

  let match = participantRegex.exec(content);
  while (match !== null) {
    const id = match[1] ?? '';
    const label = match[2]?.trim() || id;
    if (id && !seenParticipants.has(id)) {
      seenParticipants.add(id);
      entities.push({ id, label });
    }
    match = participantRegex.exec(content);
  }

  return entities;
}

/** Build a relationship from a regex match with groups [_, from, to, label]. */
function relationshipFromMatch(match: RegExpExecArray): DiagramRelationship | null {
  const from = match[1] ?? '';
  const to = match[2] ?? '';
  const label = (match[3] ?? '').trim();
  return from && to ? { from, to, label } : null;
}

/** Collect all relationships matching a given regex pattern. */
function collectMessageMatches(content: string, regex: RegExp): DiagramRelationship[] {
  const results: DiagramRelationship[] = [];
  let match = regex.exec(content);
  while (match !== null) {
    const rel = relationshipFromMatch(match);
    if (rel) results.push(rel);
    match = regex.exec(content);
  }
  return results;
}

/** Extract messages (both forward and return) from a sequence diagram. */
function extractMessages(content: string): DiagramRelationship[] {
  // Forward messages: A->>B: label or A->>+B: label
  const forward = collectMessageMatches(content, /(\w+)\s*->>?\+?\s*(\w+)\s*:\s*(.+)/g);

  // Return messages: A-->>B: label or A-->>-B: label
  const returns = collectMessageMatches(content, /(\w+)\s*-->>?-?\s*(\w+)\s*:\s*(.+)/g);

  return [...forward, ...returns];
}

/** Parse a complete sequence diagram. */
function parseSequence(content: string, diagramType: string): DiagramParseResult {
  return {
    entities: extractParticipants(content),
    relationships: extractMessages(content),
    metadata: { format: 'mermaid', diagramType },
  };
}

// ─── MermaidParser class ────────────────────────────────────────────────────

export class MermaidParser implements DiagramFormatParser {
  canParse(_content: string, ext: string): boolean {
    return ext === '.mmd' || ext === '.mermaid';
  }

  parse(content: string, _filePath: string): DiagramParseResult {
    const trimmed = content.trim();
    if (!trimmed) {
      return emptyResult();
    }

    const diagramType = detectDiagramType(trimmed);

    switch (diagramType) {
      case 'flowchart':
        return parseFlowchart(trimmed, diagramType);
      case 'sequence':
        return parseSequence(trimmed, diagramType);
      default:
        return emptyResult(diagramType);
    }
  }
}
