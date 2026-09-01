import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { glob } from 'glob';
import type { CorpusDocument, CorpusSpan } from '@harness-engineering/core';

/**
 * Trained context dictionaries (#1635) — corpus adapter.
 *
 * The trainer mines recurring spans over a corpus of past assembled contexts.
 * This repo does not persist rendered assembled-context prompts (the black-box
 * recorder deliberately omits them), so the concrete, always-available corpus of
 * committed recurring knowledge is the compiled **comprehension units** under
 * `.harness/comprehension/**` — the exact substrate assemblers draw from. Each
 * unit is one corpus *document*; its recurring lines (invariants and import
 * statements) are the candidate spans. Import statements and standard invariants
 * recur verbatim across hundreds of modules — precisely the zstd-dictionary
 * "learn the corpus's recurring substrings once" case.
 *
 * The span label is the normalized span text itself (text-as-label): with no
 * external stable concept key, an identical line IS the concept, and identical
 * lines group into one term. Read-only.
 */

/** A candidate-span line and the section it came from. */
type SectionKind = 'invariant' | 'import';
/** The two sections we mine spans from; every other heading resets to `null`. */
type Section = 'invariants' | 'dependency' | null;

/** Resolve a `## heading` line to a mined section (or `null` to stop mining). */
function sectionForHeading(line: string): Section {
  const heading = line.slice(3).toLowerCase();
  if (heading.startsWith('invariant')) return 'invariants';
  if (heading.startsWith('dependency')) return 'dependency';
  return null;
}

/** Emit a span for a body line when it is a mined line in the current section. */
function spanForLine(line: string, section: Section, inFence: boolean): CorpusSpan | null {
  if (section === 'invariants' && line.startsWith('- ')) {
    const text = line.slice(2).trim();
    return text.length > 0 ? { label: labelFor('invariant', text), text } : null;
  }
  if (section === 'dependency' && inFence && line.trim().startsWith('import ')) {
    const text = line.trim();
    return { label: labelFor('import', text), text };
  }
  return null;
}

function extractSpans(unitBody: string): CorpusSpan[] {
  const spans: CorpusSpan[] = [];
  let section: Section = null;
  let inFence = false;

  for (const raw of unitBody.split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('## ')) {
      section = sectionForHeading(line);
      inFence = false;
    } else if (line.startsWith('```')) {
      inFence = !inFence;
    } else {
      const span = spanForLine(line, section, inFence);
      if (span) spans.push(span);
    }
  }
  return spans;
}

/** Label a span by its section + its own normalized text (text-as-label). */
function labelFor(kind: SectionKind, text: string): string {
  return `${kind}:${text.replace(/\s+/g, ' ').trim()}`;
}

/**
 * Read the comprehension corpus. Returns one {@link CorpusDocument} per
 * comprehension unit found under `.harness/comprehension/**`. Returns `[]` (never
 * throws) when the directory is absent, so callers can render an empty report on
 * repos that have not compiled comprehension.
 */
export async function readComprehensionCorpus(cwd: string): Promise<CorpusDocument[]> {
  const root = join(cwd, '.harness', 'comprehension');
  let files: string[];
  try {
    files = await glob('**/_module.md', { cwd: root, nodir: true, dot: true });
  } catch {
    return [];
  }
  files.sort();

  const docs: CorpusDocument[] = [];
  for (const rel of files) {
    let content: string;
    try {
      content = readFileSync(join(root, rel), 'utf8');
    } catch {
      continue;
    }
    const spans = extractSpans(content);
    if (spans.length > 0) {
      docs.push({ id: rel.replace(/\\/g, '/'), spans });
    }
  }
  return docs;
}
