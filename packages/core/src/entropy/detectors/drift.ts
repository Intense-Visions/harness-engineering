import type { Result } from '../../shared/result';
import { Ok } from '../../shared/result';
import type {
  EntropyError,
  CodebaseSnapshot,
  DriftConfig,
  DriftReport,
  DocumentationDrift,
} from '../types';
import { fileExists } from '../../shared/fs-utils';
import { dirname, resolve } from 'path';

/**
 * Initialize the Levenshtein distance matrix with base cases.
 */
function initLevenshteinMatrix(aLen: number, bLen: number): number[][] {
  const matrix: number[][] = [];
  for (let i = 0; i <= bLen; i++) {
    matrix[i] = [i];
  }
  const firstRow = matrix[0];
  if (firstRow) {
    for (let j = 0; j <= aLen; j++) {
      firstRow[j] = j;
    }
  }
  return matrix;
}

/**
 * Compute a single cell in the Levenshtein matrix.
 */
function computeLevenshteinCell(
  row: number[],
  prevRow: number[],
  j: number,
  charsMatch: boolean
): void {
  if (charsMatch) {
    row[j] = prevRow[j - 1] ?? 0;
  } else {
    row[j] = Math.min((prevRow[j - 1] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prevRow[j] ?? 0) + 1);
  }
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix = initLevenshteinMatrix(a.length, b.length);

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const row = matrix[i];
      const prevRow = matrix[i - 1];
      if (!row || !prevRow) continue;
      computeLevenshteinCell(row, prevRow, j, b.charAt(i - 1) === a.charAt(j - 1));
    }
  }

  const lastRow = matrix[b.length];
  return lastRow?.[a.length] ?? 0;
}

/**
 * Bounded Levenshtein distance: returns the exact edit distance when it is
 * `<= max`, and a sentinel value `> max` (specifically `max + 1`) otherwise.
 *
 * Correctness: this is the textbook diagonal-band ("Ukkonen") restriction of
 * the full DP. Any cell `d[i][j]` with `|i - j| > max` satisfies
 * `d[i][j] >= |i - j| > max`, so cells outside the band can never contribute
 * to a final distance `<= max` and are treated as infinity. Within that
 * invariant, if every in-band cell of a row already exceeds `max` the final
 * distance must exceed `max`, so the row-minimum check is an exact early exit.
 * For every candidate whose true distance is `<= max` this returns the same
 * number the full-matrix {@link levenshteinDistance} would; callers only ever
 * branch on `distance <= max`, so the sentinel is indistinguishable from any
 * other out-of-range distance. Verified to produce byte-identical
 * `findPossibleMatches` output across the full monorepo (issue #692).
 */
/** Clamped minimum of the three edit-distance transitions for one DP cell. */
function boundedCell(del: number, ins: number, sub: number, inf: number): number {
  let v = del < ins ? del : ins;
  if (sub < v) v = sub;
  return v > inf ? inf : v;
}

function boundedLevenshtein(a: string, b: string, max: number): number {
  const m = a.length;
  const n = b.length;
  // Edit distance is at least the length difference; short-circuit the band.
  if (Math.abs(m - n) > max) return max + 1;

  const INF = max + 1;
  let prev = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j <= max ? j : INF;
  let curr = new Array<number>(m + 1);

  for (let i = 1; i <= n; i++) {
    const lo = Math.max(1, i - max);
    const hi = Math.min(m, i + max);
    curr[0] = i <= max ? i : INF;
    if (lo > 1) curr[lo - 1] = INF; // left boundary neighbour is out-of-band
    let rowMin = curr[0]!;
    const bi = b.charCodeAt(i - 1);
    for (let j = lo; j <= hi; j++) {
      const cost = a.charCodeAt(j - 1) === bi ? 0 : 1;
      const v = boundedCell(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost, INF);
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (hi < m) curr[hi + 1] = INF; // right boundary neighbour is out-of-band
    if (rowMin > max) return max + 1; // whole row already exceeds the budget
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  const d = prev[m]!;
  return d > max ? max + 1 : d;
}

/**
 * Precomputed export-name index for {@link findMatchesFromIndex}: the original
 * names alongside their lowercased forms and lengths. Building this once per
 * drift check avoids re-lowercasing every export for every unresolved
 * reference (the dominant cost of API-signature drift on large repos).
 */
interface ExportMatchIndex {
  names: string[];
  lowers: string[];
  lens: number[];
}

function buildExportMatchIndex(exportNames: string[]): ExportMatchIndex {
  const lowers = exportNames.map((n) => n.toLowerCase());
  const lens = lowers.map((l) => l.length);
  return { names: exportNames, lowers, lens };
}

/**
 * Core matcher over a prepared {@link ExportMatchIndex}. Kept separate from the
 * public {@link findPossibleMatches} so hot callers can share one index across
 * many references.
 */
function findMatchesFromIndex(
  reference: string,
  index: ExportMatchIndex,
  maxDistance: number
): string[] {
  const matches: { name: string; score: number }[] = [];
  const refLower = reference.toLowerCase();
  const refLen = refLower.length;
  const { names, lowers, lens } = index;

  for (let i = 0; i < names.length; i++) {
    const nameLower = lowers[i]!;

    // Exact match (case-insensitive)
    if (nameLower === refLower) {
      matches.push({ name: names[i]!, score: 0 });
      continue;
    }

    // Prefix/suffix match
    if (nameLower.includes(refLower) || refLower.includes(nameLower)) {
      matches.push({ name: names[i]!, score: 1 });
      continue;
    }

    // Edit distance is at least the length difference, so a candidate whose
    // length differs by more than maxDistance can never be within budget —
    // skip the DP entirely (it would be discarded anyway).
    if (Math.abs(refLen - lens[i]!) > maxDistance) continue;

    const distance = boundedLevenshtein(refLower, nameLower, maxDistance);
    if (distance <= maxDistance) {
      matches.push({ name: names[i]!, score: distance });
    }
  }

  return matches
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((m) => m.name);
}

/**
 * Find possible matches for a reference in a list of exports
 */
export function findPossibleMatches(
  reference: string,
  exportNames: string[],
  maxDistance: number = 5
): string[] {
  return findMatchesFromIndex(reference, buildExportMatchIndex(exportNames), maxDistance);
}

// Default doc-path prefixes that describe intended future code (ADRs,
// decisions, proposals, and change specs/plans). Both API-signature AND
// structure drift (broken links/anchors) inside these docs are suppressed —
// their contents describe the design, not the current codebase/tree.
// `docs/changes/` is the IMMUTABLE historical record of shipped changes
// (proposals, plans, verification reports): its dangling links are
// unactionable by design — "fixing" a shipped proposal's link edits history —
// and were the dominant contributor to drift counts (github issues #816,
// #1326). Do NOT remove `docs/changes/` here to "clean up" drift output.
// Override via DriftConfig.forwardLookingPaths.
const DEFAULT_FORWARD_LOOKING_PATHS = [
  'docs/architecture/',
  'docs/decisions/',
  'docs/proposals/',
  'docs/adr/',
  'docs/changes/',
];

const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  docPaths: [],
  checkApiSignatures: true,
  checkExamples: true,
  checkStructure: true,
  ignorePatterns: [],
  forwardLookingPaths: DEFAULT_FORWARD_LOOKING_PATHS,
};

// Match either as relative-path prefix (`docs/architecture/foo.md`) or as a
// substring anywhere in the absolute resolved path. The latter handles cases
// where the snapshot stores absolute paths.
function isForwardLookingDoc(docPath: string, forwardLookingPaths: string[]): boolean {
  const normalized = docPath.replaceAll('\\', '/');
  return forwardLookingPaths.some((prefix) => normalized.includes(prefix));
}

// snake_case (`assess_project`) and SCREAMING_SNAKE (`GEMINI_API_KEY`) tokens
// are MCP tool names, config keys, and env vars in a camelCase TS codebase —
// but genuine symbols in Python/Rust/Go. Rather than hardcode TS conventions,
// suppress these token classes only when the codebase itself exports nothing
// of that convention: a snake_case doc token cannot reference a symbol in a
// project that has no snake_case exports (github issue #816).
const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
const SCREAMING_SNAKE_RE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/;

/** Naming conventions the codebase actually uses for exported symbols. */
type ExportConventions = { hasSnakeExports: boolean; hasScreamingExports: boolean };

/**
 * Resolve a reference to the top-level symbol name to look up. Dotted
 * references (`User.email`) resolve to their head segment, since the export
 * map only tracks top-level symbols (github issue #816).
 */
function resolveReferenceName(reference: string): string {
  return reference.includes('.') ? (reference.split('.')[0] ?? reference) : reference;
}

/**
 * Whether a reference is noise that should not be checked for drift: caller
 * ignore patterns, forward-looking docs (ADRs/proposals/change specs), or a
 * snake_case / SCREAMING_SNAKE token in a codebase that exports nothing of
 * that convention (MCP tool names, config keys, env vars). See issues #492
 * and #816.
 */
function isSuppressedReference(
  ref: CodebaseSnapshot['codeReferences'][number],
  resolvedName: string,
  config: DriftConfig,
  conventions: ExportConventions
): boolean {
  if (config.ignorePatterns.some((p) => ref.reference.match(new RegExp(p)))) return true;
  if (isForwardLookingDoc(ref.docFile, config.forwardLookingPaths)) return true;
  if (SNAKE_CASE_RE.test(resolvedName) && !conventions.hasSnakeExports) return true;
  if (SCREAMING_SNAKE_RE.test(resolvedName) && !conventions.hasScreamingExports) return true;
  return false;
}

/** Build the drift finding for a reference that did not resolve to an export. */
function buildApiDrift(
  ref: CodebaseSnapshot['codeReferences'][number],
  exportIndex: ExportMatchIndex
): DocumentationDrift {
  const possibleMatches = findMatchesFromIndex(ref.reference, exportIndex, 5);
  const renamed = possibleMatches.length > 0;
  const drift: DocumentationDrift = {
    type: 'api-signature',
    docFile: ref.docFile,
    line: ref.line,
    reference: ref.reference,
    context: ref.context,
    issue: renamed ? 'RENAMED' : 'NOT_FOUND',
    details: renamed
      ? `Symbol "${ref.reference}" not found. Similar: ${possibleMatches.join(', ')}`
      : `Symbol "${ref.reference}" not found in codebase`,
    suggestion: renamed
      ? `Did you mean "${possibleMatches[0]}"?`
      : 'Remove reference or add the missing export',
    confidence: renamed ? 'high' : 'medium',
  };
  if (renamed) drift.possibleMatches = possibleMatches;
  return drift;
}

/**
 * Check API signature drift - docs reference symbols that don't exist
 */
function checkApiSignatureDrift(
  snapshot: CodebaseSnapshot,
  config: DriftConfig
): DocumentationDrift[] {
  const drifts: DocumentationDrift[] = [];
  const exportNames = Array.from(snapshot.exportMap.byName.keys());
  const conventions: ExportConventions = {
    hasSnakeExports: exportNames.some((n) => SNAKE_CASE_RE.test(n)),
    hasScreamingExports: exportNames.some((n) => SCREAMING_SNAKE_RE.test(n)),
  };
  // Lowercasing every export is the dominant cost of fuzzy matching; build the
  // index once and share it across every unresolved reference (issue #692).
  const exportIndex = buildExportMatchIndex(exportNames);

  for (const ref of snapshot.codeReferences) {
    const resolvedName = resolveReferenceName(ref.reference);
    if (isSuppressedReference(ref, resolvedName, config, conventions)) continue;
    if (snapshot.exportMap.byName.has(resolvedName)) continue;
    drifts.push(buildApiDrift(ref, exportIndex));
  }

  return drifts;
}

interface MarkdownLink {
  /** Raw link as written, including any `#anchor` portion. */
  raw: string;
  /** File path portion (no anchor). */
  path: string;
  /** Anchor portion without the leading `#`, or undefined when absent. */
  anchor?: string;
  line: number;
}

/**
 * Extract file/directory links from markdown content.
 *
 * Splits `file.md#anchor` into `path = file.md` and `anchor = anchor` so the
 * existence check operates on the file path alone (see github issue #492).
 */
/**
 * Blank every line inside a fenced code block, preserving line count so link
 * and heading line numbers stay accurate. A fence opens on a bare run of 3+
 * backticks or tildes and closes ONLY on a same-character run at least as long
 * as the opener with no info string — mirroring CommonMark/GFM. This makes a
 * 4-tick fence legitimately wrap 3-tick blocks: a naive open/close toggle
 * re-opens on the inner fence and exposes the second half of a quoted document
 * (issue #1342). Shared by link extraction and heading-slug extraction so the
 * two structure-drift passes agree on what is quoted illustration.
 */
function blankFencedRegions(content: string): string {
  const lines = content.split('\n');
  let fence: { char: string; len: number } | null = null;

  return lines
    .map((line) => {
      const match = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence === null) {
        if (match) {
          const run = match[1] as string;
          fence = { char: run[0] as string, len: run.length };
          return '';
        }
        return line;
      }
      // Inside a fence: close only on a bare same-char run >= opener length.
      if (
        match &&
        (match[1] as string)[0] === fence.char &&
        (match[1] as string).length >= fence.len &&
        (match[2] as string).trim() === ''
      ) {
        fence = null;
      }
      return '';
    })
    .join('\n');
}

function extractFileLinks(content: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  // Fenced code blocks (``` / ~~~, including nested runs) hold illustrative
  // markdown, not real references — blank them first so a sample link is never
  // reported as broken drift, while keeping line numbers intact (issue #1342).
  const lines = blankFencedRegions(content).split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Markdown links: [text](path)
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(line)) !== null) {
      const linkPath = match[2];
      if (!linkPath) continue;
      if (linkPath.startsWith('http')) continue;
      if (linkPath.startsWith('#')) continue;
      if (!linkPath.includes('.') && !linkPath.startsWith('..')) continue;

      const hashIdx = linkPath.indexOf('#');
      const filePart = hashIdx === -1 ? linkPath : linkPath.slice(0, hashIdx);
      const anchorPart = hashIdx === -1 ? undefined : linkPath.slice(hashIdx + 1);
      // Anchor-only links (`#section`) were already filtered above; here
      // a leading `#` would mean an empty filePart and we should skip.
      if (!filePart) continue;
      links.push({
        raw: linkPath,
        path: filePart,
        ...(anchorPart ? { anchor: anchorPart } : {}),
        line: i + 1,
      });
    }
  }

  return links;
}

/**
 * GFM-style heading slug: lowercase, drop characters that aren't Unicode
 * letters/numbers, `_`, `-`, or whitespace, then map each whitespace character
 * to one hyphen. Mirrors GitHub's slugger for typical hand-written anchors:
 * - No `.trim()` before hyphenating — GitHub keeps the space a stripped emoji
 *   leaves behind, so `## 📖 Usage` anchors at `#-usage`.
 * - Unicode `\p{L}\p{N}` instead of ASCII `\w`, so `## Café` keeps `café`.
 * - One hyphen per whitespace character (not per run), so `## Tips & Tricks`
 *   (the `&` dropped, two spaces kept) anchors at `#tips--tricks`.
 */
function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

async function extractHeadingSlugs(filePath: string): Promise<Set<string>> {
  const slugs = new Set<string>();
  let content: string;
  try {
    const fs = await import('node:fs/promises');
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return slugs;
  }
  // Blank fenced regions first so a `# Title` quoted inside a code fence does
  // not register as a real anchor (issue #1342).
  const scanned = blankFencedRegions(content);
  const headingRe = /^#{1,6}[ \t]+(.+?)[ \t]*#*\s*$/gm;
  // GitHub disambiguates repeated headings: the Nth (N>1) occurrence of a base
  // slug anchors at `base-{N-1}` (second `## Setup` -> `#setup-1`).
  const seen = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(scanned)) !== null) {
    const heading = m[1];
    if (!heading) continue;
    const base = slugifyHeading(heading);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    slugs.add(count === 0 ? base : `${base}-${count}`);
  }
  return slugs;
}

/**
 * Check structure drift - docs reference files/directories that don't exist.
 * When a link targets `file.md#anchor`, the file portion is checked for
 * existence first; if the file exists, the anchor is validated against the
 * target file's GFM-slugged headings (see github issue #492).
 */
async function checkStructureDrift(
  snapshot: CodebaseSnapshot,
  config: DriftConfig
): Promise<DocumentationDrift[]> {
  const drifts: DocumentationDrift[] = [];

  for (const doc of snapshot.docs) {
    // Forward-looking docs (ADRs, proposals, and especially the immutable
    // docs/changes/** historical record) describe the design, not the current
    // tree. Their dangling links/anchors are unactionable by design — "fixing"
    // a shipped proposal's link edits history — so suppress structure drift
    // there exactly as api-signature drift is suppressed (github issue #1326).
    if (isForwardLookingDoc(doc.path, config.forwardLookingPaths)) continue;

    const fileLinks = extractFileLinks(doc.content);

    for (const link of fileLinks) {
      const resolvedPath = resolve(dirname(doc.path), link.path);
      const exists = await fileExists(resolvedPath);

      if (!exists) {
        drifts.push({
          type: 'structure',
          docFile: doc.path,
          line: link.line,
          reference: link.raw,
          context: 'link',
          issue: 'NOT_FOUND',
          details: `File "${link.path}" referenced in documentation does not exist`,
          suggestion: 'Update the link or remove the reference',
          confidence: 'high',
        });
        continue;
      }

      if (link.anchor && resolvedPath.toLowerCase().endsWith('.md')) {
        const slugs = await extractHeadingSlugs(resolvedPath);
        // Only emit when we successfully read headings — empty set on read
        // failure means we should not pretend the anchor is broken.
        if (slugs.size > 0 && !slugs.has(link.anchor.toLowerCase())) {
          drifts.push({
            type: 'structure',
            docFile: doc.path,
            line: link.line,
            reference: link.raw,
            context: 'link-anchor',
            issue: 'NOT_FOUND',
            details: `Anchor "#${link.anchor}" not found in "${link.path}"`,
            suggestion: 'Check the target file for the correct heading slug',
            confidence: 'medium',
          });
        }
      }
    }
  }

  return drifts;
}

type GraphDriftData = {
  staleEdges: Array<{ docNodeId: string; codeNodeId: string; edgeType: string }>;
  missingTargets: string[];
};

function computeDriftSeverity(driftCount: number): DriftReport['severity'] {
  if (driftCount === 0) return 'none';
  if (driftCount <= 3) return 'low';
  if (driftCount <= 10) return 'medium';
  return 'high';
}

function buildGraphDriftReport(graphDriftData: GraphDriftData): Result<DriftReport, EntropyError> {
  const drifts: DocumentationDrift[] = [];

  for (const target of graphDriftData.missingTargets) {
    drifts.push({
      type: 'api-signature',
      docFile: target,
      line: 0,
      reference: target,
      context: 'graph-missing-target',
      issue: 'NOT_FOUND',
      details: `Graph node "${target}" has no matching code target`,
      confidence: 'high',
    });
  }

  for (const edge of graphDriftData.staleEdges) {
    drifts.push({
      type: 'api-signature',
      docFile: edge.docNodeId,
      line: 0,
      reference: edge.codeNodeId,
      context: `graph-stale-edge:${edge.edgeType}`,
      issue: 'NOT_FOUND',
      details: `Stale edge from doc "${edge.docNodeId}" to code "${edge.codeNodeId}" (${edge.edgeType})`,
      confidence: 'medium',
    });
  }

  return Ok({
    drifts,
    stats: {
      docsScanned: graphDriftData.staleEdges.length,
      referencesChecked: graphDriftData.staleEdges.length + graphDriftData.missingTargets.length,
      driftsFound: drifts.length,
      byType: { api: drifts.length, example: 0, structure: 0 },
    },
    severity: computeDriftSeverity(drifts.length),
  });
}

/**
 * Detect documentation drift in a codebase.
 * When graphDriftData is provided, uses graph-derived edges instead of snapshot-based analysis.
 */
export async function detectDocDrift(
  snapshot: CodebaseSnapshot,
  config?: Partial<DriftConfig>,
  graphDriftData?: GraphDriftData
): Promise<Result<DriftReport, EntropyError>> {
  // Graph-enhanced mode: use pre-computed graph data instead of snapshot analysis
  if (graphDriftData) {
    return buildGraphDriftReport(graphDriftData);
  }

  const fullConfig = { ...DEFAULT_DRIFT_CONFIG, ...config };
  const drifts: DocumentationDrift[] = [];

  // Check API signature drift
  if (fullConfig.checkApiSignatures) {
    drifts.push(...checkApiSignatureDrift(snapshot, fullConfig));
  }

  // Check structure drift
  if (fullConfig.checkStructure) {
    drifts.push(...(await checkStructureDrift(snapshot, fullConfig)));
  }

  // Calculate stats
  const apiDrifts = drifts.filter((d) => d.type === 'api-signature').length;
  const exampleDrifts = drifts.filter((d) => d.type === 'example-code').length;
  const structureDrifts = drifts.filter((d) => d.type === 'structure').length;

  const severity =
    drifts.length === 0
      ? 'none'
      : drifts.length <= 3
        ? 'low'
        : drifts.length <= 10
          ? 'medium'
          : 'high';

  return Ok({
    drifts,
    stats: {
      docsScanned: snapshot.docs.length,
      referencesChecked: snapshot.codeReferences.length,
      driftsFound: drifts.length,
      byType: { api: apiDrifts, example: exampleDrifts, structure: structureDrifts },
    },
    severity,
  });
}
