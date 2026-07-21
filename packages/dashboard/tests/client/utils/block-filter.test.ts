import { describe, it, expect } from 'vitest';
import {
  isStreamBlock,
  filterStreamBlocks,
  extractTodosFromBlocks,
} from '../../../src/client/utils/block-filter';
import type { ContentBlock } from '../../../src/client/types/chat';

function toolUse(tool: string, args?: string): ContentBlock {
  return { kind: 'tool_use', tool, args };
}

describe('isStreamBlock', () => {
  it('filters out status blocks', () => {
    expect(isStreamBlock({ kind: 'status', text: 'thinking' })).toBe(false);
  });

  it('filters out task-related tool_use blocks', () => {
    for (const tool of [
      'TaskCreate',
      'TaskUpdate',
      'TaskList',
      'TaskGet',
      'TaskOutput',
      'TaskStop',
      'TodoWrite',
    ]) {
      expect(isStreamBlock(toolUse(tool))).toBe(false);
    }
  });

  it('keeps non-task tool_use blocks', () => {
    expect(isStreamBlock(toolUse('Bash', '{"cmd":"ls"}'))).toBe(true);
  });

  it('keeps text and thinking blocks', () => {
    expect(isStreamBlock({ kind: 'text', text: 'hello' })).toBe(true);
    expect(isStreamBlock({ kind: 'thinking', text: 'hmm' })).toBe(true);
  });
});

describe('filterStreamBlocks', () => {
  it('returns only the blocks that belong in the stream', () => {
    const blocks: ContentBlock[] = [
      { kind: 'text', text: 'hi' },
      { kind: 'status', text: 'busy' },
      toolUse('TaskCreate', '{"subject":"a"}'),
      toolUse('Read', '{}'),
      { kind: 'thinking', text: 'planning' },
    ];

    const result = filterStreamBlocks(blocks);

    expect(result).toEqual([
      { kind: 'text', text: 'hi' },
      toolUse('Read', '{}'),
      { kind: 'thinking', text: 'planning' },
    ]);
  });

  it('does not mutate the input array', () => {
    const blocks: ContentBlock[] = [{ kind: 'status', text: 'x' }];
    const snapshot = [...blocks];
    filterStreamBlocks(blocks);
    expect(blocks).toEqual(snapshot);
  });

  it('returns an empty array when everything is filtered out', () => {
    const blocks: ContentBlock[] = [{ kind: 'status', text: 'x' }, toolUse('TodoWrite', '{}')];
    expect(filterStreamBlocks(blocks)).toHaveLength(0);
  });
});

describe('extractTodosFromBlocks', () => {
  it('returns no todos when there are no task blocks', () => {
    const blocks: ContentBlock[] = [{ kind: 'text', text: 'hi' }, toolUse('Bash', '{"cmd":"ls"}')];
    expect(extractTodosFromBlocks(blocks)).toHaveLength(0);
  });

  it('registers a todo from a TaskCreate block with an index-based id', () => {
    const blocks: ContentBlock[] = [
      toolUse('TaskCreate', JSON.stringify({ subject: 'Write docs' })),
    ];

    expect(extractTodosFromBlocks(blocks)).toEqual([
      { id: 'task-1', text: 'Write docs', completed: false },
    ]);
  });

  it('assigns sequential index-based ids to multiple TaskCreate blocks', () => {
    const blocks: ContentBlock[] = [
      toolUse('TaskCreate', JSON.stringify({ subject: 'First' })),
      toolUse('TaskCreate', JSON.stringify({ subject: 'Second' })),
    ];

    expect(extractTodosFromBlocks(blocks)).toEqual([
      { id: 'task-1', text: 'First', completed: false },
      { id: 'task-2', text: 'Second', completed: false },
    ]);
  });

  it('ignores a TaskCreate block missing a subject', () => {
    const blocks: ContentBlock[] = [
      toolUse('TaskCreate', JSON.stringify({ description: 'no subject' })),
    ];
    expect(extractTodosFromBlocks(blocks)).toHaveLength(0);
  });

  it('ignores a TaskCreate block with no args', () => {
    const blocks: ContentBlock[] = [toolUse('TaskCreate')];
    expect(extractTodosFromBlocks(blocks)).toHaveLength(0);
  });

  it('marks a matching todo completed via TaskUpdate (prefixed task id)', () => {
    const blocks: ContentBlock[] = [
      toolUse('TaskCreate', JSON.stringify({ subject: 'First' })),
      toolUse('TaskUpdate', JSON.stringify({ taskId: '1', status: 'completed' })),
    ];

    expect(extractTodosFromBlocks(blocks)).toEqual([
      { id: 'task-1', text: 'First', completed: true },
    ]);
  });

  it('does not complete anything when TaskUpdate targets an unknown id', () => {
    const blocks: ContentBlock[] = [
      toolUse('TaskCreate', JSON.stringify({ subject: 'First' })),
      toolUse('TaskUpdate', JSON.stringify({ taskId: '99', status: 'completed' })),
    ];

    expect(extractTodosFromBlocks(blocks)).toEqual([
      { id: 'task-1', text: 'First', completed: false },
    ]);
  });

  it('does not complete a todo when TaskUpdate status is not completed', () => {
    const blocks: ContentBlock[] = [
      toolUse('TaskCreate', JSON.stringify({ subject: 'First' })),
      toolUse('TaskUpdate', JSON.stringify({ taskId: '1', status: 'in_progress' })),
    ];

    expect(extractTodosFromBlocks(blocks)[0].completed).toBe(false);
  });

  it('upserts every todo carried by a TodoWrite payload', () => {
    const blocks: ContentBlock[] = [
      toolUse(
        'TodoWrite',
        JSON.stringify({
          todos: [
            { id: 't1', content: 'Alpha', status: 'pending' },
            { id: 't2', content: 'Beta', status: 'completed' },
          ],
        })
      ),
    ];

    expect(extractTodosFromBlocks(blocks)).toEqual([
      { id: 't1', text: 'Alpha', completed: false },
      { id: 't2', text: 'Beta', completed: true },
    ]);
  });

  it('lets a later TodoWrite overwrite an earlier entry with the same id', () => {
    const blocks: ContentBlock[] = [
      toolUse(
        'TodoWrite',
        JSON.stringify({ todos: [{ id: 't1', content: 'Old', status: 'pending' }] })
      ),
      toolUse(
        'TodoWrite',
        JSON.stringify({ todos: [{ id: 't1', content: 'New', status: 'completed' }] })
      ),
    ];

    expect(extractTodosFromBlocks(blocks)).toEqual([{ id: 't1', text: 'New', completed: true }]);
  });

  it('skips malformed JSON args without throwing', () => {
    const blocks: ContentBlock[] = [
      toolUse('TaskCreate', '{not valid json'),
      toolUse('TaskUpdate', '{also bad'),
      toolUse('TodoWrite', 'nope'),
    ];
    expect(extractTodosFromBlocks(blocks)).toHaveLength(0);
  });

  it('ignores non tool_use blocks while scanning', () => {
    const blocks: ContentBlock[] = [
      { kind: 'text', text: 'hi' },
      { kind: 'status', text: 'busy' },
      toolUse('TaskCreate', JSON.stringify({ subject: 'Only one' })),
    ];

    expect(extractTodosFromBlocks(blocks)).toEqual([
      { id: 'task-1', text: 'Only one', completed: false },
    ]);
  });
});
