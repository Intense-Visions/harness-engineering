---
schemaVersion: 1
module: "packages/orchestrator/src/prompt"
sourceHash: "519942e750d951a621e80c5c12367f2a1bc3e9301d023e0e284a8e6f882329b9"
compiledAt: "2026-08-28T01:22:12.309Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["renderer.ts"]
---

## Summary

`packages/orchestrator/src/prompt` exports `PromptRenderer`, a thin wrapper around the Liquid template engine for safe prompt rendering. The class enforces strict variable and filter resolution—undefined variables or unknown filters immediately throw rather than silently omitting or passing through—making template errors obvious at render time rather than hidden in generated prompts. The single public method, `render(template, context)`, is async and chains errors with `cause` for debugging.

## Invariants

- Strict mode enforced: strictVariables=true and strictFilters=true mean undefined template variables or unknown filters throw immediately, preventing silent prompt corruption
- Async render: Template rendering is async (Liquid's native contract); callers must await
- Error chaining: Rendering errors wrap in a consistent Error with cause, preserving the underlying Liquid error for diagnostics
- Stateless parsing: Each render() call parses the template fresh—no caching of compiled templates (trade-off: simplicity over throughput)
- Single engine instance: The Liquid engine is private and initialized once per PromptRenderer instance; behavior is deterministic across multiple renders with the same instance

## Interface Contract

```ts
export PromptRenderer
```

## Dependency Slice

```
import { Liquid } from 'liquidjs'
```
