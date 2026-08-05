---
'@harness-engineering/core': minor
'@harness-engineering/cli': patch
---

Promote two domain skills from advisory prose to load-bearing mechanical checks. `owasp-injection-prevention` gains `SEC-INJ-004`, which flags Prisma `$queryRawUnsafe`/`$executeRawUnsafe` called with interpolated or concatenated input (enforced by `harness-security-scan`). `a11y-aria-patterns` gains a new `AriaScanner` (`A11Y-014` aria-hidden on a focusable element, `A11Y-042` positive tabindex), invoked by `harness-accessibility`. Both checks fire only on statically-decidable values to keep false positives near zero. The CSRF, rate-limiting, and idempotency-key skills remain advisory — a low-false-positive mechanical check is not achievable for them without framework-aware data-flow analysis.
