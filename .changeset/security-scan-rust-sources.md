---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

Scan Rust sources in the security gate. `.rs` was missing from the shared security scan extension list, so a Rust project's `check-security` and CI security check read zero files and abstained, and the `rust-base` template shipped `security.enabled: false` to hide it. `rs` is now scanned (the language-agnostic rules, including secret detection, apply to Rust text), and `rust-base` no longer disables the security gate. Refs #2274.
