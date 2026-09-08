import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { expectRenderedOnce, expectNotRendered } from './render-assertions';
import React from 'react';
import { ToolUseBlockView } from '../../../../../src/client/components/chat/blocks/ToolUseBlockView';
import type { ToolUseBlock } from '../../../../../src/client/types/chat';

/**
 * Characterization tests for ToolUseBlockView — the collapsible tool-call row.
 *
 * Pins CURRENT behavior as-is, quirks included. framer-motion is rendered for
 * real; under jsdom it emits ordinary DOM nodes.
 */

function toolBlock(overrides: Partial<ToolUseBlock> = {}): ToolUseBlock {
  return { kind: 'tool_use', tool: 'Read', ...overrides };
}

/** The clickable header is the parent of the tool-title span. */
function header(titleText: string | RegExp): HTMLElement {
  const el = screen.getByText(titleText).parentElement;
  if (!el) throw new Error('tool header not found');
  return el;
}

function captureSendEvents(): string[] {
  const seen: string[] = [];
  const listener = (e: Event) => seen.push((e as CustomEvent<string>).detail);
  window.addEventListener('chat-action-send', listener);
  cleanups.push(() => window.removeEventListener('chat-action-send', listener));
  return seen;
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe('ToolUseBlockView', () => {
  describe('header', () => {
    it('renders the tool name with underscores replaced by spaces', () => {
      render(<ToolUseBlockView block={toolBlock({ tool: 'run_ci_checks' })} />);
      expectRenderedOnce('run ci checks');
    });

    it('renders an args preview beside the tool name, inside the header row', () => {
      const block = toolBlock({ tool: 'Read', args: JSON.stringify({ path: '/a/b/c.ts' }) });
      render(<ToolUseBlockView block={block} />);
      // Scoped to the header so the assertion fails if the preview moves into
      // the expanded body (test-craft TEST-R002: the name promised placement).
      expectRenderedOnce('b/c.ts', header('Read'));
    });

    it('exposes the raw args as the preview tooltip', () => {
      const args = JSON.stringify({ path: '/a/b/c.ts' });
      render(<ToolUseBlockView block={toolBlock({ args })} />);
      expect(expectRenderedOnce('b/c.ts').getAttribute('title')).toBe(args);
    });

    it('omits the args preview entirely when there are no args', () => {
      const { container } = render(<ToolUseBlockView block={toolBlock({ tool: 'Read' })} />);
      expect(container.querySelector('[title]')).toBeNull();
    });

    it('uses a bash call’s description as the title instead of the tool name', () => {
      const args = JSON.stringify({ command: 'pnpm test', description: 'Run the test suite' });
      render(<ToolUseBlockView block={toolBlock({ tool: 'bash', args })} />);
      expectRenderedOnce('Run the test suite');
      expectNotRendered('bash');
    });

    it('falls back to the tool name when bash args are unparseable', () => {
      render(<ToolUseBlockView block={toolBlock({ tool: 'bash', args: 'not json' })} />);
      expectRenderedOnce('bash');
    });

    it('falls back to the tool name when a bash call carries no description', () => {
      const args = JSON.stringify({ command: 'pnpm test' });
      render(<ToolUseBlockView block={toolBlock({ tool: 'bash', args })} />);
      expectRenderedOnce('bash');
    });
  });

  describe('attribution badge', () => {
    it('renders the attribution when one is supplied', () => {
      render(<ToolUseBlockView block={toolBlock()} attribution="architect" />);
      expectRenderedOnce('architect');
    });

    it('renders no attribution badge by default', () => {
      render(<ToolUseBlockView block={toolBlock()} />);
      expectNotRendered('architect');
    });
  });

  describe('result status badge', () => {
    it('shows OK once a successful result has arrived', () => {
      render(<ToolUseBlockView block={toolBlock({ result: 'done' })} />);
      expectRenderedOnce('OK');
    });

    it('shows ERR when the tool call errored', () => {
      render(<ToolUseBlockView block={toolBlock({ result: 'boom', isError: true })} />);
      expectRenderedOnce('ERR');
    });

    it('shows no status badge while the result is still absent', () => {
      render(<ToolUseBlockView block={toolBlock()} />);
      expectNotRendered('OK');
      expectNotRendered('ERR');
    });

    it('treats a forceResult as a result for badge purposes', () => {
      render(<ToolUseBlockView block={toolBlock()} forceResult="from the stream" />);
      expectRenderedOnce('OK');
    });
  });

  describe('expand / collapse', () => {
    it('starts collapsed for an ordinary tool, hiding the result body', () => {
      render(<ToolUseBlockView block={toolBlock({ tool: 'Read', result: 'the result body' })} />);
      expectNotRendered('the result body');
    });

    it('reveals the result body when the header is clicked', () => {
      render(<ToolUseBlockView block={toolBlock({ tool: 'Read', result: 'the result body' })} />);
      fireEvent.click(header('Read'));
      expectRenderedOnce('the result body');
    });

    it('hides the result body again on a second click', () => {
      render(<ToolUseBlockView block={toolBlock({ tool: 'Read', result: 'the result body' })} />);
      fireEvent.click(header('Read'));
      fireEvent.click(header('Read'));
      expectNotRendered('the result body');
    });

    it('renders the result body as markdown', () => {
      const block = toolBlock({ tool: 'Read', result: '# Heading\n\n- one\n- two' });
      const { container } = render(<ToolUseBlockView block={block} />);
      fireEvent.click(header('Read'));
      expect(container.querySelector('h1')?.textContent).toBe('Heading');
      expect(container.querySelectorAll('li')).toHaveLength(2);
    });

    it('renders a forceResult body when the block itself has no result', () => {
      render(<ToolUseBlockView block={toolBlock({ tool: 'Read' })} forceResult="streamed body" />);
      fireEvent.click(header('Read'));
      expectRenderedOnce('streamed body');
    });

    it('prefers the block result over forceResult when both are present', () => {
      const block = toolBlock({ tool: 'Read', result: 'own result' });
      render(<ToolUseBlockView block={block} forceResult="forced result" />);
      fireEvent.click(header('Read'));
      expectRenderedOnce('own result');
      expectNotRendered('forced result');
    });

    it.each(['emit_interaction', 'ask_question', 'ask_human', 'human_review'])(
      'starts expanded for the human-facing tool %s',
      (tool) => {
        render(<ToolUseBlockView block={toolBlock({ tool, result: 'needs your input' })} />);
        expectRenderedOnce('needs your input');
      }
    );

    it('matches the auto-expand tool names case-insensitively', () => {
      render(<ToolUseBlockView block={toolBlock({ tool: 'ASK_HUMAN', result: 'input please' })} />);
      expectRenderedOnce('input please');
    });

    it('QUIRK: expanding a tool that has no result yet renders no body at all', () => {
      const { container } = render(<ToolUseBlockView block={toolBlock({ tool: 'Read' })} />);
      fireEvent.click(header('Read'));
      // The expanded region is gated on hasResult, so nothing is revealed.
      expect(container.querySelector('.prose')).toBeNull();
    });

    it('QUIRK: a todo tool’s parsed tasks are never rendered by this view', () => {
      const args = JSON.stringify({ todos: [{ content: 'Write the tests', status: 'pending' }] });
      const block = toolBlock({ tool: 'TodoWrite', args, result: 'ok' });
      render(<ToolUseBlockView block={block} />);
      fireEvent.click(header('TodoWrite'));
      // TodoBlockView owns task rendering; the parse here feeds only dead code.
      expectNotRendered('Write the tests');
    });
  });

  describe('pending scan overlay', () => {
    it('renders the scan overlay while pending with no result', () => {
      const { container } = render(<ToolUseBlockView block={toolBlock()} isPending />);
      expect(container.querySelector('.bg-gradient-to-b')).not.toBeNull();
    });

    it('drops the scan overlay once a result has arrived', () => {
      const { container } = render(
        <ToolUseBlockView block={toolBlock({ result: 'done' })} isPending />
      );
      expect(container.querySelector('.bg-gradient-to-b')).toBeNull();
    });

    it('renders no scan overlay when not pending', () => {
      const { container } = render(<ToolUseBlockView block={toolBlock()} />);
      expect(container.querySelector('.bg-gradient-to-b')).toBeNull();
    });
  });

  describe('emit_interaction action buttons', () => {
    const question = {
      type: 'question',
      question: {
        options: [{ label: 'Ship it' }, { label: 'Hold' }, { label: 'Rework' }],
        recommendation: { optionIndex: 1 },
      },
    };

    function renderQuestion(payload: unknown = question) {
      return render(
        <ToolUseBlockView
          block={toolBlock({
            tool: 'emit_interaction',
            args: JSON.stringify(payload),
            result: 'Awaiting your decision',
          })}
        />
      );
    }

    it('offers an approve-recommendation button naming the recommended letter', () => {
      renderQuestion();
      expectRenderedOnce(/Approve Recommendation \(B\)/);
    });

    it('dispatches the recommended option label when approving the recommendation', () => {
      const sent = captureSendEvents();
      renderQuestion();
      fireEvent.click(screen.getByText(/Approve Recommendation \(B\)/));
      expect(sent).toEqual(['Approve recommendation: Hold']);
    });

    it('offers a button for every non-recommended option', () => {
      renderQuestion();
      expectRenderedOnce('Option A');
      expectRenderedOnce('Option C');
    });

    it('omits a plain option button for the recommended index', () => {
      renderQuestion();
      expectNotRendered('Option B');
    });

    it('QUIRK: option buttons show only a letter, never the option label', () => {
      renderQuestion();
      expectNotRendered('Ship it');
      expectNotRendered('Rework');
    });

    it('dispatches the letter and label when a plain option is chosen', () => {
      const sent = captureSendEvents();
      renderQuestion();
      fireEvent.click(screen.getByText('Option C'));
      expect(sent).toEqual(['Approve option C: Rework']);
    });

    it('accepts plain-string options', () => {
      const sent = captureSendEvents();
      renderQuestion({ type: 'question', question: { options: ['Yes', 'No'] } });
      fireEvent.click(screen.getByText('Option A'));
      expect(sent).toEqual(['Approve option A: Yes']);
    });

    it('always offers a Continue button for a question', () => {
      const sent = captureSendEvents();
      renderQuestion();
      fireEvent.click(screen.getByText('Continue'));
      expect(sent).toEqual(['Continue']);
    });

    it('offers only Continue when a question carries no options', () => {
      renderQuestion({ type: 'question', question: {} });
      expectRenderedOnce('Continue');
      expectNotRendered('Option A');
    });

    it('offers only Continue when the options array is empty', () => {
      renderQuestion({ type: 'question', question: { options: [] } });
      expectRenderedOnce('Continue');
      expectNotRendered('Option A');
    });

    it('renders confirm and cancel buttons for a confirmation', () => {
      renderQuestion({ type: 'confirmation' });
      expectRenderedOnce('Confirm & Proceed');
      expectRenderedOnce('Cancel');
    });

    it('dispatches an affirmative on confirm', () => {
      const sent = captureSendEvents();
      renderQuestion({ type: 'confirmation' });
      fireEvent.click(screen.getByText('Confirm & Proceed'));
      expect(sent).toEqual(['Yes, proceed']);
    });

    it('dispatches a refusal on cancel', () => {
      const sent = captureSendEvents();
      renderQuestion({ type: 'confirmation' });
      fireEvent.click(screen.getByText('Cancel'));
      expect(sent).toEqual(['No, stop']);
    });

    it('names both phases for a transition needing confirmation', () => {
      renderQuestion({
        type: 'transition',
        transition: {
          requiresConfirmation: true,
          suggestedNext: 'execution',
          completedPhase: 'planning',
        },
      });
      expectRenderedOnce('Proceed to execution');
      expectRenderedOnce('Stay in planning');
    });

    it('dispatches the target phase when proceeding through a transition', () => {
      const sent = captureSendEvents();
      renderQuestion({
        type: 'transition',
        transition: {
          requiresConfirmation: true,
          suggestedNext: 'execution',
          completedPhase: 'planning',
        },
      });
      fireEvent.click(screen.getByText('Proceed to execution'));
      expect(sent).toEqual(['Yes, proceed to execution']);
    });

    it('renders no buttons for a transition that does not require confirmation', () => {
      const { container } = renderQuestion({
        type: 'transition',
        transition: { requiresConfirmation: false, suggestedNext: 'execution' },
      });
      expect(container.querySelectorAll('button')).toHaveLength(0);
    });

    it('renders approve-all and reject buttons for a batch', () => {
      renderQuestion({ type: 'batch' });
      expectRenderedOnce('Approve All');
      expectRenderedOnce('Reject');
    });

    it('dispatches a batch approval', () => {
      const sent = captureSendEvents();
      renderQuestion({ type: 'batch' });
      fireEvent.click(screen.getByText('Approve All'));
      expect(sent).toEqual(['Approve all decisions']);
    });

    it('renders no buttons for an unrecognized interaction type', () => {
      const { container } = renderQuestion({ type: 'something-else' });
      expect(container.querySelectorAll('button')).toHaveLength(0);
    });

    it('leaves the UI untouched when the interaction args are unparseable', () => {
      const block = toolBlock({
        tool: 'emit_interaction',
        args: 'not json',
        result: 'Awaiting your decision',
      });
      const { container } = render(<ToolUseBlockView block={block} />);
      expectRenderedOnce('Awaiting your decision');
      expect(container.querySelectorAll('button')).toHaveLength(0);
    });

    it('withholds the action buttons while the interaction is still pending', () => {
      const block = toolBlock({
        tool: 'emit_interaction',
        args: JSON.stringify({ type: 'confirmation' }),
        result: 'Awaiting your decision',
      });
      const { container } = render(<ToolUseBlockView block={block} isPending />);
      expect(container.querySelectorAll('button')).toHaveLength(0);
    });

    it('renders no action buttons for a non-interaction tool with the same payload', () => {
      const block = toolBlock({
        tool: 'Read',
        args: JSON.stringify({ type: 'confirmation' }),
        result: 'Awaiting your decision',
      });
      const { container } = render(<ToolUseBlockView block={block} />);
      fireEvent.click(header('Read'));
      expect(container.querySelectorAll('button')).toHaveLength(0);
    });

    it('scopes the action buttons to the expanded result region', () => {
      renderQuestion({ type: 'confirmation' });
      const region = screen.getByText('Confirm & Proceed').closest('div.not-prose');
      expect(region).not.toBeNull();
      expect(within(region as HTMLElement).getAllByRole('button')).toHaveLength(2);
    });
  });
});
