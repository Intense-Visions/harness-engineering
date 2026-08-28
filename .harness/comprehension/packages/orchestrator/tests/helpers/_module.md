---
schemaVersion: 1
module: "packages/orchestrator/tests/helpers"
sourceHash: "2fcf6381c1cf5270b8da599fd338545cdebc9f0647271f8b8d3d84adb87620c6"
compiledAt: "2026-08-28T01:22:12.565Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["noop-exec-file.ts"]
---

## Summary

**`packages/orchestrator/tests/helpers`** exports `noopExecFile`, a test stub that replaces Node's `execFile` to prevent the `PRDetector` from shelling out to the GitHub CLI during tests—which would fail in CI without a valid `GH_TOKEN`. The stub simulates a GitHub query returning zero open PRs (`stdout: "0\n"`), allowing test candidates to pass through `filterCandidatesWithOpenPRs` unfiltered. It supports both callback and promisified invocation patterns via a custom promisify symbol.

## Invariants

- Stdout must be "0\n" — this magic value makes filterCandidatesWithOpenPRs pass all candidates through; changing it breaks the stub's intent
- Callback invoked via process.nextTick() — maintains async behavior parity with real execFile; synchronous invocation breaks event-loop ordering expectations
- Custom promisify symbol required — without Symbol.for('nodejs.util.promisify.custom'), promisify(noopExecFile) returns wrong shape (missing { stdout, stderr } unwrap)
- Callback signature is (error, stdout, stderr) — matches real execFile; deviating breaks code that reads either stream
- Return value must be undefined — real execFile returns ChildProcess; stub returns undefined to signal no process control available

## Interface Contract

```ts
export noopExecFile
```

## Dependency Slice

```
import { execFile } from 'node:child_process'
```
