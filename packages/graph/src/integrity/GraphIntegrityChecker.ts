import type { GraphNode } from '../types.js';
import type { SyncMetadata } from '../ingest/connectors/ConnectorInterface.js';

/**
 * Graph integrity checks — the defects that `harness graph status` cannot show.
 *
 * `graph status` answers "how big is the graph?". It cannot answer "is any of
 * this true?", and two live defect classes hide in exactly that gap:
 *
 *   - A connector that never authenticated still reports a fresh
 *     `last synced <timestamp>`, because the status reader narrows each
 *     connector's `lastResult` to a bare timestamp and discards `errors`
 *     and the counts (#1336).
 *   - The code extractors mint `business_term` nodes out of prose — the
 *     canonical instance being `enum or { function, const, if, if, if,
 *     return }`, produced by an unanchored regex matching the words "enum or"
 *     inside a JSDoc comment (#1331). A full re-ingest cannot clear such a
 *     node: it is re-derived from unchanged source on every run.
 *
 * Both are the #1146 shape — "examined nothing" rendered identically to
 * "examined and passed" — so every report here carries its denominators and
 * a caller can tell an abstention from a pass.
 */

/** Severity of an integrity finding. `error` blocks; `warning` informs. */
export type IntegritySeverity = 'error' | 'warning';

/** Stable identifiers for each check, so consumers can filter or suppress. */
export type IntegrityCode = 'GI-C001' | 'GI-C002' | 'GI-N001' | 'GI-N002';

export interface IntegrityFinding {
  readonly code: IntegrityCode;
  readonly severity: IntegritySeverity;
  /** Connector name or node id the finding is about. */
  readonly subject: string;
  readonly message: string;
  /** Concrete supporting detail: the connector error, or file:line and content. */
  readonly evidence?: string;
}

/**
 * What the run actually examined. A zero here is an abstention, never a pass:
 * a check that inspected no connectors and no extractor nodes verified nothing.
 */
export interface IntegrityDenominators {
  readonly connectors: number;
  readonly extractedNodes: number;
}

export interface GraphIntegrityReport {
  readonly findings: readonly IntegrityFinding[];
  readonly checked: IntegrityDenominators;
  /** True when both denominators are zero — the run examined nothing (#1146). */
  readonly checkedNothing: boolean;
}

/**
 * Reserved words across every language the code extractors handle, as one flat
 * set.
 *
 * Deliberately not scoped to the node's declared language. The motivating
 * defect is a TypeScript file yielding a node named `or` — not a TypeScript
 * keyword at all, but a Python one, and never a plausible type name in any of
 * these languages. Extractor debris does not respect language boundaries
 * because it is drawn from prose, so the union is the correct filter.
 *
 * Matching is CASE-SENSITIVE by design: every keyword here is lowercase, while
 * real type names are conventionally PascalCase. That single distinction is
 * what lets `enum Type` and `enum String` through while catching `type` and
 * `string`. Lowercasing before comparison would make this check unusable.
 */
const RESERVED_WORDS: ReadonlySet<string> = new Set([
  // TypeScript / JavaScript
  'abstract',
  'any',
  'as',
  'async',
  'await',
  'boolean',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'declare',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'get',
  'if',
  'implements',
  'import',
  'in',
  'infer',
  'instanceof',
  'interface',
  'is',
  'keyof',
  'let',
  'module',
  'namespace',
  'never',
  'new',
  'null',
  'number',
  'object',
  'of',
  'private',
  'protected',
  'public',
  'readonly',
  'require',
  'return',
  'satisfies',
  'set',
  'static',
  'string',
  'super',
  'switch',
  'symbol',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'unknown',
  'var',
  'void',
  'while',
  'with',
  'yield',
  // Python
  'and',
  'assert',
  'def',
  'del',
  'elif',
  'except',
  'global',
  'lambda',
  'None',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  // Go
  'chan',
  'defer',
  'fallthrough',
  'func',
  'go',
  'goto',
  'map',
  'package',
  'range',
  'select',
  'struct',
  // Rust
  'crate',
  'dyn',
  'extern',
  'fn',
  'impl',
  'loop',
  'match',
  'mod',
  'move',
  'mut',
  'pub',
  'ref',
  'self',
  'trait',
  'unsafe',
  'use',
  'where',
  // Java
  'byte',
  'char',
  'double',
  'final',
  'float',
  'int',
  'long',
  'native',
  'short',
  'strictfp',
  'synchronized',
  'throws',
  'transient',
  'volatile',
]);

/** Nodes minted by the code-signal extractors, as stamped in node metadata. */
const EXTRACTOR_SOURCE = 'code-extractor';

function isExtractorDerived(node: GraphNode): boolean {
  return (node.metadata as Record<string, unknown> | undefined)?.['source'] === EXTRACTOR_SOURCE;
}

/** What the extractor thought it found: `enum`, `union-type`, `const-object`. */
function kindOf(node: GraphNode): string | undefined {
  const kind = (node.metadata as Record<string, unknown> | undefined)?.['kind'];
  return typeof kind === 'string' ? kind : undefined;
}

function membersOf(node: GraphNode): readonly string[] {
  const members = (node.metadata as Record<string, unknown> | undefined)?.['members'];
  return Array.isArray(members) ? members.filter((m): m is string => typeof m === 'string') : [];
}

function locationOf(node: GraphNode): string {
  const path = node.path ?? '<unknown file>';
  const line = node.location?.startLine;
  return line === undefined ? path : `${path}:${line}`;
}

/**
 * Flags connectors whose recorded sync cannot be trusted as a sync.
 *
 * @param metadata - Parsed `sync-metadata.json`, or undefined when no connector
 *   has ever run.
 * @returns One finding per suspect connector; empty when every connector
 *   genuinely ingested something.
 */
/** Coerces a persisted count, which may be absent or malformed on disk. */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Total nodes and edges a sync actually touched; 0 when it did nothing. */
function totalTouched(lastResult: SyncEntry['lastResult'] | undefined): number {
  const result = lastResult as unknown as Record<string, unknown> | undefined;
  if (!result) return 0;
  return (
    count(result['nodesAdded']) +
    count(result['nodesUpdated']) +
    count(result['edgesAdded']) +
    count(result['edgesUpdated'])
  );
}

type SyncEntry = SyncMetadata['connectors'][string];

/** The single worst thing to say about one connector's recorded sync. */
function connectorFinding(name: string, entry: SyncEntry): IntegrityFinding | undefined {
  const timestamp = entry.lastSyncTimestamp;
  const errors = entry.lastResult?.errors ?? [];

  // A hard failure that still stamped a timestamp is the worst case: the one
  // surface a human checks reports it as freshly synced.
  if (errors.length > 0) {
    return {
      code: 'GI-C001',
      severity: 'error',
      subject: name,
      message:
        `Connector "${name}" reports last synced ${timestamp} but its last run ` +
        `failed and ingested nothing. The timestamp reads as a successful sync.`,
      evidence: errors.join('; '),
    };
  }

  // No error, but nothing changed either. Legitimate when there genuinely was
  // nothing new — indistinguishable from a silent no-op, so it warns.
  if (totalTouched(entry.lastResult) === 0) {
    return {
      code: 'GI-C002',
      severity: 'warning',
      subject: name,
      message:
        `Connector "${name}" recorded a sync at ${timestamp} that added and updated ` +
        `nothing. This cannot be distinguished from a connector that did not run.`,
    };
  }

  return undefined;
}

export function checkConnectorSync(metadata: SyncMetadata | undefined): IntegrityFinding[] {
  const entries = Object.entries(metadata?.connectors ?? {});
  return entries
    .map(([name, entry]) => connectorFinding(name, entry))
    .filter((f): f is IntegrityFinding => f !== undefined);
}

/**
 * Flags extractor-derived nodes that are prose rather than facts.
 *
 * @param nodes - Every node in the graph; non-extractor nodes are ignored, so
 *   hand-authored knowledge is never second-guessed here.
 * @returns Findings for implausible names and implausible member lists.
 */
/** Flags a node named after a keyword rather than an identifier. */
function reservedNameFinding(node: GraphNode): IntegrityFinding | undefined {
  if (!RESERVED_WORDS.has(node.name)) return undefined;
  return {
    code: 'GI-N001',
    severity: 'error',
    subject: node.id,
    message:
      `Extracted "${node.name}" as a ${node.type}, but that is a reserved word, not an ` +
      `identifier. The extractor almost certainly matched prose.`,
    evidence: `${locationOf(node)} - ${node.content ?? node.name}`,
  };
}

/** Explains why a member list cannot have come from real source, if it cannot. */
function implausibleMemberReason(node: GraphNode, members: readonly string[]): string | undefined {
  // Union-type members are string VALUES, not identifiers: in
  // `type CheckStatus = 'pass' | 'fail'`, `'pass'` is legal despite being a
  // Python keyword. Only kinds whose members are identifiers — enums and
  // const-object keys — can be judged against the reserved-word set.
  if (kindOf(node) !== 'union-type') {
    const keywords = [...new Set(members.filter((m) => RESERVED_WORDS.has(m)))];
    if (keywords.length > 0) return `members are reserved words (${keywords.join(', ')})`;
  }
  // A real enum cannot repeat a member; a scraped one routinely does.
  if (new Set(members).size !== members.length) {
    return 'members repeat, which no real enum permits';
  }
  return undefined;
}

/** Flags a member list that no real declaration could have produced. */
function memberListFinding(node: GraphNode): IntegrityFinding | undefined {
  const members = membersOf(node);
  if (members.length === 0) return undefined;

  const reason = implausibleMemberReason(node, members);
  if (!reason) return undefined;

  return {
    code: 'GI-N002',
    severity: 'error',
    subject: node.id,
    message: `Extracted "${node.name}" with an implausible member list: ${reason}.`,
    evidence: `${locationOf(node)} - ${node.content ?? members.join(', ')}`,
  };
}

export function checkExtractedNodes(nodes: Iterable<GraphNode>): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  for (const node of nodes) {
    if (!isExtractorDerived(node)) continue;
    const nodeFindings = [reservedNameFinding(node), memberListFinding(node)];
    for (const finding of nodeFindings) {
      if (finding) findings.push(finding);
    }
  }
  return findings;
}

const SEVERITY_ORDER: Record<IntegritySeverity, number> = { error: 0, warning: 1 };

/**
 * Runs every integrity check and reports findings alongside what was examined.
 *
 * @param input.syncMetadata - Parsed `sync-metadata.json`, if any.
 * @param input.nodes - Every node in the graph.
 * @returns A report whose denominators let the caller distinguish a clean graph
 *   from one that was never inspected.
 */
export function checkGraphIntegrity(input: {
  syncMetadata: SyncMetadata | undefined;
  nodes: Iterable<GraphNode>;
}): GraphIntegrityReport {
  const nodes = [...input.nodes];
  const extractedNodes = nodes.filter(isExtractorDerived).length;
  const connectors = Object.keys(input.syncMetadata?.connectors ?? {}).length;

  const findings = [...checkConnectorSync(input.syncMetadata), ...checkExtractedNodes(nodes)].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  return {
    findings,
    checked: { connectors, extractedNodes },
    checkedNothing: connectors === 0 && extractedNodes === 0,
  };
}
