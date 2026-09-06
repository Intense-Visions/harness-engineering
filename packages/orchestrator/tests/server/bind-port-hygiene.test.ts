import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Regression guard for issue #1827 / CI run 33905194260.
 *
 * A test that guesses a port and binds it can fail to bind. On POSIX the
 * refusal is EADDRINUSE; on Windows the same class of refusal arrives as
 * EACCES, because
 *
 *   1. Windows reserves blocks of the dynamic range for Hyper-V/WinNAT
 *      (`netsh interface ipv4 show excludedportrange protocol=tcp`), and a
 *      bind into a reserved block is refused with WSAEACCES; and
 *   2. libuv sets SO_EXCLUSIVEADDRUSE on Windows TCP listeners, so binding a
 *      port another socket already holds also yields WSAEACCES.
 *
 * `OrchestratorServer.start()` rejects on bind failure by design, so a single
 * such refusal can take a whole CI job red even when every test passes.
 *
 * Binding 0 removes the race rather than managing it: the OS only ever hands
 * back a port it has already reserved for that socket. `OrchestratorServer`
 * adopts the assigned port and exposes it as `boundPort`; a raw
 * `http.Server` exposes it as `(server.address() as AddressInfo).port`.
 *
 * This guard therefore asserts the absence of the pattern, not the presence of
 * a retry. Retries, widened ranges and sleeps are explicitly NOT acceptable
 * fixes — they leave the flake latent.
 */
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const SCANNED_DIRS = ['tests', 'src'];

/** `port = Math.floor(Math.random() * N) + BASE` and near relatives. */
const GUESSED_PORT =
  /(?:port|Port)\s*(?::\s*number\s*)?=\s*Math\s*\.\s*(?:floor|round|trunc)?\s*\(?\s*Math\s*\.\s*random/;

function collectTypeScriptFiles(dir: string, found: string[] = []): string[] {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      collectTypeScriptFiles(full, found);
    } else if (entry.name.endsWith('.ts')) {
      found.push(full);
    }
  }
  return found;
}

describe('bind-port hygiene (issue #1827)', () => {
  it('no source or test file derives a bind port from Math.random()', () => {
    const offenders: string[] = [];

    for (const dirName of SCANNED_DIRS) {
      for (const file of collectTypeScriptFiles(path.join(PACKAGE_ROOT, dirName))) {
        // Exempt this guard itself — it necessarily contains the pattern it bans.
        if (path.resolve(file) === path.resolve(__filename)) continue;
        const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, i) => {
          if (GUESSED_PORT.test(line)) {
            const rel = path.relative(PACKAGE_ROOT, file).split(path.sep).join('/');
            offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
          }
        });
      }
    }

    expect(
      offenders,
      'Bind 0 and read the OS-assigned port back (OrchestratorServer.boundPort, or ' +
        '(server.address() as AddressInfo).port) instead of guessing. See issue #1827.\n' +
        offenders.join('\n')
    ).toEqual([]);
  });
});
