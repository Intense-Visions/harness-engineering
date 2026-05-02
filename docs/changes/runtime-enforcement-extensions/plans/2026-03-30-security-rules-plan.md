# Plan: Phase 1 Security Rules -- Already Implemented

**Date:** 2026-03-30
**Spec:** docs/changes/runtime-enforcement-extensions/iteration-1.md
**Status:** COMPLETE (no tasks remaining)

## Goal

Extend the SecurityScanner with 18 new rules across 3 categories (expanded secrets, agent-config, MCP), with fileGlob filtering so agent-config and MCP rules only scan relevant files.

## Finding

Phase 1 is already fully implemented and tested. An earlier plan (`docs/changes/runtime-enforcement-extensions/plans/2026-03-30-phase1-security-rule-categories-plan.md`) was executed to completion. All artifacts exist and all 30 tests pass.

## Verification

All observable truths from the spec are satisfied:

1. **SecurityCategory type extended** -- `packages/core/src/security/types.ts` includes `'agent-config'` and `'mcp'` in the union type.
2. **6 new secret rules registered** -- `packages/core/src/security/rules/secrets.ts` exports 11 rules total (SEC-SEC-001 through SEC-SEC-011), each with CWE references.
3. **7 agent-config rules created** -- `packages/core/src/security/rules/agent-config.ts` exports 7 rules (SEC-AGT-001 through SEC-AGT-007), all with fileGlob properties.
4. **5 MCP rules created** -- `packages/core/src/security/rules/mcp.ts` exports 5 rules (SEC-MCP-001 through SEC-MCP-005), all targeting `**/.mcp.json`.
5. **fileGlob filtering in scanFile()** -- `scanner.ts` uses `scanContentForFile()` which filters rules by fileGlob before scanning. Agent-config rules do not fire on `.ts` files.
6. **Rule severity off** -- `resolveRuleSeverity()` with `'off'` causes rules to be skipped (existing behavior, unchanged).
7. **Scanner registration** -- `scanner.ts` imports and registers both `agentConfigRules` and `mcpRules` in the constructor.

## Test Results

```
cd packages/core && npx vitest run tests/security/rules/agent-config.test.ts \
  tests/security/rules/mcp.test.ts \
  tests/security/rules/secrets-new.test.ts \
  tests/security/scanner-fileglob.test.ts

Test Files  4 passed (4)
     Tests  30 passed (30)
```

## Implemented Files

- `packages/core/src/security/types.ts` -- SecurityCategory includes 'agent-config' and 'mcp'
- `packages/core/src/security/rules/agent-config.ts` -- 7 rules (SEC-AGT-001 through SEC-AGT-007)
- `packages/core/src/security/rules/mcp.ts` -- 5 rules (SEC-MCP-001 through SEC-MCP-005)
- `packages/core/src/security/rules/secrets.ts` -- 11 rules (5 original + 6 new: SEC-SEC-006 through SEC-SEC-011)
- `packages/core/src/security/scanner.ts` -- imports, registers, and applies fileGlob filtering
- `packages/core/tests/security/rules/agent-config.test.ts` -- 9 tests
- `packages/core/tests/security/rules/mcp.test.ts` -- 7 tests
- `packages/core/tests/security/rules/secrets-new.test.ts` -- 8 tests
- `packages/core/tests/security/scanner-fileglob.test.ts` -- 6 tests

## Next Step

Phase 1 requires no further work. Proceed to Phase 2 (Hook Scripts) when ready.
