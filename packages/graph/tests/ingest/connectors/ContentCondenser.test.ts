import { describe, it, expect } from 'vitest';
import { condenseContent } from '../../../src/ingest/connectors/ContentCondenser.js';
import type {
  CondenserOptions,
  CondenserResult,
} from '../../../src/ingest/connectors/ContentCondenser.js';

describe('condenseContent', () => {
  describe('passthrough tier', () => {
    it('returns content unchanged when under maxLength', async () => {
      const result = await condenseContent('short text', { maxLength: 100 });
      expect(result).toEqual({
        content: 'short text',
        method: 'passthrough',
        originalLength: 10,
      });
    });

    it('returns content unchanged when exactly at maxLength', async () => {
      const text = 'a'.repeat(100);
      const result = await condenseContent(text, { maxLength: 100 });
      expect(result.method).toBe('passthrough');
      expect(result.content).toBe(text);
    });
  });

  describe('truncation tier', () => {
    it('truncates content over maxLength but under summarization threshold', async () => {
      const text = 'a'.repeat(150);
      const result = await condenseContent(text, { maxLength: 100 });
      // Default summarizationThreshold is 2x maxLength = 200
      // 150 > 100 but < 200, so truncate
      expect(result.method).toBe('truncated');
      expect(result.originalLength).toBe(150);
      expect(result.content.length).toBeLessThanOrEqual(101); // 100 + ellipsis
    });

    it('truncates at custom summarizationThreshold boundary', async () => {
      const text = 'a'.repeat(250);
      const result = await condenseContent(text, {
        maxLength: 100,
        summarizationThreshold: 300, // 250 < 300, so truncate not summarize
      });
      expect(result.method).toBe('truncated');
    });

    it('sanitizes content during truncation (strips injection tags)', async () => {
      const text = '<system>evil</system>' + 'a'.repeat(200);
      const result = await condenseContent(text, { maxLength: 100 });
      expect(result.content).not.toContain('<system>');
    });
  });

  describe('fallback tier (no model configured)', () => {
    it('falls back to truncation when over threshold but no model', async () => {
      const text = 'a'.repeat(300);
      const result = await condenseContent(text, { maxLength: 100 });
      // 300 >= 200 (2x maxLength) but no modelEndpoint, so fallback truncate
      expect(result.method).toBe('truncated');
      expect(result.originalLength).toBe(300);
      expect(result.content.length).toBeLessThanOrEqual(101);
    });

    it('never throws when model is unavailable', async () => {
      const text = 'a'.repeat(500);
      await expect(condenseContent(text, { maxLength: 100 })).resolves.toBeDefined();
    });
  });
});
