# Skill Marketplace Guide

Publish, discover, and install harness skills via the `@harness-skills/*` npm namespace. Skills are pure content packages (skill.yaml + SKILL.md, no runtime code) — zero supply chain risk.

## Quick Start

```bash
# Search for skills
harness skill search deploy

# Install a skill
harness install deployment

# List installed skills
harness skill list --installed
```

After installation, skills are immediately available via `harness skill run`, slash commands, and slash command generation.

## Installing Skills

### From the public registry

```bash
# Install latest version
harness install deployment

# Install a specific version range
harness install deployment --version "^1.0.0"

# Force reinstall
harness install deployment --force
```

### From a local directory or tarball

```bash
# Install from a local skill directory
harness install my-skill --from ./path/to/my-skill/

# Install from a downloaded .tgz
harness install my-skill --from ./my-skill-1.0.0.tgz
```

Local installs validate `skill.yaml` the same way registry installs do. The lockfile records `resolved: "local:<path>"` to distinguish local from registry installs.

### From a GitHub repository

```bash
# Install from a GitHub repo (discovers all skills in the repo)
harness install skills --from github:owner/repo

# Install from a specific branch or tag
harness install skills --from github:owner/repo#v2.0

# Install using a full GitHub URL
harness install skills --from https://github.com/owner/repo
```

GitHub installs perform a shallow clone to a temp directory, then recursively discover all `skill.yaml` files (up to 3 levels deep). Each discovered skill is installed as a separate entry in the lockfile.

### Bulk install from a directory

If `--from` points to a directory that does **not** contain a `skill.yaml` at its root, harness treats it as a bulk install — it recursively discovers all subdirectories containing `skill.yaml` (up to 3 levels deep) and installs each one:

```bash
# Install all skills from a directory containing multiple skill subdirectories
harness install skills --from ./my-skill-collection/
```

### Global install

By default, skills are installed to the project-level `agents/skills/community/` directory. Use `--global` to install to `~/.harness/skills/community/` so the skill is available to all projects:

```bash
# Install globally for all projects
harness install deployment --global

# Global install from GitHub
harness install skills --from github:owner/repo --global
```

Global skills are included in `harness skill list` output and follow the same discovery priority (project-local > community > bundled).

### From a private registry

```bash
# Use a custom npm registry
harness install deployment --registry https://npm.mycompany.com
```

Authentication tokens are read from `.npmrc` (project-level first, then `$HOME/.npmrc`). The standard npm format is supported:

```
//npm.mycompany.com/:_authToken=your-token-here
```

The `--registry` flag also works with `harness skill search` and `harness skill publish`.

### What install does

**Registry install** (`harness install <skill>`):

1. Resolves `<skill>` to `@harness-skills/<skill>`
2. Checks that the skill name does not collide with a bundled skill (project-level installs only)
3. Fetches package metadata from the npm registry
4. Resolves version (latest, or semver range via `--version`)
5. Checks lockfile — skips if same version already installed (unless `--force`)
6. Downloads and extracts the tarball
7. Validates `skill.yaml` against the schema
8. Copies content to `agents/skills/community/{platform}/` for each declared platform
9. Auto-installs `depends_on` dependencies (logged as transitive installs)
10. Updates `agents/skills/community/skills-lock.json`

**Local/GitHub install** (`harness install <skill> --from <source>`):

1. If `--from` is a GitHub reference: shallow-clones the repo to a temp directory
2. If the source directory has no `skill.yaml` at root: discovers skills recursively (up to 3 levels)
3. For each discovered skill: validates `skill.yaml`, places content, updates lockfile with `resolved: "local:<path>"`
4. Cleans up temp directories

## Uninstalling Skills

```bash
# Uninstall a skill
harness uninstall deployment

# Force remove even if other skills depend on it
harness uninstall docker-basics --force
```

Uninstall checks the lockfile for dependent skills before removing. If another skill was auto-installed as a dependency of the target, a warning is shown.

## Discovering Skills

### Search

```bash
# Search for skills by keyword
harness skill search deploy

# Filter by platform
harness skill search auth --platform claude-code

# Filter by trigger type
harness skill search lint --trigger automatic

# Use a private registry
harness skill search deploy --registry https://npm.mycompany.com
```

Search queries the npm registry API scoped to `@harness-skills/*` packages. Results show name, version, description, and keywords.

### Info

```bash
# Show detailed metadata for a skill
harness skill info deployment
```

Displays name, version, type, description, triggers, platforms, tools, phases, and dependencies for a specific skill.

### List

```bash
# Show all skills with source column (bundled / local / community)
harness skill list

# Show only community-installed skills with version
harness skill list --installed

# Show only project-local skills
harness skill list --local

# JSON output for scripting
harness skill list --installed --json
```

## Creating Skills

```bash
# Scaffold a new skill
harness skill create my-deploy --description "Deploy to production"

# With options
harness skill create ci-helper \
  --type rigid \
  --platforms "claude-code,gemini-cli" \
  --triggers "manual,on_pr"
```

This creates a directory with three files:

- **`skill.yaml`** — Skill metadata (name, version, platforms, triggers, tools, type)
- **`SKILL.md`** — Skill content and instructions (the AI reads this)
- **`README.md`** — npm landing page with install instructions

Edit `SKILL.md` with your skill's behavior, then validate:

```bash
harness skill validate my-deploy
```

## Publishing Skills

```bash
# Dry run — validate without publishing
harness skill publish --dry-run

# Publish to npm
harness skill publish

# Publish to a private registry
harness skill publish --registry https://npm.mycompany.com
```

### Pre-publish validation pipeline

`harness skill publish` runs 6 checks before publishing:

1. **Schema validation** — `skill.yaml` parses against `SkillMetadataSchema`
2. **Required fields** — description non-empty, at least one platform, at least one trigger
3. **SKILL.md sections** — must contain `## When to Use` and `## Process` headings
4. **Version bump** — version must be greater than currently published version (skipped for first publish)
5. **Name guard** — skill name must not conflict with a bundled skill name
6. **Dependency check** — all `depends_on` entries must exist as published `@harness-skills/*` packages or bundled skill names

Each failure produces an actionable error message.

### What publish generates

- **`package.json`** — derived from `skill.yaml` (name, version, description, keywords from platforms/triggers, files allowlist, MIT license)
- **`README.md`** — generated from `SKILL.md` if not already present

## Skill Discovery Priority

When multiple skills share the same name, discovery follows this priority:

1. **Project-local** (`agents/skills/{platform}/`) — highest priority
2. **Community-installed** (`agents/skills/community/{platform}/`) — middle
3. **Bundled** (shipped with CLI) — fallback

First found wins. This applies to `harness skill run`, `harness skill list`, and `harness generate-slash-commands`.

## Package Format

A published `@harness-skills/*` package contains:

```
@harness-skills/my-skill/
├── package.json     # Auto-generated from skill.yaml
├── skill.yaml       # Skill metadata (source of truth)
├── SKILL.md         # Skill content/instructions
├── README.md        # npm landing page
└── [supporting files]
```

Skills are pure content — no `node_modules`, no runtime code, no build step. The `files` field in `package.json` is an allowlist: `["skill.yaml", "SKILL.md", "README.md"]`.

## Lockfile

Installed skills are tracked in `agents/skills/community/skills-lock.json`:

```json
{
  "version": 1,
  "skills": {
    "@harness-skills/deployment": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/@harness-skills/deployment/-/deployment-1.2.0.tgz",
      "integrity": "sha512-...",
      "platforms": ["claude-code", "gemini-cli"],
      "installedAt": "2026-03-25T10:00:00Z",
      "dependencyOf": null
    }
  }
}
```

The lockfile is deterministic (sorted keys) so it produces clean git diffs. You can commit it for reproducibility or `.gitignore` it.

## Architecture

```
packages/cli/src/
├── commands/
│   ├── install.ts              — harness install <skill> (registry, local, GitHub, bulk)
│   ├── uninstall.ts            — harness uninstall <skill>
│   └── skill/
│       ├── search.ts           — harness skill search <query>
│       ├── create.ts           — harness skill create <name>
│       ├── publish.ts          — harness skill publish
│       ├── info.ts             — harness skill info <name>
│       ├── list.ts             — harness skill list (with source filtering)
│       ├── run.ts              — harness skill run <name>
│       └── validate.ts         — harness skill validate <name>
├── registry/
│   ├── npm-client.ts           — npm API: fetch, download, search, .npmrc tokens
│   ├── tarball.ts              — extract tgz, place/remove skill content
│   ├── resolver.ts             — semver version resolution, dependent finder
│   ├── lockfile.ts             — deterministic skills-lock.json (pure functions)
│   ├── validator.ts            — pre-publish validation pipeline (6 checks)
│   └── bundled-skills.ts       — bundled skill name collision prevention
└── skill/
    └── package-json.ts         — derive package.json from skill.yaml
```
