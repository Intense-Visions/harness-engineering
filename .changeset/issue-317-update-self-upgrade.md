---
'@harness-engineering/cli': patch
---

fix(cli/update): detect outdated CLI even when `npm list -g` does not see it (closes #317)

`harness update` was reporting "All packages are up to date" while a separate
banner inside the same transcript advertised "Update available: vX -> vY", and
never actually performed the self-upgrade. Repeated runs were a no-op.

Root cause: the foreground check in `runUpdateAction` discovered installed
packages by parsing `npm list -g --json`. When harness was installed via
Homebrew, bun, asdf, or under a different nvm prefix than the shell's current
`npm`, `npm list -g` returned no `@harness-engineering/*` entries. `packages`
came out empty, `checkAllPackages` had nothing to compare, and the code fell
straight into the "up to date" exit path — printing the success line, refreshing
hooks, and shelling out to a child `harness generate`. That child process is
where the contradictory "Update available" banner came from: its own
`printUpdateNotification` reads the cached state populated by the background
`npm view` check (which doesn't depend on `npm list` and so works correctly),
and its stderr inherits to the parent terminal.

Fix: trust `CLI_VERSION` (loaded from the running CLI's `package.json`) as the
authoritative current version for `@harness-engineering/cli`, exactly as the
background check already does. `getInstalledPackages` always includes the CLI;
`getInstalledVersions` falls back to `CLI_VERSION` when `npm list -g` doesn't
report it; `getInstalledVersion` does the same. The foreground check now
correctly identifies the outdated CLI and reaches the install path on the
user's first `harness update` invocation.
