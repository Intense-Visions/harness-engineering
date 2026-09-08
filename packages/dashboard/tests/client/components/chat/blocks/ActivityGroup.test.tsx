import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { expectRenderedOnce, expectNotRendered } from './render-assertions';
import React from 'react';
import { ActivityGroup } from '../../../../../src/client/components/chat/blocks/ActivityGroup';
import type { ContentBlock, ToolUseBlock } from '../../../../../src/client/types/chat';

/**
 * Characterization tests for ActivityGroup — the layout pass that decides when
 * a run of tool calls collapses into a single "Used N tools" cluster and when
 * each call gets its own row.
 */

function tool(name: string, overrides: Partial<ToolUseBlock> = {}): ToolUseBlock {
  return { kind: 'tool_use', tool: name, ...overrides };
}

function renderGroup(
  blocks: ContentBlock[],
  opts: Partial<{ isStreaming: boolean; isLastGroup: boolean; startIndex: number }> = {}
) {
  return render(
    <ActivityGroup
      blocks={blocks}
      startIndex={opts.startIndex ?? 0}
      isStreaming={opts.isStreaming ?? false}
      isLastGroup={opts.isLastGroup ?? false}
    />
  );
}

describe('ActivityGroup', () => {
  describe('empty group', () => {
    it('renders nothing for an empty block list', () => {
      const { container } = renderGroup([]);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('single-block shortcuts', () => {
    it('renders a lone thinking block unwrapped', () => {
      renderGroup([{ kind: 'thinking', text: 'weighing the options' }]);
      expectRenderedOnce('Thinking...');
      expectRenderedOnce('weighing the options');
    });

    it('renders a lone status block unwrapped', () => {
      renderGroup([{ kind: 'status', text: 'Scanning the graph' }]);
      expectRenderedOnce('Scanning the graph');
    });

    it('renders a lone text block as prose', () => {
      renderGroup([{ kind: 'text', text: 'Here is the plan.' }]);
      expectRenderedOnce('Here is the plan.');
    });

    it('renders a lone tool call as a single row rather than a cluster', () => {
      renderGroup([tool('Read')]);
      expectRenderedOnce('Read');
      expectNotRendered(/Used \d+ tools/);
    });
  });

  describe('tool clustering', () => {
    it('leaves two consecutive tool calls as separate rows', () => {
      renderGroup([tool('Read'), tool('Grep')]);
      expectRenderedOnce('Read');
      expectRenderedOnce('Grep');
      expectNotRendered(/Used \d+ tools/);
    });

    it('collapses three consecutive tool calls into a cluster', () => {
      renderGroup([tool('Read'), tool('Grep'), tool('Edit')]);
      expectRenderedOnce('Used 3 tools');
    });

    it('counts every tool call in the cluster summary', () => {
      renderGroup([tool('Read'), tool('Grep'), tool('Edit'), tool('Write'), tool('Bash')]);
      expectRenderedOnce('Used 5 tools');
    });

    it('names the LAST tool of the cluster in the summary', () => {
      renderGroup([tool('Read'), tool('Grep'), tool('run_ci_checks')]);
      const summary = screen.getByText('Used 3 tools').closest('summary');
      expect(summary?.textContent).toContain('run ci checks');
    });

    it('previews the last tool’s args in the summary', () => {
      const last = tool('Read', { args: JSON.stringify({ path: '/a/b/c.ts' }) });
      renderGroup([tool('Grep'), tool('Edit'), last]);
      const summary = screen.getByText('Used 3 tools').closest('summary');
      expect(summary?.textContent).toContain('b/c.ts');
    });

    it('renders the cluster in a collapsible details element', () => {
      const { container } = renderGroup([tool('Read'), tool('Grep'), tool('Edit')]);
      expect(container.querySelector('details')).not.toBeNull();
    });

    it('still renders every clustered tool row inside the cluster body', () => {
      const { container } = renderGroup([tool('Read'), tool('Grep'), tool('Edit')]);
      const body = container.querySelector('details > div');
      expect(body).not.toBeNull();
      const rows = within(body as HTMLElement);
      expect(rows.getByText('Read')).toBeDefined();
      expect(rows.getByText('Grep')).toBeDefined();
      expect(rows.getByText('Edit')).toBeDefined();
    });

    it('QUIRK: the last tool’s name appears twice — in the summary and its own row', () => {
      renderGroup([tool('Read'), tool('Grep'), tool('Edit')]);
      expect(screen.getAllByText('Edit')).toHaveLength(2);
    });
  });

  describe('cluster boundaries', () => {
    it('a non-tool block breaks the run, leaving a sub-threshold cluster uncollapsed', () => {
      renderGroup([
        tool('Read'),
        tool('Grep'),
        { kind: 'text', text: 'Now I will edit.' },
        tool('Edit'),
      ]);
      expectNotRendered(/Used \d+ tools/);
      expectRenderedOnce('Now I will edit.');
    });

    it('clusters only the run that reaches the threshold', () => {
      renderGroup([
        tool('Read'),
        tool('Grep'),
        tool('Edit'),
        { kind: 'text', text: 'Now I will verify.' },
        tool('Bash'),
      ]);
      expectRenderedOnce('Used 3 tools');
      expectRenderedOnce('Bash');
    });

    it('forms a separate cluster for each qualifying run', () => {
      renderGroup([
        tool('Read'),
        tool('Grep'),
        tool('Edit'),
        { kind: 'status', text: 'Halfway there' },
        tool('Write'),
        tool('Bash'),
        tool('Glob'),
      ]);
      expect(screen.getAllByText(/Used 3 tools/)).toHaveLength(2);
      expectRenderedOnce('Halfway there');
    });

    it('renders thinking blocks interleaved among tool rows', () => {
      renderGroup([tool('Read'), { kind: 'thinking', text: 'reconsidering' }, tool('Grep')]);
      expectRenderedOnce('Thinking...');
      expectRenderedOnce('reconsidering');
    });

    it('closes a trailing cluster at the end of the group', () => {
      renderGroup([
        { kind: 'text', text: 'Starting now.' },
        tool('Read'),
        tool('Grep'),
        tool('Edit'),
      ]);
      expectRenderedOnce('Used 3 tools');
    });
  });

  describe('pending state of the final tool call', () => {
    it('marks the last tool call pending while streaming the last group', () => {
      const { container } = renderGroup([tool('Read'), tool('Grep')], {
        isStreaming: true,
        isLastGroup: true,
      });
      expect(container.querySelectorAll('.bg-gradient-to-b')).toHaveLength(1);
    });

    it('marks nothing pending when the group is not the last one', () => {
      const { container } = renderGroup([tool('Read'), tool('Grep')], {
        isStreaming: true,
        isLastGroup: false,
      });
      expect(container.querySelectorAll('.bg-gradient-to-b')).toHaveLength(0);
    });

    it('marks nothing pending when not streaming', () => {
      const { container } = renderGroup([tool('Read'), tool('Grep')], {
        isStreaming: false,
        isLastGroup: true,
      });
      expect(container.querySelectorAll('.bg-gradient-to-b')).toHaveLength(0);
    });

    it('marks the final tool of a cluster pending too', () => {
      const { container } = renderGroup([tool('Read'), tool('Grep'), tool('Edit')], {
        isStreaming: true,
        isLastGroup: true,
      });
      expect(container.querySelectorAll('.bg-gradient-to-b')).toHaveLength(1);
    });

    it('QUIRK: nothing is marked pending when the group ends in a non-tool block', () => {
      const { container } = renderGroup([tool('Read'), { kind: 'text', text: 'Wrapping up.' }], {
        isStreaming: true,
        isLastGroup: true,
      });
      expect(container.querySelectorAll('.bg-gradient-to-b')).toHaveLength(0);
    });
  });

  describe('startIndex', () => {
    it('renders the same visible output regardless of startIndex', () => {
      const blocks = [tool('Read'), tool('Grep'), tool('Edit')];
      const a = renderGroup(blocks, { startIndex: 0 }).container.textContent;
      const b = renderGroup(blocks, { startIndex: 99 }).container.textContent;
      expect(b).toBe(a);
    });
  });
});
