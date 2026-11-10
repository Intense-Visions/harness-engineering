import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { expectRenderedOnce } from './render-assertions';
import React from 'react';
import { ThinkingBlockView } from '../../../../../src/client/components/chat/blocks/ThinkingBlockView';

/**
 * Characterization tests for ThinkingBlockView — the assistant's reasoning,
 * tucked inside a native <details> disclosure labelled "Thinking..." that
 * starts collapsed and expands on click.
 */

function renderThinking(text: string) {
  return render(<ThinkingBlockView block={{ kind: 'thinking', text }} />);
}

describe('ThinkingBlockView', () => {
  it('labels the disclosure "Thinking..."', () => {
    renderThinking('Let me check the config first.');
    expect(expectRenderedOnce('Thinking...').tagName).toBe('SUMMARY');
  });

  it('starts collapsed', () => {
    const { container } = renderThinking('Let me check the config first.');
    expect(container.querySelector('details')?.open).toBe(false);
  });

  it('expands when the summary is clicked', () => {
    const { container } = renderThinking('Let me check the config first.');
    fireEvent.click(expectRenderedOnce('Thinking...'));
    expect(container.querySelector('details')?.open).toBe(true);
  });

  it('places the reasoning text inside the disclosure body, not the summary', () => {
    const { container } = renderThinking('Let me check the config first.');
    const body = expectRenderedOnce('Let me check the config first.');
    expect(container.querySelector('summary')?.contains(body)).toBe(false);
  });

  it('keeps the line breaks of multi-line reasoning in a whitespace-preserving paragraph', () => {
    const { container } = renderThinking('step one\nstep two');
    const paragraph = container.querySelector('details p');
    expect(paragraph?.textContent).toBe('step one\nstep two');
    expect(paragraph?.classList.contains('whitespace-pre-wrap')).toBe(true);
  });

  it('renders the reasoning literally, not as markdown', () => {
    const { container } = renderThinking('**maybe** use `foo`');
    expectRenderedOnce('**maybe** use `foo`');
    expect(container.querySelector('strong, code')).toBeNull();
  });
});
