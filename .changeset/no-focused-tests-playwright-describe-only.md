---
'@harness-engineering/eslint-plugin': patch
---

fix(eslint-plugin): no-focused-tests now catches Playwright's `test.describe.only()` (#1853)

`no-focused-tests` gated focus detection on `node.callee.object.type === 'Identifier'`,
which admits only a flat member expression. Playwright namespaces its API, so in
`test.describe.only(...)` the callee's object is a `MemberExpression` (`test.describe`)
and the guard never matched.

That inverted severity in the worst possible direction: `.only` mutes every _other_
test in the file, so a focused Playwright block silently reduced a suite to one case
while lint stayed silent and CI reported green — even though the strictly-smaller
`test.only(...)` was reported.

The rule now delegates to the existing `isTestModifierCall(node, 'only')` helper, which
walks the callee's dotted chain and matches any chain rooted at `describe`/`it`/`test`
whose final link is the modifier. This is the same adoption `no-skipped-tests` and
`no-disabled-tests` already made for `'skip'` in #1851; the helper was parameterised by
modifier for exactly this.

`test.describe.only`, `test.describe.serial.only` and `test.describe.parallel.only` are
now reported. Every previously reported spelling still reports, including the
`fdescribe` / `fit` bare-identifier forms, which the helper does not cover and which are
unchanged. Computed access (`test.describe['only']()`) and optional chaining stay
unreported, and the modifier must be the terminal chain link — the same documented
boundaries as #1851, pinned by tests.
