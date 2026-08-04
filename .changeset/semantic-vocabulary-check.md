---
'@harness-engineering/cli': patch
---

Add the `harness check-vocabulary` command — a config-driven, adopter-facing semantic-vocabulary gate. It reads a `vocabulary` block from the project's `harness.config.json` (deprecated → canonical term rules, plus `paths`/`exclude` globs) and fails when a deprecated or renamed canonical term reappears in Markdown prose, reporting the file, line, deprecated term, and suggested canonical replacement. The pure scanner strips fenced/inline code, matches case-insensitively on word boundaries, and honors per-rule `allow` exemptions; `--json` output is supported and the gate passes trivially when disabled or ruleless. Harness dogfoods it via its own five seed rules wired into CI.
