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
 * Find possible matches for a reference in a list of exports
 */
export function findPossibleMatches(
  reference: string,
  exportNames: string[],
  maxDistance: number = 5
): string[] {
  const matches: { name: string; score: number }[] = [];
  const refLower = reference.toLowerCase();

  for (const name of exportNames) {
    const nameLower = name.toLowerCase();

    // Exact match (case-insensitive)
    if (nameLower === refLower) {
      matches.push({ name, score: 0 });
      continue;
    }

    // Prefix/suffix match
    if (nameLower.includes(refLower) || refLower.includes(nameLower)) {
      matches.push({ name, score: 1 });
      continue;
    }

    // Levenshtein distance
    const distance = levenshteinDistance(refLower, nameLower);
    if (distance <= maxDistance) {
      matches.push({ name, score: distance });
    }
  }

  return matches
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((m) => m.name);
}

// Default doc-path prefixes that describe intended future code (ADRs,
// decisions, proposals). API-signature drift inside these docs is suppressed
// — symbols there describe the design, not the codebase. Override via
// DriftConfig.forwardLookingPaths.
const DEFAULT_FORWARD_LOOKING_PATHS = [
  'docs/architecture/',
  'docs/decisions/',
  'docs/proposals/',
  'docs/adr/',
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

/**
 * Check API signature drift - docs reference symbols that don't exist
 */
function checkApiSignatureDrift(
  snapshot: CodebaseSnapshot,
  config: DriftConfig
): DocumentationDrift[] {
  const drifts: DocumentationDrift[] = [];
  const exportNames = Array.from(snapshot.exportMap.byName.keys());

  for (const ref of snapshot.codeReferences) {
    if (config.ignorePatterns.some((p) => ref.reference.match(new RegExp(p)))) {
      continue;
    }

    // Forward-looking docs (ADRs, decisions, proposals) describe intended
    // future code; their referenced symbols are not codebase drift. See
    // github issue #492.
    if (isForwardLookingDoc(ref.docFile, config.forwardLookingPaths)) {
      continue;
    }

    // Check if reference exists in exports
    if (!snapshot.exportMap.byName.has(ref.reference)) {
      const possibleMatches = findPossibleMatches(ref.reference, exportNames);
      const confidence = possibleMatches.length > 0 ? 'high' : 'medium';

      const drift: DocumentationDrift = {
        type: 'api-signature',
        docFile: ref.docFile,
        line: ref.line,
        reference: ref.reference,
        context: ref.context,
        issue: possibleMatches.length > 0 ? 'RENAMED' : 'NOT_FOUND',
        details:
          possibleMatches.length > 0
            ? `Symbol "${ref.reference}" not found. Similar: ${possibleMatches.join(', ')}`
            : `Symbol "${ref.reference}" not found in codebase`,
        suggestion:
          possibleMatches.length > 0
            ? `Did you mean "${possibleMatches[0]}"?`
            : 'Remove reference or add the missing export',
        confidence,
      };
      if (possibleMatches.length > 0) {
        drift.possibleMatches = possibleMatches;
      }
      drifts.push(drift);
    }
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
function extractFileLinks(content: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const lines = content.split('\n');

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
 * GFM-style heading slug: lowercase, spaces → hyphens, drop characters that
 * aren't alphanumeric / hyphens. Mirrors GitHub's behavior well enough for
 * the common case (no full Unicode normalization, but matches typical
 * hand-written anchors).
 */
function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
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
  const headingRe = /^#{1,6}[ \t]+(.+?)[ \t]*#*\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(content)) !== null) {
    const heading = m[1];
    if (heading) slugs.add(slugifyHeading(heading));
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
  _config: DriftConfig
): Promise<DocumentationDrift[]> {
  const drifts: DocumentationDrift[] = [];

  for (const doc of snapshot.docs) {
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
