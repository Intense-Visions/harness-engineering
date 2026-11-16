---
'@harness-engineering/cli': patch
---

fix(cli): `--json` output piped to another process is no longer cut off at one pipe buffer (64 KiB on macOS, ~68 KiB on Linux) (#2254)

Writes to a pipe are asynchronous on POSIX, so a command that printed a large JSON report and then called `process.exit()` lost everything past the first buffer — always in CI, where stdout is a pipe, while the same command redirected to a file was complete. The `harness` entrypoint now puts piped stdout/stderr into blocking mode, as Node already does on Windows, so every command's output drains before exit. `check-docs --json` also serializes `undocumented` ahead of `documented`.
