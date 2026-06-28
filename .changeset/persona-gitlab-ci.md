---
'@harness-engineering/cli': patch
---

Implement GitLab CI generation for personas (`generateCIWorkflow(persona, 'gitlab')`), which previously returned `Err('GitLab CI generation is not yet supported')`. The generator emits a `.gitlab-ci.yml` pipeline fragment with an `enforce` job (`image: node:20`, `corepack`/`pnpm` setup, one `npx harness <command>` script line per command step) and translates persona triggers into GitLab `rules:` — merge-request pipelines (with `changes:` from path globs), per-branch `$CI_COMMIT_BRANCH` matches, and schedule pipelines (the cron lives in GitLab's pipeline-schedule settings, not the YAML, so it is intentionally omitted). Skill steps are skipped (CI cannot run an AI agent); a persona with only skill steps gets a no-op script so the YAML stays valid.

Also wires the previously-unreachable platform parameter to a user-facing flag: `harness persona generate <name> --platform gitlab` now writes `<slug>.gitlab-ci.yml` (include it from `.gitlab-ci.yml`), while `--platform github` (the default) continues to write `.github/workflows/<slug>.yml`.
