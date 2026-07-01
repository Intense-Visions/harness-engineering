---
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
'@harness-engineering/dashboard': patch
---

fix: make `harness graph scan` the canonical graph command and deprecate the top-level aliases

`scan`/`query`/`ingest` are now canonical under the `graph` group
(`harness graph scan`, etc.) — the form the post-update hook, fallback hints,
and docs already reference. All user-facing hints now point at
`harness graph scan`.

The bare top-level `harness scan`/`query`/`ingest` commands are retained as
hidden, deprecated aliases: they still run (so existing scripts, CI jobs, and
muscle memory keep working) but print a one-line deprecation notice to stderr
directing users to the `harness graph <op>` form. They will be removed in the
next major. No command is removed in this release, so the change is
non-breaking.
