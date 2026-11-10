---
'@harness-engineering/core': patch
'@harness-engineering/dashboard': patch
---

Security scans in the dashboard, `harness check-security` and `harness ci check` now skip the same directories. `SECURITY_SCAN_DEFAULT_IGNORE` is built from the shared walker skip-list, so build and vendor output (Cargo `target/`, `vendor/`, `build/`) is excluded everywhere. The dashboard's security gatherer also honours the project's `security.exclude`, as the CLI does (#2391).
