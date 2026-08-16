import { describe, it, expect } from 'vitest';
import { extractFencedJsonPayload } from './fenced-json.js';

describe('extractFencedJsonPayload', () => {
  it('extracts the body of a plain single ```json fence', () => {
    const raw = '```json\n{ "tier": "polish", "message": "tighten this" }\n```';
    const payload = extractFencedJsonPayload(raw);
    expect(JSON.parse(payload)).toEqual({ tier: 'polish', message: 'tighten this' });
  });

  it('extracts a bare ``` fence without the json info-string', () => {
    const raw = '```\n{ "message": "hi" }\n```';
    expect(JSON.parse(extractFencedJsonPayload(raw))).toEqual({ message: 'hi' });
  });

  it('parses bare (unfenced) JSON', () => {
    const raw = '{ "message": "no fence here" }';
    expect(JSON.parse(extractFencedJsonPayload(raw))).toEqual({ message: 'no fence here' });
  });

  it('returns the literal null sentinel unwrapped', () => {
    expect(extractFencedJsonPayload('```json\nnull\n```')).toBe('null');
    expect(extractFencedJsonPayload('null')).toBe('null');
  });

  // Regression for issue #1369: a finding whose `message` contains a ``` fence
  // must be parsed, not silently dropped by a lazy match truncating at the
  // INNER fence.
  it('parses a finding whose message value itself contains a ``` fence', () => {
    const message =
      'Prefer a guard clause. Replace:\n```ts\nif (x) { ... }\n```\nwith an early return.';
    const raw = '```json\n' + JSON.stringify({ tier: 'polish', message }, null, 2) + '\n```';
    const parsed = JSON.parse(extractFencedJsonPayload(raw)) as Record<string, unknown>;
    expect(parsed.tier).toBe('polish');
    expect(parsed.message).toBe(message);
  });

  it('handles an inner fence with a json info-string inside the message', () => {
    const message = 'Bad config:\n```json\n{ "a": 1 }\n```\nUse an array instead.';
    const raw = '```json\n' + JSON.stringify({ message }) + '\n```';
    const parsed = JSON.parse(extractFencedJsonPayload(raw)) as Record<string, unknown>;
    expect(parsed.message).toBe(message);
  });

  // The greedy "match to the last closing fence" fix would merge these two
  // blocks into one invalid blob and lose BOTH. The extractor must return the
  // FIRST complete value, leaving the second recoverable — two remain two.
  it('does not merge two separate fenced JSON blocks', () => {
    const raw = '```json\n{ "message": "first" }\n```\n\n```json\n{ "message": "second" }\n```';
    const first = extractFencedJsonPayload(raw);
    expect(JSON.parse(first)).toEqual({ message: 'first' });

    // The second block is not fused into the first, and is independently
    // recoverable from the remainder of the response.
    const afterFirst = raw.slice(raw.indexOf(first) + first.length);
    expect(JSON.parse(extractFencedJsonPayload(afterFirst))).toEqual({ message: 'second' });
  });

  it('ignores braces that appear inside string values', () => {
    const raw = '```json\n{ "message": "a } close brace and { open in text" }\n```';
    expect(JSON.parse(extractFencedJsonPayload(raw))).toEqual({
      message: 'a } close brace and { open in text',
    });
  });

  it('ignores escaped quotes when tracking string boundaries', () => {
    const raw = '```json\n{ "message": "he said \\"hi\\" then }" }\n```';
    expect(JSON.parse(extractFencedJsonPayload(raw))).toEqual({
      message: 'he said "hi" then }',
    });
  });

  it('extracts a top-level JSON array', () => {
    const raw = '```json\n[ { "a": 1 }, { "b": 2 } ]\n```';
    expect(JSON.parse(extractFencedJsonPayload(raw))).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
