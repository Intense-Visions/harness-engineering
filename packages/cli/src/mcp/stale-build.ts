import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Recognise an MCP server that has outlived its own build.
 *
 * **The failure this exists for.** The server is a long-lived process. The CLI
 * it runs from is a global npm package that gets upgraded underneath it —
 * `npm i -g @harness-engineering/cli`, or any reinstall — and a tsup build
 * emits content-hashed chunks (`chunk-GF46LTKE.js`, `dist-QI44KYEI.js`), so an
 * upgrade does not overwrite the old chunks, it *deletes* them and writes new
 * ones under new hashes.
 *
 * A running server does not notice. Its already-resolved modules stay in
 * memory, so most tools keep working. But any code path that has not been
 * imported yet — the lazy `import()` behind a rarely-used tool — resolves
 * against the filesystem at call time, and the chunk it wants is gone. Node
 * answers `ERR_MODULE_NOT_FOUND` naming two hashed filenames, one of which no
 * longer exists and the other of which *also* no longer exists but is still
 * resident in the process that is asking:
 *
 * ```
 * Cannot find module '…/dist/dist-QI44KYEI.js'
 *   imported from '…/dist/chunk-GF46LTKE.js'
 * ```
 *
 * **Why it needs translating rather than just surfacing.** That message is
 * opaque in a specific and expensive way: both names are build artefacts that
 * appear in no source file and no changelog, the package on disk is intact and
 * current, and every fresh `npx harness …` invocation works. So the evidence
 * all points at a corrupt install, which is the one thing it is not — a
 * reinstall "fixes" nothing because there is nothing wrong with the install.
 * The fix is to restart the server, and nothing in the error says so.
 *
 * This is deliberately a *recogniser*, not a repair. The process cannot reload
 * its own deleted chunks, so the only honest thing it can do is fail with an
 * error that names the cause and the remedy.
 */

/** Node's own code for a specifier that did not resolve. */
const MODULE_NOT_FOUND = 'ERR_MODULE_NOT_FOUND';

/**
 * A tsup content-hashed chunk *filename*, which is the only kind of missing
 * file that implies build skew rather than a genuinely broken install.
 *
 * Matching the *shape* rather than any particular hash is the point: the hashes
 * change every build, so a list of known names would be stale by construction.
 *
 * Anchored to the filename alone, because the path separator differs by
 * platform and the filename does not. An earlier version baked a leading `/`
 * into this pattern, which made the whole recogniser dead on Windows — where
 * `missingPath()` hands back `D:\…\dist\dist-QI44KYEI.js` — for exactly the
 * input it exists to catch.
 */
const HASHED_CHUNK = /^(?:dist|chunk)-[A-Z0-9]{8,}\.js$/;

/**
 * The filename at the end of a path, split on either separator.
 *
 * `path.basename` splits on the separator of the platform it is *running* on
 * rather than the one that produced the path, so on POSIX it hands a Windows
 * path back whole. Splitting on both makes the answer depend on the path
 * instead of on the host, which is also what lets a Windows-shaped input be
 * pinned by a test that runs everywhere.
 */
function fileNameOf(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] ?? filePath;
}

/**
 * Does this path name a content-hashed build chunk?
 *
 * Exported for its own unit test: the platform skew this guards against is by
 * definition invisible to a suite that runs on one platform at a time.
 */
export function isHashedChunk(filePath: string): boolean {
  return HASHED_CHUNK.test(fileNameOf(filePath));
}

type ModuleNotFoundError = Error & { code?: string; url?: string };

function asModuleNotFound(error: unknown): ModuleNotFoundError | null {
  if (!(error instanceof Error)) return null;
  const candidate = error as ModuleNotFoundError;
  return candidate.code === MODULE_NOT_FOUND ? candidate : null;
}

/**
 * The specifier that failed to resolve, as a filesystem path.
 *
 * Node puts it on `.url` as a `file://` URL. The message is parsed only as a
 * fallback, because `.url` is documented and the message is not.
 */
function missingPath(error: ModuleNotFoundError): string | null {
  if (typeof error.url === 'string' && error.url.startsWith('file://')) {
    try {
      return fileURLToPath(error.url);
    } catch {
      /* fall through to the message */
    }
  }
  const quoted = /Cannot find module '([^']+)'/.exec(error.message);
  return quoted?.[1] ?? null;
}

/**
 * This module's own directory.
 *
 * In the shipped build that directory *is* `dist/`, because tsup emits a flat
 * bundle; in the source tree it is `src/mcp/`. Everything below that cares
 * about the difference says so explicitly rather than assuming one of them.
 */
function moduleDir(): string {
  return fileURLToPath(new URL('.', import.meta.url));
}

/**
 * Is the missing file inside this build's own output directory?
 *
 * Both sides go through `path.resolve` so the answer does not depend on the
 * two strings happening to be spelled the same way — today they both come from
 * `fileURLToPath`, but nothing pins that. The explicit trailing separator is
 * what stops a sibling directory such as `…/dist-backup/` from matching.
 */
function isInsideOwnDist(missing: string): boolean {
  const own = path.resolve(moduleDir());
  return path.resolve(missing).startsWith(own + path.sep);
}

/** The npm name of the package this module ships inside. */
const PACKAGE_NAME = '@harness-engineering/cli';

const requireHere = createRequire(import.meta.url);

/** A candidate manifest's `name`, or `null` where there is no readable manifest. */
function manifestName(manifestPath: string): string | null {
  try {
    return (requireHere(manifestPath) as { name?: string }).name ?? null;
  } catch {
    return null;
  }
}

/**
 * Locate this package's own `package.json` by walking up from `startDir`.
 *
 * A fixed relative specifier cannot do this job, and the reason is the very
 * skew this module is about. This file sits two directories deep in the source
 * tree (`src/mcp/`) and one deep in the shipped build (tsup flattens the
 * bundle into `dist/`). So `'../../package.json'` is right from the source and
 * resolves a level *above* the package in the build, while `'../package.json'`
 * is right from the build and resolves to a file that does not exist from the
 * source. Either constant is silently wrong in one of the two layouts, and the
 * test suite — which runs from the source — can only ever see the half it is
 * standing in.
 *
 * Identifying the package instead of counting directories removes the choice:
 * walk up and take the first manifest that actually names this package.
 *
 * @param startDir directory to begin the walk from.
 * @param readName resolves a candidate manifest path to its `name` field.
 *   Injectable so the src-versus-dist skew can be pinned without a fixture tree.
 * @returns the absolute manifest path, or `null` if the walk reaches the
 *   filesystem root without finding one.
 */
export function packageJsonPath(
  startDir: string,
  readName: (manifestPath: string) => string | null = manifestName
): string | null {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, 'package.json');
    if (readName(candidate) === PACKAGE_NAME) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The installed package version, read fresh from disk rather than from a
 * constant compiled into this build.
 *
 * Reading it from disk is what makes the message useful: the version bundled
 * into *this* (stale) build is the old one, and the whole point is to tell the
 * operator what they are now running versus what this process still is.
 */
function installedVersion(): string | null {
  try {
    const manifest = packageJsonPath(moduleDir());
    if (!manifest) return null;
    return (requireHere(manifest) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

/**
 * Describe a build-skew failure, or return `null` if this is some other error.
 *
 * Returning `null` for anything unrecognised is deliberate: a genuine
 * `ERR_MODULE_NOT_FOUND` from a user's own project, or from a dependency this
 * package really is missing, must keep its original message. Claiming those are
 * stale-server problems would send someone to restart a server that was never
 * the issue — trading one misleading error for another.
 */
export function describeStaleBuildError(error: unknown): string | null {
  const notFound = asModuleNotFound(error);
  if (!notFound) return null;

  const missing = missingPath(notFound);
  if (!missing) return null;

  // Both conditions matter. Inside our own dist rules out a project's missing
  // dependency; the hashed-chunk shape rules out a file we simply failed to
  // ship, which is a packaging bug and wants a different report.
  if (!isInsideOwnDist(missing)) return null;
  if (!isHashedChunk(missing)) return null;

  const version = installedVersion();
  const versionLine = version
    ? `The version now installed on disk is ${version}.`
    : 'The version now installed on disk could not be read.';

  return [
    'This harness MCP server is running a build that no longer exists on disk.',
    '',
    `It tried to lazily load \`${missing}\`, which was removed when the CLI was`,
    'upgraded or reinstalled while this server was still running. Builds emit',
    'content-hashed chunks, so an upgrade deletes the old ones rather than',
    'replacing them in place. Modules already in memory keep working, which is',
    'why only some tools fail and why they fail at first use rather than at',
    'startup.',
    '',
    '**Restart the MCP server.** Nothing is wrong with the installed package,',
    `and reinstalling it will not help. ${versionLine}`,
    '',
    'In Claude Code: `/mcp` and reconnect, or restart the session. Any tool that',
    'has not yet been called in this process may fail the same way until then.',
  ].join('\n');
}
