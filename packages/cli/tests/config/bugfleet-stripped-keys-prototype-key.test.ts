import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfig } from '../../src/config/loader';

/**
 * Regression guard: the #862 stripped-key warning walk indexes the zod shape with
 * a bare `shape[key]` truthiness test. For any config key that collides with an
 * `Object.prototype` member (`__proto__`, `constructor`, `toString`,
 * `hasOwnProperty`, …) that lookup returns an inherited value instead of
 * `undefined`, so the walk recurses into a non-schema object and throws
 * `TypeError: Cannot read properties of undefined (reading 'typeName')`.
 *
 * `warnStrippedKeys` swallows the throw ("detection is best-effort"), so the
 * entire file's unknown-key diagnostics vanish — reinstating exactly the silent
 * no-op that #862 exists to prevent, for every other key in the same config.
 */
describe('loadConfig — stripped-key warnings survive a prototype-named config key', () => {
  const dirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function writeRawConfig(json: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-bugfleet-cfg-'));
    dirs.push(dir);
    const configPath = path.join(dir, 'harness.config.json');
    fs.writeFileSync(configPath, json);
    return configPath;
  }

  it("warns about the typo'd 'securty' key even when the config also carries a '__proto__' key", () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    // Raw JSON text on purpose: `JSON.stringify({ __proto__: ... })` would drop
    // the key, while `JSON.parse` defines it as a genuine own property — which is
    // what a tool-generated or hand-merged harness.config.json actually contains.
    const configPath = writeRawConfig(
      '{"version":1,"__proto__":{"note":"x"},"securty":{"enabled":true}}'
    );

    const result = loadConfig(configPath);

    expect(result.ok).toBe(true); // precondition: the load itself is unaffected
    const output = stderr.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain("ignored unknown key 'securty'");
  });
});
