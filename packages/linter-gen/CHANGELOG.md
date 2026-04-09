# @harness-engineering/linter-gen

## 0.1.6

### Patch Changes

- Reduce Tier 2 structural violations and fix exactOptionalPropertyTypes errors

## 0.1.5

### Patch Changes

- Fix context-builder import path

## 0.1.4

### Patch Changes

- Reduce cyclomatic complexity in generator orchestrator

## 0.1.3

### Patch Changes

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

## 0.1.1

### Patch Changes

- Align dependency versions across workspace: `vitest` ^4, `minimatch` ^10, `typescript` ^5.3.3
