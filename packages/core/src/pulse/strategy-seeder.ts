import * as fs from 'node:fs';
import * as path from 'node:path';

export interface StrategySeed {
  name: string | null;
  keyMetrics: string[];
  warnings: string[];
}

export interface SeedOptions {
  cwd?: string;
}

/**
 * Read STRATEGY.md from cwd if present and extract product name and
 * `## Key metrics` bullet items.
 *
 * Defensive: every failure mode degrades to a non-empty `warnings` array
 * with `name: null` and `keyMetrics: []` rather than throwing.
 */
export function seedFromStrategy(opts: SeedOptions = {}): StrategySeed {
  const cwd = opts.cwd ?? process.cwd();
  const strategyPath = path.join(cwd, 'STRATEGY.md');
  const warnings: string[] = [];

  if (!fs.existsSync(strategyPath)) {
    return { name: null, keyMetrics: [], warnings: ['STRATEGY.md not found'] };
  }

  const raw = fs.readFileSync(strategyPath, 'utf-8');

  // Extract frontmatter name if present.
  let name: string | null = null;
  const fmMatch = /^---\s*\n([\s\S]*?)\n---\s*\n/.exec(raw);
  if (fmMatch) {
    const fm = fmMatch[1];
    const nameMatch = /^name:\s*['"]?([^'"\n]+)['"]?\s*$/m.exec(fm);
    if (nameMatch) {
      name = nameMatch[1].trim();
    }
  }

  // Fallback: first H1
  if (name === null) {
    const h1 = /^#\s+(.+)$/m.exec(raw);
    if (h1) {
      name = h1[1].trim();
      warnings.push('STRATEGY.md frontmatter missing name; used H1 fallback');
    }
  }

  // Extract `## Key metrics` bullet list.
  const keyMetrics: string[] = [];
  const headerMatch = /^##\s+Key metrics\s*$/m.exec(raw);
  if (headerMatch && headerMatch.index !== undefined) {
    const startIdx = headerMatch.index + headerMatch[0].length;
    const after = raw.slice(startIdx);
    // Stop at the next H1/H2 heading (not deeper sub-headings).
    const stopMatch = /^(#{1,2})\s+/m.exec(after);
    const block = stopMatch ? after.slice(0, stopMatch.index) : after;
    for (const line of block.split('\n')) {
      const m = /^[-*]\s+(.+)$/.exec(line.trim());
      if (m) keyMetrics.push(m[1].trim());
    }
  } else {
    warnings.push('STRATEGY.md is missing a `## Key metrics` section');
  }

  return { name, keyMetrics, warnings };
}
