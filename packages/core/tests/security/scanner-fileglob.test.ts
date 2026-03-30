import { describe, it, expect, vi } from 'vitest';
import { SecurityScanner } from '../../src/security/scanner';

vi.mock('node:fs/promises', async () => ({
  readFile: vi.fn(),
}));

describe('SecurityScanner fileGlob filtering', () => {
  it('agent-config rules do not fire when scanning a .ts file', async () => {
    const { readFile } = await import('node:fs/promises');
    // Content that would match SEC-AGT-006 (--dangerously-skip-permissions)
    vi.mocked(readFile).mockResolvedValue('Run with --dangerously-skip-permissions');

    const scanner = new SecurityScanner({ enabled: true, strict: false });
    const findings = await scanner.scanFile('src/utils.ts');
    const agentFindings = findings.filter((f) => f.ruleId.startsWith('SEC-AGT-'));
    expect(agentFindings).toHaveLength(0);
  });

  it('agent-config rules fire when scanning a CLAUDE.md file', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValue('Run with --dangerously-skip-permissions');

    const scanner = new SecurityScanner({ enabled: true, strict: false });
    const findings = await scanner.scanFile('project/CLAUDE.md');
    const agentFindings = findings.filter((f) => f.ruleId === 'SEC-AGT-006');
    expect(agentFindings.length).toBeGreaterThan(0);
  });

  it('MCP rules do not fire when scanning a .ts file', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValue('"command": "npx -y some-package"');

    const scanner = new SecurityScanner({ enabled: true, strict: false });
    const findings = await scanner.scanFile('src/server.ts');
    const mcpFindings = findings.filter((f) => f.ruleId.startsWith('SEC-MCP-'));
    expect(mcpFindings).toHaveLength(0);
  });

  it('MCP rules fire when scanning a .mcp.json file', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValue('"command": "npx -y some-package"');

    const scanner = new SecurityScanner({ enabled: true, strict: false });
    const findings = await scanner.scanFile('project/.mcp.json');
    const mcpFindings = findings.filter((f) => f.ruleId === 'SEC-MCP-004');
    expect(mcpFindings.length).toBeGreaterThan(0);
  });

  it('rules without fileGlob still apply to all files', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValue('const key = "AKIAIOSFODNN7EXAMPLE";');

    const scanner = new SecurityScanner({ enabled: true, strict: false });
    const findings = await scanner.scanFile('src/config.ts');
    expect(findings.some((f) => f.ruleId === 'SEC-SEC-001')).toBe(true);
  });

  it('scanContent still applies all rules regardless of fileGlob (backward compat)', () => {
    const scanner = new SecurityScanner({ enabled: true, strict: false });
    // scanContent does not filter by fileGlob -- it applies all active rules
    const findings = scanner.scanContent('"command": "npx -y some-package"', 'random.txt');
    // MCP rules should still fire in scanContent (no path filtering)
    const mcpFindings = findings.filter((f) => f.ruleId === 'SEC-MCP-004');
    expect(mcpFindings.length).toBeGreaterThan(0);
  });
});
