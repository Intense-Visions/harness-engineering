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
  const fm = fmMatch?.[1];
  if (fm !== undefined) {
    const nameMatch = /^name:\s*['"]?([^'"\n]+)['"]?\s*$/m.exec(fm);
    const nameCapture = nameMatch?.[1];
    if (nameCapture !== undefined) {
      name = nameCapture.trim();
    }
  }

  // Fallback: first H1
  if (name === null) {
    const h1 = /^#\s+(.+)$/m.exec(raw);
    const h1Capture = h1?.[1];
    if (h1Capture !== undefined) {
      name = h1Capture.trim();
      warnings.push('STRATEGY.md frontmatter missing name; used H1 fallback');
    }
  }

  // Extract `## Key metrics` bullet list.
  const keyMetrics: string[] = [];
  const headerMatch = /^##\s+Key metrics\s*$/m.exec(raw);
  if (headerMatch && headerMatch.index !== undefined) {
    const startIdx = headerMatch.index + headerMatch[0].length;
    const after = raw.slice(startIdx);
    // Stop at the next H1/H2/H3 heading. H3 is the conventional sub-section
    // break; an author who indents content under an H3 inside Key metrics did
    // NOT mean those bullets to be product metrics (e.g. `### Implementation
    // notes` listing instrumentation caveats, not metrics).
    const stopMatch = /^(#{1,3})\s+/m.exec(after);
    const block = stopMatch ? after.slice(0, stopMatch.index) : after;
    for (const line of block.split('\n')) {
      const m = /^[-*]\s+(.+)$/.exec(line.trim());
      const capture = m?.[1];
      if (capture !== undefined) keyMetrics.push(capture.trim());
    }
  } else {
    warnings.push('STRATEGY.md is missing a `## Key metrics` section');
  }

  return { name, keyMetrics, warnings };
}
