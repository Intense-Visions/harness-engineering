import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Truth 10: the canary CLI is reachable only through adapters/canary.ts. No other
// module in the package may name the `canary-test-cli` package or invoke the
// `canary` bin directly — everything goes through the adapter boundary.
const srcRoot = fileURLToPath(new URL('../../src', import.meta.url));
const CANARY_ADAPTER = join('adapters', 'canary.ts');

// Matches the npm package name, or the bin invoked as a quoted token ('canary',
// "canary", `canary`). Deliberately does NOT match the exported Canary* symbol
// names (createCanaryAdapter, CanaryProbe, …) or the './canary.js' barrel path.
const FORBIDDEN = /canary-test-cli|['"`]canary['"`]/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('canary boundary', () => {
  it('only adapters/canary.ts references the canary-test-cli package or the canary bin', () => {
    const offenders = walk(srcRoot)
      .filter((f) => f.endsWith('.ts') && !f.endsWith(CANARY_ADAPTER))
      .filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
