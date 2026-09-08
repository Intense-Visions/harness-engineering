import { describe, it, expect } from 'vitest';
import { applyAgentEvent } from '../../../src/client/utils/agent-events';
import type {
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  StatusBlock,
  ToolUseBlock,
} from '../../../src/client/types/chat';
import type { AgentEventMessage } from '../../../src/client/types/orchestrator';

/**
 * Characterization tests for the agent-event → ContentBlock[] reducer.
 *
 * These assert the reducer's CURRENT observable behavior. Where that behavior
 * is surprising rather than obviously intended, the test name says so
 * explicitly ("...(current behavior)") so a future change to the reducer
 * surfaces as a deliberate decision rather than a silent regression.
 */

type AgentEvent = AgentEventMessage['event'];

// ── Event factories ─────────────────────────────────────────────────

/** A well-formed wire event: `content` is the declared `string | undefined`. */
function ev(type: string, content?: string): AgentEvent {
  return { type, timestamp: '2026-01-01T00:00:00.000Z', ...(content !== undefined && { content }) };
}

/**
 * An event whose `content` violates the declared `string` type. The
 * orchestrator forwards agent payloads verbatim, so non-string content does
 * reach the client; `resolveContent` exists precisely to absorb it. The cast
 * is the point of these tests, not an accident.
 */
function rawEv(type: string, content: unknown): AgentEvent {
  return { type, timestamp: '2026-01-01T00:00:00.000Z', content } as unknown as AgentEvent;
}

// ── Block factories ─────────────────────────────────────────────────

function text(t: string): TextBlock {
  return { kind: 'text', text: t };
}
function thinking(t: string): ThinkingBlock {
  return { kind: 'thinking', text: t };
}
function status(t: string): StatusBlock {
  return { kind: 'status', text: t };
}
function tool(name: string, extra: Partial<ToolUseBlock> = {}): ToolUseBlock {
  return { kind: 'tool_use', tool: name, ...extra };
}

/** Fold a sequence of events over a starting block list and return the result. */
function fold(initial: ContentBlock[], ...events: AgentEvent[]): ContentBlock[] {
  const blocks = [...initial];
  for (const e of events) applyAgentEvent(blocks, e);
  return blocks;
}

/** The literal banner the reducer substitutes for any rate_limit event. */
const RATE_LIMIT_TEXT = 'Rate limit — cooling down...';

describe('applyAgentEvent — reducer contract', () => {
  it('mutates the caller-supplied array in place rather than returning a new one', () => {
    const blocks: ContentBlock[] = [];
    const original = blocks;

    const returned = applyAgentEvent(blocks, ev('text', 'hello'));

    // Callers (useOrchestratorSocket, useStreamReplay) keep their own
    // reference and re-render from it, so the same array must carry the block.
    expect(returned).toBeUndefined();
    expect(original).toBe(blocks);
    expect(original).toEqual([text('hello')]);
  });

  it('preserves earlier blocks when a later event appends to the stream', () => {
    expect(fold([tool('Read', { args: 'a.ts' }), text('intro')], ev('status', 'working'))).toEqual([
      tool('Read', { args: 'a.ts' }),
      text('intro'),
      status('working'),
    ]);
  });
});

describe('applyAgentEvent — text events', () => {
  it('appends a text block when the stream is empty', () => {
    expect(fold([], ev('text', 'hello'))).toEqual([text('hello')]);
  });

  it('coalesces consecutive text events into a single block instead of one per chunk', () => {
    expect(fold([], ev('text', 'Hel'), ev('text', 'lo '), ev('text', 'world'))).toEqual([
      text('Hello world'),
    ]);
  });

  it('starts a new text block when the previous block is not text', () => {
    expect(fold([tool('Bash')], ev('text', 'done'))).toEqual([tool('Bash'), text('done')]);
  });

  it('replaces a trailing status block, so transient status never precedes the answer', () => {
    expect(fold([text('a'), status('Thinking...')], ev('text', 'answer'))).toEqual([
      text('a'),
      text('answer'),
    ]);
  });

  it('drops a trailing status even when the text content is empty (current behavior)', () => {
    // An empty text chunk still discards the status and leaves an empty text
    // block behind — the status is lost and an empty block is rendered.
    expect(fold([status('Thinking...')], ev('text', ''))).toEqual([text('')]);
  });

  it('coalesces into the previous text block without popping anything before it', () => {
    expect(fold([status('s'), text('a')], ev('text', 'b'))).toEqual([status('s'), text('ab')]);
  });
});

describe('applyAgentEvent — thought events', () => {
  it('appends a thinking block when the stream is empty', () => {
    expect(fold([], ev('thought', 'hmm'))).toEqual([thinking('hmm')]);
  });

  it('coalesces consecutive thought events into a single thinking block', () => {
    expect(fold([], ev('thought', 'first '), ev('thought', 'second'))).toEqual([
      thinking('first second'),
    ]);
  });

  it('starts a new thinking block when the previous block is text', () => {
    expect(fold([text('a')], ev('thought', 'hmm'))).toEqual([text('a'), thinking('hmm')]);
  });

  it('keeps a trailing status block, unlike a text event (current behavior)', () => {
    // A text event replaces a trailing status; a thought event does not —
    // the status stays visible above the thinking block. This asymmetry is
    // what the UI renders today, so it is pinned deliberately.
    expect(fold([status('Thinking...')], ev('thought', 'hmm'))).toEqual([
      status('Thinking...'),
      thinking('hmm'),
    ]);
  });

  it('does not merge thoughts across an intervening text block', () => {
    expect(fold([], ev('thought', 'a'), ev('text', 'x'), ev('thought', 'b'))).toEqual([
      thinking('a'),
      text('x'),
      thinking('b'),
    ]);
  });
});

describe('applyAgentEvent — call events', () => {
  it('splits "Calling tool(args)" into the tool name and its argument string', () => {
    expect(fold([], ev('call', 'Calling Bash(ls -la)'))).toEqual([
      tool('Bash', { args: 'ls -la' }),
    ]);
  });

  it('captures multi-line argument payloads verbatim', () => {
    expect(fold([], ev('call', 'Calling Write({\n  "path": "a.ts"\n})'))).toEqual([
      tool('Write', { args: '{\n  "path": "a.ts"\n}' }),
    ]);
  });

  it('records an empty args string for a no-argument call (current behavior)', () => {
    // A parsed call always carries an args string, even an empty one, so a
    // no-argument call is distinguishable from an unparsed one (which has no
    // args key at all — see the fallback test below).
    expect(fold([], ev('call', 'Calling Bash()'))).toEqual([tool('Bash', { args: '' })]);
  });

  it('splits on the last opening parenthesis when the args contain nested calls (current behavior)', () => {
    // The tool name absorbs everything up to the LAST "(" before whitespace,
    // so a nested call is mis-split. This is a latent parsing defect, pinned
    // here so a future fix is a visible, intentional change.
    expect(fold([], ev('call', 'Calling foo(bar(1), baz(2))'))).toEqual([
      tool('foo(bar', { args: '1), baz(2)' }),
    ]);
  });

  it('falls back to the raw content as the tool name when the pattern does not match', () => {
    expect(fold([], ev('call', 'Bash'))).toEqual([tool('Bash')]);
  });

  it('omits args entirely on the fallback path rather than setting an empty string', () => {
    const [block] = fold([], ev('call', 'Bash')) as [ToolUseBlock];

    expect(block).not.toHaveProperty('args');
  });

  it('does not match a tool name containing whitespace, keeping the whole line as the name', () => {
    expect(fold([], ev('call', 'Calling my tool(x)'))).toEqual([tool('Calling my tool(x)')]);
  });

  it('never coalesces calls — each call event is its own block', () => {
    expect(fold([], ev('call', 'Calling Read(a)'), ev('call', 'Calling Read(a)'))).toEqual([
      tool('Read', { args: 'a' }),
      tool('Read', { args: 'a' }),
    ]);
  });

  it('leaves a trailing status block in place ahead of the tool block (current behavior)', () => {
    expect(fold([status('Working...')], ev('call', 'Calling Read(a)'))).toEqual([
      status('Working...'),
      tool('Read', { args: 'a' }),
    ]);
  });
});

describe('applyAgentEvent — result events', () => {
  it('appends the result as its own text block', () => {
    expect(fold([], ev('result', 'all done'))).toEqual([text('all done')]);
  });

  it('does not coalesce into a preceding text block, unlike a text event (current behavior)', () => {
    // A result following streamed text produces a second adjacent text block
    // rather than extending the first, unlike a further text event would.
    expect(fold([text('streamed')], ev('result', 'final'))).toEqual([
      text('streamed'),
      text('final'),
    ]);
  });

  it('ignores an empty result instead of pushing an empty block', () => {
    expect(fold([text('a')], ev('result', ''))).toEqual([text('a')]);
  });

  it('ignores a result with no content field at all', () => {
    expect(fold([], ev('result'))).toEqual([]);
  });

  it('does not pop a trailing status block, unlike a text event (current behavior)', () => {
    expect(fold([status('Working...')], ev('result', 'final'))).toEqual([
      status('Working...'),
      text('final'),
    ]);
  });

  it('leaves a text block a later text event can still coalesce into', () => {
    expect(fold([], ev('result', 'final'), ev('text', ' addendum'))).toEqual([
      text('final addendum'),
    ]);
  });
});

describe('applyAgentEvent — rate_limit events', () => {
  it('pushes a fixed cooling-down banner', () => {
    expect(fold([], ev('rate_limit'))).toEqual([status(RATE_LIMIT_TEXT)]);
  });

  it('ignores any content carried by the event', () => {
    expect(fold([], ev('rate_limit', 'retry after 60s'))).toEqual([status(RATE_LIMIT_TEXT)]);
  });

  it('stacks a second banner rather than replacing the first (current behavior)', () => {
    // Unlike a `status` event, rate_limit pushes unconditionally, so repeated
    // rate limits accumulate duplicate banners.
    expect(fold([], ev('rate_limit'), ev('rate_limit'))).toEqual([
      status(RATE_LIMIT_TEXT),
      status(RATE_LIMIT_TEXT),
    ]);
  });
});

describe('applyAgentEvent — status events', () => {
  it('appends a status block when the previous block is not a status', () => {
    expect(fold([text('a')], ev('status', 'Working...'))).toEqual([
      text('a'),
      status('Working...'),
    ]);
  });

  it('replaces a trailing status instead of stacking, so only the latest shows', () => {
    expect(fold([], ev('status', 'Reading...'), ev('status', 'Writing...'))).toEqual([
      status('Writing...'),
    ]);
  });

  it('replaces rather than appends to the status text', () => {
    expect(fold([status('Reading...')], ev('status', 'Writing...'))).toEqual([
      status('Writing...'),
    ]);
  });

  it('pushes an empty status block for empty content (current behavior)', () => {
    expect(fold([], ev('status', ''))).toEqual([status('')]);
  });
});

describe('applyAgentEvent — turn_start events', () => {
  it('is a no-op on an empty stream', () => {
    expect(fold([], ev('turn_start'))).toEqual([]);
  });

  it('leaves existing blocks untouched even when it carries content', () => {
    expect(fold([text('a'), status('s')], ev('turn_start', 'ignored'))).toEqual([
      text('a'),
      status('s'),
    ]);
  });

  it('does not interrupt text coalescing across the turn boundary', () => {
    expect(fold([], ev('text', 'a'), ev('turn_start'), ev('text', 'b'))).toEqual([text('ab')]);
  });
});

describe('applyAgentEvent — unrecognized event types', () => {
  it('surfaces unknown-type content as a status block so nothing is silently dropped', () => {
    expect(fold([], ev('some_future_type', 'heads up'))).toEqual([status('heads up')]);
  });

  it('ignores an unknown type with empty content', () => {
    expect(fold([text('a')], ev('some_future_type', ''))).toEqual([text('a')]);
  });

  it('ignores an unknown type with no content field', () => {
    expect(fold([], ev('some_future_type'))).toEqual([]);
  });

  it('stacks unknown-type statuses rather than replacing (current behavior)', () => {
    // Unlike `status` events, consecutive unknown-type events do not collapse
    // into a single block — each one is rendered.
    expect(fold([], ev('mystery', 'one'), ev('mystery', 'two'))).toEqual([
      status('one'),
      status('two'),
    ]);
  });
});

describe('applyAgentEvent — non-string content payloads', () => {
  it('JSON-serializes object content', () => {
    expect(fold([], rawEv('text', { path: 'a.ts', lines: 3 }))).toEqual([
      text('{"path":"a.ts","lines":3}'),
    ]);
  });

  it('JSON-serializes array content', () => {
    expect(fold([], rawEv('text', [1, 'x']))).toEqual([text('[1,"x"]')]);
  });

  it('treats null content as empty rather than rendering the string "null"', () => {
    expect(fold([], rawEv('status', null))).toEqual([status('')]);
  });

  it('stringifies numeric content', () => {
    expect(fold([], rawEv('text', 42))).toEqual([text('42')]);
  });

  it('stringifies boolean content', () => {
    expect(fold([], rawEv('status', false))).toEqual([status('false')]);
  });

  it('treats null content on a result event as absent and pushes nothing', () => {
    expect(fold([], rawEv('result', null))).toEqual([]);
  });
});

describe('applyAgentEvent — realistic event sequence', () => {
  it('folds a full agent turn into the coalesced blocks the chat stream renders', () => {
    const blocks = fold(
      [],
      ev('turn_start'),
      ev('status', 'Starting...'),
      ev('thought', 'I should '),
      ev('thought', 'read the file.'),
      ev('call', 'Calling Read(src/index.ts)'),
      ev('status', 'Reading...'),
      ev('text', 'The file '),
      ev('text', 'exports one symbol.'),
      ev('result', 'Done.')
    );

    expect(blocks).toEqual([
      status('Starting...'),
      thinking('I should read the file.'),
      tool('Read', { args: 'src/index.ts' }),
      text('The file exports one symbol.'),
      text('Done.'),
    ]);
  });
});
