---
'@harness-engineering/intelligence': patch
---

fix(intelligence): parse CLI analysis-provider output on `close`, not `exit`. Under load, Node can emit `exit` before the child's stdout has drained. The Claude CLI and generic CLI providers then parsed an empty buffer ("Unexpected end of JSON input") and lost a valid reply, so comprehension fell back to static-only (#2231).
