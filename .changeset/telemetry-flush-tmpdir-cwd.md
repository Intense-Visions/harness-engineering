---
'@harness-engineering/cli': patch
---

Run the background telemetry flush from the OS temp directory instead of the project directory. The detached reporter child outlived the CLI with the project as its cwd, which on Windows pins the directory (EBUSY on delete/rename). The CLI now passes the project root via `HARNESS_TELEMETRY_PROJECT_ROOT`, and the `telemetry-reporter` hook reads consent, identity, and adoption records from that root (falling back to its cwd when run as a Stop hook).
