import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { expectRenderedOnce, expectNotRendered } from './render-assertions';
import React from 'react';
import { TextBlockView } from '../../../../../src/client/components/chat/blocks/TextBlockView';

/**
 * Characterization tests for TextBlockView — assistant prose, which either
 * routes to the terminal-output frame or renders as markdown with fenced-code
 * syntax highlighting, after graph-packing envelopes are lifted out as chips.
 */

function renderText(text: string) {
  return render(<TextBlockView block={{ kind: 'text', text }} />);
}

describe('TextBlockView', () => {
  describe('terminal-output routing', () => {
    it('renders ordinary prose as markdown, not terminal output', () => {
      renderText('Everything passed on the first run.');
      expectNotRendered('Terminal Output');
      expectRenderedOnce('Everything passed on the first run.');
    });

    it('routes shell-prompt output to the terminal frame', () => {
      renderText('$ pnpm test\nall good');
      expectRenderedOnce('Terminal Output');
    });

    it('routes package-manager style output to the terminal frame', () => {
      renderText('> harness@1.0.0 build\n> tsc -p .');
      expectRenderedOnce('Terminal Output');
    });

    it('routes check-mark log lines to the terminal frame', () => {
      renderText('✔ 12 tests passed');
      expectRenderedOnce('Terminal Output');
    });

    it('QUIRK: a single log-looking line routes the WHOLE block to terminal output', () => {
      const mostlyProse = [
        'Here is a long explanation of what happened.',
        'It goes on for several sentences of ordinary prose.',
        'And a little more prose to be sure.',
        '$ pnpm test',
      ].join('\n');
      renderText(mostlyProse);
      expectRenderedOnce('Terminal Output');
    });

    it('QUIRK: prose beginning with a slashed path is misread as terminal output', () => {
      renderText('src/index.ts is the entry point of the package.');
      expectRenderedOnce('Terminal Output');
    });

    it('QUIRK: markdown whose fenced code contains an import is misread as terminal output', () => {
      renderText("Here is the setup:\n\n```ts\nimport { x } from './x';\n```");
      expectRenderedOnce('Terminal Output');
    });

    it('does not lift packed chips out of terminal output', () => {
      renderText('<!-- packed: structural -->\n$ pnpm test');
      expectRenderedOnce('Terminal Output');
      expectNotRendered(/Packed: structural/);
    });
  });

  describe('graph-packing chips', () => {
    it('lifts a packed envelope into a chip', () => {
      renderText('<!-- packed: structural | 200 to 100 tokens -->\nThe summary follows.');
      expectRenderedOnce('Packed: structural | 200 to 100 tokens');
    });

    it('removes the packed envelope from the rendered prose', () => {
      renderText('<!-- packed: structural -->\nThe summary follows.');
      expectRenderedOnce('The summary follows.');
      expectNotRendered(/<!--/);
    });

    it('renders one chip per packed envelope', () => {
      renderText('<!-- packed: first -->\n<!-- packed: second -->\nThe summary follows.');
      expectRenderedOnce('Packed: first');
      expectRenderedOnce('Packed: second');
    });

    it('labels the chip with an explanatory tooltip', () => {
      renderText('<!-- packed: structural -->\nThe summary follows.');
      const chip = screen.getByText('Packed: structural').closest('span[title]');
      expect(chip?.getAttribute('title')).toBe('Graph context packing applied');
    });

    it('QUIRK: the angle brackets are optional, so a bare "!-- packed: x --" also matches', () => {
      renderText('!-- packed: structural --\nThe summary follows.');
      expectRenderedOnce('Packed: structural');
    });

    it('renders no prose region when the block is nothing but a packed envelope', () => {
      const { container } = renderText('<!-- packed: structural -->');
      expectRenderedOnce('Packed: structural');
      expect(container.querySelector('.prose')).toBeNull();
    });

    it('renders no chips for prose with no packed envelope', () => {
      renderText('Just ordinary prose here.');
      expectNotRendered(/^Packed:/);
    });
  });

  describe('markdown rendering', () => {
    it('renders headings', () => {
      const { container } = renderText('# The Heading\n\nAnd a paragraph.');
      expect(container.querySelector('h1')?.textContent).toBe('The Heading');
    });

    it('renders bullet lists', () => {
      const { container } = renderText('Some intro text.\n\n* alpha\n* beta');
      expect(container.querySelectorAll('li')).toHaveLength(2);
    });

    it('renders GitHub-flavoured tables', () => {
      const md = 'Intro text.\n\n| Name | Value |\n| ---- | ----- |\n| a | 1 |';
      const { container } = renderText(md);
      expect(container.querySelector('table')).not.toBeNull();
    });

    it('renders inline code without a language chrome', () => {
      const { container } = renderText('Call the `formatToolArgs` helper.');
      const code = container.querySelector('code');
      expect(code?.textContent).toBe('formatToolArgs');
      expect(container.querySelector('.font-mono.leading-relaxed')).toBeNull();
    });
  });

  describe('fenced code blocks', () => {
    it('labels a fenced block with its language', () => {
      renderText("Example:\n\n```ts\nconst greeting = 'hi';\n```");
      expectRenderedOnce('ts');
    });

    it('renders the fenced code contents', () => {
      const { container } = renderText("Example:\n\n```ts\nconst greeting = 'hi';\n```");
      expect(container.textContent).toContain('const greeting');
    });

    it('QUIRK: a fenced block with no language is rendered as inline-style code', () => {
      const { container } = renderText('Example:\n\n```\nplain block\n```');
      expect(container.querySelector('code')?.textContent).toContain('plain block');
      expectNotRendered('ts');
    });
  });
});
