// packages/cli/tests/mcp/tools/performance-wire.test.ts
//
// WIRE-LEVEL regression test for #2364. `performance.test.ts` calls
// `handleCheckPerformance` directly and asserts on what it RETURNS; a real MCP
// client never sees that object, because `mcp/server.ts` wraps every handler
// in `wrapWithCompaction`, which prefix-truncates the serialized response at a
// 4,000-token budget. Before the fix the handler returned the raw
// `EntropyReport`, whose FIRST key is `snapshot` (with full per-file ASTs):
// on this 5-file fixture the delivered text was cut mid-AST and
// `JSON.parse` threw, leaving `summary`/`complexity`/`coupling`/`sizeBudget`
// unreachable. Each row calls the real handler THROUGH the wrapper.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { wrapWithCompaction } from '../../../src/mcp/middleware/compaction';
import { handleCheckPerformance } from '../../../src/mcp/tools/performance';

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };
type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

const FIXTURE = path.join(__dirname, '../../fixtures/duplication-cli-project');
const TRUNCATING_HEADER = /^<!-- packed: structural\+truncate \| \d+→\d+ tokens /;

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-perf-wire-'));
  fs.cpSync(FIXTURE, tmp, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function deliver(input: Record<string, unknown>) {
  let raw: ToolResult | undefined;
  const capturing: ToolHandler = async (i) => {
    raw = (await handleCheckPerformance(i as never)) as ToolResult;
    return raw;
  };
  const delivered = await wrapWithCompaction('check_performance', capturing, {
    projectRoot: tmp,
  })(input);
  const text = delivered.content[0]!.text;
  const nl = text.indexOf('\n');
  return { raw: raw!, header: text.slice(0, nl), body: text.slice(nl + 1) };
}

// Which top-level analysis key each `type` variant must deliver.
const VARIANTS = [
  { type: undefined, keys: ['complexity', 'coupling', 'sizeBudget'] },
  { type: 'all', keys: ['complexity', 'coupling', 'sizeBudget'] },
  { type: 'structural', keys: ['complexity'] },
  { type: 'coupling', keys: ['coupling'] },
  { type: 'size', keys: ['sizeBudget'] },
] as const;

describe('check_performance over the wire (#2364)', () => {
  it.each(VARIANTS)('type=$type delivers parseable JSON with summary first', async (v) => {
    const { raw, header, body } = await deliver({
      path: tmp,
      ...(v.type !== undefined && { type: v.type }),
    });

    expect(raw.isError).toBeFalsy();
    // Proves the row went through the real compaction pipeline. (It does not
    // prove a cut happened: post-fix this fixture is ~2.4k tokens, under the
    // 4k budget. Pre-fix it was ~12.7k tokens and was cut mid-AST — that is
    // what makes the JSON.parse below a regression guard.)
    expect(header).toMatch(TRUNCATING_HEADER);

    // Throws — and fails the row — if compaction left unparseable JSON.
    const payload = JSON.parse(body);
    expect(Object.keys(payload)[0]).toBe('summary');
    expect(payload.summary).toBeTypeOf('object');
    for (const key of v.keys) {
      expect(payload, `${key} must survive compaction`).toHaveProperty(key);
    }
    expect(payload).toHaveProperty('timestamp');
    // ASTs are in-process parse trees no MCP caller can act on.
    const files = [payload.snapshot?.files ?? []].flat();
    for (const f of files) expect(f).not.toHaveProperty('ast');
  });

  it('the raw handler payload no longer carries per-file ASTs', async () => {
    const { raw } = await deliver({ path: tmp });
    const payload = JSON.parse(raw.content[0]!.text);
    expect(payload.snapshot.files.length).toBeGreaterThan(0);
    for (const f of payload.snapshot.files) expect(f).not.toHaveProperty('ast');
  });
});
