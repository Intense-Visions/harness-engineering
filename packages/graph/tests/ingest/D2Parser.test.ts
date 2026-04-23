import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { D2Parser } from '../../src/ingest/D2Parser.js';

const FIXTURES_DIR = path.resolve(__dirname, '../__fixtures__/diagrams');

describe('D2Parser', () => {
  const parser = new D2Parser();

  describe('canParse()', () => {
    it('returns true for .d2 extension', () => {
      expect(parser.canParse('', '.d2')).toBe(true);
    });

    it('returns false for .mmd', () => {
      expect(parser.canParse('', '.mmd')).toBe(false);
    });

    it('returns false for .puml', () => {
      expect(parser.canParse('', '.puml')).toBe(false);
    });
  });

  describe('architecture diagram parsing', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DIR, 'architecture.d2'), 'utf-8');
    const result = parser.parse(content, 'architecture.d2');

    it('extracts 3 entities (server, db, cache) with labels', () => {
      expect(result.entities).toHaveLength(3);
      const ids = result.entities.map((e) => e.id);
      expect(ids).toContain('server');
      expect(ids).toContain('db');
      expect(ids).toContain('cache');

      const server = result.entities.find((e) => e.id === 'server');
      expect(server?.label).toBe('Web Server');

      const db = result.entities.find((e) => e.id === 'db');
      expect(db?.label).toBe('PostgreSQL');

      const cache = result.entities.find((e) => e.id === 'cache');
      expect(cache?.label).toBe('Redis');
    });

    it('extracts 3 connections with labels', () => {
      expect(result.relationships).toHaveLength(3);

      const queries = result.relationships.find((r) => r.label === 'queries');
      expect(queries).toBeDefined();
      expect(queries?.from).toBe('server');
      expect(queries?.to).toBe('db');

      const sessionLookup = result.relationships.find((r) => r.label === 'session lookup');
      expect(sessionLookup).toBeDefined();
      expect(sessionLookup?.from).toBe('server');
      expect(sessionLookup?.to).toBe('cache');

      const cacheMiss = result.relationships.find((r) => r.label === 'cache miss');
      expect(cacheMiss).toBeDefined();
      expect(cacheMiss?.from).toBe('cache');
      expect(cacheMiss?.to).toBe('db');
    });

    it('captures shape metadata (db has type cylinder)', () => {
      const db = result.entities.find((e) => e.id === 'db');
      expect(db?.type).toBe('cylinder');
    });

    it('sets metadata.format to d2', () => {
      expect(result.metadata.format).toBe('d2');
      expect(result.metadata.diagramType).toBe('declarative');
    });
  });

  describe('edge cases', () => {
    it('returns empty result for empty content', () => {
      const result = parser.parse('', 'empty.d2');
      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
      expect(result.metadata.format).toBe('d2');
      expect(result.metadata.diagramType).toBe('declarative');
    });

    it('handles entities without labels', () => {
      const content = 'mynode\nanothernode';
      const result = parser.parse(content, 'simple.d2');
      // Entities without explicit labels are not parsed as declarations
      // (D2 requires `id: label` syntax for our parser)
      expect(result.entities).toHaveLength(0);
    });
  });
});
