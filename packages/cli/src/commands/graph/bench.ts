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

/**
 * Reproducible graph token-savings benchmark (issue #1271).
 *
 * Measures two objective, deterministic axes — tokens and tool calls — for
 * graph-scoped retrieval (the real shipped MCP tool handlers) versus the naive
 * file-by-file exploration a graph-less agent is forced into. Answer quality
 * (the comparator's "83%" axis) needs an LLM judge and is a deferred slice
 * (Refs #1271); it is intentionally not measured here.
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

export interface ScenarioResult {
  id: string;
  family: string;
  anchor: string;
  graph: StrategyMetrics;
  naive: StrategyMetrics;
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
}

export interface GraphBenchOptions {
  top?: number;
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

  // --- impact ---
  // `summary` mode is the context-scoping surface an agent surfaces into context
  // (impacted-file counts + highest-risk items). Detailed mode drills into the full
  // bidirectional 3-hop neighborhood and, on the most-connected anchors, is
  // catastrophically large — a documented finding, not the scoping path (see RESULTS.md).
  for (const r of byInbound) {
    const rel = r.node.path;
    const res = await handleGetImpact({ path: projectPath, filePath: rel, mode: 'summary' });
    const graph = metricsFromText(handlerText(res), 1);
    const hits = grepFiles(sources, symbolFor(rel), rel);
    const naive = naiveReadFiles(hits, 1); // 1 grep + N reads
    scenarios.push({ id: `impact:${rel}`, family: 'impact', anchor: rel, graph, naive });
  }

  // --- blast-radius ---
  for (const r of byInbound) {
    const rel = r.node.path;
    const res = await handleComputeBlastRadius({ path: projectPath, file: rel });
    const graph = metricsFromText(handlerText(res), 1);
    const hits = grepFiles(sources, symbolFor(rel), rel);
    const naive = naiveReadFiles(hits, 1);
    scenarios.push({
      id: `blast-radius:${rel}`,
      family: 'blast-radius',
      anchor: rel,
      graph,
      naive,
    });
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
    const graph = metricsFromText(handlerText(res), 1);
    const anchorFile = sources.get(rel)!;
    const imports = localImportsOf(sources, anchorFile);
    const naive = naiveReadFiles([anchorFile, ...imports], 0); // reads only: 1 anchor + M imports
    scenarios.push({
      id: `dependencies:${rel}`,
      family: 'dependencies',
      anchor: rel,
      graph,
      naive,
    });
  }

  // --- outline ---
  for (const f of byLargest) {
    const res = await handleCodeOutline({ path: f.abs });
    const graph = metricsFromText(handlerText(res), 1);
    const naive = naiveReadFiles([f], 1); // 1 read of the whole file
    scenarios.push({ id: `outline:${f.rel}`, family: 'outline', anchor: f.rel, graph, naive });
  }

  // --- find-context ---
  for (const intent of FIND_CONTEXT_INTENTS) {
    const res = await handleFindContextFor({ path: projectPath, intent });
    const graph = metricsFromText(handlerText(res), 1);
    const hits = keywordSearch(sources, intent, top);
    const naive = naiveReadFiles(hits, 1);
    scenarios.push({
      id: `find-context:${intent}`,
      family: 'find-context',
      anchor: intent,
      graph,
      naive,
    });
  }

  // --- ask ---
  for (const question of ASK_QUESTIONS) {
    const res = await handleAskGraph({ path: projectPath, question });
    const graph = metricsFromText(handlerText(res), 1);
    const hits = keywordSearch(sources, question, top);
    const naive = naiveReadFiles(hits, 1);
    scenarios.push({ id: `ask:${question}`, family: 'ask', anchor: question, graph, naive });
  }

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
  lines.push('Answer quality (comparator 83%) is not measured here — deferred slice (Refs #1271).');
  return lines.join('\n');
}

export function createBenchCommand(): Command {
  return new Command('bench')
    .description('Measure token + tool-call savings of graph-scoped retrieval vs naive file reads')
    .option('--json', 'Emit the full machine-readable result as JSON')
    .option('--out <path>', 'Write the machine-readable result JSON to a file')
    .option('--top <n>', 'Anchors per structural family', '5')
    .action(async (opts: { json?: boolean; out?: string; top: string }, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as { config?: string };
      const projectPath = path.resolve(globalOpts.config ? path.dirname(globalOpts.config) : '.');
      const top = Number.parseInt(opts.top, 10);
      const result = await runGraphBench(projectPath, {
        top: Number.isFinite(top) && top > 0 ? top : 5,
      });

      if (opts.out) {
        fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
        fs.writeFileSync(path.resolve(opts.out), JSON.stringify(result, null, 2) + '\n');
      }

      if (!result.ok) {
        console.error(result.message);
        process.exit(ExitCode.ZERO_DENOMINATOR);
      }

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatBenchReport(result));
      }
    });
}
