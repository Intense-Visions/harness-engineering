# @harness-engineering/orchestrator

## 0.2.3

### Patch Changes

- **README added** — Architecture diagram, quick start guide, core concepts (event-sourced state machine, candidate selection, agent backends, workspace management), and full API reference.
- **Cross-platform path fix** — `GraphConstraintAdapter` path normalization for consistent separators.
- Updated dependencies
  - @harness-engineering/core@0.13.1

## 0.2.2

### Patch Changes

- Fix circular dependency between orchestrator and http server modules
- Updated dependencies
  - @harness-engineering/core@0.13.0

## 0.2.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.12.0

## 0.2.0

### Minor Changes

- # Orchestrator Release & Workspace Hardening

  ## New Features
  - **Orchestrator Daemon**: Implemented a long-lived daemon for autonomous agent lifecycle management.
    - Pure state machine core for deterministic dispatch and reconciliation.
    - Multi-tracker support (Roadmap adapter implemented).
    - Isolated per-issue workspaces with deterministic path resolution.
    - Ink-based TUI and HTTP API for real-time observability.
  - **Harness Docs Pipeline**: Sequential pipeline for documentation health (drift detection, coverage audit, and auto-alignment).

  ## Improvements
  - **Documentation Coverage**: Increased project-wide documentation coverage to **84%**.
    - Comprehensive JSDoc/TSDoc for core APIs.
    - New Orchestrator Guide and API Reference.
    - Unified Source Map reference for all packages.
  - **Workspace Stability**: Resolved all pending lint errors and type mismatches in core packages.
  - **Graceful Shutdown**: Added signal handling and centralized resource cleanup for the orchestrator daemon.
  - **Hardened Security**: Restricted orchestrator HTTP API to localhost.

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.11.0
  - @harness-engineering/types@0.3.0
