---
'@harness-engineering/cli': patch
---

fix(assess): honor `tooling.linter` in the lint check (#702)

The `assess_project` lint check hardcoded `npx turbo run lint --force`, so every
non-npm project (Python, Go, Rust) got a spurious lint failure (`healthy: false`)
regardless of its configured linter — breaking the health gate and
`harness-release-readiness`.

The lint check now resolves its command from `harness.config.json`
`tooling.linter`: `ruff` → `ruff check .`, `golangci-lint` → `golangci-lint run`,
`clippy` → `cargo clippy`. npm/typescript, unconfigured, and unknown-linter
projects fall back to `turbo run lint`. The config is read as raw JSON because
`HarnessConfigSchema` declares `tooling` only under `template`, so `loadConfig`
strips the top-level `tooling` block that `harness init` actually writes.
