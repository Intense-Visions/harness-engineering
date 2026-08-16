---
slug: "local-dispatch-lang-aware-workspace"
milestone: "Intake"
order: 21
---

### Language-aware workspace bootstrap + verify for local dispatch

- **Status:** done
- **Spec:** —
- **Summary:** Local-dispatch workspace setup and the enforced verify gate are JS/pnpm-baked; make both ecosystem-aware so non-JS adopters get a working local dispatch out of the box. Two coupled pieces: (a) **workspace dependency install** — the agent's workspace is a fresh git worktree with no installed deps, so the gate's verify fails environmentally and blocks EVERY dispatch (this looked like a model failure for days; see `local-dispatch-trustworthy-e2e`). It's set via the `hooks.afterCreate` config shell command (already language-agnostic — an adopter can put any install command there), and `feat/default-local-ollama` scaffolds the JS default `pnpm install`. (b) **the verify command** — `defaultLocalVerifyRunner` (`packages/orchestrator/src/orchestrator.ts`) hardcodes `pnpm -w run typecheck/lint/test`; for a Python project it should run `pytest`/`mypy`/`ruff`, for Rust `cargo test`, etc. Build a single ecosystem detector (by lockfile/manifest: `pnpm-lock.yaml`→pnpm, `package-lock.json`→npm, `yarn.lock`→yarn, `requirements.txt`/`pyproject.toml`→pip/poetry, `Cargo.toml`→cargo, `go.mod`→go, `Gemfile`→bundler, `pom.xml`/`build.gradle`→maven/gradle) that feeds BOTH: `harness init` scaffolds a matching `afterCreate` install command AND a matching verify command; a local dispatch **warns loudly when neither is set** (rather than silently passing verify on missing deps); both remain overridable in config. Consider caching installed deps across dispatches (per-dispatch `pnpm install` is ~5s via the pnpm store, but pip/cargo/gradle can be minutes). Keep the harness's language-agnostic, degrade-gracefully posture — never hardcode a package manager in orchestrator code.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1002