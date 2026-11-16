---
'@harness-engineering/core': patch
---

Fix security-scanner false negatives introduced by comment masking: a slash after postfix `++`/`--`, after a property named like a keyword (`obj.in`), or after an `if (…)` header, and a quoted string continued with `\`, no longer flip string parity and blank the real code that follows. SEC-DES-001 no longer treats a discarded `.safeParse(v)` result as validation, and validating one `JSON.parse` no longer clears a second one on the same line.
