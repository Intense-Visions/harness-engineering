import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { expectRenderedOnce, expectNotRendered } from './render-assertions';
import React from 'react';
import { LogOutputView } from '../../../../../src/client/components/chat/blocks/LogOutputView';

/**
 * Characterization tests for LogOutputView — the "Terminal Output" frame that
 * TextBlockView routes log-looking assistant text into. The body is rendered
 * as GitHub-flavoured markdown inside a whitespace-preserving prose region.
 */

function renderLog(text: string) {
  return render(<LogOutputView text={text} />);
}

describe('LogOutputView', () => {
  it('labels the frame "Terminal Output"', () => {
    renderLog('$ pnpm test');
    expectRenderedOnce('Terminal Output');
  });

  it('renders the log text in the frame body', () => {
    renderLog('all 12 suites passed');
    expectRenderedOnce('all 12 suites passed');
  });

  it('keeps the frame label when the log text is empty', () => {
    const { container } = renderLog('');
    expectRenderedOnce('Terminal Output');
    expect(container.querySelector('.prose')?.textContent).toBe('');
  });

  it('keeps a soft line break as a visible newline in a whitespace-preserving region', () => {
    const { container } = renderLog('line one\nline two');
    const paragraph = container.querySelector('.prose p');
    expect(paragraph?.textContent).toBe('line one\nline two');
    expect(paragraph?.closest('.whitespace-pre-wrap')).not.toBeNull();
  });

  it('renders markdown emphasis rather than literal asterisks', () => {
    const { container } = renderLog('build **failed** on step 3');
    expect(container.querySelector('strong')?.textContent).toBe('failed');
    expectNotRendered(/\*\*failed\*\*/);
  });

  it('renders GitHub-flavoured strikethrough (remark-gfm is wired)', () => {
    const { container } = renderLog('~~skipped~~ step');
    expect(container.querySelector('del')?.textContent).toBe('skipped');
  });

  it('renders GitHub-flavoured tables', () => {
    const { container } = renderLog('| suite | result |\n| ----- | ------ |\n| core | pass |');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  });
});
