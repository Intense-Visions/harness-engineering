import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { expectRenderedOnce } from './render-assertions';
import React from 'react';
import { StatusBlockView } from '../../../../../src/client/components/chat/blocks/StatusBlockView';

/**
 * Characterization tests for StatusBlockView — the transient one-line status
 * ("reading", "writing", ...) shown beside a pulsing indicator dot while the
 * assistant is working.
 */

function renderStatus(text: string) {
  return render(<StatusBlockView block={{ kind: 'status', text }} />);
}

describe('StatusBlockView', () => {
  it('renders the status text', () => {
    renderStatus('reading files');
    expectRenderedOnce('reading files');
  });

  it('renders the status text literally, not as markdown', () => {
    const { container } = renderStatus('**writing** `src/a.ts`');
    expectRenderedOnce('**writing** `src/a.ts`');
    expect(container.querySelector('strong, code')).toBeNull();
  });

  it('shows a pulsing activity indicator beside the text', () => {
    const { container } = renderStatus('writing');
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(1);
  });

  it('keeps the activity indicator when the status text is empty', () => {
    const { container } = renderStatus('');
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(1);
  });
});
