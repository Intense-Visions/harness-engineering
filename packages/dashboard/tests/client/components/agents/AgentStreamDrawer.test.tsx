import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { AgentStreamDrawer } from '../../../../src/client/components/agents/AgentStreamDrawer';
import type { UseStreamReplayResult } from '../../../../src/client/hooks/useStreamReplay';
import type { RunningAgent } from '../../../../src/client/types/orchestrator';
import type { ContentBlock } from '../../../../src/client/types/chat';

// ── Controllable stream-replay seam ────────────────────────────────
// The hook does real fetch()/JSONL parsing; we replace it with a mutable
// return value so the drawer's merge/loading/manifest branches are driven
// deterministically without touching the network.
const replay = vi.hoisted(() => ({
  state: {
    manifest: null,
    recordedBlocks: [],
    loading: false,
    error: null,
  } as UseStreamReplayResult,
}));

vi.mock('../../../../src/client/hooks/useStreamReplay', () => ({
  useStreamReplay: () => replay.state,
}));

// ── Virtualized list seam ──────────────────────────────────────────
// react-virtuoso needs layout measurement that jsdom can't provide, so it
// renders no items headlessly. Replace it with a plain list that eagerly
// renders every datum through the real itemContent/computeItemKey props, and
// expose a scrollToIndex handle (the drawer calls it via a ref on live-follow).
vi.mock('react-virtuoso', () => ({
  Virtuoso: React.forwardRef(function MockVirtuoso(
    props: {
      data?: unknown[];
      itemContent: (index: number, item: unknown) => React.ReactNode;
      computeItemKey?: (index: number, item: unknown) => string;
    },
    ref: React.Ref<{ scrollToIndex: (...args: unknown[]) => void }>
  ) {
    React.useImperativeHandle(ref, () => ({ scrollToIndex: vi.fn() }));
    const data = props.data ?? [];
    return (
      <div data-testid="virtuoso">
        {data.map((item, index) => (
          <div
            key={props.computeItemKey ? props.computeItemKey(index, item) : index}
            data-testid="virtuoso-item"
          >
            {props.itemContent(index, item)}
          </div>
        ))}
      </div>
    );
  }),
}));

// ── Leaf block renderer seam ───────────────────────────────────────
// The real BlockSegmentView renders deep block trees; we surface just the
// segment kind and (for text) its text so we can assert on merge ORDER and
// which segments the drawer fed into the list.
vi.mock('../../../../src/client/components/chat/AssistantBlocks', () => ({
  BlockSegmentView: ({ segment }: { segment: { kind: string; block?: { text?: string } } }) => (
    <div data-testid="segment" data-kind={segment.kind}>
      {segment.kind === 'text' ? segment.block?.text : segment.kind}
    </div>
  ),
}));

function makeAgent(overrides: Partial<RunningAgent> = {}): RunningAgent {
  return {
    issueId: 'issue-1',
    identifier: 'agent-alpha',
    phase: 'execute',
    startedAt: new Date().toISOString(),
    workspacePath: '/tmp/ws',
    attempt: 1,
    issue: {
      identifier: 'HARNESS-1',
      title: 'Build the widget',
      description: null,
      blockedBy: [],
    },
    session: null,
    ...overrides,
  };
}

function textBlock(text: string): ContentBlock {
  return { kind: 'text', text };
}

beforeEach(() => {
  vi.clearAllMocks();
  replay.state = { manifest: null, recordedBlocks: [], loading: false, error: null };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AgentStreamDrawer visibility', () => {
  it('renders nothing when there is neither a live agent nor a recorded issue', () => {
    const { container } = render(
      <AgentStreamDrawer agent={null} issueId={null} blocks={[]} onClose={vi.fn()} />
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders the drawer for a recorded issue even without a live agent', () => {
    render(<AgentStreamDrawer agent={null} issueId="issue-1" blocks={[]} onClose={vi.fn()} />);

    expect(screen.getByText('Recorded Stream')).toBeDefined();
    expect(screen.getByRole('button')).toBeDefined();
  });
});

describe('AgentStreamDrawer header', () => {
  it('shows the live-stream header titled from the agent issue when an agent is present', () => {
    render(<AgentStreamDrawer agent={makeAgent()} issueId={null} blocks={[]} onClose={vi.fn()} />);

    expect(screen.getByText('Build the widget')).toBeDefined();
    expect(screen.getByText('Live Stream')).toBeDefined();
    expect(screen.queryByText('Recorded Stream')).toBeNull();
  });

  it('falls back to the manifest identifier for a recorded stream title', () => {
    replay.state = {
      ...replay.state,
      manifest: {
        issueId: 'issue-1',
        externalId: 42,
        identifier: 'recorded-agent-7',
        attempts: [],
        pr: null,
        highlights: null,
      },
    };

    render(<AgentStreamDrawer agent={null} issueId="issue-1" blocks={[]} onClose={vi.fn()} />);

    // Identifier also appears in the stats pane, so scope to the header heading.
    expect(screen.getByRole('heading', { name: 'recorded-agent-7' })).toBeDefined();
    expect(screen.getByText('Recorded Stream')).toBeDefined();
  });

  it("defaults the title to 'Session' when neither agent nor manifest names it", () => {
    render(<AgentStreamDrawer agent={null} issueId="issue-1" blocks={[]} onClose={vi.fn()} />);

    expect(screen.getByText('Session')).toBeDefined();
  });
});

describe('AgentStreamDrawer close affordances', () => {
  it('invokes onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<AgentStreamDrawer agent={makeAgent()} issueId={null} blocks={[]} onClose={onClose} />);

    // Scroll buttons only mount off-top/off-bottom, so the sole button is close.
    fireEvent.click(screen.getByRole('button'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <AgentStreamDrawer agent={makeAgent()} issueId={null} blocks={[]} onClose={onClose} />
    );

    const backdrop = container.querySelector('[class*="bg-black"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AgentStreamDrawer session stats', () => {
  it('renders turn count and token totals formatted by magnitude', () => {
    const agent = makeAgent({
      issue: {
        identifier: 'HARNESS-1',
        title: 'Build the widget',
        description: 'Ship the streaming drawer.',
        blockedBy: [],
      },
      session: {
        backendName: 'anthropic',
        inputTokens: 1_200,
        outputTokens: 300,
        totalTokens: 2_000_000,
        turnCount: 7,
        lastMessage: null,
      },
    });

    render(<AgentStreamDrawer agent={agent} issueId={null} blocks={[]} onClose={vi.fn()} />);

    expect(screen.getByText('Ship the streaming drawer.')).toBeDefined();
    expect(screen.getByText('anthropic')).toBeDefined();
    expect(screen.getByText('7')).toBeDefined(); // turns
    expect(screen.getByText('2.0M')).toBeDefined(); // total tokens, millions branch
    expect(screen.getByText('1.2k')).toBeDefined(); // input, thousands branch
    expect(screen.getByText('300')).toBeDefined(); // output, plain branch
  });
});

describe('AgentStreamDrawer stream body', () => {
  it('shows the loading placeholder while the recorded stream is loading', () => {
    replay.state = { ...replay.state, loading: true };

    render(<AgentStreamDrawer agent={null} issueId="issue-1" blocks={[]} onClose={vi.fn()} />);

    expect(screen.getByText('Loading recorded stream...')).toBeDefined();
    expect(screen.queryByTestId('virtuoso')).toBeNull();
  });

  it('shows the waiting placeholder when there are no blocks yet', () => {
    render(<AgentStreamDrawer agent={makeAgent()} issueId={null} blocks={[]} onClose={vi.fn()} />);

    expect(screen.getByText('Waiting for agent output...')).toBeDefined();
    expect(screen.queryByTestId('virtuoso')).toBeNull();
  });

  it('merges recorded history before live blocks and renders them as segments', () => {
    replay.state = { ...replay.state, recordedBlocks: [textBlock('recorded line')] };

    render(
      <AgentStreamDrawer
        agent={makeAgent()}
        issueId="issue-1"
        blocks={[textBlock('live line')]}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId('virtuoso')).toBeDefined();

    const texts = screen
      .getAllByTestId('segment')
      .map((el) => el.textContent)
      .filter((t): t is string => t === 'recorded line' || t === 'live line');

    // Recorded history is the base; live blocks are appended after it.
    expect(texts).toEqual(['recorded line', 'live line']);
  });

  it('uses recorded blocks alone when there are no live blocks', () => {
    replay.state = { ...replay.state, recordedBlocks: [textBlock('recorded only')] };

    render(<AgentStreamDrawer agent={null} issueId="issue-1" blocks={[]} onClose={vi.fn()} />);

    expect(screen.getByText('recorded only')).toBeDefined();
    expect(screen.getByText('Recorded Stream')).toBeDefined();
  });
});
