import { describe, it, expect } from 'vitest';
import { greet } from '../src/index';
import { formatName } from '../src/utils';

describe('greet', () => {
  it('greets by name', () => {
    expect(greet('World')).toBe('Hello, World!');
  });

  it('formats the name', () => {
    expect(greet('alice')).toBe('Hello, Alice!');
  });
});

describe('formatName', () => {
  it('capitalizes first letter', () => {
    expect(formatName('alice')).toBe('Alice');
  });

  it('handles empty string', () => {
    expect(formatName('')).toBe('');
  });
});
