---
'@harness-engineering/core': patch
---

entropy dead-export detector: close the blind spot for exported-but-unused public API (#1479). Usage attribution now follows re-export chains, so a symbol re-exported through the package barrel with zero real (non-test) workspace callers is surfaced as a distinct advisory finding class `PUBLIC_API_UNUSED` (recommendation: wire or deprecate, never delete) instead of hiding behind the barrel forwarding. Opt out with a `@public` / `@publicApi` annotation on the export or a `deadCode.publicApiAllowlist` entry. Preserves the #1409 test-import behavior; auto-fixers still act only on `NO_IMPORTERS`. The TypeScript parser now captures comments so JSDoc-based annotations are available to the detector.
