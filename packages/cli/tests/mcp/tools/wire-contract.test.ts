// packages/cli/tests/mcp/tools/wire-contract.test.ts
//
// WIRE-LEVEL contract tests (#2315). Every other file in this directory calls
// a tool handler directly and asserts on what it RETURNS. A real MCP client
// never sees that object: `mcp/server.ts` wraps every handler in
// `wrapWithCompaction` (`mcp/middleware/compaction.ts`), which runs the
// structural pass (drops empty values, COLLAPSES single-element arrays to the
// bare element, squeezes whitespace inside strings) and then prefix-truncates
// at a 4,000-token budget. Each row below calls the REAL handler THROUGH that
// wrapper against a small fixture and pins what a caller actually receives:
//
//   (a) the delivered text opens with the `<!-- packed: ... -->` header and,
//       for a JSON tool, the body after the first newline is `JSON.parse`-able;
//   (b) the keys a caller acts on survive compaction;
//   (c) where the structural pass collapses a one-element array to a scalar,
//       that wire shape is pinned as-is. Characterized, not endorsed: a caller
//       indexing `[0]` on these fields reads the first CHARACTER of a string
//       or `undefined` on an object.
//
// `deliver` captures the handler's own (pre-middleware) result from the same
// call, so each collapse row also proves the collapse is the middleware's
// doing, not the handler's.
//
// Not covered here, deliberately: `check_performance`. On a 5-file fixture its
// payload is ~51KB with `snapshot.files[].ast` first, and the delivered text
// is truncated mid-AST into unparseable JSON — the defect #2315 describes for
// `detect_entropy`. That is a parked fork, not a characterization to pin.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { wrapWithCompaction } from '../../../src/mcp/middleware/compaction';
import { handleValidateProject } from '../../../src/mcp/tools/validate';
import { handleCheckDependencies } from '../../../src/mcp/tools/architecture';
import { handleCheckDocs } from '../../../src/mcp/tools/docs';
import { handleCodeOutline, handleCodeSearch } from '../../../src/mcp/tools/code-nav';
import { handleManageState } from '../../../src/mcp/tools/state';
import { handleRunSkill } from '../../../src/mcp/tools/skill';
import { handleRunSecurityScan } from '../../../src/mcp/tools/security';
import { handleAssessProject } from '../../../src/mcp/tools/assess-project';
import { handleInsightsSummary } from '../../../src/mcp/tools/insights-summary';
import {
  handleQueryGraph,
  handleGetImpact,
  handleGetRelationships,
} from '../../../src/mcp/tools/graph/index.js';

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };
type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

const FIXTURES = path.join(__dirname, '../../fixtures');

/** Header the default (lossy) pipeline stamps on every delivered response. */
const TRUNCATING_HEADER = /^<!-- packed: structural\+truncate \| \d+→\d+ tokens /;
/** Header for LOSSLESS_ONLY_TOOLS — structural pass only, never truncated. */
const LOSSLESS_HEADER = /^<!-- packed: structural \| \d+→\d+ tokens /;

interface Delivery {
  /** What the handler returned, before the middleware touched it. */
  raw: ToolResult;
  /** What the MCP client receives. */
  delivered: ToolResult;
  header: string;
  body: string;
}

/**
 * Invoke `handler` exactly as the server does — through `wrapWithCompaction`
 * — and split the delivered first text item into its packed header and body.
 */
async function deliver(
  tool: string,
  handler: (input: never) => Promise<ToolResult>,
  input: Record<string, unknown>,
  projectRoot: string
): Promise<Delivery> {
  let raw: ToolResult | undefined;
  const capturing: ToolHandler = async (i) => {
    raw = await (handler as unknown as ToolHandler)(i);
    return raw;
  };
  const delivered = await wrapWithCompaction(tool, capturing, { projectRoot })(input);
  const text = delivered.content[0]!.text;
  const nl = text.indexOf('\n');
  return { raw: raw!, delivered, header: text.slice(0, nl), body: text.slice(nl + 1) };
}

/** `deliver` for a JSON-emitting tool: also parses both sides. */
async function deliverJson(
  tool: string,
  handler: (input: never) => Promise<ToolResult>,
  input: Record<string, unknown>,
  projectRoot: string
) {
  const d = await deliver(tool, handler, input, projectRoot);
  return {
    ...d,
    rawPayload: JSON.parse(d.raw.content[0]!.text),
    // Throws — and fails the row — if compaction left unparseable JSON.
    payload: JSON.parse(d.body),
  };
}

/**
 * Pin the structural pass's one-element-array collapse (`cleanArray` in
 * `core/src/compaction/strategies/structural.ts`) for one field: the handler
 * emitted `[x]`, the client receives the bare (cleaned) `x`.
 */
function expectCollapsed(raw: unknown, wire: unknown, field: string): void {
  expect(raw, `${field}: fixture should make the handler emit a one-element array`).toHaveLength(1);
  expect(
    Array.isArray(wire),
    `${field}: a one-element array should arrive on the wire collapsed to its element`
  ).toBe(false);
}

let tmp: string;

function copyFixture(name: string): string {
  fs.cpSync(path.join(FIXTURES, name), tmp, { recursive: true });
  return tmp;
}

function write(rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
  fs.writeFileSync(path.join(tmp, rel), content);
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-wire-contract-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ── core tier ────────────────────────────────────────────────────────

describe('validate_project over the wire', () => {
  it('delivers verdict + checks, with a single error collapsed to a string', async () => {
    const root = copyFixture('valid-project');
    const { header, payload, rawPayload } = await deliverJson(
      'validate_project',
      handleValidateProject,
      { path: root },
      root
    );

    expect(header).toMatch(TRUNCATING_HEADER);
    expect(payload.valid).toBe(false);
    expect(payload.checks).toEqual({ config: 'pass', structure: 'skipped', agentsMap: 'fail' });
    // The handler emits `errors: [msg]`; the client receives `errors: msg`.
    expectCollapsed(rawPayload.errors, payload.errors, 'errors');
    expect(payload.errors).toBeTypeOf('string');
    expect(payload.errors).toContain('AGENTS.md missing sections');
  });
});

describe('check_dependencies over the wire', () => {
  it('delivers a layer violation, collapsed from a one-element array to an object', async () => {
    write(
      'harness.config.json',
      JSON.stringify({
        version: 1,
        rootDir: '.',
        layers: [
          { name: 'types', pattern: 'src/types/**', allowedDependencies: [] },
          { name: 'domain', pattern: 'src/domain/**', allowedDependencies: ['types'] },
        ],
      })
    );
    write('src/domain/order.ts', 'export interface Order { id: string }\n');
    write(
      'src/types/id.ts',
      "import type { Order } from '../domain/order';\nexport type Id = Order['id'];\n"
    );

    const { header, payload, rawPayload } = await deliverJson(
      'check_dependencies',
      handleCheckDependencies,
      { path: tmp },
      tmp
    );

    expect(header).toMatch(TRUNCATING_HEADER);
    expect(payload.valid).toBe(false);
    expectCollapsed(rawPayload.violations, payload.violations, 'violations');
    expect(payload.violations).toMatchObject({
      fromLayer: 'types',
      toLayer: 'domain',
      reason: 'WRONG_LAYER',
      line: 1,
    });
    expect(payload.violations.file).toMatch(/src[\\/]types[\\/]id\.ts$/);
  });
});

describe('check_docs over the wire', () => {
  it('delivers coverage with the lone undocumented file and gap as scalars', async () => {
    const root = copyFixture('valid-project');
    const { header, payload, rawPayload } = await deliverJson(
      'check_docs',
      handleCheckDocs,
      { path: root },
      root
    );

    expect(header).toMatch(TRUNCATING_HEADER);
    expect(payload.coveragePercentage).toBe(0);
    expectCollapsed(rawPayload.undocumented, payload.undocumented, 'undocumented');
    expect(payload.undocumented).toBe('index.ts');
    expect(payload.gaps).toEqual({
      file: 'index.ts',
      suggestedSection: 'Module Exports',
      importance: 'high',
    });
  });
});

/** Minimal saved graph: index.ts contains hello, imports utils, documented by an ADR. */
async function writeGraph(dir: string): Promise<void> {
  const { GraphStore } = await import('@harness-engineering/graph');
  const store = new GraphStore();
  const file = (p: string) => ({
    id: `file:${p}`,
    type: 'file' as const,
    name: path.basename(p),
    path: p,
    metadata: {},
  });
  store.addNode(file('src/index.ts'));
  store.addNode(file('src/utils.ts'));
  store.addNode({
    id: 'fn:hello',
    type: 'function',
    name: 'hello',
    path: 'src/index.ts',
    metadata: {},
  });
  store.addNode({
    id: 'adr:001',
    type: 'adr',
    name: 'Use TypeScript',
    metadata: { status: 'accepted' },
  });
  store.addEdge({ from: 'file:src/index.ts', to: 'fn:hello', type: 'contains' });
  store.addEdge({ from: 'file:src/index.ts', to: 'file:src/utils.ts', type: 'imports' });
  store.addEdge({ from: 'adr:001', to: 'file:src/index.ts', type: 'documents' });
  await store.save(path.join(dir, '.harness', 'graph'));
}

describe('query_graph over the wire', () => {
  it('delivers nodes/edges as arrays and keeps falsy pagination flags', async () => {
    await writeGraph(tmp);
    const { header, payload } = await deliverJson(
      'query_graph',
      handleQueryGraph,
      { path: tmp, rootNodeIds: ['file:src/index.ts'] },
      tmp
    );

    expect(header).toMatch(TRUNCATING_HEADER);
    expect(payload.nodes.map((n: { id: string }) => n.id)).toEqual([
      'file:src/index.ts',
      'fn:hello',
      'file:src/utils.ts',
    ]);
    expect(payload.edges).toHaveLength(2);
    // `false` and `0` are retained by the structural pass — only null,
    // undefined, '' and empty containers are dropped. A caller paging on
    // `hasMore` / `truncated` can rely on them being present.
    expect(payload.pagination.hasMore).toBe(false);
    expect(payload.truncated).toBe(false);
    expect(payload.stats.pruned).toBe(0);
  });
});

describe('get_impact over the wire', () => {
  it('delivers the single doc hit as an object and drops the empty tests group', async () => {
    await writeGraph(tmp);
    const { header, payload, rawPayload } = await deliverJson(
      'get_impact',
      handleGetImpact,
      { path: tmp, nodeId: 'file:src/index.ts' },
      tmp
    );

    expect(header).toMatch(TRUNCATING_HEADER);
    expect(payload.targetNodeId).toBe('file:src/index.ts');
    expect(payload.impact.code.map((n: { id: string }) => n.id)).toEqual([
      'fn:hello',
      'file:src/utils.ts',
    ]);
    // One doc: an array of one from the handler, the bare node on the wire.
    expectCollapsed(rawPayload.impact.docs, payload.impact.docs, 'impact.docs');
    expect(payload.impact.docs).toMatchObject({ id: 'adr:001', type: 'adr' });
    // No tests: `[]` from the handler, no key at all on the wire.
    expect(rawPayload.impact.tests).toEqual([]);
    expect(Object.keys(payload.impact).sort()).toEqual(['code', 'docs']);
  });
});

describe('manage_state over the wire', () => {
  it('delivers a loaded handoff losslessly, single-item lists collapsed', async () => {
    const save = await handleManageState({
      path: tmp,
      action: 'save-handoff',
      handoff: {
        timestamp: '2026-11-10T00:00:00.000Z',
        fromSkill: 'harness-planning',
        phase: 'PLAN',
        summary: 'planned  the   wire contract',
        completed: ['write fixture'],
        pending: ['assert header', 'assert body'],
      },
    });
    expect(save.isError).toBeFalsy();

    const { header, payload, rawPayload } = await deliverJson(
      'manage_state',
      handleManageState,
      { path: tmp, action: 'load-handoff' },
      tmp
    );

    // manage_state is a LOSSLESS_ONLY tool: structural pass, never truncated.
    expect(header).toMatch(LOSSLESS_HEADER);
    expect(payload).toMatchObject({ fromSkill: 'harness-planning', phase: 'PLAN' });
    expect(payload.pending).toEqual(['assert header', 'assert body']);
    expectCollapsed(rawPayload.completed, payload.completed, 'completed');
    expect(payload.completed).toBe('write fixture');
    // Whitespace runs inside string values are squeezed even on this path.
    expect(payload.summary).toBe('planned the wire contract');
  });
});

describe('run_skill over the wire', () => {
  it('delivers a skill far over the token budget byte-for-byte, untruncated', async () => {
    const { header, body, raw } = await deliver(
      'run_skill',
      handleRunSkill,
      { skill: 'fleet-command', path: tmp },
      tmp
    );
    const rawText = raw.content[0]!.text;

    // Guard the fixture: ~4 chars/token, so this is several budgets' worth.
    // If the skill shrinks under the budget this row stops proving anything.
    expect(
      rawText.length,
      'fixture precondition: fleet-command SKILL.md must stay well over the 4,000-token budget'
    ).toBeGreaterThan(4 * 4000 * 2);
    expect(header).toMatch(LOSSLESS_HEADER);
    // Non-JSON passes the structural pass unchanged.
    expect(body).toBe(rawText);
  });
});

describe('code_search over the wire', () => {
  it('delivers the plain-text match list with file:line locators intact', async () => {
    const root = copyFixture('duplication-cli-project');
    const { header, body } = await deliver(
      'code_search',
      handleCodeSearch,
      { query: 'accumulateBeta', directory: path.join(root, 'src') },
      root
    );

    expect(header).toMatch(TRUNCATING_HEADER);
    expect(body).toMatch(/^Search: "accumulateBeta" — \d+ match/);
    expect(body).toMatch(/beta\.ts:6 \[function\] accumulateBeta/);
  });
});

describe('code_outline over the wire', () => {
  it('delivers outlines as one whitespace-squeezed string plus pagination', async () => {
    const root = copyFixture('duplication-cli-project');
    const { header, payload, rawPayload } = await deliverJson(
      'code_outline',
      handleCodeOutline,
      { path: path.join(root, 'src') },
      root
    );

    expect(header).toMatch(TRUNCATING_HEADER);
    expect(payload.pagination).toMatchObject({ total: 5, hasMore: false });
    // The handler's outline is multi-line tree text; the structural pass
    // squeezes every whitespace run in a string, so the client gets it on ONE
    // line. Symbols and `:line` anchors survive; the line layout does not.
    expect(rawPayload.outlines, 'handler outline should be multi-line').toContain('\n');
    expect(
      payload.outlines,
      'structural pass should squeeze newlines out of strings'
    ).not.toContain('\n');
    expect(payload.outlines).toContain('export function accumulateBeta(');
    expect(payload.outlines).toMatch(/solo\.ts \(\d+ lines\) └── export function bumpSolo/);
  });
});

describe('insights_summary over the wire', () => {
  it('delivers every report section a caller reads', async () => {
    const root = copyFixture('valid-project');
    const { header, payload } = await deliverJson(
      'insights_summary',
      handleInsightsSummary,
      { path: root },
      root
    );

    expect(header).toMatch(TRUNCATING_HEADER);
    expect(payload.project.root).toBe(root);
    expect(Object.keys(payload)).toEqual(
      expect.arrayContaining(['generatedAt', 'health', 'entropy', 'decay', 'attention'])
    );
    // Zero counts survive the structural pass (only empty values are dropped),
    // so a caller can read them without an existence check.
    expect(payload.entropy).toEqual({
      driftCount: expect.any(Number),
      deadFiles: expect.any(Number),
      deadExports: expect.any(Number),
    });
    expect(payload.health.passed).toBeTypeOf('boolean');
  });
});

// ── standard tier ────────────────────────────────────────────────────

describe('run_security_scan over the wire', () => {
  it('delivers the single finding as an object and the summary counts', async () => {
    const root = copyFixture('security-findings');
    const { header, payload, rawPayload } = await deliverJson(
      'run_security_scan',
      handleRunSecurityScan,
      { path: root },
      root
    );

    expect(header).toMatch(TRUNCATING_HEADER);
    expect(payload.summary).toEqual({ errors: 1, warnings: 0, info: 0 });
    expectCollapsed(rawPayload.findings, payload.findings, 'findings');
    expect(payload.findings).toMatchObject({
      ruleId: 'SEC-SEC-002',
      severity: 'error',
      line: 3,
      // `references: ['CWE-798']` nests the same collapse one level down.
      references: 'CWE-798',
    });
  });
});

describe('assess_project over the wire', () => {
  it('delivers the verdict and every named check with its pass flag', async () => {
    const root = copyFixture('valid-project');
    const { header, payload } = await deliverJson(
      'assess_project',
      handleAssessProject,
      { path: root },
      root
    );

    expect(header).toMatch(TRUNCATING_HEADER);
    expect(payload.healthy).toBe(false);
    const byName = Object.fromEntries(
      payload.checks.map((c: { name: string; passed: boolean }) => [c.name, c])
    );
    // `lint` is also present but its outcome depends on the host toolchain.
    expect(Object.keys(byName)).toEqual(
      expect.arrayContaining(['validate', 'deps', 'docs', 'entropy', 'security', 'perf'])
    );
    expect(byName.validate).toMatchObject({ passed: false, issueCount: 1 });
    expect(byName.validate.topIssue).toContain('AGENTS.md missing sections');
    expect(byName.deps.passed).toBe(true);
  });
});

describe('get_relationships over the wire', () => {
  it('delivers the full neighbourhood as arrays', async () => {
    await writeGraph(tmp);
    const { header, payload } = await deliverJson(
      'get_relationships',
      handleGetRelationships,
      { path: tmp, nodeId: 'file:src/index.ts' },
      tmp
    );

    expect(header).toMatch(TRUNCATING_HEADER);
    expect(payload).toMatchObject({ nodeId: 'file:src/index.ts', direction: 'both', depth: 1 });
    expect(payload.nodes.map((n: { id: string }) => n.id).sort()).toEqual([
      'adr:001',
      'file:src/index.ts',
      'file:src/utils.ts',
      'fn:hello',
    ]);
    expect(payload.edges).toHaveLength(3);
    // Empty `metadata: {}` is dropped from each node; non-empty survives.
    const adr = payload.nodes.find((n: { id: string }) => n.id === 'adr:001');
    expect(adr.metadata).toEqual({ status: 'accepted' });
    const hello = payload.nodes.find((n: { id: string }) => n.id === 'fn:hello');
    expect('metadata' in hello).toBe(false);
  });
});
