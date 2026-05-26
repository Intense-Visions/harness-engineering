---
'@harness-engineering/cli': patch
---

Fix harness security scanner false positives on `security-craft/extract/signals.ts`. The scanner is regex-based and matched three comments that described what the AST detector looks for (`new Function(...)`, `Bare identifier calls: eval(...), fetch(...)`, `Raw query: db.query(\`...\${x}...\`)`) as actual sinks. Rewrote the three comments to describe the same logic without the literal patterns the regex scanner triggers on. No behavior change — pure documentation rewrite. `harness ci check --skip arch` now exits 0 (was exit 1 with 3 SEC-INJ-001/SEC-INJ-002 error-severity findings).
