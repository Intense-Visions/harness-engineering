import { describe, it, expect } from 'vitest';
import { manualToRawWorkItem } from '../../src/adapters/manual.js';

describe('manualToRawWorkItem', () => {
  it('maps title and generates unique ID', () => {
    const result = manualToRawWorkItem({ title: 'Fix the login page' });

    expect(result.id).toMatch(/^manual-[0-9a-f-]+$/);
    expect(result.title).toBe('Fix the login page');
    expect(result.description).toBeNull();
    expect(result.labels).toEqual([]);
    expect(result.source).toBe('manual');
    expect(result.comments).toEqual([]);
    expect(result.linkedItems).toEqual([]);
    expect(result.metadata).toEqual({});
  });

  it('includes optional description', () => {
    const result = manualToRawWorkItem({
      title: 'Add dark mode',
      description: 'Users want a dark theme option',
    });
    expect(result.description).toBe('Users want a dark theme option');
  });

  it('includes optional labels', () => {
    const result = manualToRawWorkItem({
      title: 'Bug fix',
      labels: ['bug', 'urgent'],
    });
    expect(result.labels).toEqual(['bug', 'urgent']);
  });

  it('generates unique IDs for each call', () => {
    const a = manualToRawWorkItem({ title: 'Task A' });
    const b = manualToRawWorkItem({ title: 'Task B' });
    expect(a.id).not.toBe(b.id);
  });
});
