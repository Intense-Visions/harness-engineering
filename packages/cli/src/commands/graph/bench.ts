import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import {
  handleGetImpact,
  handleComputeBlastRadius,
  handleQueryGraph,
  handleFindContextFor,
  handleAskGraph,
} from '../../mcp/tools/graph/index.js';
import { handleCodeOutline } from '../../mcp/tools/code-nav.js';
import { ExitCode } from '../../utils/errors.js';
import type { BenchJudge, QualityGrade } from './bench-judge.js';
import { resolveBenchJudge, JUDGE_PAYLOAD_CHAR_BUDGET } from './bench-judge.js';

/**
 * Reproducible graph token-savings benchmark (issue #1271).
 *
 * Measures two objective, deterministic axes — tokens and tool calls — for
 * graph-scoped retrieval (the real shipped MCP tool handlers) versus the naive
 * file-by-file exploration a graph-less agent is forced into. A third axis —
 * answer quality (the comparator's "83%") — is opt-in and advisory: pass a judge
 * (`--judge`; see bench-judge.ts) and an LLM grades whether each strategy's
 * retrieved payload suffices to answer the query. It degrades honestly to
 * INCONCLUSIVE when no judge is reachable and never fails the benchmark, so the
 * default (no-judge) run stays deterministic. A published multi-repo
 * answer-quality number remains deferred (Refs #1271).
 *
 * The honest target is the arXiv comparator figure (preprint 2603.27277: ~10x
 * fewer tokens, ~2.1x fewer tool calls), NOT the flattering 99.2% README figure.
 * The measured harness number is reported truthfully, flattering or not.
 */

// --- token estimator (mirrors core's estimateTokens: chars / 4) ---
// Inlined so both strategies are measured with the identical estimator and the
// benchmark carries no extra barrel dependency. See packages/core/src/compaction/envelope.ts.
export function estimateBenchTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
]);

export interface StrategyMetrics {
  tokens: number;
  toolCalls: number;
  bytes: number;
}

/** Per-scenario answer-quality grade for each strategy (populated only when a judge runs). */
export interface ScenarioQuality {
  graph: QualityGrade;
  naive: QualityGrade;
}

export interface ScenarioResult {
  id: string;
  family: string;
  anchor: string;
  /** The exact natural-language query the answer-quality judge is (or would be) asked. */
  query: string;
  graph: StrategyMetrics;
  naive: StrategyMetrics;
  /** Answer-quality grades; present only when the bench ran with a judge. */
  quality?: ScenarioQuality;
}

/** Aggregate sufficiency counts for one strategy across all judged scenarios. */
export interface QualityAggregate {
  /** Scenarios graded sufficient (payload answers the query). */
  sufficient: number;
  /** Scenarios graded insufficient. */
  insufficient: number;
  /** Scenarios the judge could not decide (unreachable / unusable response). */
  inconclusive: number;
  /** Total scenarios considered. */
  total: number;
  /** sufficient / (sufficient + insufficient); null when nothing was decidable. */
  sufficientRate: number | null;
}

/**
 * The answer-quality axis (the comparator's "83%"), advisory by construction — it never
 * changes `result.ok`. `status`:
 * - `skipped`      — no judge requested (`--judge` absent); objective axes stand alone.
 * - `inconclusive` — a judge was requested but no provider was reachable/configured.
 * - `measured`     — a judge graded the scenarios (individual grades may still be inconclusive).
 */
export interface AnswerQualityAxis {
  status: 'skipped' | 'inconclusive' | 'measured';
  /** Always true: the axis is advisory and never fails the benchmark. */
  advisory: true;
  note: string;
  graph?: QualityAggregate;
  naive?: QualityAggregate;
}

export interface FamilyAggregate {
  family: string;
  scenarios: number;
  graph: StrategyMetrics;
  naive: StrategyMetrics;
  tokenSavings: number;
  toolCallSavings: number;
}

export interface GraphBenchResult {
  ok: boolean;
  message?: string;
  projectPath: string;
  generatedAt: string;
  comparator: {
    source: string;
    tokenSavings: number;
    toolCallSavings: number;
    answerQuality: number;
    note: string;
  };
  scenarios: ScenarioResult[];
  families: FamilyAggregate[];
  overall: {
    scenarios: number;
    graph: StrategyMetrics;
    naive: StrategyMetrics;
    tokenSavings: number;
    toolCallSavings: number;
  };
  answerQuality: AnswerQualityAxis;
}

export interface GraphBenchOptions {
  top?: number;
  /**
   * Answer-quality judge. When supplied, each scenario × strategy is graded for
   * retrieval sufficiency. Absent → the axis is reported as `skipped`. Injected in
   * tests; the CLI resolves the real judge via `resolveBenchJudge`.
   */
  judge?: BenchJudge;
  /**
   * The judge was requested (`--judge`) but no provider was reachable. Distinguishes the
   * honest `inconclusive` axis from a plain `skipped` (no `--judge`) run.
   */
  judgeRequestedButUnavailable?: boolean;
}

// Fixed task-context inputs live in source so a reviewer can read exactly what was asked.
const FIND_CONTEXT_INTENTS = [
  'add a new CLI subcommand to the graph command group',
  'handle the case where the knowledge graph has not been built yet',
  'compute the blast radius of a source file',
];
const ASK_QUESTIONS = [
  'What loads the knowledge graph store from disk?',
  'How does the graph compute the impact of changing a file?',
  'Where are graph MCP tool handlers registered?',
];

function emptyMetrics(): StrategyMetrics {
  return { tokens: 0, toolCalls: 0, bytes: 0 };
}

function addMetrics(a: StrategyMetrics, b: StrategyMetrics): StrategyMetrics {
  return {
    tokens: a.tokens + b.tokens,
    toolCalls: a.toolCalls + b.toolCalls,
    bytes: a.bytes + b.bytes,
  };
}

function ratio(naive: number, graph: number): number {
  if (graph <= 0) return 0;
  return Math.round((naive / graph) * 100) / 100;
}

/** Concatenate the text of an MCP tool handler result. */
function handlerText(result: { content?: Array<{ type: string; text?: string }> }): string {
  if (!result.content) return '';
  return result.content
    .map((c) => (c.type === 'text' && typeof c.text === 'string' ? c.text : ''))
    .join('\n');
}

function metricsFromText(text: string, toolCalls: number): StrategyMetrics {
  const bytes = Buffer.byteLength(text, 'utf8');
  return { tokens: estimateBenchTokens(text), toolCalls, bytes };
}

/**
 * Deterministic query phrasings for the structural families (anchor is a file path).
 * `find-context` / `ask` are absent here — their anchor is already a natural-language query.
 */
const STRUCTURAL_QUERY: Record<string, (anchor: string) => string> = {
  impact: (a) => `What is the impact of changing ${a}? Which files and symbols are affected?`,
  'blast-radius': (a) =>
    `What is the blast radius of ${a}? Which files depend on it and would be affected by a change?`,
  dependencies: (a) => `What does ${a} depend on — its direct and transitive local dependencies?`,
  outline: (a) => `What functions, classes, and exports are defined in ${a}?`,
};

/**
 * The natural-language query the answer-quality judge is asked for a scenario. For
 * `find-context` / `ask` the anchor is already a query; the structural families get a
 * deterministic phrasing so a reviewer can read exactly what was asked.
 */
export function benchQueryFor(family: string, anchor: string): string {
  return STRUCTURAL_QUERY[family]?.(anchor) ?? anchor;
}

/** Concatenated text of the files a naive strategy reads — the payload handed to the judge. */
function naiveTextOf(files: SourceFile[]): string {
  return files.map((f) => `// ${f.rel}\n${f.content}`).join('\n\n');
}

/** Fold a list of grades into an aggregate sufficiency count for one strategy. */
function aggregateQuality(grades: QualityGrade[]): QualityAggregate {
  let sufficient = 0;
  let insufficient = 0;
  let inconclusive = 0;
  for (const g of grades) {
    if (g.sufficient === true) sufficient += 1;
    else if (g.sufficient === false) insufficient += 1;
    else inconclusive += 1;
  }
  const decided = sufficient + insufficient;
  return {
    sufficient,
    insufficient,
    inconclusive,
    total: grades.length,
    sufficientRate: decided > 0 ? Math.round((sufficient / decided) * 100) / 100 : null,
  };
}

interface SourceFile {
  rel: string;
  abs: string;
  content: string;
  bytes: number;
}

/**
 * Load every source file the graph knows about into memory once. This is the
 * shared "file universe" both strategies operate over — equivalent to the set a
 * naive agent would see via `git ls-files`; using the graph's file nodes to
 * enumerate is a convenience, not a semantic advantage for the naive side.
 */
function loadSourceFiles(
  projectPath: string,
  fileNodes: Array<{ id: string; path?: string }>
): Map<string, SourceFile> {
  const files = new Map<string, SourceFile>();
  for (const node of fileNodes) {
    const rel = node.path;
    if (!rel) continue;
    if (!CODE_EXTENSIONS.has(path.extname(rel))) continue;
    const abs = path.join(projectPath, rel);
    let content: string;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      continue; // file node points at a path no longer on disk
    }
    files.set(rel, { rel, abs, content, bytes: Buffer.byteLength(content, 'utf8') });
  }
  return files;
}

/** Naive read of a set of whole files: tokens summed, one tool call per read. */
function naiveReadFiles(files: SourceFile[], searchCalls: number): StrategyMetrics {
  let m: StrategyMetrics = { tokens: 0, toolCalls: searchCalls, bytes: 0 };
  for (const f of files) {
    m = addMetrics(m, { tokens: estimateBenchTokens(f.content), toolCalls: 1, bytes: f.bytes });
  }
  return m;
}

function symbolFor(rel: string): string {
  return path.basename(rel, path.extname(rel));
}

/** Files that mention `symbol` as a whole word — the naive grep result. */
function grepFiles(
  sources: Map<string, SourceFile>,
  symbol: string,
  exclude: string
): SourceFile[] {
  if (symbol.length < 3) return [];
  const re = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const out: SourceFile[] = [];
  for (const f of sources.values()) {
    if (f.rel === exclude) continue;
    if (re.test(f.content)) out.push(f);
  }
  return out;
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'to',
  'of',
  'and',
  'or',
  'for',
  'in',
  'on',
  'is',
  'are',
  'has',
  'have',
  'not',
  'been',
  'yet',
  'where',
  'what',
  'how',
  'does',
  'new',
  'case',
  'when',
  'from',
  'disk',
  'add',
]);

function keywordsOf(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
    )
  );
}

/** Top-K files ranked by how many query keywords they contain — the naive keyword-search result. */
function keywordSearch(
  sources: Map<string, SourceFile>,
  query: string,
  topK: number
): SourceFile[] {
  const keywords = keywordsOf(query);
  const scored: Array<{ file: SourceFile; score: number }> = [];
  for (const f of sources.values()) {
    const lower = f.content.toLowerCase();
    let score = 0;
    for (const kw of keywords) if (lower.includes(kw)) score += 1;
    if (score > 0) scored.push({ file: f, score });
  }
  scored.sort((a, b) => b.score - a.score || a.file.rel.localeCompare(b.file.rel));
  return scored.slice(0, topK).map((s) => s.file);
}

/** Resolve a relative import specifier from `fromRel` to a project-relative source path. */
function resolveLocalImport(
  sources: Map<string, SourceFile>,
  fromRel: string,
  spec: string
): string | null {
  const baseDir = path.dirname(fromRel);
  const joined = path.normalize(path.join(baseDir, spec));
  const candidates = [
    joined,
    ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].map((e) => joined.replace(/\.js$/, '') + e),
    ...['.ts', '.tsx', '.js', '.jsx'].map((e) => joined + e),
    ...['index.ts', 'index.tsx', 'index.js'].map((f) => path.join(joined, f)),
  ];
  for (const c of candidates) {
    const norm = c.split(path.sep).join('/');
    if (sources.has(norm)) return norm;
  }
  return null;
}

function localImportsOf(sources: Map<string, SourceFile>, file: SourceFile): SourceFile[] {
  const specs = new Set<string>();
  const importRe = /(?:from\s+|require\(\s*)['"](\.[^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(file.content)) !== null) {
    specs.add(match[1]!);
  }
  const out: SourceFile[] = [];
  for (const spec of specs) {
    const resolved = resolveLocalImport(sources, file.rel, spec);
    if (resolved && resolved !== file.rel) {
      const sf = sources.get(resolved);
      if (sf) out.push(sf);
    }
  }
  return out;
}

/**
 * Run the graph token-savings benchmark against a project's knowledge graph.
 * Pure: returns a typed result, prints nothing, exits nothing.
 */
export async function runGraphBench(
  projectPath: string,
  opts: GraphBenchOptions = {}
): Promise<GraphBenchResult> {
  const top = opts.top ?? 5;
  const { loadGraphStore } = await import('../../mcp/utils/graph-loader.js');
  const store = await loadGraphStore(projectPath);

  const base: Omit<GraphBenchResult, 'ok' | 'message'> = {
    projectPath,
    generatedAt: new Date().toISOString(),
    comparator: {
      source: 'arXiv preprint 2603.27277 (codebase-memory-mcp)',
      tokenSavings: 10,
      toolCallSavings: 2.1,
      answerQuality: 0.83,
      note: 'The honest comparator across 31 real repos — NOT the 99.2% README figure from 5 hand-picked queries. Answer quality is not measured here (deferred slice, Refs #1271).',
    },
    scenarios: [],
    families: [],
    overall: {
      scenarios: 0,
      graph: emptyMetrics(),
      naive: emptyMetrics(),
      tokenSavings: 0,
      toolCallSavings: 0,
    },
    answerQuality: {
      status: 'skipped',
      advisory: true,
      note: 'Answer-quality axis not run (no graph to benchmark).',
    },
  };

  if (!store) {
    return {
      ok: false,
      message:
        'No knowledge graph found. Run `harness graph scan` first, then re-run the benchmark.',
      ...base,
    };
  }

  const fileNodes = store
    .findNodes({ type: 'file' })
    .filter((n): n is typeof n & { path: string } => typeof n.path === 'string');
  const sources = loadSourceFiles(projectPath, fileNodes);

  // Deterministic anchor ranking by neighbor degree (most connected first).
  const ranked = fileNodes
    .filter((n) => sources.has(n.path))
    .map((n) => ({
      node: n,
      degree: store.getNeighbors(n.id, 'both').length,
      outDegree: store.getNeighbors(n.id, 'outbound').length,
    }))
    .sort((a, b) => b.degree - a.degree || a.node.path.localeCompare(b.node.path));

  const byInbound = ranked.slice(0, top);
  const byOutbound = [...ranked]
    .sort((a, b) => b.outDegree - a.outDegree || a.node.path.localeCompare(b.node.path))
    .filter((r) => r.outDegree > 0)
    .slice(0, top);
  const byLargest = [...sources.values()].sort((a, b) => b.bytes - a.bytes).slice(0, top);

  const scenarios: ScenarioResult[] = [];
  // Retrieved payload text per scenario, kept so the (optional) answer-quality judge can
  // grade what each strategy actually surfaced. Keyed by scenario id.
  const payloads = new Map<string, { graphText: string; naiveText: string }>();

  const record = (
    fields: Omit<ScenarioResult, 'query' | 'quality'>,
    graphText: string,
    naiveText: string
  ): void => {
    const scenario: ScenarioResult = {
      ...fields,
      query: benchQueryFor(fields.family, fields.anchor),
    };
    scenarios.push(scenario);
    payloads.set(scenario.id, { graphText, naiveText });
  };

  // --- impact ---
  // `summary` mode is the context-scoping surface an agent surfaces into context
  // (impacted-file counts + highest-risk items). Detailed mode drills into the full
  // bidirectional 3-hop neighborhood and, on the most-connected anchors, is
  // catastrophically large — a documented finding, not the scoping path (see RESULTS.md).
  for (const r of byInbound) {
    const rel = r.node.path;
    const res = await handleGetImpact({ path: projectPath, filePath: rel, mode: 'summary' });
    const graphText = handlerText(res);
    const graph = metricsFromText(graphText, 1);
    const hits = grepFiles(sources, symbolFor(rel), rel);
    const naive = naiveReadFiles(hits, 1); // 1 grep + N reads
    record(
      { id: `impact:${rel}`, family: 'impact', anchor: rel, graph, naive },
      graphText,
      naiveTextOf(hits)
    );
  }

  // --- blast-radius ---
  for (const r of byInbound) {
    const rel = r.node.path;
    const res = await handleComputeBlastRadius({ path: projectPath, file: rel });
    const graphText = handlerText(res);
    const graph = metricsFromText(graphText, 1);
    const hits = grepFiles(sources, symbolFor(rel), rel);
    const naive = naiveReadFiles(hits, 1);
    record(
      { id: `blast-radius:${rel}`, family: 'blast-radius', anchor: rel, graph, naive },
      graphText,
      naiveTextOf(hits)
    );
  }

  // --- dependencies (query_graph depth 2) ---
  // `summary` mode is the scoping surface (node/edge counts + top connectors); detailed
  // mode serializes the full paginated subgraph (see the detailed-mode finding in RESULTS.md).
  for (const r of byOutbound) {
    const rel = r.node.path;
    const res = await handleQueryGraph({
      path: projectPath,
      rootNodeIds: [r.node.id],
      maxDepth: 2,
      mode: 'summary',
    });
    const graphText = handlerText(res);
    const graph = metricsFromText(graphText, 1);
    const anchorFile = sources.get(rel)!;
    const imports = localImportsOf(sources, anchorFile);
    const naive = naiveReadFiles([anchorFile, ...imports], 0); // reads only: 1 anchor + M imports
    record(
      { id: `dependencies:${rel}`, family: 'dependencies', anchor: rel, graph, naive },
      graphText,
      naiveTextOf([anchorFile, ...imports])
    );
  }

  // --- outline ---
  for (const f of byLargest) {
    const res = await handleCodeOutline({ path: f.abs });
    const graphText = handlerText(res);
    const graph = metricsFromText(graphText, 1);
    const naive = naiveReadFiles([f], 1); // 1 read of the whole file
    record(
      { id: `outline:${f.rel}`, family: 'outline', anchor: f.rel, graph, naive },
      graphText,
      naiveTextOf([f])
    );
  }

  // --- find-context ---
  for (const intent of FIND_CONTEXT_INTENTS) {
    const res = await handleFindContextFor({ path: projectPath, intent });
    const graphText = handlerText(res);
    const graph = metricsFromText(graphText, 1);
    const hits = keywordSearch(sources, intent, top);
    const naive = naiveReadFiles(hits, 1);
    record(
      { id: `find-context:${intent}`, family: 'find-context', anchor: intent, graph, naive },
      graphText,
      naiveTextOf(hits)
    );
  }

  // --- ask ---
  for (const question of ASK_QUESTIONS) {
    const res = await handleAskGraph({ path: projectPath, question });
    const graphText = handlerText(res);
    const graph = metricsFromText(graphText, 1);
    const hits = keywordSearch(sources, question, top);
    const naive = naiveReadFiles(hits, 1);
    record(
      { id: `ask:${question}`, family: 'ask', anchor: question, graph, naive },
      graphText,
      naiveTextOf(hits)
    );
  }

  // --- answer-quality axis (advisory; the comparator's "83%") ---
  const answerQuality = await judgeAnswerQuality(scenarios, payloads, opts);

  // Aggregate per family + overall.
  const familyMap = new Map<string, ScenarioResult[]>();
  for (const s of scenarios) {
    const list = familyMap.get(s.family) ?? [];
    list.push(s);
    familyMap.set(s.family, list);
  }

  const families: FamilyAggregate[] = [];
  let overallGraph = emptyMetrics();
  let overallNaive = emptyMetrics();
  for (const [family, list] of familyMap) {
    let g = emptyMetrics();
    let n = emptyMetrics();
    for (const s of list) {
      g = addMetrics(g, s.graph);
      n = addMetrics(n, s.naive);
    }
    families.push({
      family,
      scenarios: list.length,
      graph: g,
      naive: n,
      tokenSavings: ratio(n.tokens, g.tokens),
      toolCallSavings: ratio(n.toolCalls, g.toolCalls),
    });
    overallGraph = addMetrics(overallGraph, g);
    overallNaive = addMetrics(overallNaive, n);
  }

  return {
    ok: true,
    ...base,
    scenarios,
    families,
    overall: {
      scenarios: scenarios.length,
      graph: overallGraph,
      naive: overallNaive,
      tokenSavings: ratio(overallNaive.tokens, overallGraph.tokens),
      toolCallSavings: ratio(overallNaive.toolCalls, overallGraph.toolCalls),
    },
    answerQuality,
  };
}

/**
 * Run the answer-quality axis over the built scenarios. Advisory by construction — it
 * never fails the benchmark. Degrades honestly:
 * - no judge requested        → `skipped`.
 * - requested, none reachable → `inconclusive` (no fabricated score).
 * - judge present             → `measured`; a per-scenario grade that the judge could not
 *   decide is counted as inconclusive, never faked. Grades are attached to each scenario
 *   in place so a reviewer can trace bench → judge → score.
 */
async function judgeAnswerQuality(
  scenarios: ScenarioResult[],
  payloads: Map<string, { graphText: string; naiveText: string }>,
  opts: GraphBenchOptions
): Promise<AnswerQualityAxis> {
  if (!opts.judge) {
    return opts.judgeRequestedButUnavailable
      ? {
          status: 'inconclusive',
          advisory: true,
          note: 'Answer-quality axis requested (--judge) but no judge provider was reachable/configured (set ANTHROPIC_API_KEY or HARNESS_ANALYSIS_BASE_URL). The token and tool-call axes still stand.',
        }
      : {
          status: 'skipped',
          advisory: true,
          note: 'Answer-quality axis not run (pass --judge to grade retrieval sufficiency with an LLM judge). The comparator reports 83% on this axis; the objective axes here stand alone.',
        };
  }

  const judge = opts.judge;
  const graphGrades: QualityGrade[] = [];
  const naiveGrades: QualityGrade[] = [];
  for (const scenario of scenarios) {
    const payload = payloads.get(scenario.id) ?? { graphText: '', naiveText: '' };
    const graph = await judge.grade(scenario.query, 'graph', payload.graphText);
    const naive = await judge.grade(scenario.query, 'naive', payload.naiveText);
    scenario.quality = { graph, naive };
    graphGrades.push(graph);
    naiveGrades.push(naive);
  }

  return {
    status: 'measured',
    advisory: true,
    note: `Retrieval-sufficiency graded by an LLM judge over each strategy's payload (truncated to ${JUDGE_PAYLOAD_CHAR_BUDGET} chars before judging). Advisory: never fails the benchmark. Individual scenarios the judge could not decide are counted as inconclusive, never faked.`,
    graph: aggregateQuality(graphGrades),
    naive: aggregateQuality(naiveGrades),
  };
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatBenchReport(result: GraphBenchResult): string {
  const lines: string[] = [];
  lines.push('Graph token-savings benchmark (issue #1271)');
  lines.push(`Project: ${result.projectPath}`);
  lines.push(
    `Comparator target: ${result.comparator.tokenSavings}x fewer tokens, ${result.comparator.toolCallSavings}x fewer tool calls (${result.comparator.source})`
  );
  lines.push('');
  const pad = (s: string, w: number) => s.padEnd(w);
  lines.push(
    `${pad('Family', 16)}${pad('Scen', 6)}${pad('Graph tok', 12)}${pad('Naive tok', 12)}${pad('Tok×', 8)}${pad('Call×', 8)}`
  );
  lines.push('-'.repeat(62));
  for (const f of result.families) {
    lines.push(
      `${pad(f.family, 16)}${pad(String(f.scenarios), 6)}${pad(fmt(f.graph.tokens), 12)}${pad(fmt(f.naive.tokens), 12)}${pad(`${f.tokenSavings}x`, 8)}${pad(`${f.toolCallSavings}x`, 8)}`
    );
  }
  lines.push('-'.repeat(62));
  const o = result.overall;
  lines.push(
    `${pad('OVERALL', 16)}${pad(String(o.scenarios), 6)}${pad(fmt(o.graph.tokens), 12)}${pad(fmt(o.naive.tokens), 12)}${pad(`${o.tokenSavings}x`, 8)}${pad(`${o.toolCallSavings}x`, 8)}`
  );
  lines.push('');
  lines.push(
    `Tool calls: graph ${o.graph.toolCalls} vs naive ${o.naive.toolCalls} (${o.toolCallSavings}x fewer).`
  );
  lines.push('');
  lines.push(formatAnswerQuality(result.answerQuality));
  return lines.join('\n');
}

/** Human-readable answer-quality axis (advisory; the comparator's "83%"). */
export function formatAnswerQuality(axis: AnswerQualityAxis): string {
  const pct = (agg: QualityAggregate): string =>
    agg.sufficientRate === null
      ? 'n/a (no decidable grades)'
      : `${Math.round(agg.sufficientRate * 100)}% sufficient (${agg.sufficient}/${agg.sufficient + agg.insufficient} decided, ${agg.inconclusive} inconclusive)`;
  switch (axis.status) {
    case 'skipped':
      return 'Answer quality (comparator 83%): not run — pass --judge to grade retrieval sufficiency (advisory).';
    case 'inconclusive':
      return 'Answer quality (comparator 83%): INCONCLUSIVE — --judge requested but no judge provider reachable; token/tool-call axes still stand (advisory).';
    case 'measured':
      return [
        'Answer quality (comparator 83%) — advisory, retrieval-sufficiency judged by an LLM:',
        `  graph: ${axis.graph ? pct(axis.graph) : 'n/a'}`,
        `  naive: ${axis.naive ? pct(axis.naive) : 'n/a'}`,
      ].join('\n');
  }
}

interface BenchCliOptions {
  json?: boolean;
  out?: string;
  top: string;
  judge?: boolean;
  judgeModel?: string;
}

/** Parse `--top` into a positive anchor count, defaulting to 5. */
function parseTop(raw: string): number {
  const top = Number.parseInt(raw, 10);
  return Number.isFinite(top) && top > 0 ? top : 5;
}

/**
 * Resolve the answer-quality judge options from `--judge` / `--judge-model`. When `--judge`
 * is passed but no provider is reachable, returns the honest "requested but unavailable"
 * flag so the axis reports INCONCLUSIVE rather than a fabricated score.
 */
async function resolveJudgeOptions(
  opts: BenchCliOptions
): Promise<Pick<GraphBenchOptions, 'judge' | 'judgeRequestedButUnavailable'>> {
  if (!opts.judge) return {};
  const judge = await resolveBenchJudge(opts.judgeModel);
  return judge ? { judge } : { judgeRequestedButUnavailable: true };
}

/** Write (when `--out`) and print the bench result; exits non-zero on abstention. */
function emitBenchResult(result: GraphBenchResult, out: string | undefined, asJson: boolean): void {
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(path.resolve(out), JSON.stringify(result, null, 2) + '\n');
  }
  if (!result.ok) {
    console.error(result.message);
    process.exit(ExitCode.ZERO_DENOMINATOR);
  }
  console.log(asJson ? JSON.stringify(result, null, 2) : formatBenchReport(result));
}

export function createBenchCommand(): Command {
  return new Command('bench')
    .description('Measure token + tool-call savings of graph-scoped retrieval vs naive file reads')
    .option('--json', 'Emit the full machine-readable result as JSON')
    .option('--out <path>', 'Write the machine-readable result JSON to a file')
    .option('--top <n>', 'Anchors per structural family', '5')
    .option(
      '--judge',
      'Grade the answer-quality axis with an LLM judge (retrieval sufficiency; advisory). Requires ANTHROPIC_API_KEY or HARNESS_ANALYSIS_BASE_URL; degrades to INCONCLUSIVE if neither is set.'
    )
    .option('--judge-model <model>', 'Model override for the answer-quality judge')
    .action(async (opts: BenchCliOptions, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as { config?: string; json?: boolean };
      const projectPath = path.resolve(globalOpts.config ? path.dirname(globalOpts.config) : '.');
      // `--json` is also declared as a program-global option, which shadows the
      // subcommand flag; honor either so `graph bench --json` emits JSON.
      const asJson = opts.json === true || globalOpts.json === true;
      const judgeOpts = await resolveJudgeOptions(opts);
      const result = await runGraphBench(projectPath, { top: parseTop(opts.top), ...judgeOpts });
      emitBenchResult(result, opts.out, asJson);
    });
}
