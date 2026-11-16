---
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
---

Craft collectors (`code_craft`, `security_craft`, `docs_craft`, `spec_craft`, `knowledge_craft`, `cli_ergonomics_craft`, `api_craft`) now resolve a relative `files` entry against the run's `path` instead of `process.cwd()`. Before, such an entry was skipped without any error and the run reported a clean pass with zero prompts. The review-hook craft resolver now recognises `.test/.spec.mts|.cts`, `*Tests.java`, `*IT.java` and `*_test.rs` as tests, and `.d.mts`/`.d.cts` as declarations. Before, these files activated code-craft, security-craft and naming-craft on a test or declaration file, used up the default budget, and kept test-craft from running (#2571).
