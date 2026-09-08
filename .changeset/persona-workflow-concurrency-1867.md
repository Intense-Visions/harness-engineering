---
'@harness-engineering/cli': patch
---

Persona CI-workflow generator: split the generated `concurrency` group by event so a push to a
trunk branch no longer cancels the previous commit's verification.

The generator emitted `group: ${{ github.workflow }}-${{ github.ref }}` with an unconditional
`cancel-in-progress: true`. A persona declaring an `on_commit` trigger generates `push:` to a trunk
branch, where `github.ref` is constant across every commit — so each push cancelled the still-running
run for the preceding commit, concluding `cancelled` rather than `failure` and alarming nothing.

Generated workflows now use the shape established in #1865 for the hand-written workflows:
push keys the group on `github.sha` (per commit, never cancelled), while `pull_request` keeps the
per-ref group with cancellation on, so PR supersession and PR runner spend are unchanged.

Refs #1867.
