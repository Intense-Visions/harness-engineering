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

// ─── D2Parser class ─────────────────────────────────────────────────────────

export class D2Parser implements DiagramFormatParser {
  canParse(_content: string, ext: string): boolean {
    return ext === '.d2';
  }

  parse(content: string, _filePath: string): DiagramParseResult {
    const trimmed = content.trim();
    if (!trimmed) return emptyResult();

    const entities = new Map<string, DiagramEntity>();
    const relationships: DiagramRelationship[] = [];
    let braceDepth = 0;

    for (const line of trimmed.split('\n')) {
      const stripped = line.trim();
      if (!stripped || stripped.startsWith('#')) continue;

      // Track brace depth — skip lines inside nested blocks
      if (stripped.endsWith('{')) {
        if (braceDepth === 0) {
          const shape = parseBlockShape(stripped);
          if (shape) entities.set(shape.id, { id: shape.id, label: shape.label });
        }
        braceDepth++;
        continue;
      }

      if (stripped === '}') {
        braceDepth = Math.max(0, braceDepth - 1);
        continue;
      }

      if (braceDepth > 0) continue;

      // Connection: "server -> db: queries"
      const conn = parseConnection(stripped);
      if (conn) {
        relationships.push(conn);
        continue;
      }

      // Simple shape declaration: "server: Web Server"
      const shape = parseSimpleShape(stripped);
      if (shape && !entities.has(shape.id)) {
        entities.set(shape.id, { id: shape.id, label: shape.label });
      }
    }

    return {
      entities: Array.from(entities.values()),
      relationships,
      metadata: { format: 'd2', diagramType: 'architecture' },
    };
  }
}
