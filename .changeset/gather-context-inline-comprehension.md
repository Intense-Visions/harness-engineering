---
'@harness-engineering/cli': patch
---

`gather_context` summary mode (the default) now inlines the served comprehension
units instead of collapsing them to counts. Previously a default call returned
"N units served" with no content, forcing a second `get_comprehension` round-trip
or a raw-source fallback — defeating the pull-primary path. Comprehension is the
primary, already-budget-bounded payload, so summary mode serves the units inline
and only summarizes the stale/malformed noise to counts.
