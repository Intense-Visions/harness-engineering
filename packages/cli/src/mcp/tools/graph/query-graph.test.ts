import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleQueryGraph, queryGraphDefinition } from './query-graph';
import { clearGraphStoreCache } from '../../utils/graph-loader.js';

/**
 * Observable-contract coverage for the `query_graph` MCP handler.
 *
 * These tests exercise the parts of the tool the handler itself owns — input
 * sanitization, the graph-not-found guard, and error formatting — rather than
 * ContextQL traversal internals (which have their own coverage). Every path
 * returns the MCP `{ content: [{ type: 'text', text }] }` envelope; failures
 * additionally carry `isError: true`.
 */

beforeEach(() => {
  clearGraphStoreCache();
});

describe('queryGraphDefinition', () => {
  it('declares the tool name and required inputs', () => {
    expect(queryGraphDefinition.name).toBe('query_graph');
    expect(queryGraphDefinition.inputSchema.required).toEqual(['path', 'rootNodeIds']);
    expect(queryGraphDefinition.inputSchema.properties.mode.enum).toEqual(['summary', 'detailed']);
  });
});

describe('handleQueryGraph — guard paths', () => {
  it('returns an error envelope when the path resolves to the filesystem root', async () => {
    const res = await handleQueryGraph({ path: '/', rootNodeIds: ['n1'] });
    expect(res.isError).toBe(true);
    const text = res.content[0]!.text;
    expect(text).toContain('Error:');
    expect(text).toContain('filesystem root');
  });

  it('returns the graph-not-found envelope when no graph exists for the project', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'query-graph-'));
    try {
      const res = await handleQueryGraph({ path: dir, rootNodeIds: ['n1'] });
      expect(res.isError).toBe(true);
      expect(res.content[0]!.text).toContain('No graph found');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('always returns a text content envelope', async () => {
    const res = await handleQueryGraph({ path: '/', rootNodeIds: [] });
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.content[0]!.type).toBe('text');
    expect(typeof res.content[0]!.text).toBe('string');
  });
});
