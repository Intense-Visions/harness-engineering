---
'@harness-engineering/stats': minor
---

New leaf package `@harness-engineering/stats`: the durable home for the harness's statistical instruments. This release scaffolds the `bandit` (explore/exploit) and `sprt` (sequential probability ratio test) namespaces; the instruments themselves land in follow-up releases. Runtime dependency is exactly `@harness-engineering/types`, so any consumer can import it without a layer exception.
