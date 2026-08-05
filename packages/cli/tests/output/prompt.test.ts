import { describe, it, expect, vi } from 'vitest';

vi.mock('node:readline', () => ({
  default: {
    createInterface: vi.fn(() => ({
      question: vi.fn((_q: string, cb: (answer: string) => void) => {
        cb('  YES  ');
      }),
      close: vi.fn(),
    })),
  },
}));

import { prompt } from '../../src/output/prompt';

describe('prompt', () => {
  it('resolves with the trimmed, lower-cased answer', async () => {
    const answer = await prompt('Continue? (y/N) ');
    expect(answer).toBe('yes');
  });
});
