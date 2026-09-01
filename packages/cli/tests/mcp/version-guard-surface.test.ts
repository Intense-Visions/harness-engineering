/**
 * Reproducing test for #1301 — the toolchain version-skew guard (PR #1293) was
 * wired only as a commander preAction hook, so it fired on CLI invocations but
 * NOT on the MCP surface. MCP tools call the same findings-producing check
 * implementations in-process through the server's CallToolRequest handler, which
 * never runs the commander hook — a stale `harness-mcp` shim reproduced the
 * original incident unmitigated.
 *
 * These tests drive the REAL MCP dispatch path end-to-end (a linked in-memory
 * client/server pair against `createHarnessServer`), so they exercise the shared
 * entry point both surfaces share rather than a mocked seam.
 *
 * Before the fix: a findings call under sharp version skew is NOT blocked — the
 * scan runs and returns a normal result. After the fix: it is refused with an
 * `isError` result and the tool never runs.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createHarnessServer } from '../../src/mcp/server';

type ToolCallResult = {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
};

function resultText(result: ToolCallResult): string {
  return result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n');
}

async function callTool(
  projectRoot: string,
  name: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const server = createHarnessServer(projectRoot);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: {} });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    return (await client.callTool({ name, arguments: args })) as unknown as ToolCallResult;
  } finally {
    await client.close();
  }
}

describe('MCP surface version-skew guard (#1301)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'harness-version-guard-mcp-'));
    // The guard reads process.env at call time; keep the escape hatch off so the
    // refusal path is the one under test unless a test opts in explicitly.
    delete process.env['HARNESS_NO_VERSION_GUARD'];
  });

  afterEach(() => {
    delete process.env['HARNESS_NO_VERSION_GUARD'];
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function pinCliVersion(range: string): void {
    writeFileSync(
      join(projectRoot, 'harness.config.json'),
      JSON.stringify({ toolchain: { cliVersion: range } }, null, 2)
    );
  }

  it('refuses an MCP findings call when the CLI is sharply out of step', async () => {
    // A workspace that expects a far-newer CLI line than the one running. The
    // running CLI is many majors behind, which is the "refuse" rung of the ladder.
    pinCliVersion('>=9999.0.0');

    const result = await callTool(projectRoot, 'run_security_scan', { path: projectRoot });

    // Fails before the fix (the scan ran and returned a normal result); passes
    // after (the guard blocks the findings call on the MCP surface too).
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('refusing to run');
  });

  it('does not block when the running CLI satisfies the workspace pin', async () => {
    // An any-CLI pin the running version always satisfies — the guard stays
    // silent, and the tool runs normally (no false positive, CLI path unaffected).
    pinCliVersion('>=1.0.0');

    const result = await callTool(projectRoot, 'run_security_scan', { path: projectRoot });

    expect(result.isError).toBeFalsy();
    expect(resultText(result)).not.toContain('refusing to run');
  });

  it('does not block a non-findings tool even under sharp skew', async () => {
    // The guard gates only findings-producing tools. A context/graph/state tool
    // a session needs to recover must never be blocked.
    pinCliVersion('>=9999.0.0');

    const result = await callTool(projectRoot, 'manage_state', {
      action: 'get',
      path: projectRoot,
    });

    expect(resultText(result)).not.toContain('refusing to run');
  });

  it('HARNESS_NO_VERSION_GUARD downgrades a refusal to a warning and still runs', async () => {
    pinCliVersion('>=9999.0.0');
    process.env['HARNESS_NO_VERSION_GUARD'] = '1';

    const result = await callTool(projectRoot, 'run_security_scan', { path: projectRoot });

    // Downgraded: not an error, the scan ran, but the notice is still surfaced.
    expect(result.isError).toBeFalsy();
    expect(resultText(result)).toContain('HARNESS_NO_VERSION_GUARD is set');
  });
});
