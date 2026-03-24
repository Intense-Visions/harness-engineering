import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { handleAskGraph, askGraphDefinition } from '../../../src/mcp/tools/graph.js';

let tmpDir: string;

async function createTestGraph(dir: string) {
  const { GraphStore } = await import('@harness-engineering/graph');
  const store = new GraphStore();

  store.addNode({
    id: 'file:src/index.ts',
    type: 'file',
    name: 'index.ts',
    path: 'src/index.ts',
    metadata: {},
  });
  store.addNode({
    id: 'file:src/utils.ts',
    type: 'file',
    name: 'utils.ts',
    path: 'src/utils.ts',
    metadata: {},
  });
  store.addNode({
    id: 'fn:hello',
    type: 'function',
    name: 'hello',
    path: 'src/index.ts',
    metadata: {},
  });
  store.addNode({
    id: 'class:UserService',
    type: 'class',
    name: 'UserService',
    path: 'src/index.ts',
    metadata: {},
  });

  store.addEdge({ from: 'file:src/index.ts', to: 'fn:hello', type: 'contains' });
  store.addEdge({ from: 'file:src/index.ts', to: 'class:UserService', type: 'contains' });
  store.addEdge({ from: 'file:src/index.ts', to: 'file:src/utils.ts', type: 'imports' });

  const graphDir = path.join(dir, '.harness', 'graph');
  await store.save(graphDir);
  return store;
}

function parseResult(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ask-graph-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── Definition tests ──────────────────────────────────────────────

describe('ask_graph definition', () => {
  it('has correct name', () => {
    expect(askGraphDefinition.name).toBe('ask_graph');
  });

  it('requires path and question', () => {
    expect(askGraphDefinition.inputSchema.required).toEqual(['path', 'question']);
  });

  it('has path and question properties', () => {
    const props = askGraphDefinition.inputSchema.properties;
    expect(props).toHaveProperty('path');
    expect(props).toHaveProperty('question');
    expect(props.path.type).toBe('string');
    expect(props.question.type).toBe('string');
  });

  it('description mentions natural language', () => {
    expect(askGraphDefinition.description).toContain('natural language');
  });
});

// ── Handler tests ─────────────────────────────────────────────────

describe('handleAskGraph', () => {
  it('returns AskGraphResult with all expected fields', async () => {
    await createTestGraph(tmpDir);
    const result = await handleAskGraph({
      path: tmpDir,
      question: 'what is UserService?',
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data).toHaveProperty('intent');
    expect(data).toHaveProperty('intentConfidence');
    expect(data).toHaveProperty('entities');
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('data');
    expect(typeof data.summary).toBe('string');
    expect(data.summary.length).toBeGreaterThan(0);
  });

  it('returns error when graph does not exist', async () => {
    const result = await handleAskGraph({
      path: tmpDir,
      question: 'what is UserService?',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No graph found');
  });

  it('handles impact questions', async () => {
    await createTestGraph(tmpDir);
    const result = await handleAskGraph({
      path: tmpDir,
      question: 'what breaks if I change UserService?',
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.intent).toBe('impact');
  });

  it('handles find questions', async () => {
    await createTestGraph(tmpDir);
    const result = await handleAskGraph({
      path: tmpDir,
      question: 'where is the hello function?',
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.intent).toBe('find');
  });

  it('handles anomaly questions', async () => {
    await createTestGraph(tmpDir);
    const result = await handleAskGraph({
      path: tmpDir,
      question: 'what looks wrong?',
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.intent).toBe('anomaly');
  });

  it('returns suggestions for ambiguous questions', async () => {
    await createTestGraph(tmpDir);
    const result = await handleAskGraph({
      path: tmpDir,
      question: 'hmm',
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.suggestions).toBeDefined();
    expect(data.suggestions.length).toBeGreaterThan(0);
  });
});
