---
schemaVersion: 1
module: "packages/orchestrator/src/logging"
sourceHash: "17868854849457b49650364b93bafea41f7f7fda6bbd9779bec31ab021433e88"
compiledAt: "2026-08-28T01:22:12.209Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["logger.ts"]
---

## Summary

StructuredLogger is a minimal structured-logging wrapper that formats log entries with level, message, timestamp, and optional context. It provides four convenience methods (debug, info, warn, error) that all route through a generic log() method. Each entry is formatted to a string (ISO timestamp, uppercase level, message, JSON context) and written to console.log. The implementation handles circular references in context objects gracefully via try-catch in safeStringify().

## Invariants

- Timestamp always present: Every log entry receives an ISO-8601 timestamp, either from the entry or generated at log-time via new Date().toISOString().
- Serialization never crashes: Context objects are passed through safeStringify(), which catches JSON.stringify() failures and substitutes a placeholder string rather than throwing.
- No level-based routing: All levels (debug, info, warn, error) write to console.log — there is no filtering, stream separation, or level thresholding. Callers must manage output levels externally.
- Context is nullable: When no context is provided, it is omitted from the entry entirely (not included as null). The spread operator enforces this.
- Level must be one of four strings: Type safety enforces that level is 'debug' | 'info' | 'warn' | 'error'; no runtime validation.

## Interface Contract

```ts
export StructuredLogger
```

## Dependency Slice

```

```
