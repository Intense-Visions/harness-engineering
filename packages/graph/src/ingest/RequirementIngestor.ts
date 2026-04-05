import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphStore } from '../store/GraphStore.js';
import type { IngestResult, EdgeType, GraphNode } from '../types.js';
import { hash, emptyResult } from './ingestUtils.js';

/** Section headings that contain numbered requirements. */
const REQUIREMENT_SECTIONS = [
  'Observable Truths',
  'Success Criteria',
  'Acceptance Criteria',
] as const;

/** Regex to match section headings (## or ### level). */
const SECTION_HEADING_RE = /^#{2,3}\s+(.+)$/;

/** Regex to match numbered list items. */
const NUMBERED_ITEM_RE = /^\s*(\d+)\.\s+(.+)$/;

/** EARS pattern detection heuristics. */
function detectEarsPattern(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (/^if\b.+\bthen\b.+\bshall not\b/.test(lower)) return 'unwanted';
  if (/^when\b/.test(lower)) return 'event-driven';
  if (/^while\b/.test(lower)) return 'state-driven';
  if (/^where\b/.test(lower)) return 'optional';
  // Ubiquitous: "The system shall..." without conditional prefix
  if (/^the\s+\w+\s+shall\b/.test(lower)) return 'ubiquitous';
  return undefined;
}

const CODE_NODE_TYPES = ['file', 'function', 'class', 'method', 'interface', 'variable'] as const;

export class RequirementIngestor {
  constructor(private readonly store: GraphStore) {}

  /**
   * Scan a specs directory for `<feature>/proposal.md` files,
   * extract numbered requirements from recognized sections,
   * and create requirement nodes with convention-based edges.
   */
  async ingestSpecs(specsDir: string): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];
    let nodesAdded = 0;
    let edgesAdded = 0;

    let featureDirs: string[];
    try {
      const entries = await fs.readdir(specsDir, { withFileTypes: true });
      featureDirs = entries.filter((e) => e.isDirectory()).map((e) => path.join(specsDir, e.name));
    } catch {
      return emptyResult(Date.now() - start);
    }

    for (const featureDir of featureDirs) {
      const featureName = path.basename(featureDir);
      const specPath = path.join(featureDir, 'proposal.md');

      let content: string;
      try {
        content = await fs.readFile(specPath, 'utf-8');
      } catch {
        continue; // No proposal.md in this directory
      }

      try {
        const specHash = hash(specPath);

        // Create a document node for the spec itself
        const specNodeId = `file:${specPath}`;
        this.store.addNode({
          id: specNodeId,
          type: 'document',
          name: path.basename(specPath),
          path: specPath,
          metadata: { featureName },
        });

        // Parse sections and extract numbered requirements
        const requirements = this.extractRequirements(content, specPath, specHash, featureName);

        for (const req of requirements) {
          this.store.addNode(req.node);
          nodesAdded++;

          // Link requirement -> spec document via 'specifies' edge
          this.store.addEdge({
            from: req.node.id,
            to: specNodeId,
            type: 'specifies',
          });
          edgesAdded++;

          // Convention-based linking
          edgesAdded += this.linkByPathPattern(req.node.id, featureName);
          edgesAdded += this.linkByKeywordOverlap(req.node.id, req.node.name);
        }
      } catch (err) {
        errors.push(`${specPath}: ${err instanceof Error ? err.message : String(err)}`);
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

  /**
   * Parse markdown content and extract numbered items from recognized sections.
   */
  private extractRequirements(
    content: string,
    specPath: string,
    specHash: string,
    featureName: string
  ): Array<{ node: GraphNode }> {
    const lines = content.split('\n');
    const results: Array<{ node: GraphNode }> = [];

    let currentSection: string | undefined;
    let inRequirementSection = false;
    // Use a file-level counter for unique IDs (sections may reuse item numbers)
    let globalIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Check for section heading
      const headingMatch = line.match(SECTION_HEADING_RE);
      if (headingMatch) {
        const heading = headingMatch[1]!.trim();
        const isReqSection = REQUIREMENT_SECTIONS.some(
          (s) => heading.toLowerCase() === s.toLowerCase()
        );
        if (isReqSection) {
          currentSection = heading;
          inRequirementSection = true;
        } else {
          inRequirementSection = false;
        }
        continue;
      }

      if (!inRequirementSection) continue;

      // Check for numbered item
      const itemMatch = line.match(NUMBERED_ITEM_RE);
      if (!itemMatch) continue;

      const index = parseInt(itemMatch[1]!, 10);
      const text = itemMatch[2]!.trim();
      const rawText = line.trim();
      const lineNumber = i + 1; // 1-based

      globalIndex++;
      const nodeId = `req:${specHash}:${globalIndex}`;
      const earsPattern = detectEarsPattern(text);

      results.push({
        node: {
          id: nodeId,
          type: 'requirement',
          name: text,
          path: specPath,
          location: {
            fileId: `file:${specPath}`,
            startLine: lineNumber,
            endLine: lineNumber,
          },
          metadata: {
            specPath,
            index,
            section: currentSection!,
            rawText,
            earsPattern,
            featureName,
          },
        },
      });
    }

    return results;
  }

  /**
   * Convention-based linking: match requirement to code/test files
   * by feature name in their path.
   */
  private linkByPathPattern(reqId: string, featureName: string): number {
    let count = 0;
    const fileNodes = this.store.findNodes({ type: 'file' });

    for (const node of fileNodes) {
      if (!node.path) continue;
      const normalizedPath = node.path.replace(/\\/g, '/');

      /* eslint-disable @harness-engineering/no-hardcoded-path-separator */
      // Code file pattern: packages/*/<feature>* (normalizedPath uses / on all platforms)
      const isCodeMatch =
        normalizedPath.includes('packages/') && path.basename(normalizedPath).includes(featureName);

      // Test file pattern: **/tests/**/<feature>* (normalizedPath uses / on all platforms)
      const isTestMatch =
        normalizedPath.includes('/tests/') && // platform-safe
        path.basename(normalizedPath).includes(featureName);
      /* eslint-enable @harness-engineering/no-hardcoded-path-separator */

      if (isCodeMatch && !isTestMatch) {
        this.store.addEdge({
          from: reqId,
          to: node.id,
          type: 'requires',
          confidence: 0.5,
          metadata: { method: 'convention', matchReason: 'path-pattern' },
        });
        count++;
      } else if (isTestMatch) {
        this.store.addEdge({
          from: reqId,
          to: node.id,
          type: 'verified_by',
          confidence: 0.5,
          metadata: { method: 'convention', matchReason: 'path-pattern' },
        });
        count++;
      }
    }

    return count;
  }

  /**
   * Convention-based linking: match requirement text to code nodes
   * by keyword overlap (function/class names appearing in requirement text).
   */
  private linkByKeywordOverlap(reqId: string, reqText: string): number {
    let count = 0;

    for (const nodeType of CODE_NODE_TYPES) {
      const codeNodes = this.store.findNodes({ type: nodeType });
      for (const node of codeNodes) {
        // Skip short names to avoid false positives
        if (node.name.length < 3) continue;

        const escaped = node.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const namePattern = new RegExp(`\\b${escaped}\\b`, 'i');
        if (namePattern.test(reqText)) {
          // Determine edge type: test files get verified_by, code gets requires
          // eslint-disable-next-line @harness-engineering/no-hardcoded-path-separator
          const edgeType: EdgeType = node.path?.replace(/\\/g, '/').includes('/tests/') // platform-safe
            ? 'verified_by'
            : 'requires';

          this.store.addEdge({
            from: reqId,
            to: node.id,
            type: edgeType,
            confidence: 0.6,
            metadata: { method: 'convention', matchReason: 'keyword-overlap' },
          });
          count++;
        }
      }
    }

    return count;
  }
}
