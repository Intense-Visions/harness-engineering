---
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
---

fix: four downstream-consumer papercuts (#902)

Repos that consume the harness CLI as a dev-dependency and layer their own
skills on top (downstream overlay repos) hit four generator/tooling gaps:

1. **doctor remedy typo** — the architecture-baseline remedy said
   `harness check-arch --update`; the real flag is `--update-baseline`.
2. **`roadmap.tracker.repo` default** — when `roadmap.tracker.kind` is
   `github` but `repo` is unset, both tracker-config loaders now derive
   `owner/repo` from `git remote get-url origin` (https, ssh, and scp-style
   URLs, with or without `.git`). Explicit config still wins; with no origin
   remote the previous missing-repo handling applies, with a clearer error.
3. **skills-index provenance + overlay skills** — `buildIndex` labeled
   entries by array position, so a repo without project skills had the entire
   bundled catalog labeled `source:"project"`, and the `projectRoot` argument
   was ignored, so a downstream repo's own `agents/skills/<platform>/` skills
   were never indexed when cwd was elsewhere. Provenance now travels with each
   directory (`resolveAllSkillsDirsWithSource`) and `projectRoot` is honored.
4. **generated-hook clobber guard** — `initHooks` now records install-time
   content hashes in `.harness/hooks/profile.json` and, on regeneration,
   preserves (and warns about) hook files whose content no longer matches the
   recorded hash instead of silently overwriting hand-edits. `harness hooks
init --force` restores the old overwrite behavior. Installs predating hash
   recording keep the legacy refresh behavior.
