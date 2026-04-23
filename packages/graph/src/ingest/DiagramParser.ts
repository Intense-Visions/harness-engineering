/**
 * Diagram-as-code parser types and format-specific implementations.
 *
 * Extracts entities and relationships from diagram files (Mermaid, D2, PlantUML)
 * and maps them to the knowledge graph.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Empty Result ────────────────────────────────────────────────────────────

function emptyMermaidResult(diagramType: string = 'unknown'): DiagramParseResult {
  return {
    entities: [],
    relationships: [],
    metadata: { format: 'mermaid', diagramType },
  };
}

// ─── MermaidParser ───────────────────────────────────────────────────────────

export class MermaidParser implements DiagramFormatParser {
  canParse(_content: string, ext: string): boolean {
    return ext === '.mmd' || ext === '.mermaid';
  }

  parse(content: string, _filePath: string): DiagramParseResult {
    const trimmed = content.trim();
    if (!trimmed) {
      return emptyMermaidResult();
    }

    const diagramType = this.detectDiagramType(trimmed);

    switch (diagramType) {
      case 'flowchart':
        return this.parseFlowchart(trimmed, diagramType);
      case 'sequence':
        return this.parseSequence(trimmed, diagramType);
      default:
        return emptyMermaidResult(diagramType);
    }
  }

  private detectDiagramType(content: string): string {
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      if (/^(?:graph|flowchart)\b/i.test(trimmedLine)) return 'flowchart';
      if (/^sequenceDiagram\b/.test(trimmedLine)) return 'sequence';
      if (/^classDiagram\b/.test(trimmedLine)) return 'class';
      if (/^erDiagram\b/.test(trimmedLine)) return 'er';
      break;
    }
    return 'unknown';
  }

  private parseFlowchart(content: string, diagramType: string): DiagramParseResult {
    const entities = new Map<string, DiagramEntity>();
    const relationships: DiagramRelationship[] = [];

    // Extract nodes: id[label], id(label), id{label}
    const nodeRegex = /([A-Za-z0-9_]+)\s*[[({]([^\])}]+)[\])}]/g;
    let match: RegExpExecArray | null;

    match = nodeRegex.exec(content);
    while (match !== null) {
      const id = match[1] ?? '';
      const label = (match[2] ?? '').trim();

      if (id && !entities.has(id)) {
        const isDecision = this.isDecisionNode(content, id);
        entities.set(id, {
          id,
          label,
          ...(isDecision ? { type: 'decision' as const } : {}),
        });
      }
      match = nodeRegex.exec(content);
    }

    // Strip node shape definitions to simplify edge extraction
    // A[Auth Service] --> B{Valid Token?} becomes A --> B
    // Note: we only strip [..], (..), {..} — not > which appears in arrows
    const stripped = content.replace(/[[({][^\])}]*[\])}]/g, '');

    // Extract edges with labels: A -->|label| B
    const labeledEdgeRegex = /([A-Za-z0-9_]+)\s*--+>?\|([^|]+)\|\s*([A-Za-z0-9_]+)/g;
    // Extract edges without labels: A --> B
    const unlabeledEdgeRegex = /([A-Za-z0-9_]+)\s*--+>?\s+([A-Za-z0-9_]+)/g;

    const edgeKeys = new Set<string>();

    // First pass: labeled edges (more specific pattern)
    match = labeledEdgeRegex.exec(stripped);
    while (match !== null) {
      const from = match[1] ?? '';
      const label = (match[2] ?? '').trim();
      const to = match[3] ?? '';
      if (from && to) {
        const key = `${from}->${to}:${label}`;
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key);
          relationships.push({ from, to, label });
        }
      }
      match = labeledEdgeRegex.exec(stripped);
    }

    // Second pass: unlabeled edges
    match = unlabeledEdgeRegex.exec(stripped);
    while (match !== null) {
      const from = match[1] ?? '';
      const to = match[2] ?? '';
      if (from && to) {
        // Skip if this from->to pair already has a labeled edge
        const hasLabeled = relationships.some((r) => r.from === from && r.to === to);
        if (!hasLabeled) {
          const key = `${from}->${to}`;
          if (!edgeKeys.has(key)) {
            edgeKeys.add(key);
            relationships.push({ from, to });
          }
        }
      }
      match = unlabeledEdgeRegex.exec(stripped);
    }

    return {
      entities: Array.from(entities.values()),
      relationships,
      metadata: { format: 'mermaid', diagramType },
    };
  }

  private isDecisionNode(content: string, nodeId: string): boolean {
    // Check if the node is defined with {…} syntax (diamond/decision shape)
    const decisionRegex = new RegExp(`${nodeId}\\s*\\{`);
    return decisionRegex.test(content);
  }

  private parseSequence(content: string, diagramType: string): DiagramParseResult {
    const entities: DiagramEntity[] = [];
    const relationships: DiagramRelationship[] = [];
    const seenParticipants = new Set<string>();

    // Extract participants
    const participantRegex = /participant\s+(\w+)(?:\s+as\s+(.+))?/g;
    let match: RegExpExecArray | null;

    match = participantRegex.exec(content);
    while (match !== null) {
      const id = match[1] ?? '';
      const label = match[2]?.trim() || id;
      if (id && !seenParticipants.has(id)) {
        seenParticipants.add(id);
        entities.push({ id, label });
      }
      match = participantRegex.exec(content);
    }

    // Extract forward messages: A->>B: label or A->>+B: label
    const forwardMsgRegex = /(\w+)\s*->>?\+?\s*(\w+)\s*:\s*(.+)/g;
    match = forwardMsgRegex.exec(content);
    while (match !== null) {
      const from = match[1] ?? '';
      const to = match[2] ?? '';
      const label = (match[3] ?? '').trim();
      if (from && to) {
        relationships.push({ from, to, label });
      }
      match = forwardMsgRegex.exec(content);
    }

    // Extract return messages: A-->>B: label or A-->>-B: label
    const returnMsgRegex = /(\w+)\s*-->>?-?\s*(\w+)\s*:\s*(.+)/g;
    match = returnMsgRegex.exec(content);
    while (match !== null) {
      const from = match[1] ?? '';
      const to = match[2] ?? '';
      const label = (match[3] ?? '').trim();
      if (from && to) {
        relationships.push({ from, to, label });
      }
      match = returnMsgRegex.exec(content);
    }

    return {
      entities,
      relationships,
      metadata: { format: 'mermaid', diagramType },
    };
  }
}
