/**
 * D2 diagram format parser.
 *
 * Handles .d2 files, extracting entities and connections from D2 architecture diagrams.
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
    metadata: { format: 'd2', diagramType: 'architecture' },
  };
}

/** Parse a shape declaration with a block: "db: PostgreSQL {" */
function parseBlockShape(stripped: string): { id: string; label: string } | null {
  const match = stripped.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+?)\s*\{$/);
  if (match) {
    const id = match[1];
    const label = match[2];
    if (id && label) return { id, label };
  }
  return null;
}

/** Parse a connection: "server -> db: queries" */
function parseConnection(stripped: string): { from: string; to: string; label?: string } | null {
  const match = stripped.match(/^([a-zA-Z0-9_.-]+)\s*->\s*([a-zA-Z0-9_.-]+)(?:\s*:\s*(.+?))?$/);
  if (match) {
    const from = match[1] ?? '';
    const to = match[2] ?? '';
    const label = match[3]?.trim();
    if (from && to) return { from, to, ...(label ? { label } : {}) };
  }
  return null;
}

/** Parse a simple shape declaration: "server: Web Server" */
function parseSimpleShape(stripped: string): { id: string; label: string } | null {
  const match = stripped.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
  if (match) {
    const id = match[1];
    const label = (match[2] ?? '').trim();
    if (id && label) return { id, label };
  }
  return null;
}

// ─── Line processing helpers ───────────────────────────────────────────────

interface ParseState {
  entities: Map<string, DiagramEntity>;
  relationships: DiagramRelationship[];
  braceDepth: number;
}

/** Handle a line that opens a brace block. Returns the new brace depth. */
function handleBlockOpen(stripped: string, state: ParseState): void {
  if (state.braceDepth === 0) {
    const shape = parseBlockShape(stripped);
    if (shape) state.entities.set(shape.id, { id: shape.id, label: shape.label });
  }
  state.braceDepth++;
}

/** Process a top-level line (not inside a nested block). */
function processTopLevelLine(stripped: string, state: ParseState): void {
  const conn = parseConnection(stripped);
  if (conn) {
    state.relationships.push(conn);
    return;
  }

  const shape = parseSimpleShape(stripped);
  if (shape && !state.entities.has(shape.id)) {
    state.entities.set(shape.id, { id: shape.id, label: shape.label });
  }
}

/** Process a single line within the D2 parse loop. */
function processD2Line(stripped: string, state: ParseState): void {
  if (!stripped || stripped.startsWith('#')) return;

  if (stripped.endsWith('{')) {
    handleBlockOpen(stripped, state);
    return;
  }

  if (stripped === '}') {
    state.braceDepth = Math.max(0, state.braceDepth - 1);
    return;
  }

  if (state.braceDepth > 0) return;

  processTopLevelLine(stripped, state);
}

// ─── D2Parser class ─────────────────────────────────────────────────────────

export class D2Parser implements DiagramFormatParser {
  canParse(_content: string, ext: string): boolean {
    return ext === '.d2';
  }

  parse(content: string, _filePath: string): DiagramParseResult {
    const trimmed = content.trim();
    if (!trimmed) return emptyResult();

    const state: ParseState = {
      entities: new Map<string, DiagramEntity>(),
      relationships: [],
      braceDepth: 0,
    };

    for (const line of trimmed.split('\n')) {
      processD2Line(line.trim(), state);
    }

    return {
      entities: Array.from(state.entities.values()),
      relationships: state.relationships,
      metadata: { format: 'd2', diagramType: 'architecture' },
    };
  }
}
