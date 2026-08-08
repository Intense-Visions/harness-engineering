import { describe, it, expect } from 'vitest';
import { parseCodexNotifyPayload } from '../../src/hooks/session-retrospect-core.js';

/**
 * Unit tests for the shared Codex notify payload parser. This helper is the
 * single source of truth for the ~12-line payload contract shared by the
 * `harness hooks run session-retrospect-codex` command and the copied
 * `session-retrospect-codex.js` support script, so they cannot drift.
 */
describe('parseCodexNotifyPayload', () => {
  it('parses valid JSON with thread-id and cwd', () => {
    const raw = JSON.stringify({ 'thread-id': 't-123', cwd: '/some/project' });
    expect(parseCodexNotifyPayload(raw)).toEqual({ sessionId: 't-123', cwd: '/some/project' });
  });

  it('falls back to "unknown" when thread-id is missing', () => {
    const raw = JSON.stringify({ cwd: '/some/project' });
    const parsed = parseCodexNotifyPayload(raw);
    expect(parsed?.sessionId).toBe('unknown');
    expect(parsed?.cwd).toBe('/some/project');
  });

  it('falls back to process.cwd() when cwd is missing', () => {
    const raw = JSON.stringify({ 'thread-id': 't-1' });
    expect(parseCodexNotifyPayload(raw)?.cwd).toBe(process.cwd());
  });

  it('falls back to process.cwd() when cwd is empty', () => {
    const raw = JSON.stringify({ 'thread-id': 't-1', cwd: '' });
    expect(parseCodexNotifyPayload(raw)?.cwd).toBe(process.cwd());
  });

  it('returns null for a non-string raw', () => {
    // @ts-expect-error intentionally passing a non-string
    expect(parseCodexNotifyPayload(undefined)).toBeNull();
    // @ts-expect-error intentionally passing a non-string
    expect(parseCodexNotifyPayload(42)).toBeNull();
  });

  it('returns null for an empty or whitespace-only raw', () => {
    expect(parseCodexNotifyPayload('')).toBeNull();
    expect(parseCodexNotifyPayload('   ')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseCodexNotifyPayload('not json')).toBeNull();
  });

  it('returns null for valid JSON that is not an object', () => {
    expect(parseCodexNotifyPayload('42')).toBeNull();
    expect(parseCodexNotifyPayload('null')).toBeNull();
    expect(parseCodexNotifyPayload('"a string"')).toBeNull();
  });
});
