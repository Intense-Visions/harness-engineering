---
'@harness-engineering/cli': patch
---

`harness update` no longer reports "All packages are up to date" when it could not
reach the registry.

`checkAllPackages` collected results with `Promise.allSettled` and `continue`d past
rejections, so a package whose `npm view` failed contributed nothing to `outdated` —
and the caller then read an empty list as good news. Any npm hiccup (timeout, offline,
proxy, throttle, non-zero exit, empty response) was silently rendered as a green
success line, which is worse than a crash because the user acts on it. It also made
the update banner's own advice unreliable: `Update available … Run "harness update"
to upgrade` pointed at a command that could quietly no-op.

Failed lookups are now tagged with their package and surfaced as `unreachable` on
`UpdateCheckResult`. When any package could not be checked, `harness update` names
each one and the reason, prints any updates it _was_ able to find, suggests the manual
install command, and exits non-zero instead of claiming success. "We could not check"
and "you are current" no longer produce the same output.
