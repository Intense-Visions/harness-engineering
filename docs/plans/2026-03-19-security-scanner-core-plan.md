# Plan: Security Scanner Core (Phases 1-4)

**Date:** 2026-03-19
**Spec:** docs/changes/security-first-class/proposal.md
**Estimated tasks:** 14
**Estimated time:** 50 minutes
**Scope:** Spec Phases 1-4 (Core Scanner Engine, Built-in Rules, Stack-Adaptive Rules, CI Integration)

## Goal

Every harness project has a built-in security scanner that catches high-confidence vulnerabilities with zero external dependencies, integrated as the 6th CI check with stack-adaptive rules and configurable severity.

## Observable Truths (Acceptance Criteria)

1. When `runCIChecks()` executes, the system shall run 6 checks including `security`
2. When a file contains `const API_KEY = "sk-live-abc123"`, the security check shall return an `error`-severity finding with rule ID `SEC-SEC-*`
3. When a file contains `eval(userInput)`, the security check shall return an `error`-severity finding with rule ID `SEC-INJ-*`
4. When a file contains `query("SELECT * FROM users WHERE id=" + id)`, the security check shall return an `error`-severity finding
5. When a project has `express` in `package.json`, the scanner shall automatically include `SEC-EXPRESS-*` rules
6. Where `security.strict` is `true` in config, the system shall promote all `warning` findings to `error`
7. Where `security.rules["SEC-NET-001"]` is `"off"`, the system shall not run that rule
8. The system shall complete scanning in < 100ms for test fixtures
9. `npx vitest run packages/core/tests/security/` shall pass with all tests green
10. `harness validate` shall pass after all changes

## File Map

```
MODIFY  packages/types/src/index.ts (add 'security' to CICheckName)
CREATE  packages/core/src/security/types.ts
CREATE  packages/core/src/security/config.ts
CREATE  packages/core/src/security/rules/registry.ts
CREATE  packages/core/src/security/stack-detector.ts
CREATE  packages/core/src/security/rules/secrets.ts
CREATE  packages/core/src/security/rules/injection.ts
CREATE  packages/core/src/security/rules/xss.ts
CREATE  packages/core/src/security/rules/crypto.ts
CREATE  packages/core/src/security/rules/path-traversal.ts
CREATE  packages/core/src/security/rules/network.ts
CREATE  packages/core/src/security/rules/deserialization.ts
CREATE  packages/core/src/security/rules/stack/node.ts
CREATE  packages/core/src/security/rules/stack/react.ts
CREATE  packages/core/src/security/rules/stack/express.ts
CREATE  packages/core/src/security/rules/stack/go.ts
CREATE  packages/core/src/security/scanner.ts
CREATE  packages/core/src/security/index.ts
MODIFY  packages/core/src/index.ts (add security export)
MODIFY  packages/core/src/ci/check-orchestrator.ts (add security check)
MODIFY  harness.config.json (add security config)
CREATE  packages/core/tests/security/types.test.ts
CREATE  packages/core/tests/security/config.test.ts
CREATE  packages/core/tests/security/stack-detector.test.ts
CREATE  packages/core/tests/security/rules/registry.test.ts
CREATE  packages/core/tests/security/rules/secrets.test.ts
CREATE  packages/core/tests/security/rules/injection.test.ts
CREATE  packages/core/tests/security/rules/xss-crypto.test.ts
CREATE  packages/core/tests/security/rules/medium-confidence.test.ts
CREATE  packages/core/tests/security/rules/stack-rules.test.ts
CREATE  packages/core/tests/security/scanner.test.ts
CREATE  packages/core/tests/security/integration.test.ts
MODIFY  packages/core/tests/ci/check-orchestrator.test.ts (add security tests)
```

## Tasks

### Task 1: Define security types

**Depends on:** none
**Files:** packages/core/src/security/types.ts, packages/core/tests/security/types.test.ts

1. Create test file `packages/core/tests/security/types.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import type {
     SecurityCategory,
     SecuritySeverity,
     SecurityConfidence,
     SecurityRule,
     SecurityFinding,
     ScanResult,
     SecurityConfig,
   } from '../../src/security/types';

   describe('Security types', () => {
     it('SecurityRule has required fields', () => {
       const rule: SecurityRule = {
         id: 'SEC-INJ-001',
         name: 'SQL String Concatenation',
         category: 'injection',
         severity: 'error',
         confidence: 'high',
         patterns: [/query\(.*\+/],
         message: 'Avoid SQL string concatenation',
         remediation: 'Use parameterized queries',
       };
       expect(rule.id).toBe('SEC-INJ-001');
       expect(rule.category).toBe('injection');
       expect(rule.confidence).toBe('high');
     });

     it('SecurityFinding references a rule', () => {
       const finding: SecurityFinding = {
         ruleId: 'SEC-INJ-001',
         ruleName: 'SQL String Concatenation',
         category: 'injection',
         severity: 'error',
         confidence: 'high',
         file: 'src/db.ts',
         line: 10,
         match: 'query("SELECT * FROM users WHERE id=" + id)',
         context: '  const result = query("SELECT * FROM users WHERE id=" + id);',
         message: 'Avoid SQL string concatenation',
         remediation: 'Use parameterized queries',
       };
       expect(finding.ruleId).toBe('SEC-INJ-001');
       expect(finding.file).toBe('src/db.ts');
       expect(finding.line).toBe(10);
     });

     it('ScanResult tracks coverage level', () => {
       const result: ScanResult = {
         findings: [],
         scannedFiles: 10,
         rulesApplied: 25,
         externalToolsUsed: [],
         coverage: 'baseline',
       };
       expect(result.coverage).toBe('baseline');
       expect(result.findings).toHaveLength(0);
     });

     it('SecurityConfig supports rule overrides and strict mode', () => {
       const config: SecurityConfig = {
         enabled: true,
         strict: true,
         rules: { 'SEC-NET-001': 'off', 'SEC-INJ-*': 'error' },
         exclude: ['**/*.test.ts'],
       };
       expect(config.strict).toBe(true);
       expect(config.rules?.['SEC-NET-001']).toBe('off');
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/security/types.test.ts`
3. Observe failure: types not found

4. Create `packages/core/src/security/types.ts`:

   ```typescript
   export type SecurityCategory =
     | 'secrets'
     | 'injection'
     | 'xss'
     | 'crypto'
     | 'network'
     | 'deserialization'
     | 'path-traversal';

   export type SecuritySeverity = 'error' | 'warning' | 'info';
   export type SecurityConfidence = 'high' | 'medium' | 'low';

   export interface SecurityRule {
     id: string;
     name: string;
     category: SecurityCategory;
     severity: SecuritySeverity;
     confidence: SecurityConfidence;
     patterns: RegExp[];
     fileGlob?: string;
     stack?: string[];
     message: string;
     remediation: string;
     references?: string[];
   }

   export interface SecurityFinding {
     ruleId: string;
     ruleName: string;
     category: SecurityCategory;
     severity: SecuritySeverity;
     confidence: SecurityConfidence;
     file: string;
     line: number;
     column?: number;
     match: string;
     context: string;
     message: string;
     remediation: string;
     references?: string[];
   }

   export interface ScanResult {
     findings: SecurityFinding[];
     scannedFiles: number;
     rulesApplied: number;
     externalToolsUsed: string[];
     coverage: 'baseline' | 'enhanced';
   }

   export type RuleOverride = 'off' | SecuritySeverity;

   export interface SecurityConfig {
     enabled: boolean;
     strict: boolean;
     rules?: Record<string, RuleOverride>;
     exclude?: string[];
     external?: {
       semgrep?: { enabled: 'auto' | boolean; rulesets?: string[] };
       gitleaks?: { enabled: 'auto' | boolean };
     };
   }

   export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
     enabled: true,
     strict: false,
     rules: {},
     exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/fixtures/**'],
   };
   ```

5. Run test: `npx vitest run packages/core/tests/security/types.test.ts`
6. Observe: all tests pass
7. Run: `npx vitest run packages/core/tests/`
8. Commit: `feat(security): define security scanner types and interfaces`

---

### Task 2: Define security config schema with Zod

**Depends on:** Task 1
**Files:** packages/core/src/security/config.ts, packages/core/tests/security/config.test.ts

1. Create test file `packages/core/tests/security/config.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import {
     SecurityConfigSchema,
     parseSecurityConfig,
     resolveRuleSeverity,
   } from '../../src/security/config';

   describe('SecurityConfigSchema', () => {
     it('validates a minimal config', () => {
       const result = SecurityConfigSchema.safeParse({ enabled: true, strict: false });
       expect(result.success).toBe(true);
     });

     it('applies defaults for missing fields', () => {
       const result = SecurityConfigSchema.safeParse({});
       expect(result.success).toBe(true);
       if (result.success) {
         expect(result.data.enabled).toBe(true);
         expect(result.data.strict).toBe(false);
       }
     });

     it('accepts rule overrides', () => {
       const result = SecurityConfigSchema.safeParse({
         rules: { 'SEC-NET-001': 'off', 'SEC-INJ-*': 'error' },
       });
       expect(result.success).toBe(true);
     });

     it('rejects invalid rule override values', () => {
       const result = SecurityConfigSchema.safeParse({
         rules: { 'SEC-NET-001': 'invalid' },
       });
       expect(result.success).toBe(false);
     });
   });

   describe('parseSecurityConfig', () => {
     it('returns default config when input is undefined', () => {
       const config = parseSecurityConfig(undefined);
       expect(config.enabled).toBe(true);
       expect(config.strict).toBe(false);
     });

     it('merges partial config with defaults', () => {
       const config = parseSecurityConfig({ strict: true });
       expect(config.strict).toBe(true);
       expect(config.enabled).toBe(true);
     });
   });

   describe('resolveRuleSeverity', () => {
     it('returns rule default when no override exists', () => {
       const severity = resolveRuleSeverity('SEC-INJ-001', 'error', {}, false);
       expect(severity).toBe('error');
     });

     it('returns off when rule is disabled', () => {
       const severity = resolveRuleSeverity(
         'SEC-NET-001',
         'warning',
         { 'SEC-NET-001': 'off' },
         false
       );
       expect(severity).toBe('off');
     });

     it('matches wildcard overrides', () => {
       const severity = resolveRuleSeverity(
         'SEC-INJ-001',
         'warning',
         { 'SEC-INJ-*': 'error' },
         false
       );
       expect(severity).toBe('error');
     });

     it('promotes warnings to errors in strict mode', () => {
       const severity = resolveRuleSeverity('SEC-NET-001', 'warning', {}, true);
       expect(severity).toBe('error');
     });

     it('does not demote errors in strict mode', () => {
       const severity = resolveRuleSeverity('SEC-INJ-001', 'error', {}, true);
       expect(severity).toBe('error');
     });
   });
   ```

2. Run test — observe failures

3. Create `packages/core/src/security/config.ts`:

   ```typescript
   import { z } from 'zod';
   import type { SecurityConfig, SecuritySeverity, RuleOverride } from './types';
   import { DEFAULT_SECURITY_CONFIG } from './types';

   const RuleOverrideSchema = z.enum(['off', 'error', 'warning', 'info']);

   export const SecurityConfigSchema = z.object({
     enabled: z.boolean().default(true),
     strict: z.boolean().default(false),
     rules: z.record(z.string(), RuleOverrideSchema).optional().default({}),
     exclude: z
       .array(z.string())
       .optional()
       .default(['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/fixtures/**']),
     external: z
       .object({
         semgrep: z
           .object({
             enabled: z.union([z.literal('auto'), z.boolean()]).default('auto'),
             rulesets: z.array(z.string()).optional(),
           })
           .optional(),
         gitleaks: z
           .object({
             enabled: z.union([z.literal('auto'), z.boolean()]).default('auto'),
           })
           .optional(),
       })
       .optional(),
   });

   export function parseSecurityConfig(input: unknown): SecurityConfig {
     if (input === undefined || input === null) {
       return { ...DEFAULT_SECURITY_CONFIG };
     }
     const result = SecurityConfigSchema.safeParse(input);
     if (result.success) {
       return result.data as SecurityConfig;
     }
     return { ...DEFAULT_SECURITY_CONFIG };
   }

   export function resolveRuleSeverity(
     ruleId: string,
     defaultSeverity: SecuritySeverity,
     overrides: Record<string, RuleOverride>,
     strict: boolean
   ): RuleOverride {
     // Check exact match first
     if (overrides[ruleId] !== undefined) {
       return overrides[ruleId];
     }

     // Check wildcard matches (e.g. "SEC-INJ-*")
     for (const [pattern, override] of Object.entries(overrides)) {
       if (pattern.endsWith('*')) {
         const prefix = pattern.slice(0, -1);
         if (ruleId.startsWith(prefix)) {
           return override;
         }
       }
     }

     // Apply strict mode: promote warnings/info to error
     if (strict && (defaultSeverity === 'warning' || defaultSeverity === 'info')) {
       return 'error';
     }

     return defaultSeverity;
   }
   ```

4. Run test — observe: all pass
5. Run: `npx vitest run packages/core/tests/security/`
6. Commit: `feat(security): add security config schema with Zod validation`

---

### Task 3: Create stack detector

**Depends on:** Task 1
**Files:** packages/core/src/security/stack-detector.ts, packages/core/tests/security/stack-detector.test.ts

1. Create test file `packages/core/tests/security/stack-detector.test.ts`:

   ```typescript
   import { describe, it, expect, vi } from 'vitest';
   import { detectStack } from '../../src/security/stack-detector';
   import * as fs from 'node:fs';

   vi.mock('node:fs');

   describe('detectStack', () => {
     it('detects node from package.json', () => {
       vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
         return String(p).endsWith('package.json');
       });
       vi.mocked(fs.readFileSync).mockReturnValue(
         JSON.stringify({
           dependencies: { express: '^4.18.0' },
         })
       );
       const stacks = detectStack('/project');
       expect(stacks).toContain('node');
       expect(stacks).toContain('express');
     });

     it('detects react from package.json', () => {
       vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
         return String(p).endsWith('package.json');
       });
       vi.mocked(fs.readFileSync).mockReturnValue(
         JSON.stringify({
           dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
         })
       );
       const stacks = detectStack('/project');
       expect(stacks).toContain('node');
       expect(stacks).toContain('react');
     });

     it('detects go from go.mod', () => {
       vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
         return String(p).endsWith('go.mod');
       });
       vi.mocked(fs.readFileSync).mockReturnValue('module example.com/myapp\n\ngo 1.21\n');
       const stacks = detectStack('/project');
       expect(stacks).toContain('go');
     });

     it('returns empty array when no stack detected', () => {
       vi.mocked(fs.existsSync).mockReturnValue(false);
       const stacks = detectStack('/project');
       expect(stacks).toEqual([]);
     });
   });
   ```

2. Run test — observe failures

3. Create `packages/core/src/security/stack-detector.ts`:

   ```typescript
   import * as fs from 'node:fs';
   import * as path from 'node:path';

   export function detectStack(projectRoot: string): string[] {
     const stacks: string[] = [];

     // Check for Node.js / JavaScript ecosystem
     const pkgJsonPath = path.join(projectRoot, 'package.json');
     if (fs.existsSync(pkgJsonPath)) {
       stacks.push('node');
       try {
         const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
         const allDeps = {
           ...pkgJson.dependencies,
           ...pkgJson.devDependencies,
         };

         if (allDeps.react || allDeps['react-dom']) stacks.push('react');
         if (allDeps.express) stacks.push('express');
         if (allDeps.koa) stacks.push('koa');
         if (allDeps.fastify) stacks.push('fastify');
         if (allDeps.next) stacks.push('next');
         if (allDeps.vue) stacks.push('vue');
         if (allDeps.angular || allDeps['@angular/core']) stacks.push('angular');
       } catch {
         // Malformed package.json — continue with just 'node'
       }
     }

     // Check for Go
     const goModPath = path.join(projectRoot, 'go.mod');
     if (fs.existsSync(goModPath)) {
       stacks.push('go');
     }

     // Check for Python
     const requirementsPath = path.join(projectRoot, 'requirements.txt');
     const pyprojectPath = path.join(projectRoot, 'pyproject.toml');
     if (fs.existsSync(requirementsPath) || fs.existsSync(pyprojectPath)) {
       stacks.push('python');
     }

     return stacks;
   }
   ```

4. Run test — observe: all pass
5. Commit: `feat(security): add tech stack detector`

---

### Task 4: Create rule registry

**Depends on:** Task 1, Task 2
**Files:** packages/core/src/security/rules/registry.ts, packages/core/tests/security/rules/registry.test.ts

1. Create test file `packages/core/tests/security/rules/registry.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { RuleRegistry } from '../../../src/security/rules/registry';
   import type { SecurityRule } from '../../../src/security/types';

   const mockRule: SecurityRule = {
     id: 'SEC-TEST-001',
     name: 'Test Rule',
     category: 'injection',
     severity: 'error',
     confidence: 'high',
     patterns: [/eval\(/],
     message: 'Do not use eval',
     remediation: 'Remove eval',
   };

   const stackRule: SecurityRule = {
     id: 'SEC-NODE-001',
     name: 'Node Rule',
     category: 'injection',
     severity: 'warning',
     confidence: 'medium',
     patterns: [/prototype\[/],
     stack: ['node'],
     message: 'Prototype pollution risk',
     remediation: 'Use Object.create(null)',
   };

   describe('RuleRegistry', () => {
     it('registers and retrieves rules', () => {
       const registry = new RuleRegistry();
       registry.register(mockRule);
       expect(registry.getAll()).toHaveLength(1);
       expect(registry.getById('SEC-TEST-001')).toBe(mockRule);
     });

     it('filters by category', () => {
       const registry = new RuleRegistry();
       registry.register(mockRule);
       registry.register(stackRule);
       const injectionRules = registry.getByCategory('injection');
       expect(injectionRules).toHaveLength(2);
     });

     it('filters by stack', () => {
       const registry = new RuleRegistry();
       registry.register(mockRule);
       registry.register(stackRule);
       const forNode = registry.getForStacks(['node']);
       expect(forNode).toContain(mockRule); // no stack restriction = applies to all
       expect(forNode).toContain(stackRule); // stack matches
     });

     it('excludes rules for non-matching stacks', () => {
       const registry = new RuleRegistry();
       registry.register(stackRule);
       const forGo = registry.getForStacks(['go']);
       expect(forGo).not.toContain(stackRule);
     });

     it('registers multiple rules at once', () => {
       const registry = new RuleRegistry();
       registry.registerAll([mockRule, stackRule]);
       expect(registry.getAll()).toHaveLength(2);
     });
   });
   ```

2. Run test — observe failures

3. Create `packages/core/src/security/rules/registry.ts`:

   ```typescript
   import type { SecurityRule, SecurityCategory } from '../types';

   export class RuleRegistry {
     private rules: Map<string, SecurityRule> = new Map();

     register(rule: SecurityRule): void {
       this.rules.set(rule.id, rule);
     }

     registerAll(rules: SecurityRule[]): void {
       for (const rule of rules) {
         this.register(rule);
       }
     }

     getById(id: string): SecurityRule | undefined {
       return this.rules.get(id);
     }

     getAll(): SecurityRule[] {
       return Array.from(this.rules.values());
     }

     getByCategory(category: SecurityCategory): SecurityRule[] {
       return this.getAll().filter((r) => r.category === category);
     }

     getForStacks(stacks: string[]): SecurityRule[] {
       return this.getAll().filter((rule) => {
         // Rules with no stack restriction apply to all projects
         if (!rule.stack || rule.stack.length === 0) return true;
         // Stack-specific rules apply only if the project has a matching stack
         return rule.stack.some((s) => stacks.includes(s));
       });
     }
   }
   ```

4. Run test — observe: all pass
5. Commit: `feat(security): add rule registry with stack filtering`

---

### Task 5: Create secrets and injection rules (high-confidence)

**Depends on:** Task 1, Task 4
**Files:** packages/core/src/security/rules/secrets.ts, packages/core/src/security/rules/injection.ts, packages/core/tests/security/rules/secrets.test.ts, packages/core/tests/security/rules/injection.test.ts

1. Create test file `packages/core/tests/security/rules/secrets.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { secretRules } from '../../../src/security/rules/secrets';

   describe('Secret detection rules', () => {
     it('exports multiple rules', () => {
       expect(secretRules.length).toBeGreaterThan(0);
       for (const rule of secretRules) {
         expect(rule.id).toMatch(/^SEC-SEC-/);
         expect(rule.category).toBe('secrets');
         expect(rule.confidence).toBe('high');
         expect(rule.severity).toBe('error');
       }
     });

     it('detects AWS access key patterns', () => {
       const rule = secretRules.find((r) => r.id === 'SEC-SEC-001');
       expect(rule).toBeDefined();
       const testLine = 'const key = "AKIAIOSFODNN7EXAMPLE";';
       expect(rule!.patterns.some((p) => p.test(testLine))).toBe(true);
     });

     it('detects generic API key assignments', () => {
       const rule = secretRules.find((r) => r.id === 'SEC-SEC-002');
       expect(rule).toBeDefined();
       const testLine = 'const API_KEY = "sk-live-abc123def456";';
       expect(rule!.patterns.some((p) => p.test(testLine))).toBe(true);
     });

     it('detects private key headers', () => {
       const rule = secretRules.find((r) => r.id === 'SEC-SEC-003');
       expect(rule).toBeDefined();
       const testLine = '"-----BEGIN RSA PRIVATE KEY-----"';
       expect(rule!.patterns.some((p) => p.test(testLine))).toBe(true);
     });

     it('does not flag env variable reads', () => {
       const rule = secretRules.find((r) => r.id === 'SEC-SEC-002');
       const envRead = 'const key = process.env.API_KEY;';
       expect(rule!.patterns.some((p) => p.test(envRead))).toBe(false);
     });
   });
   ```

2. Create test file `packages/core/tests/security/rules/injection.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { injectionRules } from '../../../src/security/rules/injection';

   describe('Injection detection rules', () => {
     it('exports multiple rules', () => {
       expect(injectionRules.length).toBeGreaterThan(0);
       for (const rule of injectionRules) {
         expect(rule.id).toMatch(/^SEC-INJ-/);
         expect(rule.category).toBe('injection');
       }
     });

     it('detects eval usage', () => {
       const rule = injectionRules.find((r) => r.id === 'SEC-INJ-001');
       expect(rule).toBeDefined();
       expect(rule!.severity).toBe('error');
       expect(rule!.patterns.some((p) => p.test('eval(userInput)'))).toBe(true);
       expect(rule!.patterns.some((p) => p.test('new Function(code)'))).toBe(true);
     });

     it('detects SQL string concatenation', () => {
       const rule = injectionRules.find((r) => r.id === 'SEC-INJ-002');
       expect(rule).toBeDefined();
       const testLine = 'query("SELECT * FROM users WHERE id=" + id)';
       expect(rule!.patterns.some((p) => p.test(testLine))).toBe(true);
     });

     it('detects child_process.exec with string arg', () => {
       const rule = injectionRules.find((r) => r.id === 'SEC-INJ-003');
       expect(rule).toBeDefined();
       const testLine = 'exec("rm -rf " + userInput)';
       expect(rule!.patterns.some((p) => p.test(testLine))).toBe(true);
     });
   });
   ```

3. Run tests — observe failures

4. Create `packages/core/src/security/rules/secrets.ts`:

   ```typescript
   import type { SecurityRule } from '../types';

   export const secretRules: SecurityRule[] = [
     {
       id: 'SEC-SEC-001',
       name: 'AWS Access Key',
       category: 'secrets',
       severity: 'error',
       confidence: 'high',
       patterns: [/(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/],
       message: 'Hardcoded AWS access key detected',
       remediation: 'Use environment variables or a secrets manager',
       references: ['CWE-798'],
     },
     {
       id: 'SEC-SEC-002',
       name: 'Generic API Key/Secret Assignment',
       category: 'secrets',
       severity: 'error',
       confidence: 'high',
       patterns: [
         /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
       ],
       message: 'Hardcoded API key or secret detected',
       remediation: 'Use environment variables: process.env.API_KEY',
       references: ['CWE-798'],
     },
     {
       id: 'SEC-SEC-003',
       name: 'Private Key',
       category: 'secrets',
       severity: 'error',
       confidence: 'high',
       patterns: [/-----BEGIN\s(?:RSA|DSA|EC|OPENSSH|PGP)\s(?:PRIVATE\s)?KEY-----/],
       message: 'Private key detected in source code',
       remediation: 'Store private keys in a secrets manager, never in source',
       references: ['CWE-321'],
     },
     {
       id: 'SEC-SEC-004',
       name: 'Password Assignment',
       category: 'secrets',
       severity: 'error',
       confidence: 'high',
       patterns: [/(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i],
       message: 'Hardcoded password detected',
       remediation: 'Use environment variables or a secrets manager',
       references: ['CWE-259'],
     },
     {
       id: 'SEC-SEC-005',
       name: 'JWT/Bearer Token',
       category: 'secrets',
       severity: 'error',
       confidence: 'high',
       patterns: [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
       message: 'Hardcoded JWT token detected',
       remediation: 'Tokens should be fetched at runtime, not embedded in source',
       references: ['CWE-798'],
     },
   ];
   ```

5. Create `packages/core/src/security/rules/injection.ts`:

   ```typescript
   import type { SecurityRule } from '../types';

   export const injectionRules: SecurityRule[] = [
     {
       id: 'SEC-INJ-001',
       name: 'eval/Function Constructor',
       category: 'injection',
       severity: 'error',
       confidence: 'high',
       patterns: [/\beval\s*\(/, /new\s+Function\s*\(/],
       message: 'eval() and Function constructor allow arbitrary code execution',
       remediation: 'Use JSON.parse() for data, or a sandboxed interpreter for dynamic code',
       references: ['CWE-95'],
     },
     {
       id: 'SEC-INJ-002',
       name: 'SQL String Concatenation',
       category: 'injection',
       severity: 'error',
       confidence: 'high',
       patterns: [
         /(?:query|execute|prepare)\s*\(\s*['"`].*?\s*\+/,
         /(?:query|execute|prepare)\s*\(\s*`[^`]*\$\{/,
       ],
       message: 'SQL query built with string concatenation or template literals with interpolation',
       remediation: 'Use parameterized queries: query("SELECT * FROM users WHERE id = $1", [id])',
       references: ['CWE-89'],
     },
     {
       id: 'SEC-INJ-003',
       name: 'Command Injection',
       category: 'injection',
       severity: 'error',
       confidence: 'high',
       patterns: [
         /\bexec\s*\(\s*['"`].*?\s*\+/,
         /\bexec\s*\(\s*`[^`]*\$\{/,
         /\bexecSync\s*\(\s*['"`].*?\s*\+/,
         /\bexecSync\s*\(\s*`[^`]*\$\{/,
       ],
       message: 'Shell command built with string concatenation',
       remediation: 'Use execFile() with argument array instead of exec() with string',
       references: ['CWE-78'],
     },
   ];
   ```

6. Run tests — observe: all pass
7. Commit: `feat(security): add secrets and injection detection rules`

---

### Task 6: Create XSS and crypto rules (high-confidence)

**Depends on:** Task 1
**Files:** packages/core/src/security/rules/xss.ts, packages/core/src/security/rules/crypto.ts, packages/core/tests/security/rules/xss-crypto.test.ts

1. Create test file `packages/core/tests/security/rules/xss-crypto.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { xssRules } from '../../../src/security/rules/xss';
   import { cryptoRules } from '../../../src/security/rules/crypto';

   describe('XSS rules', () => {
     it('detects innerHTML assignment', () => {
       const rule = xssRules.find((r) => r.id === 'SEC-XSS-001');
       expect(rule).toBeDefined();
       expect(rule!.patterns.some((p) => p.test('element.innerHTML = userInput'))).toBe(true);
     });

     it('detects dangerouslySetInnerHTML', () => {
       const rule = xssRules.find((r) => r.id === 'SEC-XSS-002');
       expect(rule).toBeDefined();
       expect(
         rule!.patterns.some((p) => p.test('dangerouslySetInnerHTML={{ __html: data }}'))
       ).toBe(true);
     });

     it('detects document.write', () => {
       const rule = xssRules.find((r) => r.id === 'SEC-XSS-003');
       expect(rule).toBeDefined();
       expect(rule!.patterns.some((p) => p.test('document.write(html)'))).toBe(true);
     });
   });

   describe('Crypto rules', () => {
     it('detects MD5 usage', () => {
       const rule = cryptoRules.find((r) => r.id === 'SEC-CRY-001');
       expect(rule).toBeDefined();
       expect(rule!.patterns.some((p) => p.test("createHash('md5')"))).toBe(true);
     });

     it('detects SHA1 usage', () => {
       const rule = cryptoRules.find((r) => r.id === 'SEC-CRY-001');
       expect(rule!.patterns.some((p) => p.test("createHash('sha1')"))).toBe(true);
     });

     it('does not flag SHA256', () => {
       const rule = cryptoRules.find((r) => r.id === 'SEC-CRY-001');
       expect(rule!.patterns.some((p) => p.test("createHash('sha256')"))).toBe(false);
     });

     it('detects hardcoded encryption keys', () => {
       const rule = cryptoRules.find((r) => r.id === 'SEC-CRY-002');
       expect(rule).toBeDefined();
       expect(rule!.patterns.some((p) => p.test('encryption_key = "hardcoded123"'))).toBe(true);
     });
   });
   ```

2. Run tests — observe failures

3. Create `packages/core/src/security/rules/xss.ts`:

   ```typescript
   import type { SecurityRule } from '../types';

   export const xssRules: SecurityRule[] = [
     {
       id: 'SEC-XSS-001',
       name: 'innerHTML Assignment',
       category: 'xss',
       severity: 'error',
       confidence: 'high',
       patterns: [/\.innerHTML\s*=/],
       message: 'Direct innerHTML assignment can lead to XSS',
       remediation: 'Use textContent for text, or a sanitizer like DOMPurify for HTML',
       references: ['CWE-79'],
     },
     {
       id: 'SEC-XSS-002',
       name: 'dangerouslySetInnerHTML',
       category: 'xss',
       severity: 'error',
       confidence: 'high',
       patterns: [/dangerouslySetInnerHTML/],
       message: 'dangerouslySetInnerHTML bypasses React XSS protections',
       remediation: 'Sanitize HTML with DOMPurify before passing to dangerouslySetInnerHTML',
       references: ['CWE-79'],
     },
     {
       id: 'SEC-XSS-003',
       name: 'document.write',
       category: 'xss',
       severity: 'error',
       confidence: 'high',
       patterns: [/document\.write\s*\(/, /document\.writeln\s*\(/],
       message: 'document.write can lead to XSS and is a legacy API',
       remediation: 'Use DOM APIs: createElement, appendChild, textContent',
       references: ['CWE-79'],
     },
   ];
   ```

4. Create `packages/core/src/security/rules/crypto.ts`:

   ```typescript
   import type { SecurityRule } from '../types';

   export const cryptoRules: SecurityRule[] = [
     {
       id: 'SEC-CRY-001',
       name: 'Weak Hash Algorithm',
       category: 'crypto',
       severity: 'error',
       confidence: 'high',
       patterns: [/createHash\s*\(\s*['"](?:md5|sha1|md4|ripemd160)['"]\s*\)/],
       message: 'MD5 and SHA1 are cryptographically broken for security use',
       remediation: 'Use SHA-256 or higher: createHash("sha256")',
       references: ['CWE-328'],
     },
     {
       id: 'SEC-CRY-002',
       name: 'Hardcoded Encryption Key',
       category: 'crypto',
       severity: 'error',
       confidence: 'high',
       patterns: [
         /(?:encryption[_-]?key|cipher[_-]?key|aes[_-]?key|secret[_-]?key)\s*[:=]\s*['"][^'"]{4,}['"]/i,
       ],
       message: 'Hardcoded encryption key detected',
       remediation: 'Load encryption keys from environment variables or a key management service',
       references: ['CWE-321'],
     },
   ];
   ```

5. Run tests — observe: all pass
6. Commit: `feat(security): add XSS and cryptography detection rules`

---

### Task 7: Create medium-confidence rules (path-traversal, network, deserialization)

**Depends on:** Task 1
**Files:** packages/core/src/security/rules/path-traversal.ts, packages/core/src/security/rules/network.ts, packages/core/src/security/rules/deserialization.ts, packages/core/tests/security/rules/medium-confidence.test.ts

1. Create test file `packages/core/tests/security/rules/medium-confidence.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { pathTraversalRules } from '../../../src/security/rules/path-traversal';
   import { networkRules } from '../../../src/security/rules/network';
   import { deserializationRules } from '../../../src/security/rules/deserialization';

   describe('Path traversal rules', () => {
     it('detects ../ in file operations', () => {
       const rule = pathTraversalRules.find((r) => r.id === 'SEC-PTH-001');
       expect(rule).toBeDefined();
       expect(rule!.severity).toBe('warning');
       expect(rule!.patterns.some((p) => p.test('readFile(dir + "/../" + file)'))).toBe(true);
     });
   });

   describe('Network rules', () => {
     it('detects CORS wildcard origin', () => {
       const rule = networkRules.find((r) => r.id === 'SEC-NET-001');
       expect(rule).toBeDefined();
       expect(rule!.patterns.some((p) => p.test("origin: '*'"))).toBe(true);
       expect(rule!.patterns.some((p) => p.test('origin: "*"'))).toBe(true);
     });

     it('detects disabled TLS verification', () => {
       const rule = networkRules.find((r) => r.id === 'SEC-NET-002');
       expect(rule).toBeDefined();
       expect(rule!.patterns.some((p) => p.test('rejectUnauthorized: false'))).toBe(true);
     });

     it('detects hardcoded http:// URLs', () => {
       const rule = networkRules.find((r) => r.id === 'SEC-NET-003');
       expect(rule).toBeDefined();
       expect(rule!.severity).toBe('info');
       expect(rule!.patterns.some((p) => p.test("fetch('http://api.example.com')"))).toBe(true);
       // localhost should not be flagged
       expect(rule!.patterns.some((p) => p.test("fetch('http://localhost:3000')"))).toBe(false);
     });
   });

   describe('Deserialization rules', () => {
     it('detects JSON.parse on request body without schema', () => {
       const rule = deserializationRules.find((r) => r.id === 'SEC-DES-001');
       expect(rule).toBeDefined();
       expect(rule!.severity).toBe('warning');
     });
   });
   ```

2. Run tests — observe failures

3. Create `packages/core/src/security/rules/path-traversal.ts`:

   ```typescript
   import type { SecurityRule } from '../types';

   export const pathTraversalRules: SecurityRule[] = [
     {
       id: 'SEC-PTH-001',
       name: 'Path Traversal Pattern',
       category: 'path-traversal',
       severity: 'warning',
       confidence: 'medium',
       patterns: [
         /(?:readFile|readFileSync|writeFile|writeFileSync|createReadStream|createWriteStream|access|stat|unlink|rmdir|mkdir)\s*\([^)]*\.{2}[/\\]/,
         /(?:readFile|readFileSync|writeFile|writeFileSync)\s*\([^)]*\+/,
       ],
       message: 'Potential path traversal: file operation with ../ or string concatenation',
       remediation:
         'Use path.resolve() and validate the resolved path stays within the expected directory',
       references: ['CWE-22'],
     },
   ];
   ```

4. Create `packages/core/src/security/rules/network.ts`:

   ```typescript
   import type { SecurityRule } from '../types';

   export const networkRules: SecurityRule[] = [
     {
       id: 'SEC-NET-001',
       name: 'CORS Wildcard Origin',
       category: 'network',
       severity: 'warning',
       confidence: 'medium',
       patterns: [/origin\s*:\s*['"][*]['"]/],
       message: 'CORS wildcard origin allows any website to make requests',
       remediation: 'Restrict CORS to specific trusted origins',
       references: ['CWE-942'],
     },
     {
       id: 'SEC-NET-002',
       name: 'Disabled TLS Verification',
       category: 'network',
       severity: 'warning',
       confidence: 'high',
       patterns: [/rejectUnauthorized\s*:\s*false/],
       message: 'TLS certificate verification is disabled, enabling MITM attacks',
       remediation: 'Remove rejectUnauthorized: false, or use a proper CA bundle',
       references: ['CWE-295'],
     },
     {
       id: 'SEC-NET-003',
       name: 'Hardcoded HTTP URL',
       category: 'network',
       severity: 'info',
       confidence: 'low',
       patterns: [/['"]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[^'"]+['"]/],
       message: 'Non-TLS HTTP URL detected (excluding localhost)',
       remediation: 'Use HTTPS for all non-local connections',
       references: ['CWE-319'],
     },
   ];
   ```

5. Create `packages/core/src/security/rules/deserialization.ts`:

   ```typescript
   import type { SecurityRule } from '../types';

   export const deserializationRules: SecurityRule[] = [
     {
       id: 'SEC-DES-001',
       name: 'Unvalidated JSON Parse',
       category: 'deserialization',
       severity: 'warning',
       confidence: 'medium',
       patterns: [
         /JSON\.parse\s*\(\s*(?:req|request)\.body/,
         /JSON\.parse\s*\(\s*(?:event|data|payload|input|body)\b/,
       ],
       message: 'JSON.parse on potentially untrusted input without schema validation',
       remediation: 'Validate parsed data with Zod, ajv, or joi before use',
       references: ['CWE-502'],
     },
   ];
   ```

6. Run tests — observe: all pass
7. Commit: `feat(security): add path-traversal, network, and deserialization rules`

---

### Task 8: Create stack-adaptive rules (Node, Express, React, Go)

**Depends on:** Task 1
**Files:** packages/core/src/security/rules/stack/node.ts, packages/core/src/security/rules/stack/express.ts, packages/core/src/security/rules/stack/react.ts, packages/core/src/security/rules/stack/go.ts, packages/core/tests/security/rules/stack-rules.test.ts

1. Create test file `packages/core/tests/security/rules/stack-rules.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { nodeRules } from '../../../src/security/rules/stack/node';
   import { expressRules } from '../../../src/security/rules/stack/express';
   import { reactRules } from '../../../src/security/rules/stack/react';
   import { goRules } from '../../../src/security/rules/stack/go';

   describe('Node.js rules', () => {
     it('all have stack: ["node"]', () => {
       for (const rule of nodeRules) {
         expect(rule.stack).toContain('node');
         expect(rule.id).toMatch(/^SEC-NODE-/);
       }
     });

     it('detects prototype pollution', () => {
       const rule = nodeRules.find((r) => r.id === 'SEC-NODE-001');
       expect(rule).toBeDefined();
       expect(rule!.patterns.some((p) => p.test('obj[key] = value'))).toBe(true);
     });
   });

   describe('Express rules', () => {
     it('all have stack: ["express"]', () => {
       for (const rule of expressRules) {
         expect(rule.stack).toContain('express');
         expect(rule.id).toMatch(/^SEC-EXPRESS-/);
       }
     });
   });

   describe('React rules', () => {
     it('all have stack: ["react"]', () => {
       for (const rule of reactRules) {
         expect(rule.stack).toContain('react');
         expect(rule.id).toMatch(/^SEC-REACT-/);
       }
     });

     it('detects localStorage for sensitive data', () => {
       const rule = reactRules.find((r) => r.id === 'SEC-REACT-001');
       expect(rule).toBeDefined();
       expect(rule!.patterns.some((p) => p.test("localStorage.setItem('token', jwt)"))).toBe(true);
     });
   });

   describe('Go rules', () => {
     it('all have stack: ["go"]', () => {
       for (const rule of goRules) {
         expect(rule.stack).toContain('go');
         expect(rule.id).toMatch(/^SEC-GO-/);
       }
     });
   });
   ```

2. Run tests — observe failures

3. Create `packages/core/src/security/rules/stack/node.ts`:

   ```typescript
   import type { SecurityRule } from '../../types';

   export const nodeRules: SecurityRule[] = [
     {
       id: 'SEC-NODE-001',
       name: 'Prototype Pollution',
       category: 'injection',
       severity: 'warning',
       confidence: 'medium',
       patterns: [/\w+\[\s*\w+\s*\]\s*=\s*\w+/],
       stack: ['node'],
       message: 'Dynamic property assignment may lead to prototype pollution',
       remediation: 'Validate keys against a whitelist, or use Map instead of plain objects',
       references: ['CWE-1321'],
     },
     {
       id: 'SEC-NODE-002',
       name: 'NoSQL Injection',
       category: 'injection',
       severity: 'warning',
       confidence: 'medium',
       patterns: [
         /\.find\s*\(\s*\{[^}]*\$(?:gt|gte|lt|lte|ne|in|nin|regex|where|exists)/,
         /\.find\s*\(\s*(?:req|request)\.(?:body|query|params)/,
       ],
       stack: ['node'],
       message: 'Potential NoSQL injection: MongoDB query operators in user input',
       remediation: 'Sanitize input by stripping keys starting with $ before using in queries',
       references: ['CWE-943'],
     },
   ];
   ```

4. Create `packages/core/src/security/rules/stack/express.ts`:

   ```typescript
   import type { SecurityRule } from '../../types';

   export const expressRules: SecurityRule[] = [
     {
       id: 'SEC-EXPRESS-001',
       name: 'Missing Helmet',
       category: 'network',
       severity: 'info',
       confidence: 'low',
       patterns: [/app\s*=\s*express\s*\(\)/],
       stack: ['express'],
       message: 'Express app may be missing security headers (helmet middleware)',
       remediation: 'Add helmet middleware: app.use(helmet())',
       references: ['CWE-693'],
     },
     {
       id: 'SEC-EXPRESS-002',
       name: 'Missing Rate Limiting',
       category: 'network',
       severity: 'info',
       confidence: 'low',
       patterns: [/app\.(?:get|post|put|delete|patch)\s*\(/],
       stack: ['express'],
       message: 'Express routes may lack rate limiting',
       remediation: 'Add rate limiting with express-rate-limit middleware',
       references: ['CWE-770'],
     },
   ];
   ```

5. Create `packages/core/src/security/rules/stack/react.ts`:

   ```typescript
   import type { SecurityRule } from '../../types';

   export const reactRules: SecurityRule[] = [
     {
       id: 'SEC-REACT-001',
       name: 'Sensitive Data in Client Storage',
       category: 'secrets',
       severity: 'warning',
       confidence: 'medium',
       patterns: [
         /localStorage\.setItem\s*\(\s*['"](?:token|jwt|auth|session|password|secret|key|credential)/i,
         /sessionStorage\.setItem\s*\(\s*['"](?:token|jwt|auth|session|password|secret|key|credential)/i,
       ],
       stack: ['react'],
       message: 'Storing sensitive data in browser storage is accessible to XSS attacks',
       remediation: 'Use httpOnly cookies for auth tokens instead of localStorage',
       references: ['CWE-922'],
     },
   ];
   ```

6. Create `packages/core/src/security/rules/stack/go.ts`:

   ```typescript
   import type { SecurityRule } from '../../types';

   export const goRules: SecurityRule[] = [
     {
       id: 'SEC-GO-001',
       name: 'Unsafe Pointer Usage',
       category: 'injection',
       severity: 'warning',
       confidence: 'medium',
       patterns: [/unsafe\.Pointer/],
       stack: ['go'],
       message: 'unsafe.Pointer bypasses Go type safety',
       remediation: 'Avoid unsafe.Pointer unless absolutely necessary; document justification',
       references: ['CWE-119'],
     },
     {
       id: 'SEC-GO-002',
       name: 'Format String Injection',
       category: 'injection',
       severity: 'warning',
       confidence: 'medium',
       patterns: [/fmt\.Sprintf\s*\(\s*\w+[^,)]*\)/],
       stack: ['go'],
       message: 'Format string may come from user input',
       remediation: 'Use fmt.Sprintf with a literal format string: fmt.Sprintf("%s", userInput)',
       references: ['CWE-134'],
     },
   ];
   ```

7. Run tests — observe: all pass
8. Commit: `feat(security): add stack-adaptive rules for Node, Express, React, and Go`

---

### Task 9: Create scanner orchestrator

**Depends on:** Task 1, Task 2, Task 3, Task 4, Tasks 5-8
**Files:** packages/core/src/security/scanner.ts, packages/core/tests/security/scanner.test.ts

1. Create test file `packages/core/tests/security/scanner.test.ts`:

   ```typescript
   import { describe, it, expect, vi } from 'vitest';
   import { SecurityScanner } from '../../src/security/scanner';
   import type { SecurityConfig } from '../../src/security/types';

   // Mock fs for file reading
   vi.mock('node:fs', async () => {
     const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
     return {
       ...actual,
       existsSync: vi.fn().mockReturnValue(true),
       readFileSync: vi.fn().mockReturnValue(JSON.stringify({ dependencies: {} })),
       readdirSync: vi.fn().mockReturnValue([]),
       statSync: vi.fn().mockReturnValue({ isDirectory: () => false, isFile: () => true }),
     };
   });

   vi.mock('node:fs/promises', async () => ({
     readFile: vi.fn(),
     readdir: vi.fn().mockResolvedValue([]),
     stat: vi.fn().mockResolvedValue({ isDirectory: () => false, isFile: () => true }),
   }));

   describe('SecurityScanner', () => {
     it('scans content and returns findings', () => {
       const scanner = new SecurityScanner({
         enabled: true,
         strict: false,
       });

       const findings = scanner.scanContent(
         'const key = "AKIAIOSFODNN7EXAMPLE";',
         'src/config.ts',
         1
       );
       expect(findings.length).toBeGreaterThan(0);
       expect(findings[0].ruleId).toMatch(/^SEC-SEC-/);
       expect(findings[0].severity).toBe('error');
     });

     it('detects eval in content', () => {
       const scanner = new SecurityScanner({ enabled: true, strict: false });
       const findings = scanner.scanContent('eval(userInput)', 'src/util.ts', 1);
       expect(findings.some((f) => f.ruleId === 'SEC-INJ-001')).toBe(true);
     });

     it('detects SQL injection', () => {
       const scanner = new SecurityScanner({ enabled: true, strict: false });
       const findings = scanner.scanContent(
         'query("SELECT * FROM users WHERE id=" + id)',
         'src/db.ts',
         1
       );
       expect(findings.some((f) => f.ruleId === 'SEC-INJ-002')).toBe(true);
     });

     it('respects rule overrides (off)', () => {
       const scanner = new SecurityScanner({
         enabled: true,
         strict: false,
         rules: { 'SEC-SEC-001': 'off' },
       });
       const findings = scanner.scanContent(
         'const key = "AKIAIOSFODNN7EXAMPLE";',
         'src/config.ts',
         1
       );
       expect(findings.some((f) => f.ruleId === 'SEC-SEC-001')).toBe(false);
     });

     it('promotes warnings to errors in strict mode', () => {
       const scanner = new SecurityScanner({ enabled: true, strict: true });
       const findings = scanner.scanContent("origin: '*'", 'src/cors.ts', 1);
       const corsFindings = findings.filter((f) => f.ruleId === 'SEC-NET-001');
       if (corsFindings.length > 0) {
         expect(corsFindings[0].severity).toBe('error');
       }
     });

     it('returns empty when disabled', () => {
       const scanner = new SecurityScanner({ enabled: false, strict: false });
       const findings = scanner.scanContent('eval(x)', 'src/util.ts', 1);
       expect(findings).toHaveLength(0);
     });

     it('scanFile returns findings for file content', async () => {
       const { readFile } = await import('node:fs/promises');
       vi.mocked(readFile).mockResolvedValue(
         'const key = "AKIAIOSFODNN7EXAMPLE";\neval(userInput);\n'
       );

       const scanner = new SecurityScanner({ enabled: true, strict: false });
       const findings = await scanner.scanFile('src/config.ts');
       expect(findings.length).toBeGreaterThanOrEqual(2);
     });
   });
   ```

2. Run tests — observe failures

3. Create `packages/core/src/security/scanner.ts`:

   ```typescript
   import * as fs from 'node:fs/promises';
   import { RuleRegistry } from './rules/registry';
   import { resolveRuleSeverity } from './config';
   import { detectStack } from './stack-detector';
   import { secretRules } from './rules/secrets';
   import { injectionRules } from './rules/injection';
   import { xssRules } from './rules/xss';
   import { cryptoRules } from './rules/crypto';
   import { pathTraversalRules } from './rules/path-traversal';
   import { networkRules } from './rules/network';
   import { deserializationRules } from './rules/deserialization';
   import { nodeRules } from './rules/stack/node';
   import { expressRules } from './rules/stack/express';
   import { reactRules } from './rules/stack/react';
   import { goRules } from './rules/stack/go';
   import type { SecurityConfig, SecurityFinding, SecurityRule, ScanResult } from './types';
   import { DEFAULT_SECURITY_CONFIG } from './types';

   export class SecurityScanner {
     private registry: RuleRegistry;
     private config: SecurityConfig;
     private activeRules: SecurityRule[] = [];

     constructor(config: Partial<SecurityConfig> = {}) {
       this.config = { ...DEFAULT_SECURITY_CONFIG, ...config };
       this.registry = new RuleRegistry();

       // Register all base rules
       this.registry.registerAll([
         ...secretRules,
         ...injectionRules,
         ...xssRules,
         ...cryptoRules,
         ...pathTraversalRules,
         ...networkRules,
         ...deserializationRules,
       ]);

       // Register stack-specific rules
       this.registry.registerAll([...nodeRules, ...expressRules, ...reactRules, ...goRules]);

       // All rules active initially; will be filtered by stack in scan()
       this.activeRules = this.registry.getAll();
     }

     configureForProject(projectRoot: string): void {
       const stacks = detectStack(projectRoot);
       this.activeRules = this.registry.getForStacks(stacks.length > 0 ? stacks : []);
     }

     scanContent(content: string, filePath: string, startLine: number = 1): SecurityFinding[] {
       if (!this.config.enabled) return [];

       const findings: SecurityFinding[] = [];
       const lines = content.split('\n');

       for (const rule of this.activeRules) {
         const resolved = resolveRuleSeverity(
           rule.id,
           rule.severity,
           this.config.rules ?? {},
           this.config.strict
         );

         if (resolved === 'off') continue;

         for (let i = 0; i < lines.length; i++) {
           const line = lines[i];
           for (const pattern of rule.patterns) {
             // Reset regex lastIndex for global patterns
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
                 references: rule.references,
               });
               break; // One finding per rule per line
             }
           }
         }
       }

       return findings;
     }

     async scanFile(filePath: string): Promise<SecurityFinding[]> {
       if (!this.config.enabled) return [];
       const content = await fs.readFile(filePath, 'utf-8');
       return this.scanContent(content, filePath, 1);
     }

     async scanFiles(filePaths: string[]): Promise<ScanResult> {
       const allFindings: SecurityFinding[] = [];

       for (const filePath of filePaths) {
         try {
           const findings = await this.scanFile(filePath);
           allFindings.push(...findings);
         } catch {
           // Skip unreadable files
         }
       }

       return {
         findings: allFindings,
         scannedFiles: filePaths.length,
         rulesApplied: this.activeRules.length,
         externalToolsUsed: [],
         coverage: 'baseline',
       };
     }
   }
   ```

4. Run tests — observe: all pass
5. Commit: `feat(security): add scanner orchestrator with rule resolution`

---

### Task 10: Create barrel export and wire into core

**Depends on:** Tasks 1-9
**Files:** packages/core/src/security/index.ts, packages/core/src/index.ts

1. Create `packages/core/src/security/index.ts`:

   ```typescript
   // Scanner
   export { SecurityScanner } from './scanner';

   // Config
   export { SecurityConfigSchema, parseSecurityConfig, resolveRuleSeverity } from './config';

   // Registry
   export { RuleRegistry } from './rules/registry';

   // Stack detection
   export { detectStack } from './stack-detector';

   // Built-in rules
   export { secretRules } from './rules/secrets';
   export { injectionRules } from './rules/injection';
   export { xssRules } from './rules/xss';
   export { cryptoRules } from './rules/crypto';
   export { pathTraversalRules } from './rules/path-traversal';
   export { networkRules } from './rules/network';
   export { deserializationRules } from './rules/deserialization';

   // Stack-specific rules
   export { nodeRules } from './rules/stack/node';
   export { expressRules } from './rules/stack/express';
   export { reactRules } from './rules/stack/react';
   export { goRules } from './rules/stack/go';

   // Types
   export type {
     SecurityCategory,
     SecuritySeverity,
     SecurityConfidence,
     SecurityRule,
     SecurityFinding,
     ScanResult,
     SecurityConfig,
     RuleOverride,
   } from './types';
   export { DEFAULT_SECURITY_CONFIG } from './types';
   ```

2. Add to `packages/core/src/index.ts`:

   ```typescript
   // Security module
   export * from './security';
   ```

3. Run: `npx vitest run packages/core/tests/security/`
4. Run: `npx vitest run packages/core/tests/`
5. Commit: `feat(security): add barrel exports and wire security module into core`

---

### Task 11: Update CICheckName type to include 'security'

**Depends on:** Task 10
**Files:** packages/types/src/index.ts, packages/core/tests/ci/check-orchestrator.test.ts

1. Modify `packages/types/src/index.ts`:
   Change `CICheckName` from:

   ```typescript
   export type CICheckName = 'validate' | 'deps' | 'docs' | 'entropy' | 'phase-gate';
   ```

   To:

   ```typescript
   export type CICheckName = 'validate' | 'deps' | 'docs' | 'entropy' | 'security' | 'phase-gate';
   ```

2. Run: `npx tsc --noEmit -p packages/types/tsconfig.json`
3. Run: `npx tsc --noEmit -p packages/core/tsconfig.json` — expect compilation errors in check-orchestrator (no 'security' case yet)
4. Commit: `feat(types): add 'security' to CICheckName union`

---

### Task 12: Wire security check into CI check orchestrator

**Depends on:** Task 11
**Files:** packages/core/src/ci/check-orchestrator.ts, packages/core/tests/ci/check-orchestrator.test.ts

1. Add tests to `packages/core/tests/ci/check-orchestrator.test.ts`:

   ```typescript
   // Add after existing mock setup, before imports:
   vi.mock('../../src/security/scanner', () => {
     return {
       SecurityScanner: class {
         configureForProject = vi.fn();
         scanContent = vi.fn().mockReturnValue([]);
       },
     };
   });

   vi.mock('../../src/security/config', () => ({
     parseSecurityConfig: vi.fn().mockReturnValue({ enabled: true, strict: false }),
   }));
   ```

   Add these test cases inside the `describe('runCIChecks')` block:

   ```typescript
   it('includes security check in the pipeline', async () => {
     const result = await runCIChecks({
       projectRoot: '/fake',
       config: minimalConfig(),
     });

     expect(result.ok).toBe(true);
     if (!result.ok) return;
     expect(result.value.checks).toHaveLength(6);
     expect(result.value.checks.map((c) => c.name)).toEqual([
       'validate',
       'deps',
       'docs',
       'entropy',
       'security',
       'phase-gate',
     ]);
   });

   it('security check passes when no source files match', async () => {
     const result = await runCIChecks({
       projectRoot: '/fake',
       config: minimalConfig(),
     });

     expect(result.ok).toBe(true);
     if (!result.ok) return;
     const secCheck = result.value.checks.find((c) => c.name === 'security');
     expect(secCheck).toBeDefined();
     expect(secCheck!.status).toBe('pass');
   });
   ```

2. Run tests — observe failures (check count is 5 not 6, no 'security' case)

3. Modify `packages/core/src/ci/check-orchestrator.ts`:

   Add import at top:

   ```typescript
   import { SecurityScanner } from '../security/scanner';
   import { parseSecurityConfig } from '../security/config';
   ```

   Update `ALL_CHECKS`:

   ```typescript
   const ALL_CHECKS: CICheckName[] = [
     'validate',
     'deps',
     'docs',
     'entropy',
     'security',
     'phase-gate',
   ];
   ```

   Add case inside `runSingleCheck` switch, before `case 'phase-gate'`:

   ```typescript
   case 'security': {
     const securityConfig = parseSecurityConfig(config.security);
     if (!securityConfig.enabled) break;

     const scanner = new SecurityScanner(securityConfig);
     scanner.configureForProject(projectRoot);

     // Scan source files (TypeScript/JavaScript)
     const glob = await import('fast-glob');
     const sourceFiles = await glob.default(
       ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.go', '**/*.py'],
       {
         cwd: projectRoot,
         ignore: securityConfig.exclude ?? [
           '**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/fixtures/**',
         ],
         absolute: true,
       }
     );

     const result = await scanner.scanFiles(sourceFiles);

     for (const finding of result.findings) {
       issues.push({
         severity: finding.severity === 'info' ? 'warning' : finding.severity,
         message: `[${finding.ruleId}] ${finding.message}: ${finding.match}`,
         file: finding.file,
         line: finding.line,
       });
     }
     break;
   }
   ```

4. Run tests — observe: all pass
5. Run: `npx vitest run packages/core/tests/ci/`
6. Run: `npx tsc --noEmit -p packages/core/tsconfig.json`
7. Commit: `feat(security): wire security scanner into CI check orchestrator as 6th check`

---

### Task 13: Add security config to harness.config.json

**Depends on:** Task 12
**Files:** harness.config.json

1. Add security config to `harness.config.json` after the `entropy` block:

   ```json
   "security": {
     "enabled": true,
     "strict": false,
     "exclude": ["**/node_modules/**", "**/dist/**", "**/*.test.ts", "**/tests/fixtures/**"]
   }
   ```

2. Run: `npx harness validate`
3. Commit: `feat(security): add security configuration to harness.config.json`

---

### Task 14: Integration test and final validation

[checkpoint:human-verify]

**Depends on:** Tasks 1-13
**Files:** packages/core/tests/security/integration.test.ts

1. Create `packages/core/tests/security/integration.test.ts`:

   ```typescript
   import { describe, it, expect, vi } from 'vitest';
   import { SecurityScanner } from '../../src/security/scanner';

   // Don't mock fs for integration — we're testing the scanner end-to-end
   // with synthetic content, not real files

   describe('Security scanner integration', () => {
     const scanner = new SecurityScanner({ enabled: true, strict: false });

     it('detects multiple vulnerability types in a single file', () => {
       const code = [
         'import express from "express";',
         'const app = express();',
         'const API_KEY = "sk-live-abc123def456ghi789";',
         'app.get("/users", (req, res) => {',
         '  const id = req.query.id;',
         '  const result = query("SELECT * FROM users WHERE id=" + id);',
         '  res.send(eval(req.body.template));',
         '});',
       ].join('\n');

       const findings = scanner.scanContent(code, 'src/app.ts');
       const ruleIds = findings.map((f) => f.ruleId);
       expect(ruleIds).toContain('SEC-SEC-002'); // API key
       expect(ruleIds).toContain('SEC-INJ-002'); // SQL injection
       expect(ruleIds).toContain('SEC-INJ-001'); // eval
     });

     it('produces no findings for clean code', () => {
       const code = [
         'import { query } from "./db";',
         'const key = process.env.API_KEY;',
         'const result = await query("SELECT * FROM users WHERE id = $1", [id]);',
         'element.textContent = sanitizedInput;',
       ].join('\n');

       const findings = scanner.scanContent(code, 'src/clean.ts');
       // Only structural/medium-confidence rules might fire; no high-confidence errors
       const errors = findings.filter((f) => f.severity === 'error');
       expect(errors).toHaveLength(0);
     });

     it('strict mode promotes warnings to errors', () => {
       const strictScanner = new SecurityScanner({ enabled: true, strict: true });
       const code = "origin: '*'";
       const findings = strictScanner.scanContent(code, 'src/cors.ts');
       const corsFindings = findings.filter((f) => f.ruleId === 'SEC-NET-001');
       if (corsFindings.length > 0) {
         expect(corsFindings[0].severity).toBe('error');
       }
     });

     it('respects rule overrides', () => {
       const customScanner = new SecurityScanner({
         enabled: true,
         strict: false,
         rules: { 'SEC-INJ-001': 'off' },
       });
       const findings = customScanner.scanContent('eval(x)', 'src/util.ts');
       expect(findings.some((f) => f.ruleId === 'SEC-INJ-001')).toBe(false);
     });

     it('findings include remediation guidance', () => {
       const findings = scanner.scanContent('eval(userInput)', 'src/util.ts');
       const evalFinding = findings.find((f) => f.ruleId === 'SEC-INJ-001');
       expect(evalFinding).toBeDefined();
       expect(evalFinding!.remediation).toBeTruthy();
       expect(evalFinding!.message).toBeTruthy();
       expect(evalFinding!.references).toBeDefined();
     });

     it('disabled scanner returns no findings', () => {
       const disabled = new SecurityScanner({ enabled: false, strict: false });
       const findings = disabled.scanContent('eval(x)', 'src/util.ts');
       expect(findings).toHaveLength(0);
     });
   });
   ```

2. Run: `npx vitest run packages/core/tests/security/`
3. Observe: all tests pass
4. Run: `npx vitest run packages/core/tests/`
5. Run: `npx tsc --noEmit -p packages/core/tsconfig.json`
6. Run: `npx harness validate`
7. Commit: `feat(security): add integration tests for security scanner`

## Parallel Opportunities

- **Tasks 1-4** must be sequential (each builds on prior types)
- **Tasks 5, 6, 7, 8** can run in parallel (independent rule files, all depend on Task 1 only)
- **Task 9** depends on all rule tasks (5-8)
- **Tasks 10-14** must be sequential

## Follow-up Plan (Phases 5-8)

This plan covers spec Phases 1-4. A follow-up plan will cover:

- **Phase 5:** MCP tool (`run_security_scan`) + external tool adapter (Semgrep/Gitleaks)
- **Phase 6:** Security phase in harness-pre-commit-review, harness-code-review, harness-integrity skills
- **Phase 7:** Standalone `harness-security-review` skill + `security-reviewer` persona
- **Phase 8:** Documentation updates (AGENTS.md, guides, CLI reference, SECURITY.md)
