import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { AnalysisFormCard } from '../../../../src/client/components/cards/AnalysisFormCard';

// ── framer-motion drives the collapse animation. Replace it with plain DOM so
//    the form's expanded/collapsed content is synchronously present (no RAF,
//    no height-transition gating) and assertions are deterministic.
vi.mock('framer-motion', () => {
  const strip = (props: Record<string, unknown>) => {
    const { initial, animate, exit, transition, whileHover, whileTap, layout, ...rest } = props;
    void initial;
    void animate;
    void exit;
    void transition;
    void whileHover;
    void whileTap;
    void layout;
    return rest;
  };
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) => (props: Record<string, unknown>) =>
        React.createElement(tag, strip(props), props.children as React.ReactNode),
    }
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

const TITLE_PLACEHOLDER = 'Feature or issue title...';
const DESCRIPTION_PLACEHOLDER = 'Optional context...';
const LABELS_PLACEHOLDER = 'Comma-separated labels...';

function renderCard(overrides: Partial<React.ComponentProps<typeof AnalysisFormCard>> = {}) {
  const onSubmit = vi.fn();
  const props: React.ComponentProps<typeof AnalysisFormCard> = {
    initialTitle: '',
    initialDescription: '',
    initialLabels: [],
    collapsed: false,
    onSubmit,
    ...overrides,
  };
  render(<AnalysisFormCard {...props} />);
  return { onSubmit };
}

describe('AnalysisFormCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('seeds the inputs from the initial props', () => {
    renderCard({
      initialTitle: 'Refactor auth',
      initialDescription: 'harden token flow',
      initialLabels: ['auth', 'security'],
    });

    expect(screen.getByPlaceholderText<HTMLInputElement>(TITLE_PLACEHOLDER).value).toBe(
      'Refactor auth'
    );
    expect(screen.getByPlaceholderText<HTMLTextAreaElement>(DESCRIPTION_PLACEHOLDER).value).toBe(
      'harden token flow'
    );
    // initialLabels are rejoined with ", " for the comma-separated field.
    expect(screen.getByPlaceholderText<HTMLInputElement>(LABELS_PLACEHOLDER).value).toBe(
      'auth, security'
    );
  });

  it('submits trimmed title/description and normalized labels', () => {
    const { onSubmit } = renderCard({
      initialTitle: '  Refactor auth  ',
      initialDescription: '  harden token flow  ',
    });

    // A deliberately messy label string: surrounding whitespace and empty
    // segments must be trimmed and dropped.
    fireEvent.change(screen.getByPlaceholderText(LABELS_PLACEHOLDER), {
      target: { value: 'auth ,  , security,,perf ' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Run Analysis/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Refactor auth',
      description: 'harden token flow',
      labels: ['auth', 'security', 'perf'],
    });
  });

  it('submits an empty labels array when the labels field is blank', () => {
    const { onSubmit } = renderCard({ initialTitle: 'Ship it' });

    fireEvent.click(screen.getByRole('button', { name: /Run Analysis/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0].labels).toEqual([]);
  });

  it('disables the run button and guards submit when the title is whitespace-only', () => {
    const { onSubmit } = renderCard({ initialTitle: '   ' });

    const runButton = screen.getByRole<HTMLButtonElement>('button', { name: /Run Analysis/ });
    expect(runButton.disabled).toBe(true);

    fireEvent.click(runButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the "New Analysis" fallback heading when the title is empty', () => {
    renderCard({ initialTitle: '' });
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('New Analysis');
  });

  it('reflects the live title in the heading as the user types', () => {
    renderCard({ initialTitle: '' });

    fireEvent.change(screen.getByPlaceholderText(TITLE_PLACEHOLDER), {
      target: { value: 'New idea' },
    });

    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('New idea');
  });

  it('starts collapsed and hides the form until the header is toggled', () => {
    renderCard({ collapsed: true, initialTitle: 'Done work' });

    // collapsed => expanded starts false => the inputs are not mounted.
    expect(screen.queryByPlaceholderText(TITLE_PLACEHOLDER)).toBeNull();
    expect(screen.getByText('Analysis complete — expand to see inputs')).toBeDefined();

    fireEvent.click(screen.getByRole('button'));

    // Now the form is expanded and mounted.
    expect(screen.getByPlaceholderText(TITLE_PLACEHOLDER)).toBeDefined();
  });

  it('disables the inputs and omits the run button when collapsed', () => {
    renderCard({ collapsed: true, initialTitle: 'Done work' });

    // Expand the collapsed card to reveal the (disabled) inputs.
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByPlaceholderText<HTMLInputElement>(TITLE_PLACEHOLDER).disabled).toBe(true);
    expect(screen.getByPlaceholderText<HTMLTextAreaElement>(DESCRIPTION_PLACEHOLDER).disabled).toBe(
      true
    );
    expect(screen.getByPlaceholderText<HTMLInputElement>(LABELS_PLACEHOLDER).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Run Analysis/ })).toBeNull();
  });

  it('collapses the expanded form when the header is toggled', () => {
    renderCard({ initialTitle: 'Refactor auth' });

    // Starts expanded (collapsed=false): the header is the button that is not
    // the run button, and clicking it should hide the inputs.
    expect(screen.getByPlaceholderText(TITLE_PLACEHOLDER)).toBeDefined();
    fireEvent.click(screen.getByRole('heading', { level: 3 }).closest('button')!);

    expect(screen.queryByPlaceholderText(TITLE_PLACEHOLDER)).toBeNull();
  });
});
