/**
 * Diagram-as-code parser types and format-specific implementations.
 *
 * Extracts entities and relationships from diagram files (Mermaid, D2, PlantUML)
 * and maps them to the knowledge graph.
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import type { GraphStore } from '../store/GraphStore.js';
import type { IngestResult } from '../types.js';
import { hash } from './ingestUtils.js';

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

// ─── D2Parser ───────────────────────────────────────────────────────────────

export class D2Parser implements DiagramFormatParser {
  canParse(_content: string, ext: string): boolean {
    return ext === '.d2';
  }

  parse(content: string, _filePath: string): DiagramParseResult {
    const trimmed = content.trim();
    if (!trimmed) {
      return {
        entities: [],
        relationships: [],
        metadata: { format: 'd2', diagramType: 'architecture' },
      };
    }

    const entities = new Map<string, DiagramEntity>();
    const relationships: DiagramRelationship[] = [];

    let braceDepth = 0;

    for (const line of trimmed.split('\n')) {
      const stripped = line.trim();
      if (!stripped || stripped.startsWith('#')) continue;

      // Track brace depth — skip lines inside nested blocks
      if (stripped.endsWith('{')) {
        // Shape declaration with block: "db: PostgreSQL {"
        if (braceDepth === 0) {
          const shapeMatch = stripped.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+?)\s*\{$/);
          if (shapeMatch) {
            const id = shapeMatch[1];
            const label = shapeMatch[2];
            if (id && label) {
              entities.set(id, { id, label });
            }
          }
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
      const connMatch = stripped.match(
        /^([a-zA-Z0-9_.-]+)\s*->\s*([a-zA-Z0-9_.-]+)(?:\s*:\s*(.+?))?$/
      );
      if (connMatch) {
        const from = connMatch[1] ?? '';
        const to = connMatch[2] ?? '';
        const label = connMatch[3]?.trim();
        if (from && to) {
          relationships.push({ from, to, ...(label ? { label } : {}) });
        }
        continue;
      }

      // Simple shape declaration: "server: Web Server"
      const simpleMatch = stripped.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
      if (simpleMatch) {
        const id = simpleMatch[1];
        const label = (simpleMatch[2] ?? '').trim();
        if (id && label && !entities.has(id)) {
          entities.set(id, { id, label });
        }
      }
    }

    return {
      entities: Array.from(entities.values()),
      relationships,
      metadata: { format: 'd2', diagramType: 'architecture' },
    };
  }
}

// ─── PlantUmlParser ─────────────────────────────────────────────────────────

export class PlantUmlParser implements DiagramFormatParser {
  canParse(_content: string, ext: string): boolean {
    return ext === '.puml' || ext === '.plantuml';
  }

  parse(content: string, _filePath: string): DiagramParseResult {
    const trimmed = content.trim();
    if (!trimmed) {
      return {
        entities: [],
        relationships: [],
        metadata: { format: 'plantuml', diagramType: 'unknown' },
      };
    }

    const diagramType = this.detectDiagramType(trimmed);
    const entities = new Map<string, DiagramEntity>();
    const relationships: DiagramRelationship[] = [];

    // Strip @startuml/@enduml wrappers
    const body = trimmed
      .replace(/@startuml\b.*\n?/, '')
      .replace(/@enduml\b.*/, '')
      .trim();

    // Extract classes
    const classRegex = /class\s+(\w+)/g;
    let match: RegExpExecArray | null;
    match = classRegex.exec(body);
    while (match !== null) {
      const id = match[1] ?? '';
      if (id && !entities.has(id)) {
        entities.set(id, { id, label: id });
      }
      match = classRegex.exec(body);
    }

    // Extract components: [Name] or component "Name"
    const componentRegex1 = /\[([^\]]+)\]/g;
    match = componentRegex1.exec(body);
    while (match !== null) {
      const label = (match[1] ?? '').trim();
      if (label) {
        const id = label.replace(/\s+/g, '_');
        if (!entities.has(id)) {
          entities.set(id, { id, label });
        }
      }
      match = componentRegex1.exec(body);
    }

    // Extract relationships: A --> B : label (various arrow styles)
    const relRegex = /(\w+)\s*(?:-->|->|<--|<-|\.\.>|--)\s*(\w+)(?:\s*:\s*(.+))?/g;
    match = relRegex.exec(body);
    while (match !== null) {
      const from = match[1] ?? '';
      const to = match[2] ?? '';
      const label = match[3]?.trim();
      if (from && to) {
        relationships.push({ from, to, ...(label ? { label } : {}) });
      }
      match = relRegex.exec(body);
    }

    return {
      entities: Array.from(entities.values()),
      relationships,
      metadata: { format: 'plantuml', diagramType },
    };
  }

  private detectDiagramType(content: string): string {
    if (/class\s+\w+/.test(content)) return 'class';
    if (/\[.+\]/.test(content) || /component\s+/.test(content)) return 'component';
    if (/participant\s+/.test(content) || /actor\s+/.test(content)) return 'sequence';
    return 'unknown';
  }
}

// ─── DiagramParser Orchestrator ─────────────────────────────────────────────

const DIAGRAM_EXTENSIONS = new Set(['.mmd', '.mermaid', '.d2', '.puml', '.plantuml']);

export class DiagramParser {
  private readonly parsers: readonly DiagramFormatParser[] = [
    new MermaidParser(),
    new D2Parser(),
    new PlantUmlParser(),
  ];

  constructor(private readonly store: GraphStore) {}

  parse(content: string, filePath: string): DiagramParseResult {
    const ext = path.extname(filePath).toLowerCase();
    for (const parser of this.parsers) {
      if (parser.canParse(content, ext)) {
        return parser.parse(content, filePath);
      }
    }
    return {
      entities: [],
      relationships: [],
      metadata: { format: 'mermaid', diagramType: 'unknown' },
    };
  }

  async ingest(projectDir: string): Promise<IngestResult> {
    const start = Date.now();
    let nodesAdded = 0;
    let edgesAdded = 0;
    const errors: string[] = [];

    const diagramFiles = await this.findDiagramFiles(projectDir);

    for (const filePath of diagramFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const relPath = path.relative(projectDir, filePath).replaceAll('\\', '/');
        const result = this.parse(content, filePath);

        if (result.entities.length === 0) continue;

        const pathHash = hash(relPath);

        // Map entities to business_concept nodes
        for (const entity of result.entities) {
          const nodeId = `diagram:${pathHash}:${entity.id}`;
          this.store.addNode({
            id: nodeId,
            type: 'business_concept',
            name: entity.label,
            path: relPath,
            metadata: {
              source: 'diagram',
              format: result.metadata.format,
              diagramType: result.metadata.diagramType,
              confidence: 0.85,
              ...(entity.type ? { entityType: entity.type } : {}),
            },
          });
          nodesAdded++;
        }

        // Map relationships to references edges
        for (const rel of result.relationships) {
          const fromId = `diagram:${pathHash}:${rel.from}`;
          const toId = `diagram:${pathHash}:${rel.to}`;
          this.store.addEdge({
            from: fromId,
            to: toId,
            type: 'references',
            metadata: {
              ...(rel.label ? { label: rel.label } : {}),
            },
          });
          edgesAdded++;
        }
      } catch (err) {
        errors.push(
          `Failed to parse ${filePath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return {
      nodesAdded,
      nodesUpdated: 0,
      edgesAdded,
      edgesUpdated: 0,
      errors,
      durationMs: Date.now() - start,
    };
  }

  private async findDiagramFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.harness']);

    const walk = async (currentDir: string): Promise<void> => {
      let entries: fsSync.Dirent[];
      try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) {
            await walk(path.join(currentDir, entry.name));
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (DIAGRAM_EXTENSIONS.has(ext)) {
            files.push(path.join(currentDir, entry.name));
          }
        }
      }
    };

    await walk(dir);
    return files;
  }
}
