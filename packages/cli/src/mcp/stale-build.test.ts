import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { describeStaleBuildError } from './stale-build.js';

/**
 * The transcript this was written from (2026-09-14), reproduced rather than
 * paraphrased. A `manage_roadmap` call against a server started before an
 * upgrade answered:
 *
 * ```
 * Error: Cannot find module '…/dist/dist-QI44KYEI.js'
 *   imported from '…/dist/chunk-GF46LTKE.js'
 * ```
 *
 * Both named files were absent from the installed package, which was intact and
 * at the latest published version, and every fresh `npx harness` invocation
 * worked. The install was misdiagnosed as corrupt twice before the running
 * process was identified as the stale party.
 */

/** This test file's own directory, which is the `dist/` the built code checks against. */
const OWN_DIR = fileURLToPath(new URL('.', import.meta.url));

/** Node's real shape for a failed dynamic import: a `code` and a `file://` `url`. */
function moduleNotFound(missing: string, overrides: Record<string, unknown> = {}): Error {
  const error = new Error(
    `Cannot find module '${missing}' imported from ${OWN_DIR}chunk-GF46LTKE.js`
  ) as Error & { code?: string; url?: string };
  error.code = 'ERR_MODULE_NOT_FOUND';
  error.url = new URL(`file://${missing}`).href;
  return Object.assign(error, overrides);
}

describe('describeStaleBuildError', () => {
  it('recognises a hashed chunk missing from its own dist, and says to restart', () => {
    const message = describeStaleBuildError(moduleNotFound(`${OWN_DIR}dist-QI44KYEI.js`));

    expect(message).not.toBeNull();
    // The remedy is the whole point of the translation — assert it literally.
    expect(message).toContain('Restart the MCP server');
    expect(message).toContain('reinstalling it will not help');
    // And the offending specifier, so the report stays diagnosable.
    expect(message).toContain('dist-QI44KYEI.js');
  });

  it('recognises the `chunk-` prefix as well as `dist-`', () => {
    expect(describeStaleBuildError(moduleNotFound(`${OWN_DIR}chunk-GF46LTKE.js`))).not.toBeNull();
  });

  it('reads the specifier from the message when `url` is absent', () => {
    // `.url` is documented; the message is not. The fallback exists so a Node
    // version that stops populating `url` degrades to a worse message rather
    // than to the opaque original.
    const error = moduleNotFound(`${OWN_DIR}dist-QI44KYEI.js`);
    delete (error as { url?: string }).url;

    expect(describeStaleBuildError(error)).toContain('dist-QI44KYEI.js');
  });

  describe('does not over-match — each of these must keep its original error', () => {
    it("a missing module in the user's own project", () => {
      expect(describeStaleBuildError(moduleNotFound('/home/u/app/src/missing.js'))).toBeNull();
    });

    it('a dependency this package genuinely failed to ship', () => {
      // Inside our dist, but not a hashed chunk: that is a packaging bug and
      // wants a packaging report, not "restart your server".
      expect(describeStaleBuildError(moduleNotFound(`${OWN_DIR}index.js`))).toBeNull();
    });

    it('a hashed chunk belonging to some other installed package', () => {
      expect(
        describeStaleBuildError(moduleNotFound('/usr/lib/node_modules/other/dist/dist-AAAAAAAA.js'))
      ).toBeNull();
    });

    it('an error with the right shape but a different code', () => {
      const wrongCode = moduleNotFound(`${OWN_DIR}dist-QI44KYEI.js`, { code: 'ERR_REQUIRE_ESM' });
      expect(describeStaleBuildError(wrongCode)).toBeNull();
    });

    it('an ordinary Error, a string, null and undefined', () => {
      expect(describeStaleBuildError(new Error('boom'))).toBeNull();
      expect(describeStaleBuildError('ERR_MODULE_NOT_FOUND')).toBeNull();
      expect(describeStaleBuildError(null)).toBeNull();
      expect(describeStaleBuildError(undefined)).toBeNull();
    });
  });

  it('requires BOTH conditions, not either — proven by flipping one at a time', () => {
    // The two guards are an AND, and a regression that loosened it to an OR
    // would still pass every case above. These two pin the conjunction: each
    // input satisfies exactly one half and must still be rejected.
    const ownDirButNotAChunk = moduleNotFound(`${OWN_DIR}tools/roadmap.js`);
    const chunkButNotOwnDir = moduleNotFound('/elsewhere/dist/dist-BBBBBBBB.js');

    expect(describeStaleBuildError(ownDirButNotAChunk)).toBeNull();
    expect(describeStaleBuildError(chunkButNotOwnDir)).toBeNull();
    // ...while the conjunction of the two is recognised.
    expect(describeStaleBuildError(moduleNotFound(`${OWN_DIR}dist-CCCCCCCC.js`))).not.toBeNull();
  });
});
