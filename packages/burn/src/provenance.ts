import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * One fleet lane's provenance record, normalised from the varied shapes seen
 * across `docs/changes/<slug>/provenance.json`.
 *
 * The on-disk files are hand- and skill-written and have drifted: some carry
 * `issue` as a scalar, others `issues` as an array; `branch`, `slug`, and
 * `closingKeyword` are all optional. This reader is deliberately permissive —
 * a malformed or partial file is dropped or defaulted, never a reason to throw,
 * because a single bad provenance file must not blind the whole cost report.
 */
export interface ProvenanceEntry {
  /** Change-directory slug; defaults to the directory name when the file omits it. */
  slug: string;
  /** GitHub issue numbers this lane closed. Empty when none could be read. */
  issues: number[];
  /** Feature branch, when the file recorded one. */
  branch?: string;
  /**
   * The burn lane id (`agentId`) that produced this change, when a provenance
   * writer stamped it. Absent in every current file — see the cost-report
   * degrade path, which treats a lane with no matching `laneId` as
   * `unattributed` rather than inventing a link.
   */
  laneId?: string;
}

/** Coerce an unknown `issue`/`issues` field into a de-duped list of positive integers. */
function readIssues(raw: Record<string, unknown>): number[] {
  const out = new Set<number>();
  const push = (v: unknown): void => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (Number.isInteger(n) && n > 0) out.add(n);
  };
  if (Array.isArray(raw.issues)) for (const v of raw.issues) push(v);
  push(raw.issue);
  return [...out];
}

/** Parse one provenance file's text into an entry, or null when unusable. */
function parseEntry(dirName: string, text: string): ProvenanceEntry | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (obj === null || typeof obj !== 'object') return null;

  const slug = typeof obj.slug === 'string' && obj.slug.trim() !== '' ? obj.slug.trim() : dirName;
  const entry: ProvenanceEntry = { slug, issues: readIssues(obj) };
  if (typeof obj.branch === 'string' && obj.branch.trim() !== '') entry.branch = obj.branch.trim();
  if (typeof obj.laneId === 'string' && obj.laneId.trim() !== '') entry.laneId = obj.laneId.trim();
  return entry;
}

/**
 * Read every `docs/changes/<slug>/provenance.json` under `repoRoot`.
 *
 * Returns `[]` when the `docs/changes` tree is absent, and silently skips any
 * file that is unreadable or not valid JSON. The result is the outcome half of
 * the cost join — the token half comes from burn's own store.
 */
export function readProvenance(repoRoot: string): ProvenanceEntry[] {
  const changesDir = path.join(repoRoot, 'docs', 'changes');
  if (!existsSync(changesDir)) return [];

  let dirents;
  try {
    dirents = readdirSync(changesDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const entries: ProvenanceEntry[] = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    const file = path.join(changesDir, dirent.name, 'provenance.json');
    if (!existsSync(file)) continue;
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const entry = parseEntry(dirent.name, text);
    if (entry) entries.push(entry);
  }
  return entries;
}
