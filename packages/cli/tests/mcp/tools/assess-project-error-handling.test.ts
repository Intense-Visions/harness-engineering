/**
 * Tests for parseToolResponse — the extracted helper that guards against
 * isError responses and non-JSON text from sub-tool handlers.
 *
 * Direct unit tests (no mocking needed) since the helper is a pure function.
 */
import { describe, it, expect } from 'vitest';
import { parseToolResponse } from '../../../src/mcp/tools/assess-project';

describe('parseToolResponse', () => {
  describe('isError guard', () => {
    it('returns error with message when result has isError: true', () => {
      const result = {
        content: [{ type: 'text', text: 'Error: config not found' }],
        isError: true as const,
      };
      const out = parseToolResponse(result, 'validate');
      expect('error' in out).toBe(true);
      if ('error' in out) {
        expect(out.error.name).toBe('validate');
        expect(out.error.passed).toBe(false);
        expect(out.error.issueCount).toBe(1);
        expect(out.error.topIssue).toBe('Error: config not found');
      }
    });

    it('uses fallback message when content is empty', () => {
      const result = { content: [], isError: true as const };
      const out = parseToolResponse(result, 'entropy');
      expect('error' in out).toBe(true);
      if ('error' in out) {
        expect(out.error.topIssue).toBe('entropy check failed');
      }
    });

    it('preserves check name in error result', () => {
      const result = {
        content: [{ type: 'text', text: 'Error: boom' }],
        isError: true as const,
      };
      for (const name of ['validate', 'deps', 'docs', 'entropy', 'security']) {
        const out = parseToolResponse(result, name);
        expect('error' in out).toBe(true);
        if ('error' in out) expect(out.error.name).toBe(name);
      }
    });
  });

  describe('JSON.parse resilience', () => {
    it('returns error with raw text when content is not valid JSON', () => {
      const result = {
        content: [{ type: 'text', text: 'not json {{{' }],
      };
      const out = parseToolResponse(result, 'docs');
      expect('error' in out).toBe(true);
      if ('error' in out) {
        expect(out.error.name).toBe('docs');
        expect(out.error.passed).toBe(false);
        expect(out.error.topIssue).toBe('not json {{{');
      }
    });

    it('returns error with fallback when content text is undefined', () => {
      const result = {
        content: [{ type: 'text', text: undefined as unknown as string }],
      };
      const out = parseToolResponse(result, 'security');
      // undefined gets passed to JSON.parse which throws, and the fallback kicks in
      expect('error' in out).toBe(true);
      if ('error' in out) {
        expect(out.error.topIssue).toContain('security');
      }
    });

    it('does not contain SyntaxError message in topIssue', () => {
      const result = {
        content: [{ type: 'text', text: 'Could not parse config file' }],
      };
      const out = parseToolResponse(result, 'entropy');
      expect('error' in out).toBe(true);
      if ('error' in out) {
        expect(out.error.topIssue).not.toContain('Unexpected token');
        expect(out.error.topIssue).toBe('Could not parse config file');
      }
    });
  });

  describe('happy path', () => {
    it('returns parsed JSON when content is valid', () => {
      const result = {
        content: [{ type: 'text', text: '{"valid":true,"errors":[]}' }],
      };
      const out = parseToolResponse(result, 'validate');
      expect('parsed' in out).toBe(true);
      if ('parsed' in out) {
        expect(out.parsed).toEqual({ valid: true, errors: [] });
      }
    });

    it('returns empty object when content array is empty', () => {
      const result = { content: [] as Array<{ type: string; text: string }> };
      const out = parseToolResponse(result, 'deps');
      expect('parsed' in out).toBe(true);
      if ('parsed' in out) {
        expect(out.parsed).toEqual({});
      }
    });

    it('does not treat non-error result with isError absent as error', () => {
      const result = {
        content: [{ type: 'text', text: '{"findings":[]}' }],
      };
      const out = parseToolResponse(result, 'security');
      expect('parsed' in out).toBe(true);
    });
  });
});
