import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { offerIntegrationsSync } from '../../src/commands/update';
import { INTEGRATION_REGISTRY } from '../../src/integrations/registry';

/** Write a `.mcp.json` in `dir` configuring the given server names. */
function writeMcpConfig(dir: string, names: string[]): void {
  const mcpServers = Object.fromEntries(names.map((n) => [n, { command: 'x', args: [] }]));
  fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers }));
}

describe('offerIntegrationsSync (post-update MCP-catalog drift nudge)', () => {
  let dir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-update-sync-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const out = () => logSpy.mock.calls.map((c) => String(c[0] ?? '')).join('\n');

  it('nudges toward `harness integrations sync` when a deprecated server is configured', () => {
    writeMcpConfig(dir, ['perplexity']); // deprecated — not in the refreshed registry
    offerIntegrationsSync(dir);
    expect(out()).toContain('harness integrations sync');
    expect(out().toLowerCase()).toContain('deprecated');
  });

  it('stays silent when the configured servers match the catalog (in sync)', () => {
    writeMcpConfig(
      dir,
      INTEGRATION_REGISTRY.map((i) => i.name)
    );
    offerIntegrationsSync(dir);
    expect(out()).not.toContain('harness integrations sync');
  });

  it('stays silent when nothing is configured (fresh project)', () => {
    offerIntegrationsSync(dir); // no .mcp.json
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('never throws on a malformed .mcp.json', () => {
    fs.writeFileSync(path.join(dir, '.mcp.json'), '{ not json');
    expect(() => offerIntegrationsSync(dir)).not.toThrow();
  });
});
