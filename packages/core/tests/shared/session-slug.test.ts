import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import { sessionSlugError } from '../../src/shared/session-slug';
import { validateOverrideSlug } from '../../src/autonomy/paths';
import { resolveSessionDir } from '../../src/state/session-resolver';

/** S2: ONE slug validator shared by the state session resolver and the autonomy override store. */
const RESERVED = ['CON', 'con', 'PRN', 'AUX', 'NUL', 'nul.json', 'COM1', 'com9', 'LPT1', 'Lpt9.x'];
const PATHY = ['', '   ', '..', '../x', 'a/b', 'a\\b', 'C:x'];
// N2(a): dot-only names are `.`/`..`-like path segments; padded names differ invisibly.
const DOT_OR_PADDED = ['.', '...', '....', ' s1', 's1 ', '\ts1', 's1\n'];
// A slug that starts with a dot is a hidden path segment, and `.harness` as a slug would put a
// `.harness/reviews/` pair inside a session (review receipts read that pair as standalone).
const DOT_LEADING = ['.hidden', '.harness', '.s1'];
const consumers: Array<[string, (s: unknown) => boolean]> = [
  ['sessionSlugError', (s) => sessionSlugError(s) === null],
  ['validateOverrideSlug', (s) => validateOverrideSlug(s as string).ok],
  ['resolveSessionDir', (s) => resolveSessionDir(os.tmpdir(), s as string).ok],
];

describe.each(consumers)('%s', (_name, ok) => {
  it.each(RESERVED)('rejects Windows reserved name %j', (slug) => expect(ok(slug)).toBe(false));
  it.each(PATHY)('rejects path-like slug %j', (slug) => expect(ok(slug)).toBe(false));
  it.each(DOT_OR_PADDED)('rejects dot-only / whitespace-padded slug %j', (slug) =>
    expect(ok(slug)).toBe(false)
  );
  it.each(DOT_LEADING)('rejects a slug that starts with a dot %j', (slug) =>
    expect(ok(slug)).toBe(false)
  );
  it.each([[undefined], [null], [42], [{}], [['s1']]])('rejects non-string %j', (slug) =>
    expect(ok(slug)).toBe(false)
  );
  it.each([
    's1',
    'changes--trusted-autonomy-mode--proposal',
    'CONSOLE',
    'COM10',
    'LPT',
    'my.slug',
    's1.',
    'a b',
  ])('accepts ordinary slug %j (positive control)', (slug) => expect(ok(slug)).toBe(true));
});
