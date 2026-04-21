import * as fs from 'node:fs/promises';
import * as path from 'node:path';

interface KnowledgeEntry {
  type: string;
  name: string;
  domain: string;
  path: string;
  tags?: string[];
}

export async function getBusinessKnowledgeResource(projectRoot: string): Promise<string> {
  const knowledgeDir = path.join(projectRoot, 'docs', 'knowledge');

  let files: string[];
  try {
    files = await findMarkdownFiles(knowledgeDir);
  } catch {
    return JSON.stringify({ domains: {}, totalFiles: 0, totalDomains: 0 });
  }

  const domains: Record<string, KnowledgeEntry[]> = {};

  for (const filePath of files) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = parseFrontmatter(raw);
      if (!parsed) continue;

      const { frontmatter, body } = parsed;
      const titleMatch = body.match(/^#\s+(.+)$/m);
      const name = titleMatch ? titleMatch[1]!.trim() : path.basename(filePath, '.md');
      const relPath = path.relative(projectRoot, filePath).replaceAll('\\', '/');

      const entry: KnowledgeEntry = {
        type: frontmatter.type,
        name,
        domain: frontmatter.domain,
        path: relPath,
        ...(frontmatter.tags && { tags: frontmatter.tags }),
      };

      if (!domains[frontmatter.domain]) {
        domains[frontmatter.domain] = [];
      }
      domains[frontmatter.domain]!.push(entry);
    } catch {
      // Skip unreadable files
    }
  }

  return JSON.stringify({
    domains,
    totalFiles: Object.values(domains).reduce((sum, entries) => sum + entries.length, 0),
    totalDomains: Object.keys(domains).length,
  });
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findMarkdownFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

function parseFrontmatter(raw: string): {
  frontmatter: { type: string; domain: string; tags?: string[] };
  body: string;
} | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const yamlBlock = match[1]!;
  const body = match[2]!;

  const fm: Record<string, unknown> = {};
  for (const line of yamlBlock.split('\n')) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (!kvMatch) continue;
    const key = kvMatch[1]!;
    const value = kvMatch[2]!.trim();

    if (value.startsWith('[') && value.endsWith(']')) {
      fm[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim());
    } else {
      fm[key] = value;
    }
  }

  if (!fm.type || typeof fm.type !== 'string') return null;
  if (!fm.domain || typeof fm.domain !== 'string') return null;

  return {
    frontmatter: fm as { type: string; domain: string; tags?: string[] },
    body,
  };
}
