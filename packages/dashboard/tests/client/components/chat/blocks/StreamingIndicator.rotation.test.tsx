import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { expectRenderedOnce, expectNotRendered } from './render-assertions';
import React from 'react';

/**
 * Phrase-rotation characterization for StreamingIndicator.
 *
 * WHY framer-motion IS STUBBED HERE (and nowhere else in this directory):
 * the phrase is wrapped in `AnimatePresence mode="wait"`, which keeps the
 * OUTGOING phrase mounted until its exit animation completes. framer-motion's
 * frameloop does not advance under jsdom + fake timers, so with the real
 * library the exit never finishes and the phrase never visibly swaps — the
 * rotation logic (the interval and its no-repeat `do/while`) would be
 * untestable. The stub renders the same DOM shape, minus animation.
 *
 * Every other suite in this directory renders framer-motion for real.
 */
vi.mock('framer-motion', async () => {
  const react = await import('react');
  const passthrough = (tag: string) =>
    react.forwardRef(function MotionStub(
      props: Record<string, unknown>,
      ref: React.Ref<HTMLElement>
    ) {
      // Keep layout-relevant props; drop the animation-only ones.
      const { children, className, style, title } = props as {
        children?: React.ReactNode;
        className?: string;
        style?: React.CSSProperties;
        title?: string;
      };
      return react.createElement(tag, { ref, className, style, title }, children);
    });
  return {
    motion: new Proxy({}, { get: (_target, tag: string) => passthrough(tag) }),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      react.createElement(react.Fragment, null, children),
  };
});

const { StreamingIndicator } =
  await import('../../../../../src/client/components/chat/blocks/StreamingIndicator');

/** The phrase catalog, mirrored from the component so edits to it fail loudly. */
const PROCESSING_PHRASES = [
  'Thinking deeply…',
  'Analyzing the codebase…',
  'Connecting the dots…',
  'Weaving through the code…',
  'Exploring possibilities…',
  'Building a mental model…',
  'Following the thread…',
  'Mapping dependencies…',
  'Tracing the logic…',
  'Piecing it together…',
  'Diving into the details…',
  'Reasoning through options…',
  'Scanning for patterns…',
  'Synthesizing insights…',
  'Crafting a response…',
  'Running the numbers…',
  'Almost there…',
  'Working through it…',
  'Processing your request…',
  'Engineering a solution…',
];

/** The longest possible rotation delay: 4500 + random * 2000. */
const MAX_PHRASE_DELAY_MS = 6500;
/** The shortest possible rotation delay. */
const MIN_PHRASE_DELAY_MS = 4500;

/**
 * Read the rendered phrase from the DOM without consulting the catalog, so
 * catalog-membership assertions stay falsifiable (test-craft TEST-R002).
 */
function phraseNodes(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('span')).filter(
    (el) => el.children.length === 0 && (el.textContent ?? '').trim().endsWith('…')
  );
}

function currentPhrase(container: HTMLElement): string {
  const nodes = phraseNodes(container);
  expect(nodes, 'expected exactly one processing phrase to be rendered').toHaveLength(1);
  return (nodes[0]!.textContent ?? '').trim();
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StreamingIndicator phrase rotation', () => {
  it('swaps to a different phrase once the rotation interval elapses', () => {
    const { container } = render(<StreamingIndicator />);
    const first = currentPhrase(container);
    advance(MAX_PHRASE_DELAY_MS);
    expect(currentPhrase(container)).not.toBe(first);
  });

  it('holds the phrase steady before the shortest possible interval', () => {
    const { container } = render(<StreamingIndicator />);
    const first = currentPhrase(container);
    advance(MIN_PHRASE_DELAY_MS - 1);
    expect(currentPhrase(container)).toBe(first);
  });

  it('never repeats the same phrase on consecutive rotations', () => {
    const { container } = render(<StreamingIndicator />);
    let previous = currentPhrase(container);
    for (let i = 0; i < 8; i++) {
      advance(MAX_PHRASE_DELAY_MS);
      const next = currentPhrase(container);
      expect(next).not.toBe(previous);
      previous = next;
    }
  });

  it('always draws the replacement from the phrase catalog', () => {
    const { container } = render(<StreamingIndicator />);
    advance(MAX_PHRASE_DELAY_MS);
    expect(PROCESSING_PHRASES).toContain(currentPhrase(container));
  });

  it('still shows exactly one phrase after rotating', () => {
    const { container } = render(<StreamingIndicator />);
    advance(MAX_PHRASE_DELAY_MS);
    expect(phraseNodes(container)).toHaveLength(1);
  });

  it('stops rotating after unmount', () => {
    const { container, unmount } = render(<StreamingIndicator />);
    expect(phraseNodes(container)).toHaveLength(1);
    unmount();
    advance(MAX_PHRASE_DELAY_MS * 3);
    expect(phraseNodes(container)).toHaveLength(0);
  });
});
