---
'@harness-engineering/core': minor
---

`rehearsalTierFor` is now `rehearsalTierForScore`; the old name stays as a deprecated alias

The old name predicted its return type but left its input unnamed — `For` what? At a
call site like `rehearsalTierFor(value)` a reader could not tell whether the argument was
a score, a run, an attempt record, or a config without opening the signature.
`rehearsalTierForScore(score)` names the artifact being mapped from.

`@harness-engineering/core` is published, so a bare rename would be a breaking change.
`rehearsalTierFor` is retained as a `@deprecated` alias — a `const` binding to the same
function, so `rehearsalTierFor === rehearsalTierForScore` holds and existing imports keep
working unchanged. That makes this release MINOR, not MAJOR. The alias will be removed in
a future MAJOR release.
