import { describe, it, expect } from 'vitest';
import { extractMarkdownLinks, extractSections } from '../../src/context/agents-map';

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

describe('extractSections', () => {
  it('should extract sections with headings', () => {
    const content = `# Project Overview

Some description here.

## Repository Structure

- [src](./src/)

## Development Workflow

Run tests with:`;
    const sections = extractSections(content);

    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe('Project Overview');
    expect(sections[0].level).toBe(1);
    expect(sections[0].line).toBe(1);
    expect(sections[1].title).toBe('Repository Structure');
    expect(sections[1].level).toBe(2);
    expect(sections[2].title).toBe('Development Workflow');
  });

  it('should associate links with correct sections', () => {
    const content = `## About

See [readme](./README.md)

## Code

Check [src](./src/) and [tests](./tests/)`;
    const sections = extractSections(content);

    expect(sections[0].links).toHaveLength(1);
    expect(sections[0].links[0].text).toBe('readme');
    expect(sections[1].links).toHaveLength(2);
  });

  it('should capture section description', () => {
    const content = `## Overview

This is the project overview.
It spans multiple lines.

## Next Section`;
    const sections = extractSections(content);

    expect(sections[0].description).toContain('project overview');
  });
});
