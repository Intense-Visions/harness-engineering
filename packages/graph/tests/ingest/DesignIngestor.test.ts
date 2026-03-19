// packages/graph/tests/ingest/DesignIngestor.test.ts
import * as path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { DesignIngestor } from '../../src/ingest/DesignIngestor.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/sample-project');

describe('DesignIngestor', () => {
  let store: GraphStore;
  let ingestor: DesignIngestor;

  beforeEach(() => {
    store = new GraphStore();
    ingestor = new DesignIngestor(store);
  });

  describe('ingestTokens', () => {
    it('creates design_token nodes for each token in tokens.json', async () => {
      const tokensPath = path.join(FIXTURE_DIR, 'design-system', 'tokens.json');
      const result = await ingestor.ingestTokens(tokensPath);

      expect(result.errors).toHaveLength(0);
      // 4 colors + 2 typography + 1 spacing = 7 tokens
      expect(result.nodesAdded).toBe(7);

      const tokenNodes = store.findNodes({ type: 'design_token' });
      expect(tokenNodes.length).toBe(7);
    });

    it('sets correct metadata on color tokens', async () => {
      const tokensPath = path.join(FIXTURE_DIR, 'design-system', 'tokens.json');
      await ingestor.ingestTokens(tokensPath);

      const primary = store.getNode('design_token:color.primary');
      expect(primary).not.toBeNull();
      expect(primary!.type).toBe('design_token');
      expect(primary!.name).toBe('color.primary');
      expect(primary!.metadata.tokenType).toBe('color');
      expect(primary!.metadata.value).toBe('#2563eb');
      expect(primary!.metadata.group).toBe('color');
      expect(primary!.metadata.description).toBe('Primary brand color');
    });

    it('sets correct metadata on typography tokens', async () => {
      const tokensPath = path.join(FIXTURE_DIR, 'design-system', 'tokens.json');
      await ingestor.ingestTokens(tokensPath);

      const display = store.getNode('design_token:typography.display');
      expect(display).not.toBeNull();
      expect(display!.metadata.tokenType).toBe('typography');
      expect(display!.metadata.value).toEqual({
        fontFamily: 'Instrument Serif',
        fontSize: '3rem',
        fontWeight: 400,
        lineHeight: 1.1,
      });
      expect(display!.metadata.group).toBe('typography');
    });

    it('returns empty result for missing file', async () => {
      const result = await ingestor.ingestTokens('/nonexistent/tokens.json');
      expect(result.nodesAdded).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error for invalid JSON', async () => {
      // Create a temp file with invalid JSON — use os.tmpdir
      const os = await import('node:os');
      const fs = await import('node:fs/promises');
      const tmpFile = path.join(os.tmpdir(), 'bad-tokens.json');
      await fs.writeFile(tmpFile, '{ invalid json }');
      const result = await ingestor.ingestTokens(tmpFile);
      expect(result.errors.length).toBeGreaterThan(0);
      await fs.unlink(tmpFile);
    });
  });

  describe('ingestDesignIntent', () => {
    it('creates an aesthetic_intent node from DESIGN.md', async () => {
      const designPath = path.join(FIXTURE_DIR, 'design-system', 'DESIGN.md');
      const result = await ingestor.ingestDesignIntent(designPath);

      expect(result.errors).toHaveLength(0);
      expect(result.nodesAdded).toBeGreaterThanOrEqual(1);

      const intentNodes = store.findNodes({ type: 'aesthetic_intent' });
      expect(intentNodes.length).toBe(1);

      const intent = intentNodes[0]!;
      expect(intent.metadata.style).toBe('Refined minimalism with editorial typography');
      expect(intent.metadata.tone).toBe('Professional but warm — not corporate sterile');
      expect(intent.metadata.differentiator).toBe('Generous whitespace + oversized serif headings');
      expect(intent.metadata.strictness).toBe('standard');
    });

    it('creates design_constraint nodes for each anti-pattern', async () => {
      const designPath = path.join(FIXTURE_DIR, 'design-system', 'DESIGN.md');
      await ingestor.ingestDesignIntent(designPath);

      const constraintNodes = store.findNodes({ type: 'design_constraint' });
      expect(constraintNodes.length).toBe(3); // 3 anti-patterns in fixture

      const names = constraintNodes.map((n) => n.name);
      expect(names).toContain('No system/default fonts in user-facing UI');
      expect(names).toContain('No purple-gradient-on-white hero sections');
      expect(names).toContain('No icon-only buttons without labels');
    });

    it('returns empty result for missing file', async () => {
      const result = await ingestor.ingestDesignIntent('/nonexistent/DESIGN.md');
      expect(result.nodesAdded).toBe(0);
    });
  });

  describe('ingestAll', () => {
    it('ingests both tokens and design intent from a design-system directory', async () => {
      const designDir = path.join(FIXTURE_DIR, 'design-system');
      const result = await ingestor.ingestAll(designDir);

      expect(result.errors).toHaveLength(0);
      // 7 tokens + 1 intent + 3 constraints = 11 nodes
      expect(result.nodesAdded).toBe(11);

      // Verify both types exist
      const tokenNodes = store.findNodes({ type: 'design_token' });
      expect(tokenNodes.length).toBe(7);

      const intentNodes = store.findNodes({ type: 'aesthetic_intent' });
      expect(intentNodes.length).toBe(1);

      const constraintNodes = store.findNodes({ type: 'design_constraint' });
      expect(constraintNodes.length).toBe(3);
    });
  });
});
