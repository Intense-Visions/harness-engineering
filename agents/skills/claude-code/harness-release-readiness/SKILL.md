# Harness Release Readiness

> Audit, fix, and track your project's path to a publishable release. No release without a passing report.

## When to Use

- Before publishing packages to npm — audit readiness and fix gaps
- At milestone boundaries — check progress toward release (fires on `on_milestone` trigger)
- When resuming release prep after a previous session — loads state and shows what changed
- NOT for actually performing the release (that is CI/CD — Changesets, GitHub Actions, etc.)
- NOT for non-npm targets (Docker, PyPI, etc.) — this skill is npm-focused
- NOT when the project has no packages to publish (use harness-verification for general health)

## Arguments

- **`--comprehensive`** — Run additional checks beyond the standard set: API doc coverage, example project validation, dependency health audit, and git hygiene scan. These checks are slower and may require network access (e.g., `npm audit`). Omit for a fast standard audit.

## Process

### Iron Law

**No release may be performed without a passing release readiness report.**

If the report shows failures, the project is not ready. Fix the failures first. A "mostly passing" report is not a passing report — every failure is a risk that lands on your users.

---
