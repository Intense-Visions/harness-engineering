/**
 * Knowledge Document Materializer
 *
 * Takes GapEntry[] from the differential gap report and creates
 * docs/knowledge/{domain}/*.md files from graph nodes.
 * Frontmatter is compatible with BusinessKnowledgeIngestor's parseFrontmatter().
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphNode, NodeType } from '../types.js';
import type { GraphStore } from '../store/GraphStore.js';
import type { GapEntry } from './KnowledgeStagingAggregator.js';
import {
  inferDomain as inferDomainShared,
  type DomainInferenceOptions,
} from './domain-inference.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MaterializeOptions {
  readonly projectDir: string;
  readonly dryRun: boolean;
  readonly maxDocs?: number; // Default: 50
}

export interface MaterializeResult {
  readonly created: readonly MaterializedDoc[];
  readonly skipped: readonly SkippedEntry[];
}

export interface MaterializedDoc {
  readonly filePath: string; // relative to projectDir
  readonly nodeId: string;
  readonly domain: string;
  readonly name: string;
}

export interface SkippedEntry {
  readonly nodeId: string;
  readonly name: string;
  readonly reason: 'no_content' | 'no_domain' | 'already_documented' | 'dry_run' | 'cap_reached';
}

// ─── Constants ──────────────────────────────────────────────────────────────

const VALID_BUSINESS_TYPES = new Set<string>([
  'business_rule',
  'business_process',
  'business_concept',
  'business_term',
  'business_metric',
]);

const DEFAULT_MAX_DOCS = 50;
const MAX_COLLISION_SUFFIX = 10;

// ─── Implementation ─────────────────────────────────────────────────────────

interface ResolvedEntry {
  readonly node: GraphNode;
  readonly domain: string;
  readonly domainDir: string;
  readonly nameKey: string;
}

export class KnowledgeDocMaterializer {
  constructor(
    private readonly store: GraphStore,
    private readonly inferenceOptions: DomainInferenceOptions = {}
  ) {}

  async materialize(
    gapEntries: readonly GapEntry[],
    options: MaterializeOptions
  ): Promise<MaterializeResult> {
    const maxDocs = options.maxDocs ?? DEFAULT_MAX_DOCS;
    const created: MaterializedDoc[] = [];
    const skipped: SkippedEntry[] = [];
    const createdNames = new Set<string>();

    for (const entry of gapEntries) {
      const resolved = await this.resolveEntry(
        entry,
        created.length,
        maxDocs,
        createdNames,
        options
      );

      if ('reason' in resolved) {
        skipped.push(resolved);
        continue;
      }

      const { node, domain, domainDir, nameKey } = resolved;
      await fs.mkdir(domainDir, { recursive: true });

      const basename = this.generateFilename(entry.name);
      const filename = await this.resolveCollision(domainDir, basename);
      const content = this.formatDoc(node, domain);
      const filePath = ['docs', 'knowledge', domain, filename].join('/');

      await fs.writeFile(path.join(options.projectDir, filePath), content, 'utf-8');

      createdNames.add(nameKey);
      created.push({ filePath, nodeId: entry.nodeId, domain, name: entry.name });
    }

    return { created, skipped };
  }

  private async resolveEntry(
    entry: GapEntry,
    createdCount: number,
    maxDocs: number,
    createdNames: ReadonlySet<string>,
    options: MaterializeOptions
  ): Promise<SkippedEntry | ResolvedEntry> {
    if (!entry.hasContent) {
      return { nodeId: entry.nodeId, name: entry.name, reason: 'no_content' };
    }

    const node = this.store.getNode(entry.nodeId);
    if (!node || !node.content || node.content.trim().length < 10) {
      return { nodeId: entry.nodeId, name: entry.name, reason: 'no_content' };
    }

    const domain = this.inferDomain(node);
    if (!domain || /[/\\]|\.\.|\0/.test(domain)) {
      return { nodeId: entry.nodeId, name: entry.name, reason: 'no_domain' };
    }

    if (createdCount >= maxDocs) {
      return { nodeId: entry.nodeId, name: entry.name, reason: 'cap_reached' };
    }

    const domainDir = path.join(options.projectDir, 'docs', 'knowledge', domain);
    const nameKey = `${domain}:${entry.name.toLowerCase().trim()}`;
    if (!createdNames.has(nameKey) && (await this.hasExistingDoc(domainDir, entry.name))) {
      return { nodeId: entry.nodeId, name: entry.name, reason: 'already_documented' };
    }

    if (options.dryRun) {
      return { nodeId: entry.nodeId, name: entry.name, reason: 'dry_run' };
    }

    return { node, domain, domainDir, nameKey };
  }

  inferDomain(node: GraphNode): string | null {
    const result = inferDomainShared(node, this.inferenceOptions);
    return result === 'unknown' ? null : result;
  }

  generateFilename(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
    return `${slug}.md`;
  }

  async resolveCollision(dir: string, basename: string): Promise<string> {
    const ext = path.extname(basename);
    const stem = path.basename(basename, ext);

    try {
      await fs.access(path.join(dir, basename));
    } catch {
      // File does not exist — no collision
      return basename;
    }

    // File exists — try suffixes
    for (let i = 2; i <= MAX_COLLISION_SUFFIX; i++) {
      const candidate = `${stem}-${i}${ext}`;
      try {
        await fs.access(path.join(dir, candidate));
      } catch {
        return candidate;
      }
    }

    throw new Error(
      `Cannot resolve filename collision for "${basename}" after ${MAX_COLLISION_SUFFIX} attempts`
    );
  }

  formatDoc(node: GraphNode, domain: string): string {
    const mappedType = this.mapNodeType(node);
    const sanitize = (s: string) => s.replace(/[\n\r]/g, ' ').replace(/:/g, '-');
    const lines: string[] = ['---', `type: ${sanitize(mappedType)}`, `domain: ${sanitize(domain)}`];

    // Tags — sanitize each element to prevent YAML injection
    const tags = node.metadata?.tags;
    if (Array.isArray(tags) && tags.length > 0) {
      lines.push(`tags: [${tags.map((t: string) => sanitize(String(t))).join(', ')}]`);
    }

    // Related — sanitize each element
    const related = node.metadata?.related;
    if (Array.isArray(related) && related.length > 0) {
      lines.push(`related: [${related.map((r: string) => sanitize(String(r))).join(', ')}]`);
    }

    const title = (node.name ?? '').replace(/[\n\r]/g, ' ');
    lines.push('---', '', `# ${title}`, '', node.content ?? '', '');

    return lines.join('\n');
  }

  /** Check if a doc with a matching title already exists in the domain directory. */
  private async hasExistingDoc(domainDir: string, name: string): Promise<boolean> {
    const normalizedName = name.toLowerCase().trim();
    try {
      const files = await fs.readdir(domainDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const raw = await fs.readFile(path.join(domainDir, file), 'utf-8');
        const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
        const body = fmMatch ? fmMatch[1]! : raw;
        const titleMatch = body.match(/^#\s+(.+)$/m);
        if (titleMatch && titleMatch[1]!.trim().toLowerCase() === normalizedName) {
          return true;
        }
      }
    } catch {
      // Directory doesn't exist yet — no existing doc
    }
    return false;
  }

  mapNodeType(node: GraphNode): NodeType {
    if (VALID_BUSINESS_TYPES.has(node.type)) {
      return node.type;
    }
    if (node.type === 'business_fact') {
      return 'business_rule';
    }
    return 'business_concept';
  }
}
