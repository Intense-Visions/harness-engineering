/**
 * Diagram-as-code parser orchestrator.
 *
 * Delegates to format-specific parsers (Mermaid, D2, PlantUML) and maps
 * extracted entities/relationships to the knowledge graph.
 *
 * Format-specific implementations live in ./parsers/.
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import type { GraphStore } from '../store/GraphStore.js';
import type { IngestResult } from '../types.js';
import { hash } from './ingestUtils.js';
import { DEFAULT_SKIP_DIRS } from './skip-dirs.js';

// Re-export types and parsers so existing imports remain valid
export type {
  DiagramEntity,
  DiagramRelationship,
  DiagramParseResult,
  DiagramFormatParser,
} from './parsers/index.js';

export { MermaidParser, D2Parser, PlantUmlParser } from './parsers/index.js';

import type { DiagramParseResult, DiagramFormatParser } from './parsers/index.js';
import { MermaidParser, D2Parser, PlantUmlParser } from './parsers/index.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const DIAGRAM_EXTENSIONS = new Set(['.mmd', '.mermaid', '.d2', '.puml', '.plantuml']);

// ─── DiagramParser Orchestrator ─────────────────────────────────────────────

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
        nodesAdded += this.addEntityNodes(result, relPath, pathHash);
        edgesAdded += this.addRelationshipEdges(result, pathHash);
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

  /** Map diagram entities to business_concept graph nodes. */
  private addEntityNodes(result: DiagramParseResult, relPath: string, pathHash: string): number {
    let count = 0;
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
      count++;
    }
    return count;
  }

  /** Map diagram relationships to references graph edges. */
  private addRelationshipEdges(result: DiagramParseResult, pathHash: string): number {
    let count = 0;
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
      count++;
    }
    return count;
  }

  private async findDiagramFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    const walk = async (currentDir: string): Promise<void> => {
      let entries: fsSync.Dirent[];
      try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!DEFAULT_SKIP_DIRS.has(entry.name)) {
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
