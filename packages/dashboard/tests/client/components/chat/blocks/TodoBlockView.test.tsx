import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { expectRenderedOnce, expectNotRendered } from './render-assertions';
import React from 'react';
import { TodoBlockView } from '../../../../../src/client/components/chat/blocks/TodoBlockView';
import type { ToolUseBlock } from '../../../../../src/client/types/chat';

/** Characterization tests for TodoBlockView — the todo-plan checklist card. */

type Todo = { content: string; status: string; activeForm?: string };

function todoBlock(todos: Todo[], overrides: Partial<ToolUseBlock> = {}): ToolUseBlock {
  return {
    kind: 'tool_use',
    tool: 'TodoWrite',
    args: JSON.stringify({ todos }),
    ...overrides,
  };
}

/** The task row wrapping a given task label. */
function row(content: string): HTMLElement {
  const el = screen.getByText(content).closest('div.flex.items-start');
  if (!el) throw new Error(`no task row for "${content}"`);
  return el as HTMLElement;
}

describe('TodoBlockView', () => {
  describe('fallback when there is no task list', () => {
    it('falls back to the raw tool row when args are absent', () => {
      render(<TodoBlockView block={{ kind: 'tool_use', tool: 'TodoWrite' }} />);
      expectNotRendered('Todo Plan');
      expectRenderedOnce('TodoWrite');
    });

    it('falls back to the raw tool row when args are unparseable', () => {
      render(<TodoBlockView block={{ kind: 'tool_use', tool: 'TodoWrite', args: 'not json' }} />);
      expectNotRendered('Todo Plan');
      expectRenderedOnce('TodoWrite');
    });

    it('falls back to the raw tool row when todos is not an array', () => {
      const block = {
        kind: 'tool_use',
        tool: 'TodoWrite',
        args: '{"todos":"nope"}',
      } as ToolUseBlock;
      render(<TodoBlockView block={block} />);
      expectNotRendered('Todo Plan');
    });

    it('QUIRK: an empty todos array still renders the card, with no rows', () => {
      const { container } = render(<TodoBlockView block={todoBlock([])} />);
      expectRenderedOnce('Todo Plan');
      expect(container.querySelectorAll('div.flex.items-start')).toHaveLength(0);
    });
  });

  describe('task list', () => {
    it('renders the card header', () => {
      render(<TodoBlockView block={todoBlock([{ content: 'Write tests', status: 'pending' }])} />);
      expectRenderedOnce('Todo Plan');
    });

    it('renders one row per task, in order', () => {
      render(
        <TodoBlockView
          block={todoBlock([
            { content: 'First task', status: 'completed' },
            { content: 'Second task', status: 'in_progress' },
            { content: 'Third task', status: 'pending' },
          ])}
        />
      );
      expectRenderedOnce('First task');
      expectRenderedOnce('Second task');
      expectRenderedOnce('Third task');
    });

    it('strikes through a completed task', () => {
      render(<TodoBlockView block={todoBlock([{ content: 'Done thing', status: 'completed' }])} />);
      expect(expectRenderedOnce('Done thing').className).toContain('line-through');
    });

    it('also treats the "done" status as completed', () => {
      render(<TodoBlockView block={todoBlock([{ content: 'Done thing', status: 'done' }])} />);
      expect(expectRenderedOnce('Done thing').className).toContain('line-through');
    });

    it('does not strike through a pending task', () => {
      render(<TodoBlockView block={todoBlock([{ content: 'Todo thing', status: 'pending' }])} />);
      expect(expectRenderedOnce('Todo thing').className).not.toContain('line-through');
    });

    it('does not strike through an in-progress task', () => {
      render(
        <TodoBlockView block={todoBlock([{ content: 'Busy thing', status: 'in_progress' }])} />
      );
      expect(expectRenderedOnce('Busy thing').className).not.toContain('line-through');
    });

    it('marks a completed task with a checkmark icon', () => {
      render(<TodoBlockView block={todoBlock([{ content: 'Done thing', status: 'completed' }])} />);
      expect(row('Done thing').querySelector('svg')).not.toBeNull();
    });

    it('marks an in-progress task with a pulsing dot rather than a checkmark', () => {
      render(
        <TodoBlockView block={todoBlock([{ content: 'Busy thing', status: 'in_progress' }])} />
      );
      const r = row('Busy thing');
      expect(r.querySelector('svg')).toBeNull();
      expect(r.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('marks a pending task with an empty box', () => {
      render(<TodoBlockView block={todoBlock([{ content: 'Todo thing', status: 'pending' }])} />);
      const r = row('Todo thing');
      expect(r.querySelector('svg')).toBeNull();
      expect(r.querySelector('.animate-pulse')).toBeNull();
    });

    it('QUIRK: an unrecognized status is rendered exactly like pending', () => {
      render(<TodoBlockView block={todoBlock([{ content: 'Odd thing', status: 'banana' }])} />);
      const r = row('Odd thing');
      expect(r.querySelector('svg')).toBeNull();
      expect(r.querySelector('.animate-pulse')).toBeNull();
      expect(expectRenderedOnce('Odd thing').className).not.toContain('line-through');
    });
  });

  describe('active form', () => {
    it('shows the active form of the in-progress task', () => {
      const todos = [
        { content: 'Write tests', status: 'in_progress', activeForm: 'Writing tests' },
      ];
      render(<TodoBlockView block={todoBlock(todos)} />);
      expectRenderedOnce(/Writing tests/);
    });

    it('hides the active form of a task that is not in progress', () => {
      const todos = [{ content: 'Write tests', status: 'pending', activeForm: 'Writing tests' }];
      render(<TodoBlockView block={todoBlock(todos)} />);
      expectNotRendered(/Writing tests/);
    });

    it('hides the active form of a completed task', () => {
      const todos = [{ content: 'Write tests', status: 'completed', activeForm: 'Writing tests' }];
      render(<TodoBlockView block={todoBlock(todos)} />);
      expectNotRendered(/Writing tests/);
    });

    it('omits the active form line when the task carries none', () => {
      render(
        <TodoBlockView block={todoBlock([{ content: 'Write tests', status: 'in_progress' }])} />
      );
      expect(row('Write tests').textContent).toBe('Write tests');
    });
  });

  describe('error and result', () => {
    it('flags a parse error on the card header', () => {
      const todos = [{ content: 'Write tests', status: 'pending' }];
      render(<TodoBlockView block={todoBlock(todos, { isError: true })} />);
      expectRenderedOnce('Error Parsing');
    });

    it('shows no error flag on a healthy card', () => {
      render(<TodoBlockView block={todoBlock([{ content: 'Write tests', status: 'pending' }])} />);
      expectNotRendered('Error Parsing');
    });

    it('renders the tool result as markdown beneath the tasks', () => {
      const todos = [{ content: 'Write tests', status: 'pending' }];
      const { container } = render(
        <TodoBlockView block={todoBlock(todos, { result: '# Updated\n\nAll set.' })} />
      );
      expect(container.querySelector('h1')?.textContent).toBe('Updated');
      expectRenderedOnce('All set.');
    });

    it('renders no result region when there is no result', () => {
      const { container } = render(
        <TodoBlockView block={todoBlock([{ content: 'Write tests', status: 'pending' }])} />
      );
      expect(container.querySelector('.prose')).toBeNull();
    });
  });
});
