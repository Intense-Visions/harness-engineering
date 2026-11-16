import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleCheckDependencies } from '../../../src/mcp/tools/architecture';
import { runCheckDeps } from '../../../src/commands/check-deps';

/**
 * Parity between the `check_dependencies` MCP tool and `harness check-deps`
 * (follow-up to #2606 / #2607).
 *
 * `check-deps` and the `harness ci check` deps step read harness.config.json
 * through core's `resolveDepsSettings` / `toLayerConfig`. The MCP tool built
 * its own LayerConfig and ignored `deps.exclude` and `rootDir`, so an agent
 * asking the MCP tool got violations the CLI had excluded, and it never named
 * the files it could not parse.
 *
 * Real engine, real temp-dir fixtures (no mocks): the parity is the claim.
 */
const VIOLATING = "import { db } from '../infra/db';\nexport const order = db;\n";
const BROKEN_LINE = 'function broken( {\n';

interface Fixture {
  exclude?: string[];
  fallbackBehavior?: 'warn';
  rootDir?: string;
  broken?: boolean;
}

function scaffold(opts: Fixture = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-mcp-deps-parity-'));
  const src = path.join(root, opts.rootDir ?? '.', 'src');
  fs.mkdirSync(path.join(src, 'domain/legacy'), { recursive: true });
  fs.mkdirSync(path.join(src, 'infra'), { recursive: true });
  fs.writeFileSync(path.join(src, 'infra/db.ts'), 'export const db = 1;\n');
  fs.writeFileSync(
    path.join(src, 'domain/legacy/order.ts'),
    "import { db } from '../../infra/db';\nexport const order = db;\n"
  );
  fs.writeFileSync(path.join(src, 'domain/clean.ts'), 'export const clean = 1;\n');
  if (opts.broken) {
    fs.writeFileSync(path.join(src, 'domain/order.ts'), VIOLATING + BROKEN_LINE);
  }
  const deps: Record<string, unknown> = {};
  if (opts.exclude) deps.exclude = opts.exclude;
  if (opts.fallbackBehavior) deps.fallbackBehavior = opts.fallbackBehavior;
  fs.writeFileSync(
    path.join(root, 'harness.config.json'),
    JSON.stringify({
      version: 1,
      rootDir: opts.rootDir ?? '.',
      layers: [
        { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
        { name: 'infra', pattern: 'src/infra/**', allowedDependencies: ['domain'] },
      ],
      ...(Object.keys(deps).length > 0 ? { deps } : {}),
    })
  );
  return root;
}

const norm = (p: string): string => p.replaceAll('\\', '/');

async function both(root: string) {
  const cli = await runCheckDeps({ cwd: root, configPath: path.join(root, 'harness.config.json') });
  if (!cli.ok) throw new Error(`check-deps failed: ${cli.error.message}`);
  const mcp = await handleCheckDependencies({ path: root });
  expect(mcp.isError).toBeFalsy();
  const payload = JSON.parse(mcp.content[0]!.text) as {
    valid: boolean;
    violations: Array<{ file: string; imports: string }>;
    unavailableChecks?: Array<{ check: string; file?: string; reason: string }>;
    abstentionDowngraded?: boolean;
  };
  const cliViolations = cli.value.layerViolations
    .map((v) => `${norm(v.file)} -> ${norm(v.imports)}`)
    .sort();
  const mcpViolations = payload.violations
    .map((v) => `${norm(v.file)} -> ${norm(v.imports)}`)
    .sort();
  return { cli: cli.value, payload, cliViolations, mcpViolations };
}

describe('check_dependencies MCP tool agrees with harness check-deps (#2606)', () => {
  let root: string;
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('positive control: both report the same violation without deps.exclude', async () => {
    root = scaffold();
    const r = await both(root);
    expect(r.cliViolations).toHaveLength(1);
    expect(r.mcpViolations).toEqual(r.cliViolations);
    expect(r.payload.valid).toBe(false);
  });

  it('honours deps.exclude exactly as check-deps does', async () => {
    root = scaffold({ exclude: ['src/domain/legacy/**'] });
    const r = await both(root);
    expect(r.cliViolations).toEqual([]);
    expect(r.mcpViolations).toEqual(r.cliViolations);
    expect(r.payload.valid).toBe(true);
  });

  it('resolves layer patterns against rootDir exactly as check-deps does', async () => {
    root = scaffold({ rootDir: 'app' });
    const r = await both(root);
    expect(r.cliViolations).toHaveLength(1);
    expect(r.mcpViolations).toEqual(r.cliViolations);
  });

  it("reports an unparseable file like check-deps under fallbackBehavior 'warn'", async () => {
    root = scaffold({ broken: true, fallbackBehavior: 'warn' });
    const r = await both(root);
    expect(r.mcpViolations).toEqual(r.cliViolations);
    const cliFiles = (r.cli.unavailableChecks ?? []).map((u) => u.file).filter(Boolean);
    expect(cliFiles).toEqual(['src/domain/order.ts']);
    expect(r.payload.unavailableChecks).toEqual(r.cli.unavailableChecks);
    expect(r.payload.abstentionDowngraded).toBe(true);
    expect(r.cli.abstentionDowngraded).toBe(true);
  });

  it('reports an unparseable file without downgrading under the default policy', async () => {
    root = scaffold({ broken: true });
    const r = await both(root);
    expect(r.payload.unavailableChecks).toEqual(r.cli.unavailableChecks);
    expect(r.payload.abstentionDowngraded).toBeUndefined();
  });
});
