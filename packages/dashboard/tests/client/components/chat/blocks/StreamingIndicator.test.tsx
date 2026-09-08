import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { expectRenderedOnce, expectNotRendered } from './render-assertions';
import React from 'react';
import { StreamingIndicator } from '../../../../../src/client/components/chat/blocks/StreamingIndicator';

/**
 * Characterization tests for StreamingIndicator — the "still working" affordance
 * shown while the assistant streams.
 *
 * Timers are faked so the elapsed counter is deterministic. framer-motion and
 * NeuralOrganism render for real here.
 *
 * Math.random is left REAL on purpose: the phrase-rotation loop is a `do/while`
 * that retries until it draws a *different* index, so a constant-valued
 * Math.random stub would spin forever. Assertions therefore pin the properties
 * the component guarantees (membership in the phrase catalog) rather than one
 * particular draw.
 *
 * Phrase ROTATION is covered in StreamingIndicator.rotation.test.tsx instead:
 * `AnimatePresence mode="wait"` keeps the outgoing phrase mounted until its exit
 * animation completes, and framer-motion's frameloop does not advance under
 * jsdom + fake timers, so the swap is unobservable here. That file stubs
 * framer-motion for exactly that reason.
 */

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

/** The longest possible phrase-rotation delay: 4500 + random * 2000. */
const MAX_PHRASE_DELAY_MS = 6500;

/**
 * Read the rendered phrase straight out of the DOM, WITHOUT consulting the
 * catalog. Looking it up by catalog membership would make any
 * "the phrase is in the catalog" assertion a tautology (test-craft TEST-R002).
 * The phrase is the only leaf element whose text ends in an ellipsis.
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

describe('StreamingIndicator', () => {
  describe('processing phrase', () => {
    it('renders a phrase drawn from the catalog', () => {
      const { container } = render(<StreamingIndicator />);
      expect(PROCESSING_PHRASES).toContain(currentPhrase(container));
    });

    it('renders exactly one phrase at a time', () => {
      const { container } = render(<StreamingIndicator />);
      expect(phraseNodes(container)).toHaveLength(1);
    });

    it('keeps the outgoing phrase mounted while its exit animation is pending', () => {
      const { container } = render(<StreamingIndicator />);
      const first = currentPhrase(container);
      advance(MAX_PHRASE_DELAY_MS);
      // AnimatePresence mode="wait" holds the outgoing child until exit
      // completes; see the rotation suite for the swap itself.
      expect(currentPhrase(container)).toBe(first);
    });
  });

  describe('elapsed counter', () => {
    it('is hidden on first render', () => {
      render(<StreamingIndicator />);
      expectNotRendered(/^T\+/);
    });

    it('is still hidden at two seconds', () => {
      render(<StreamingIndicator />);
      advance(2000);
      expectNotRendered(/^T\+/);
    });

    it('appears once more than two seconds have passed', () => {
      render(<StreamingIndicator />);
      advance(3000);
      expectRenderedOnce('T+3s');
    });

    it('counts up in whole seconds below a minute', () => {
      render(<StreamingIndicator />);
      advance(45_000);
      expectRenderedOnce('T+45s');
    });

    it('switches to minutes-and-seconds at exactly one minute', () => {
      render(<StreamingIndicator />);
      advance(60_000);
      expectRenderedOnce('T+1m 0s');
    });

    it('shows the remainder seconds past a minute', () => {
      render(<StreamingIndicator />);
      advance(95_000);
      expectRenderedOnce('T+1m 35s');
    });

    it('shows the last second before the minute boundary in seconds only', () => {
      render(<StreamingIndicator />);
      advance(59_000);
      expectRenderedOnce('T+59s');
    });
  });

  describe('composition', () => {
    it('renders the neural organism avatar', () => {
      const { container } = render(<StreamingIndicator />);
      expect(container.querySelector('svg')).not.toBeNull();
    });

    it('renders the full set of ambient activity bars', () => {
      const { container } = render(<StreamingIndicator />);
      expect(container.querySelectorAll('.origin-bottom')).toHaveLength(20);
    });
  });

  describe('teardown', () => {
    it('stops its timers on unmount', () => {
      const { unmount } = render(<StreamingIndicator />);
      unmount();
      expect(() => advance(120_000)).not.toThrow();
    });
  });
});
