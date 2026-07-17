---
'@harness-engineering/eslint-plugin': minor
---

Add the `no-hardcoded-test-count` ESLint rule. It flags hardcoded numeric literals in test-count
assertions — `expect(x).toHaveLength(<number>)` and `expect(x.length).toBe(<number>)` — which drift
silently as items are added or removed. A variable or computed expected value is not reported. The
rule is registered in the recommended config.
