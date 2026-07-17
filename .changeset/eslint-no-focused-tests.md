---
'@harness-engineering/eslint-plugin': minor
---

Add the `no-focused-tests` rule: flags focused tests — `describe.only` /
`it.only` / `test.only`, and bare `fdescribe` / `fit` — so a focused test can't
slip into CI and silently skip the rest of the suite. Object-name-gated, so an
unrelated `.only` member access is not a false positive. Enabled as `error` in
the recommended config.
