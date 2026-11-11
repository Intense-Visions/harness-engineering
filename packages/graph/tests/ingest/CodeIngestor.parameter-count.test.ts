import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';

// Issue #2384: parameterCount metadata must count declared parameters, not
// commas, and must see the whole parameter list.
const TS_SOURCE = [
  "export function stringDefault(root: string, include = '**/*.{ts,tsx}') {",
  '  return 0;',
  '}',
  'export function destructured({ alpha, beta, gamma }: Opts, next: () => void) {',
  '  return 0;',
  '}',
  'export function arrayDefault(xs = [1, 2, 3]) {',
  '  return 0;',
  '}',
  'export function arrowBeforeGeneric(cb = (x) => x, m: Map<string, number>, c: number) {',
  '  return 0;',
  '}',
  'export function trailingComma(a: number, b: number,) {',
  '  return 0;',
  '}',
  'export function multiLine(',
  '  a: string,',
  '  b = (y: number) => y,',
  '  c: Map<string, number>,',
  ') {',
  '  return 0;',
  '}',
  'export function noParams() {',
  '  return 0;',
  '}',
  'export class Svc {',
  '  run(',
  '    a: string,',
  "    b = 'x,y'",
  '  ): void {',
  '    return;',
  '  }',
  '}',
  '',
].join('\n');

const GO_SOURCE = [
  'package svc',
  '',
  'type Svc struct{}',
  '',
  'func (s *Svc) Handle(a int, b string, c map[string]int) error {',
  '  return nil',
  '}',
  '',
].join('\n');

const RUST_SOURCE = [
  "pub fn borrow<'a>(x: &'a str, y: &'a str) -> &'a str {",
  '    x',
  '}',
  '',
].join('\n');

describe('CodeIngestor — parameterCount (issue #2384)', () => {
  let dir: string;
  const store = new GraphStore();

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-ingestor-params-'));
    await fs.writeFile(path.join(dir, 'params.ts'), TS_SOURCE);
    await fs.writeFile(path.join(dir, 'svc.go'), GO_SOURCE);
    await fs.writeFile(path.join(dir, 'lib.rs'), RUST_SOURCE);
    await new CodeIngestor(store).ingest(dir);
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  function parameterCountOf(name: string): unknown {
    const node = [
      ...store.findNodes({ type: 'function' }),
      ...store.findNodes({ type: 'method' }),
    ].find((n) => n.name === name);
    expect(node, `node ${name}`).toBeDefined();
    return node!.metadata?.parameterCount;
  }

  it.each([
    ['stringDefault', 2],
    ['destructured', 2],
    ['arrayDefault', 1],
    ['arrowBeforeGeneric', 3],
    ['trailingComma', 2],
    ['multiLine', 3],
    ['noParams', 0],
    ['run', 2],
    ['Handle', 3],
    ['borrow', 2],
  ])('counts %s as %i parameters', (name, expected) => {
    expect(parameterCountOf(name)).toBe(expected);
  });
});
