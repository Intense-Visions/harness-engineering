import { describe, it, expect } from 'vitest';
import { extractMarkdownLinks } from '../../src/context/agents-map';

describe('extractMarkdownLinks', () => {
  it('should extract simple markdown links', () => {
    const content = 'Check out [README](./README.md) for more info.';
    const links = extractMarkdownLinks(content);

    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({
      text: 'README',
      path: './README.md',
      line: 1,
    });
  });

  it('should extract multiple links from same line', () => {
    const content = 'See [docs](./docs/) and [api](./api.md)';
    const links = extractMarkdownLinks(content);

    expect(links).toHaveLength(2);
    expect(links[0].text).toBe('docs');
    expect(links[1].text).toBe('api');
  });

  it('should track line numbers correctly', () => {
    const content = `# Title

See [link1](./file1.md)

And [link2](./file2.md)`;
    const links = extractMarkdownLinks(content);

    expect(links).toHaveLength(2);
    expect(links[0].line).toBe(3);
    expect(links[1].line).toBe(5);
  });
});
