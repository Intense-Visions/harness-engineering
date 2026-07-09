---
slug: "plugin-generator-leaks-globally-installed-skills-into-repo-artifacts"
milestone: "v5.0 — Enforcement Hardening"
order: 11
---

### Plugin generator leaks globally-installed skills into repo artifacts

- **Status:** planned
- **Spec:** —
- **Summary:** Problem `pnpm generate:plugin:all` (and `generate-slash-commands`), run by the pre-commit hook whenever `agents/skills/` is staged, scans **globally-installed** skills — not just the repo's own `agents/skills/`. On a developer machine with third-party skills installed, those command files get written into the repo's tracked plugin dirs (`.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.codex-plugin/`) and auto-`git add`ed into the commit. Impact Any contributor with global skills installed leaks foreign command files into harness-engineering on every `agents/skills/` commit. Discovered while adding the `product-advisor` skill — 8 global commands were swept into the commit and had to be manually stripped before push (see PR for product-advisor). Proposed fix Scope the plugin/slash-command generators to the repo's own `agents/skills/` tree only (exclude globally-resolved skill dirs). Likely in `scripts/generate-plugin*.mjs` / `scripts/lib/plugin-config.mjs` and the `resolveAllSkillsDirs` path used during generation. Workaround until fixed Strip non-repo plugin command files from the commit before push (amend staging only plugin files so the pre-commit hook's `agents/skills/` trigger doesn't re-fire).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#704
