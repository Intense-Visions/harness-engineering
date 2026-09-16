import { createRequire } from 'node:module';
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
 * A tsup content-hashed chunk, which is the only kind of missing file that
 * implies build skew rather than a genuinely broken install.
 *
 * Matching the *shape* rather than any particular hash is the point: the hashes
 * change every build, so a list of known names would be stale by construction.
 */
const HASHED_CHUNK = /\/(?:dist|chunk)-[A-Z0-9]{8,}\.js$/;

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

/** This build's own `dist/` directory, resolved from this module's location. */
function ownDistDir(): string {
  return fileURLToPath(new URL('.', import.meta.url));
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
    const require = createRequire(import.meta.url);
    const pkg = require('../../package.json') as { version?: string };
    return pkg.version ?? null;
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
  if (!missing.startsWith(ownDistDir())) return null;
  if (!HASHED_CHUNK.test(missing)) return null;

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
