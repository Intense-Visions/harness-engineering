import { describe, it, expect } from 'vitest';
import { mcpRules } from '../../../src/security/rules/mcp';

describe('MCP security rules', () => {
  it('exports 5 rules', () => {
    expect(mcpRules).toHaveLength(5);
  });

  it('all rules have category mcp and target .mcp.json', () => {
    for (const rule of mcpRules) {
      expect(rule.id).toMatch(/^SEC-MCP-/);
      expect(rule.category).toBe('mcp');
      expect(rule.fileGlob).toBe('**/.mcp.json');
    }
  });

  it('SEC-MCP-001: detects hardcoded secrets in MCP env', () => {
    const rule = mcpRules.find((r) => r.id === 'SEC-MCP-001');
    expect(rule).toBeDefined();
    expect(rule!.patterns.some((p) => p.test('"API_KEY": "sk-live-abc123"'))).toBe(true);
    expect(
      rule!.patterns.some((p) => p.test('"TOKEN": "ghp_abcdef1234567890abcdef1234567890abcdef12"'))
    ).toBe(true);
    expect(rule!.patterns.some((p) => p.test('"PASSWORD": "hunter2pass"'))).toBe(true);
    expect(rule!.patterns.some((p) => p.test('"PORT": "3000"'))).toBe(false);
  });

  it('SEC-MCP-002: detects shell injection in MCP args', () => {
    const rule = mcpRules.find((r) => r.id === 'SEC-MCP-002');
    expect(rule).toBeDefined();
    expect(rule!.patterns.some((p) => p.test('"args": ["--flag", "$(whoami)"]'))).toBe(true);
    expect(rule!.patterns.some((p) => p.test('"args": ["`rm -rf /`"]'))).toBe(true);
    expect(rule!.patterns.some((p) => p.test('"args": ["--port", "3000"]'))).toBe(false);
  });

  it('SEC-MCP-003: detects network exposure with 0.0.0.0', () => {
    const rule = mcpRules.find((r) => r.id === 'SEC-MCP-003');
    expect(rule).toBeDefined();
    expect(rule!.patterns.some((p) => p.test('"host": "0.0.0.0"'))).toBe(true);
    expect(rule!.patterns.some((p) => p.test('"host": "127.0.0.1"'))).toBe(false);
  });

  it('SEC-MCP-004: detects npx -y typosquatting vector', () => {
    const rule = mcpRules.find((r) => r.id === 'SEC-MCP-004');
    expect(rule).toBeDefined();
    expect(rule!.patterns.some((p) => p.test('"command": "npx -y some-package"'))).toBe(true);
    expect(rule!.patterns.some((p) => p.test('"command": "npx --yes some-package"'))).toBe(true);
    expect(rule!.patterns.some((p) => p.test('"command": "npx some-package"'))).toBe(false);
  });

  it('SEC-MCP-005: detects unencrypted http:// transport', () => {
    const rule = mcpRules.find((r) => r.id === 'SEC-MCP-005');
    expect(rule).toBeDefined();
    expect(rule!.patterns.some((p) => p.test('"url": "http://mcp-server.example.com"'))).toBe(true);
    expect(rule!.patterns.some((p) => p.test('"url": "https://mcp-server.example.com"'))).toBe(
      false
    );
    // localhost should not trigger
    expect(rule!.patterns.some((p) => p.test('"url": "http://localhost:3000"'))).toBe(false);
    expect(rule!.patterns.some((p) => p.test('"url": "http://127.0.0.1:3000"'))).toBe(false);
  });
});
