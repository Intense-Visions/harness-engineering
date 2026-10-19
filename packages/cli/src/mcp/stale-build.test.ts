import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeStaleBuildError, isHashedChunk, packageJsonPath } from './stale-build.js';

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
    // The version read fresh from disk is the other half of the remedy: it is
    // how the operator tells what they now have from what this process still
    // is. If the manifest cannot be located the message silently degrades to
    // "could not be read", so assert the real thing.
    expect(message).toMatch(/The version now installed on disk is \d+\.\d+\.\d+/);
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

describe('isHashedChunk', () => {
  it('recognises a hashed chunk under a POSIX path', () => {
    expect(
      isHashedChunk('/usr/lib/node_modules/@harness-engineering/cli/dist/dist-QI44KYEI.js')
    ).toBe(true);
    expect(
      isHashedChunk('/usr/lib/node_modules/@harness-engineering/cli/dist/chunk-GF46LTKE.js')
    ).toBe(true);
  });

  it('recognises a hashed chunk under a Windows path', () => {
    // This is the case the recogniser used to miss entirely. The pattern
    // anchored a literal `/` before the filename, and `missingPath()` returns
    // a filesystem path, so on Windows nothing ever matched and
    // `describeStaleBuildError` answered `null` for its own subject. A global
    // npm package is upgraded under a running server on Windows exactly as it
    // is on POSIX, and tsup emits the same content-hashed chunks there.
    expect(
      isHashedChunk(String.raw`D:\npm\node_modules\@harness-engineering\cli\dist\dist-QI44KYEI.js`)
    ).toBe(true);
    expect(
      isHashedChunk(
        String.raw`C:\Users\dev\AppData\Roaming\npm\node_modules\cli\dist\chunk-GF46LTKE.js`
      )
    ).toBe(true);
  });

  it('rejects anything that is not a hashed chunk, on either separator', () => {
    // A file we genuinely failed to ship: a packaging bug, not build skew.
    expect(isHashedChunk('/pkg/dist/index.js')).toBe(false);
    expect(isHashedChunk(String.raw`D:\pkg\dist\index.js`)).toBe(false);
    // Too short, and the wrong case: esbuild's hash alphabet is uppercase.
    expect(isHashedChunk('/pkg/dist/dist-ABC.js')).toBe(false);
    expect(isHashedChunk('/pkg/dist/dist-qi44kyei.js')).toBe(false);
    // The chunk name has to be the file, not a directory along the way.
    expect(isHashedChunk('/pkg/chunk-GF46LTKE.js/index.js')).toBe(false);
  });
});

describe('packageJsonPath', () => {
  // A stand-in for the real tree. `packages/cli/package.json` is this package;
  // `packages/package.json` is the one a fixed `'../../package.json'` would
  // have reached from the flat `dist/` bundle, and it is deliberately present
  // and deliberately named something else, because the failure being pinned is
  // resolving to the WRONG manifest rather than to none at all.
  const at = (...segments: string[]): string => path.resolve('/repo', ...segments);
  const manifests = new Map<string, string>([
    [at('packages', 'package.json'), '@harness-engineering/monorepo'],
    [at('packages', 'cli', 'package.json'), '@harness-engineering/cli'],
  ]);
  const readName = (manifestPath: string): string | null => manifests.get(manifestPath) ?? null;

  const ownManifest = at('packages', 'cli', 'package.json');

  it('finds the manifest from the source layout, two directories deep', () => {
    expect(packageJsonPath(at('packages', 'cli', 'src', 'mcp'), readName)).toBe(ownManifest);
  });

  it('finds the same manifest from the shipped flat bundle, one directory deep', () => {
    // tsup emits a flat bundle, so at runtime this module sits in `dist/`.
    // Every fixed relative specifier that is right from `src/mcp/` is wrong
    // here, and the test suite runs from `src/` so it cannot see that.
    expect(packageJsonPath(at('packages', 'cli', 'dist'), readName)).toBe(ownManifest);
  });

  it('finds it from the package root itself', () => {
    expect(packageJsonPath(at('packages', 'cli'), readName)).toBe(ownManifest);
  });

  it('returns null rather than the nearest manifest of some other package', () => {
    // `packages/` has a manifest, and it is not ours. Walking past it is the
    // whole point; answering with it would be the original bug in a new shape.
    expect(packageJsonPath(at('packages', 'other', 'src'), readName)).toBeNull();
  });
});
