# Community Skill Registry

> Publish, discover, and install harness skills via the `@harness-skills/*` npm namespace. Turns the skill system from a monorepo-bundled set into an open ecosystem with network effects.

**Keywords:** skill-registry, npm-namespace, harness-install, skill-publish, skill-search, dependency-resolution, community-skills, skill-marketplace

## Overview

The harness framework ships 49+ skills bundled with the CLI. These skills are file-system based — discovered at runtime by scanning `agents/skills/{platform}/` directories. This works for first-party skills but creates a closed ecosystem: contributing a new skill means opening a PR against the monorepo.

The Community Skill Registry introduces:

- **`@harness-skills/*` npm namespace** for publishing skills as lightweight content packages
- **`harness install <skill>`** for downloading and placing skills into projects
- **`harness skills search <query>`** for discovering skills via npm with harness-specific metadata filtering
- **`harness skills create <name>`** for scaffolding new skills with correct structure
- **`harness skills publish`** for validating and publishing skills to npm
- A **pre-publish validation pipeline** ensuring a quality floor for the ecosystem

### Goals

1. Any developer can publish a harness skill with `harness skills publish`
2. Any user can discover skills with `harness skills search` and install with `harness install`
3. Installed skills work identically to bundled/local skills — zero behavioral difference
4. A quality floor exists: broken or incomplete skills cannot be published
5. Dependency chains resolve automatically with transparency

### Non-Goals

- Runtime code in skills (future enhancement — skills remain pure content)
- Hosted registry infrastructure (leverage npm entirely)
- Constraint sharing (separate roadmap item H3)
- Skill ratings, reviews, or curation (requires hosted infrastructure)
- Monetization or paid skills
- Version pinning in `depends_on` (future enhancement — installs latest for now)

## Decisions

| Decision              | Choice                                                  | Rationale                                                                                                                             |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| npm namespace         | `@harness-skills/*`                                     | Distinct community identity, separates from core `@harness-engineering/*` packages, enables trivial npm search scoping                |
| Package format        | Pure content (skill.yaml + SKILL.md + supporting files) | Zero supply chain risk, tiny packages (~5-20KB), matches existing skill model. Runtime code is a future enhancement                   |
| Dependency resolution | Single-level auto-resolve with warnings                 | Skill chains are inherently shallow (2-3 deep max). Full npm-style resolution is overkill for content packages                        |
| Search backend        | npm registry API + local metadata enrichment            | No infrastructure to maintain. Fetch skill.yaml from results to enable harness-specific filtering (platform, trigger, cognitive mode) |
| Install location      | `agents/skills/community/{platform}/`                   | Clean separation from local/bundled skills. Lockfile tracks installed state. Can gitignore or commit for reproducibility              |
| Quality gate          | Pre-publish validation pipeline                         | Validates skill.yaml schema, required SKILL.md sections, platform declarations before publish. Prevents broken skills in registry     |
| Scaffolding           | `harness skills create`                                 | Lowers barrier to contribution, establishes correct structure from the start                                                          |

## Technical Design

### Package Structure

A published skill is an npm package:

```
@harness-skills/my-skill/
├── package.json          # Auto-generated from skill.yaml
├── skill.yaml            # Skill metadata (source of truth)
├── SKILL.md              # Skill content/instructions
├── README.md             # npm landing page (auto-generated from SKILL.md)
└── [supporting files]    # Templates, examples, references
```

`package.json` is derived from `skill.yaml`:

- `name` → `@harness-skills/{skill.yaml.name}`
- `version` → `skill.yaml.version`
- `description` → `skill.yaml.description`
- `keywords` → encoded from platforms, triggers, cognitive_mode (e.g., `harness-skill`, `platform:claude-code`, `trigger:on_pr`, `mode:adversarial-reviewer`)
- `files` → allowlist of skill content (no node_modules, no src/)
- `license` → defaults to `MIT` unless overridden

### CLI Commands

#### `harness skills create <name>`

1. Validates name is kebab-case
2. Creates directory with skill.yaml template, SKILL.md template, README.md
3. Prompts for: description, platforms, triggers, type (rigid/flexible)
4. Outputs: ready-to-edit skill directory

#### `harness install <skill> [--version <range>]`

1. Resolves `<skill>` → `@harness-skills/<skill>` if not already scoped
2. Fetches package metadata from npm registry (`GET https://registry.npmjs.org/@harness-skills/<skill>`)
3. Resolves version (latest or semver range match)
4. Downloads tarball and extracts to temp directory
5. Validates extracted skill.yaml against `SkillMetadataSchema`
6. Copies content to `agents/skills/community/{platform}/` for each declared platform
7. Reads `depends_on`, installs missing dependencies recursively (warns on each transitive install)
8. Updates `agents/skills/community/skills-lock.json`
9. Outputs: installed skill name, version, platforms, and any transitive dependencies

#### `harness uninstall <skill>`

1. Looks up skill in lockfile
2. Checks if other installed skills depend on it — warns if so, requires `--force` to proceed
3. Removes skill directory from `agents/skills/community/{platform}/`
4. Updates lockfile

#### `harness skills search <query> [--platform <p>] [--trigger <t>]`

1. Queries npm registry search: `GET /-/v1/search?text=scope:harness-skills+<query>&size=20`
2. For top results, fetches skill.yaml from package tarball metadata
3. Filters by `--platform` and `--trigger` flags against skill.yaml metadata
4. Displays table: name, version, description, platforms, triggers, weekly downloads

#### `harness skills publish`

1. Runs pre-publish validation pipeline (see below)
2. Generates/updates `package.json` from skill.yaml
3. Generates `README.md` from SKILL.md (adds npm badge header, install instructions)
4. Runs `npm publish --access public`
5. Outputs: published package name and version

#### `harness skills list [--installed] [--local] [--all]`

- `--installed`: only community-installed skills
- `--local`: only project-authored skills
- `--all` (default): both, with source column (bundled / local / community)

### Pre-Publish Validation Pipeline

`harness skills publish` runs these checks sequentially, stopping on first failure:

1. **Schema validation** — skill.yaml parses against `SkillMetadataSchema`
2. **Required fields** — description non-empty, at least one platform, at least one trigger
3. **SKILL.md exists** — contains at least: a heading, a "When to Use" section, and a "Process" section
4. **Version bump** — version in skill.yaml is greater than currently published version (skip for first publish)
5. **Name guard** — skill name does not conflict with bundled skill names (prevents community `harness-tdd` overriding the bundled one)
6. **Dependency check** — all `depends_on` entries exist as published `@harness-skills/*` packages or as bundled skill names

Each failure produces an actionable error message with fix instructions.

### Lockfile Format

`agents/skills/community/skills-lock.json`:

```json
{
  "version": 1,
  "skills": {
    "@harness-skills/deployment": {
      "version": "1.2.0",
      "resolved": "https://registry.npmjs.org/@harness-skills/deployment/-/deployment-1.2.0.tgz",
      "integrity": "sha512-...",
      "platforms": ["claude-code", "gemini-cli"],
      "installedAt": "2026-03-23T10:00:00Z",
      "dependencyOf": null
    },
    "@harness-skills/docker-basics": {
      "version": "0.3.1",
      "resolved": "https://registry.npmjs.org/@harness-skills/docker-basics/-/docker-basics-0.3.1.tgz",
      "integrity": "sha512-...",
      "platforms": ["claude-code"],
      "installedAt": "2026-03-23T10:00:01Z",
      "dependencyOf": "@harness-skills/deployment"
    }
  }
}
```

### Discovery Integration

Update `resolveSkillsDir()` in `packages/cli/src/utils/paths.ts` to return an ordered list of skill directories:

1. **Project-local:** `{projectRoot}/agents/skills/{platform}/` (highest priority)
2. **Community-installed:** `{projectRoot}/agents/skills/community/{platform}/`
3. **Bundled:** `{cliPackage}/dist/agents/skills/{platform}/` (fallback)

When the same skill name exists in multiple locations, project-local wins. A debug log notes the override. This ensures users can always fork and customize a community skill locally.

### Schema Changes

`skill.yaml` gains one optional field:

```yaml
repository: 'https://github.com/user/my-skill' # optional, for npm/README metadata
```

No other schema changes. The existing `depends_on: string[]` field is used as-is for skill name references. Semver version pinning in `depends_on` is deferred to a future enhancement.

### Assumptions

- **Node.js runtime**: Node.js >= 18.x (LTS). Implementation uses built-in modules (fs, path, child_process).
- **npm CLI available**: `harness skills publish` requires npm CLI installed and authenticated (`npm login`). Install and search use the npm registry HTTP API directly — no npm CLI dependency.
- **npm org registered**: The `@harness-skills` npm organization must be registered before first publish. Publishers need org membership or use `--access public` on the scoped package.
- **Network connectivity**: Install, search, and publish require network access. Offline behavior: installed skills continue to work (they are local files). Install/search/publish fail fast with a clear "network unreachable" error.

### Error Handling

- **Registry unreachable**: `harness install` and `harness skills search` fail with "Cannot reach npm registry. Check your network connection." Exit code 1.
- **Tarball download failure**: Partial downloads are cleaned up. Retry once, then fail with "Download failed for @harness-skills/{name}. Try again."
- **Invalid skill in tarball**: If extracted skill.yaml fails `SkillMetadataSchema` validation, abort install with "Package @harness-skills/{name}@{version} contains invalid skill.yaml: {validation errors}." The skill is not placed on disk.
- **Disk full**: Extraction fails naturally via fs errors. Partial extraction is cleaned up via try/finally.
- **Already installed**: `harness install` on an already-installed skill compares versions. If same version, skips with "Already installed: {name}@{version}". If newer version available, upgrades and logs "Upgraded {name}: {old} → {new}". Use `--force` to reinstall same version.
- **Community vs bundled name collision**: `harness install` refuses to install a skill whose name matches a bundled skill. Error: "Skill '{name}' is a bundled skill and cannot be overridden by a community package. Use a project-local skill to override."

### File Layout (new code)

```
packages/cli/src/
├── commands/
│   ├── install.ts              # harness install <skill>
│   ├── uninstall.ts            # harness uninstall <skill>
│   └── skills/
│       ├── create.ts           # harness skills create <name>
│       ├── publish.ts          # harness skills publish
│       └── search.ts           # harness skills search <query>
├── registry/
│   ├── npm-client.ts           # npm registry API client (search, fetch metadata, download tarball)
│   ├── tarball.ts              # Tarball extraction and content placement
│   ├── lockfile.ts             # skills-lock.json read/write/update
│   ├── resolver.ts             # Version resolution and dependency auto-install
│   └── validator.ts            # Pre-publish validation pipeline
├── skill/
│   ├── schema.ts               # (existing) add optional repository field
│   ├── scaffolder.ts           # Template generation for harness skills create
│   └── package-json.ts         # skill.yaml → package.json derivation
└── utils/
    └── paths.ts                # (existing) add community/ discovery path
```

## Success Criteria

1. **`harness skills create my-skill`** scaffolds a valid, publishable skill directory that passes `harness skill validate`
2. **`harness skills publish`** publishes a skill to `@harness-skills/*` on npm, blocked by pre-publish validation failures
3. **`harness install deployment`** downloads, extracts, and places a skill into `agents/skills/community/{platform}/` — the skill is immediately invocable via `harness skill run` and slash commands
4. **`harness skills search auth`** returns matching `@harness-skills/*` packages with harness-specific metadata (platforms, triggers, cognitive mode)
5. **`harness uninstall deployment`** removes the skill and updates the lockfile, warning if dependents exist
6. **`harness skills list --installed`** shows only community-installed skills with version and source
7. **Installed community skills behave identically** to bundled/local skills — same discovery, same execution, same slash command generation
8. **Dependency auto-resolution** installs missing `depends_on` skills, logging each transitive install
9. **Pre-publish validation** rejects skills with: missing SKILL.md, invalid skill.yaml, name collision with bundled skills, or unresolvable dependencies — each rejection includes an actionable error message explaining how to fix the issue
10. **Lockfile** is deterministic — same install sequence on same versions produces identical `skills-lock.json`
11. **`harness install` on already-installed skill** skips if same version, upgrades if newer available, respects `--force` for reinstall

## Implementation Order

1. **Foundation** — Schema changes (optional `repository` field), discovery path update to scan `community/` directory, lockfile read/write utilities
2. **Install/Uninstall** — `harness install` and `harness uninstall` commands with npm registry client, tarball extraction, lockfile management, dependency auto-resolution
3. **Search & List** — `harness skills search` with npm API + metadata enrichment, updated `harness skills list` with source filtering
4. **Scaffolding** — `harness skills create` with interactive prompts and template generation
5. **Publish Pipeline** — `harness skills publish` with validation pipeline, package.json generation, README generation, npm publish wrapper
6. **Integration** — Slash command generation picks up community skills, documentation updates, end-to-end testing
