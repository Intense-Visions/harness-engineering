---
'@harness-engineering/core': patch
---

Security scan: SEC-SEC-004 now catches hardcoded passwords behind a type annotation (`const password: string = "..."`, `PASSWORD: str = "..."`, Rust `const DB_PASSWORD: &str = "..."`), and the new SEC-NET-004 flags Rust `danger_accept_invalid_certs(true)` / `danger_accept_invalid_hostnames(true)` (reqwest / native-tls) in `.rs` files.
