---
'@harness-engineering/cli': patch
---

Deflake the `LazyLocalAdapter` test suite. Added an optional `makeProvider`
injection seam to `LazyLocalAdapter` (mirroring the existing `fetchModels` seam)
so tests resolve against a stub instead of opening a real socket to the endpoint
— the OpenAI SDK's connect-timeout + retry backoff to a dead port made the suite
multi-second and flaky under parallel coverage load (~16.5s → 0.6s, deterministic).
Production default behavior is unchanged.
