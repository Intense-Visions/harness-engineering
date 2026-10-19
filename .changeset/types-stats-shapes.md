---
'@harness-engineering/types': minor
---

Add the shared explore/exploit shapes `Pull`, `ArmState`, `BanditConfig`, `Choice`, `SprtVerdict`, and `SprtConfig` (`packages/types/src/stats.ts`), exported from the barrel so `@harness-engineering/stats` and every consumer read one bandit ledger line the same way. `BanditConfig.halfLifeDays` and `BanditConfig.minEffectiveN` are optional, matching the spec defaults (30 days, 2 effective samples) that `resolveBanditConfig` fills; `Pull.ts` is documented as an ISO-8601 instant with a zone designator (`Z` or `±HH:MM`).
