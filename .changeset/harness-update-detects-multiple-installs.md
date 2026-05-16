---
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
---

Fix `harness update` reporting "All packages are up to date" while a stale background notification simultaneously printed "Update available". The post-command notification is now suppressed during the `update` subcommand (its fresh `npm view` is authoritative), and the cached check state is invalidated after a successful update so subsequent invocations don't display pre-upgrade data.

`harness update` also now detects every `harness` binary on `PATH` (`which -a` / `where`) and warns when more than one global install is present. If the user opts in, npm-style installs are uninstalled from their respective prefixes; pnpm/yarn installs are surfaced with the exact command to run manually. This prevents the case where `npm install -g` lands in one prefix while the shell continues resolving an older binary from another prefix.
