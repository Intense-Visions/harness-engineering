import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { uatSignoffDefinition, handleUatSignoff } from './uat-signoff.js';

type Result = Awaited<ReturnType<typeof handleUatSignoff>>;
const isErr = (r: Result): boolean => 'isError' in r && r.isError === true;
const firstText = (r: Result): string => r.content[0]?.text ?? '';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uat-signoff-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('uatSignoffDefinition', () => {
  it('is named uat_signoff and requires engagement/decision/signedOffBy', () => {
    expect(uatSignoffDefinition.name).toBe('uat_signoff');
    expect(uatSignoffDefinition.inputSchema.required).toEqual([
      'engagement',
      'decision',
      'signedOffBy',
    ]);
  });
});

describe('handleUatSignoff', () => {
  it('rejects a missing decision', async () => {
    const r = await handleUatSignoff({
      engagement: 'acme',
      // @ts-expect-error deliberately invalid to exercise validation
      decision: 'NOPE',
      signedOffBy: 'Dana',
      path: dir,
    });
    expect(isErr(r)).toBe(true);
  });

  it('records a human sign-off and persists a readable execution_outcome node', async () => {
    const r = await handleUatSignoff({
      engagement: 'acme-loyalty',
      decision: 'REJECTED',
      signedOffBy: 'Dana (client PO)',
      items: [
        { id: 'G1', disposition: 'ACCEPT' },
        { id: 'G2', disposition: 'REJECT', note: 'missing 404 path' },
      ],
      brdRefs: ['G1'],
      path: dir,
    });
    expect(isErr(r)).toBe(false);
    const payload = JSON.parse(firstText(r));
    expect(payload.recorded).toBe(true);
    expect(payload.result).toBe('failure');
    expect(payload.nodesAdded).toBe(1);
    expect(payload.outcomeId).toMatch(/^outcome:uat-signoff:acme-loyalty:/);

    // The node is actually written to disk and readable back through the graph.
    const { GraphStore, resolveGraphDir } = await import('@harness-engineering/graph');
    const store = new GraphStore();
    await store.load(resolveGraphDir(dir));
    const nodes = store.findNodes({ type: 'execution_outcome' });
    expect(nodes).toHaveLength(1);
    const node = nodes[0];
    if (!node) throw new Error('expected one execution_outcome node');
    expect(node.metadata.source).toBe('uat-signoff');
    expect(node.metadata.result).toBe('failure');
    expect(node.metadata.decision).toBe('REJECTED');
    expect(node.metadata.signedOffBy).toBe('Dana (client PO)');
  });
});
