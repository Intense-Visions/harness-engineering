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

/**
 * WHY NeuralOrganism IS ALSO STUBBED HERE:
 * the avatar rolls a random "genome" on mount and then runs its own
 * self-rescheduling spark timers, each of which draws again. Measured on this
 * component: 197 Math.random draws during mount and ~195 more per 4500ms of
 * fake time. Those draws interleave with the rotation's own draws, so the
 * phrase sequence cannot be pinned from the test while the avatar renders. The
 * avatar has nothing to do with phrase rotation, so this suite renders it as
 * nothing; StreamingIndicator.test.tsx next door renders it for real.
 */
vi.mock('../../../../../src/client/components/chat/NeuralOrganism', () => ({
  NeuralOrganism: () => null,
}));

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
 * Pinned Math.random draws.
 *
 * The rotation is random in two places and BOTH must be pinned or this suite is
 * a coin flip (issue #2225). The period is drawn once per mount
 * (`4500 + Math.random() * 2000`), and each replacement index is drawn inside a
 * `do/while` that rejects the index already showing. When the test advanced by
 * the period's UPPER bound, a period near the lower bound let unconsumed fake
 * time accumulate until one advance fired the interval TWICE -- and two hops can
 * land back on the starting phrase (A to B to A), which reads as a repeat.
 *
 * Verified draw order per mount, with the avatar stubbed out above:
 *   draw 0  -> the `useState` initializer's starting phrase index
 *   draw 1  -> the rotation period, drawn inside the effect
 *   draw 2+ -> one or more per rotation, drawn inside the `do/while`
 *
 * The sequence below is chosen so that:
 *   - draw 1 returns 0, making the period exactly MIN_PHRASE_DELAY_MS, so
 *     advancing by that period fires the interval exactly once;
 *   - 0.55 appears twice in a row, so every fourth rotation hands the
 *     `do/while` the index it already has and the no-repeat guard must draw
 *     again. That is what keeps this suite able to fail if the guard is
 *     removed, rather than passing vacuously on a pinned sequence;
 *   - no other adjacent pair maps to the same index, so the guard can never
 *     spin: it accepts within three draws at worst.
 *
 * Resulting phrase indices: 2 on mount, then 11, 6, 2, 0 repeating.
 */
const PINNED_RANDOM_DRAWS = [0.1, 0, 0.55, 0.55, 0.3];

/** The period the pinned draws produce: 4500 + 0 * 2000. */
const PINNED_PHRASE_DELAY_MS = MIN_PHRASE_DELAY_MS;

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
  // The counter is per-test, so every mount starts the sequence at draw 0 and
  // therefore always lands 0 on the period draw.
  let draw = 0;
  vi.spyOn(Math, 'random').mockImplementation(
    () => PINNED_RANDOM_DRAWS[draw++ % PINNED_RANDOM_DRAWS.length]!
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('StreamingIndicator phrase rotation', () => {
  it('swaps to a different phrase once the rotation interval elapses', () => {
    const { container } = render(<StreamingIndicator />);
    const first = currentPhrase(container);
    advance(PINNED_PHRASE_DELAY_MS);
    expect(currentPhrase(container)).not.toBe(first);
  });

  it('holds the phrase steady before the shortest possible interval', () => {
    // Paired with the test above, this pins the scheduled period to exactly
    // PINNED_PHRASE_DELAY_MS: no rotation at period - 1ms, one rotation at
    // period. A component change to the delay formula fails one of the two.
    const { container } = render(<StreamingIndicator />);
    const first = currentPhrase(container);
    advance(PINNED_PHRASE_DELAY_MS - 1);
    expect(currentPhrase(container)).toBe(first);
  });

  it('never repeats the same phrase on consecutive rotations', () => {
    // Advancing by exactly the pinned period fires the interval exactly once,
    // so each iteration observes ONE rotation. Advancing by the period's upper
    // bound is what made this flaky (#2225): a short period let fake time
    // accumulate until a single advance produced two hops.
    const { container } = render(<StreamingIndicator />);
    let previous = currentPhrase(container);
    for (let i = 0; i < 8; i++) {
      advance(PINNED_PHRASE_DELAY_MS);
      const next = currentPhrase(container);
      expect(next).not.toBe(previous);
      previous = next;
    }
  });

  it('always draws the replacement from the phrase catalog', () => {
    const { container } = render(<StreamingIndicator />);
    advance(PINNED_PHRASE_DELAY_MS);
    expect(PROCESSING_PHRASES).toContain(currentPhrase(container));
  });

  it('still shows exactly one phrase after rotating', () => {
    const { container } = render(<StreamingIndicator />);
    advance(PINNED_PHRASE_DELAY_MS);
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
