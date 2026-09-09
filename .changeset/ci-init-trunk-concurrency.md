---
'@harness-engineering/cli': patch
---

fix(ci): stop the scaffolded adopter workflow from cancelling its own trunk verification

The GitHub Actions workflow emitted by `harness ci init` (and by the `harness init`
project scaffold, which calls the same generator) triggered on both `push:` to `main`
and `pull_request:`, but guarded them with a single per-ref concurrency group:

```yaml
concurrency:
  group: harness-${{ github.ref }}
  cancel-in-progress: true
```

On a push, `github.ref` is `refs/heads/main` for **every** commit, so all trunk pushes
landed in one concurrency bucket and each new merge cancelled the still-running
verification of the previous commit. The cancelled run concluded `cancelled`, not
`failure`, so nothing alarmed — the adopter's board stayed green while the commit went
unverified. Under a merge burst, most commits reaching trunk were never verified at all.

Concurrency is now split by event, matching the shape already used for this repo's own
workflows and for the generated persona workflows:

```yaml
concurrency:
  group: harness-${{ github.event_name == 'pull_request' && github.ref || github.sha }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

A push resolves to a per-commit group that is never cancelled, so every commit landing
on trunk reaches its own verdict. A pull request keeps the per-ref group with
cancellation on, so pushing to a PR still supersedes the older run.

**Adopter trunk runner spend rises with merge-burst size, and that increase is the fix.**
Previously a burst of N merges cost roughly one full verification because the earlier
runs were killed; now it costs N, because each of those N commits is actually verified.
PR runner spend is unchanged. Adopters who regenerate their workflow, or who copy the
new concurrency block into an existing one, should expect trunk Actions minutes to scale
with merge volume rather than staying artificially flat.

This only affects the emitted template; no existing adopter workflow is rewritten in
place. Regenerate with `harness ci init --platform github` to pick up the fix.
