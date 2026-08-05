---
'@harness-engineering/cli': patch
---

Fix two Windows-only CI test failures that block the fleet on `windows-latest`:

- `roadmap install-hook`: the exec-bit assertion now skips on Windows, matching
  the `process.platform !== 'win32'` guard around `chmodSync` (git for Windows
  honors the hook regardless of mode).
- `outcome-eval-ci` `resolveSpecPath`: the expected path is now built with
  `path.join` instead of a hard-coded POSIX string, so it matches the native
  separator the implementation returns.

Both are test-only corrections; runtime behavior is unchanged.
