import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { getConfig } from '@testing-library/react';

// Deliberately does NOT import ./setup: importing it would apply configure()
// itself and make this pass even if setupFiles stopped loading it.
function vitestTestTimeout(): number {
  // Importing vitest.config.mts here pulls esbuild into jsdom, so read the literal.
  const src = readFileSync(path.resolve(import.meta.dirname, '../../vitest.config.mts'), 'utf8');
  const match = /testTimeout:\s*([\d_]+)/.exec(src);
  if (!match) throw new Error('testTimeout not found in vitest.config.mts');
  return Number(match[1].replaceAll('_', ''));
}

describe('client test setup (#2339)', () => {
  it('raises the RTL wait budget above the 1000 ms default for every client test', () => {
    expect(getConfig().asyncUtilTimeout).toBeGreaterThan(1_000);
  });

  it('keeps the wait budget below the per-test timeout', () => {
    expect(getConfig().asyncUtilTimeout).toBeLessThan(vitestTestTimeout());
  });
});
