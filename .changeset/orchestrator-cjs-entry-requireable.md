---
'@harness-engineering/orchestrator': patch
---

Fix the CommonJS entry so `require('@harness-engineering/orchestrator')` works on Node 22. The deprecated Ink TUI was imported at module top level, and `ink` pulls in `yoga-wasm-web`, whose top-level `await` made every `require()` of the package throw `ERR_REQUIRE_ASYNC_MODULE`. `launchTUI` now loads the renderer lazily; its signature is unchanged, and a TUI load or mount failure surfaces as a rejection of `waitUntilExit()`.
