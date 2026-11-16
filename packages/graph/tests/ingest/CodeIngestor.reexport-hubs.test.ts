import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';
import { ContextQL } from '../../src/query/ContextQL.js';

/**
 * #2079 class 1 — coverage reached through a NON-index re-export hub.
 *
 * Mirrors the real packages/graph topology the test-advisor flagged as
 * untested:
 *
 *   parsers/mermaid.ts ──► parsers/index.ts      (an index barrel, pure re-exports)
 *                               │
 *                               ▼
 *                         DiagramParser.ts       (a plain-named module that only re-exports)
 *                               ▲
 *                         tests/DiagramParser.test.ts
 *
 * Before the fix `export … from` statements emitted no `imports` edge, so a
 * pure re-export module was a dead end and the test could never be reached
 * from the parser files — the advisor reported them as coverage gaps.
 */

const FILES: Record<string, string> = {
  'src/parsers/types.ts': 'export interface DiagramFormatParser { parse(s: string): unknown }\n',
  'src/parsers/mermaid.ts': 'export class MermaidParser { parse(s: string) { return s; } }\n',
  'src/parsers/d2.ts': 'export class D2Parser { parse(s: string) { return s; } }\n',
  'src/parsers/plantuml.ts': 'export class PlantUmlParser { parse(s: string) { return s; } }\n',
  'src/parsers/index.ts': [
    "export type { DiagramFormatParser } from './types.js';",
    "export { MermaidParser } from './mermaid.js';",
    "export { D2Parser } from './d2.js';",
    "export * from './plantuml.js';",
    '',
  ].join('\n'),
  'src/DiagramParser.ts': [
    "export type { DiagramFormatParser } from './parsers/index.js';",
    "export {\n  MermaidParser,\n  D2Parser,\n  PlantUmlParser,\n} from './parsers/index.js';",
    '',
  ].join('\n'),
  'tests/DiagramParser.test.ts': [
    "import { MermaidParser, D2Parser, PlantUmlParser } from '../src/DiagramParser.js';",
    'export const all = [MermaidParser, D2Parser, PlantUmlParser];',
    '',
  ].join('\n'),
  // Same target reached by a value import AND a type-only re-export.
  'src/mixed.ts': [
    "import { MermaidParser } from './parsers/mermaid.js';",
    "export type { MermaidParser as M } from './parsers/mermaid.js';",
    'export const p = new MermaidParser();',
    '',
  ].join('\n'),
  // Positive control: genuinely untested — nothing imports or re-exports it.
  'src/orphan.ts': 'export function orphan() { return 1; }\n',
  // Re-export cycle: must not hang ingestion or traversal.
  'src/cycle-a.ts': "export * from './cycle-b.js';\nexport const a = 1;\n",
  'src/cycle-b.ts': "export * as fromA from './cycle-a.js';\nexport const b = 2;\n",
  'tests/cycle.test.ts': "import { b } from '../src/cycle-b.js';\nexport const x = b;\n",
};

let root: string;
let store: GraphStore;

/** Test files reachable from `file`, the same traversal shape get_impact uses. */
function reachableTests(file: string, maxDepth = 3): string[] {
  const result = new ContextQL(store).execute({
    rootNodeIds: [`file:${file}`],
    bidirectional: true,
    maxDepth,
    includeEdges: ['imports'],
  });
  return result.nodes
    .filter((n) => n.type === 'file' && /\.test\.ts$/.test(n.path ?? n.id))
    .map((n) => (n.path ?? n.id).replace(/^file:/, ''))
    .sort();
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'reexport-hubs-'));
  for (const [rel, content] of Object.entries(FILES)) {
    const abs = path.join(root, ...rel.split('/'));
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
  store = new GraphStore();
  await new CodeIngestor(store).ingest(root);
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('CodeIngestor re-export edges (#2079)', () => {
  it('emits an imports edge for each `export … from` in an index barrel', () => {
    const targets = store
      .getEdges({ from: 'file:src/parsers/index.ts', type: 'imports' })
      .map((e) => e.to)
      .sort();
    expect(targets).toEqual([
      'file:src/parsers/d2.ts',
      'file:src/parsers/mermaid.ts',
      'file:src/parsers/plantuml.ts',
      'file:src/parsers/types.ts',
    ]);
  });

  it('emits an imports edge for a multi-line re-export in a non-index hub', () => {
    const edges = store.getEdges({ from: 'file:src/DiagramParser.ts', type: 'imports' });
    expect(edges.map((e) => e.to)).toContain('file:src/parsers/index.ts');
    expect(edges.every((e) => e.metadata?.reexport === true)).toBe(true);
  });

  it('keeps importType within the constraint union for re-exports', () => {
    const typeOnly = store
      .getEdges({ from: 'file:src/parsers/index.ts', type: 'imports' })
      .find((e) => e.to === 'file:src/parsers/types.ts');
    expect(typeOnly?.metadata?.importType).toBe('type-only');
  });

  it('folds an import and a type-only re-export of one target into a static re-export edge', () => {
    const edges = store.getEdges({ from: 'file:src/mixed.ts', type: 'imports' });
    expect(edges).toHaveLength(1);
    expect(edges[0]!.metadata).toMatchObject({ importType: 'static', reexport: true });
  });

  it.each(['mermaid', 'd2', 'plantuml'])(
    'reaches the hub test from parsers/%s.ts through the two-hop re-export chain',
    (name) => {
      expect(reachableTests(`src/parsers/${name}.ts`)).toContain('tests/DiagramParser.test.ts');
    }
  );

  it('still reports a genuinely untested file as untested (positive control)', () => {
    expect(reachableTests('src/orphan.ts')).toEqual([]);
  });

  it('terminates on a re-export cycle and attributes both members', () => {
    expect(
      store.getEdges({ from: 'file:src/cycle-a.ts', type: 'imports' }).map((e) => e.to)
    ).toEqual(['file:src/cycle-b.ts']);
    expect(
      store.getEdges({ from: 'file:src/cycle-b.ts', type: 'imports' }).map((e) => e.to)
    ).toEqual(['file:src/cycle-a.ts']);
    expect(reachableTests('src/cycle-a.ts')).toEqual(['tests/cycle.test.ts']);
  });
});
