---
'@harness-engineering/core': patch
---

Tighten `INJ-REROL-003` injection regex to require an explicit override verb so plain documentation headings and YAML keys no longer trip the high-severity blocking guard.

The previous pattern `(?:new\s+)?(?:system\s+)?(?:instruction|directive|role|persona)\s*[:=]\s*` made both leading-verb groups optional, so any colon-terminated heading containing `instruction`, `directive`, `role`, or `persona` matched at high severity. Because `INJ-REROL-*` is on the orchestrator's `BLOCKING_INJECTION_PREFIXES` list (`packages/orchestrator/src/workspace/config-scanner.ts`), the false positive blocked dispatch with no medium-severity fallback. The repo's own `AGENTS.md:416` contains `_Agent & Persona:_` as a markdown italic category heading listing skill names — copied into every workspace, this aborted every orchestrator dispatch with `Config scan blocked dispatch ... INJ-REROL-003: Injection pattern detected`.

The pattern now requires one of `new|override|replace|set|reassign|reset|switch( to)?|update|change` before the keyword, so true overrides (`new system instruction:`, `override directive:`, `set role: admin`, `reassign persona:`) still fire high while documentation headings (`_Agent & Persona:_`, `## Instructions:`, `Directive: ship by Friday`) and YAML keys (`role: developer`) no longer match. Four negative and three positive regression tests in `packages/core/tests/security/injection-patterns.test.ts` pin the behavior.
