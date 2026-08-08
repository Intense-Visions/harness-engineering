# CI repair: plugin-manifest MCP pin drift (build-and-test ubuntu-latest)

## Symptom

`build-and-test (ubuntu-latest, 22)` was RED on `main` while macOS and Windows
were green. The failing step was **Baseline-gating regression test**
(`node --test 'tests/scripts/*.test.mjs'`), with two TAP failures:

- `not ok 59 - every manifest pins @harness-engineering/cli to the CLI package version` (expected `11.0.0`, actual `10.2.0`)
- `not ok 60 - syncManifestContent is idempotent at the target version` (expected `unchanged`, actual `synced`)

## Root cause (proven)

Real version drift — **not** environmental. `packages/cli/package.json` is
`11.0.0` on `main`, but all five plugin manifests still pinned the MCP server at
`@harness-engineering/cli@10.2.0`:

- `.claude-plugin/plugin.json`
- `.codex-plugin/plugin.json`
- `.cursor-plugin/plugin.json`
- `.gemini-extension/gemini-extension.json`
- `.antigravity-extension/config/mcp_config.json`

The release flow's `version` script (`changeset version && node
scripts/sync-plugin-pin.mjs`) is supposed to carry the manifest pin bump in the
same commit that bumps the CLI version. The "version packages" commit (#1039)
bumped the CLI to `11.0.0` without the accompanying `sync-plugin-pin` result, so
the drift-guard test caught the un-synced pins.

### Why it looked ubuntu-only

The baseline-gating and plugin-pin tests only *run* on ubuntu
(`if: matrix.os == 'ubuntu-latest'`). macOS/Windows never execute this step, so
they stayed green by omission. The failures reproduce identically on macOS
locally.

### The "coverage FAIL:" lines are red herrings

`FAIL: packages/core has baseline but no coverage data`,
`packages/cli lines dropped 85%→80%`, and
`packages/orchestrator 85.52%→83.5%` are `console.log` side-effects emitted by
`evaluateCoverage` while it is exercised by *passing* in-memory unit tests in
`baseline-gating.test.mjs` (the numbers match the test fixtures exactly). They
are asserted-expected failures inside green tests, not real coverage
regressions.

## Fix

Ran `node scripts/sync-plugin-pin.mjs` — the exact remediation the test's error
message prescribes. It surgically rewrote only the version token
(`10.2.0` → `11.0.0`) in all five manifests, preserving byte-for-byte
formatting (prettier-clean, inline `args` array intact).

## Verification

- `node --test 'tests/scripts/*.test.mjs'` → 62 pass, 0 fail (was 60/2).
- `prettier --check` on all five manifests → clean.
- No changeset required: the change touches only root plugin manifests, not any
  `packages/<pkg>/src` or `packages/<pkg>/package.json` (per
  `scripts/check-changesets.mjs` heuristic).
- The plugin generator does not manage the MCP pin (only `sync-plugin-pin.mjs`
  references `mcpServers.harness.args`), so `generate:plugin:check` is
  unaffected.

Refs CI run 31254496127.
