import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GraphStore, resolveGraphDir } from '@harness-engineering/graph';
import { handleGetImpact } from './get-impact.js';
import { handleComputeBlastRadius } from './compute-blast-radius.js';
import { handleGetCriticalPaths } from '../performance.js';
import { clearGraphStoreCache } from '../../utils/graph-loader.js';

/**
 * Issue #2253: get_critical_paths, compute_blast_radius and get_impact failed
 * with `The "paths[0]" argument must be of type string. Received undefined`
 * whenever the caller named the project root `projectPath` (or omitted it),
 * because each handler passed `input.path` straight into `path.resolve`.
 *
 * Every documented spelling of the project root must reach the graph: `path`,
 * `projectPath`, and none (the server's working directory).
 */

type Res = { content: Array<{ text: string }>; isError?: boolean };

let projectDir: string;

beforeEach(async () => {
  clearGraphStoreCache();
  projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'project-path-args-')));
  const store = new GraphStore();
  const fileNode = (id: string, p: string) => ({
    id,
    type: 'file' as const,
    name: p,
    path: p,
    metadata: {},
  });
  store.addNode(fileNode('file:a.ts', 'a.ts'));
  store.addNode(fileNode('file:b.ts', 'b.ts'));
  store.addEdge({ from: 'file:b.ts', to: 'file:a.ts', type: 'imports' });
  await store.save(resolveGraphDir(projectDir, 'write'));
  clearGraphStoreCache();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearGraphStoreCache();
  fs.rmSync(projectDir, { recursive: true, force: true });
});

function rootArgSpellings(): Array<[string, () => Record<string, string>]> {
  return [
    ['path', () => ({ path: projectDir })],
    ['projectPath', () => ({ projectPath: projectDir })],
    [
      'no root (defaults to cwd)',
      () => {
        vi.spyOn(process, 'cwd').mockReturnValue(projectDir);
        return {};
      },
    ],
  ];
}

function expectOk(res: Res): void {
  expect(res.content[0]!.text).not.toMatch(/paths\[0\]/);
  expect(res.isError, res.content[0]!.text).toBeFalsy();
}

describe('graph MCP tools accept every project-root spelling (#2253)', () => {
  describe.each(rootArgSpellings())('root given as %s', (_label, root) => {
    it('get_impact resolves filePath against the graph', async () => {
      const res = (await handleGetImpact({ ...root(), filePath: 'a.ts' } as never)) as Res;
      expectOk(res);
      expect(JSON.parse(res.content[0]!.text).targetNodeId).toBe('file:a.ts');
    });

    it('compute_blast_radius resolves file against the graph', async () => {
      const res = (await handleComputeBlastRadius({ ...root(), file: 'a.ts' } as never)) as Res;
      expectOk(res);
      expect(JSON.parse(res.content[0]!.text).sourceNodeId).toBe('file:a.ts');
    });

    it('get_critical_paths runs the resolver', async () => {
      const res = (await handleGetCriticalPaths(root() as never)) as Res;
      expectOk(res);
    });
  });

  it('a non-string root is rejected with an actionable message, not a Node paths[0] error', async () => {
    const res = (await handleGetImpact({ path: 42, filePath: 'a.ts' } as never)) as Res;
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).not.toMatch(/paths\[0\]/);
    expect(res.content[0]!.text).toMatch(/project root/i);
  });
});
