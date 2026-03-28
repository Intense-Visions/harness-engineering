# Multi-Language Framework Templates

**Status:** Approved
**Keywords:** templates, frameworks, multi-language, python, go, rust, java, typescript, scaffold, auto-detect

## Overview

Extend the harness template system to support 10 popular frameworks across 5 languages (TypeScript/JS, Python, Go, Rust, Java), enabling `harness init` and `/harness:initialize-project` to scaffold and configure projects for any of these stacks. Templates work on both new and existing projects, with auto-detection of the current framework.

### Goals

1. Users can initialize a harness-managed project for any of the 10 supported frameworks with a single command
2. Existing projects can adopt harness without clobbering their files — the template overlays configuration and structure only
3. Post-initialization, harness skills (review, planning, brainstorming, validation) work with framework-aware context via AGENTS.md and config
4. The template engine supports a language manifest so future validation and linting integration is straightforward
5. Auto-detection identifies the framework in existing projects and confirms with the user before applying

### Non-Goals

- Multi-language `harness validate` integration (deferred)
- Opinionated example code or starter apps
- Per-language adoption levels (basic/intermediate/advanced remain JS/TS-only for now)
- Community/third-party template registry

## Decisions

| #   | Decision                                                                                                               | Rationale                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Multi-language with language manifest in `template.json`                                                               | Broadest adoption surface; manifest enables future validation wiring without engine changes |
| 2   | Curated 10 frameworks: Next.js (existing), React (Vite), Vue, Express, NestJS, FastAPI, Gin, Axum, Spring Boot, Django | Top choice per ecosystem, manageable scope, remaining frameworks can follow fast            |
| 3   | Minimal scaffold per template (config + deps + structure + entry point)                                                | Consistent with existing Next.js overlay, least opinionated, lowest maintenance             |
| 4   | Include native linter config but don't wire into `harness validate`                                                    | Practical value without blocking on engine-level multi-language validation                  |
| 5   | Hybrid flat directory layout — language-base templates + framework overlays as peers                                   | Zero migration of existing templates, simple to extend, relationships via manifest          |
| 6   | `--framework` infers language, `--language` as fallback for bare scaffolds                                             | Ergonomic common case, explicit fallback for bare language projects                         |
| 7   | Auto-detect framework in existing projects with user confirmation and override                                         | Seamless for existing project adoption, AI skill leverages detection, user stays in control |
| 8   | `/harness:initialize-project` is the primary entry point                                                               | Templates must integrate well with AI-driven initialization flow                            |
| 9   | Existing project support is first-class — overlay without clobbering                                                   | Templates skip existing files by default, merge configs additively                          |

## Technical Design

### Template Directory Layout

```
templates/
  base/                  # (existing) Shared base for JS/TS
  basic/                 # (existing) JS/TS level 1
  intermediate/          # (existing) JS/TS level 2
  advanced/              # (existing) JS/TS level 3
  nextjs/                # (existing) JS/TS framework overlay
  orchestrator/          # (existing) Special-purpose
  python-base/           # Python language base
  go-base/               # Go language base
  rust-base/             # Rust language base
  java-base/             # Java language base
  react-vite/            # JS/TS framework overlay
  vue/                   # JS/TS framework overlay
  express/               # JS/TS framework overlay
  nestjs/                # JS/TS framework overlay
  fastapi/               # Python framework overlay (extends python-base)
  django/                # Python framework overlay (extends python-base)
  gin/                   # Go framework overlay (extends go-base)
  axum/                  # Rust framework overlay (extends rust-base)
  spring-boot/           # Java framework overlay (extends java-base)
```

### Expanded `template.json` Schema

```json
{
  "name": "fastapi",
  "description": "FastAPI web framework scaffold",
  "version": 1,
  "language": "python",
  "framework": "fastapi",
  "extends": "python-base",
  "mergeStrategy": { "json": "deep-merge", "files": "overlay-wins" },
  "tooling": {
    "packageManager": "pip",
    "linter": "ruff",
    "formatter": "ruff",
    "buildTool": "setuptools",
    "testRunner": "pytest",
    "lockFile": "requirements.txt"
  },
  "detect": [
    { "file": "requirements.txt", "contains": "fastapi" },
    { "file": "pyproject.toml", "contains": "fastapi" }
  ]
}
```

New fields:

- `language` — one of `typescript`, `python`, `go`, `rust`, `java`
- `tooling` — language-specific tool declarations for future validation integration and downstream skill consumption
- `detect` — array of file+content patterns for auto-detection in existing projects

### Language Base Template Contents

| Language | Base template includes                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------ |
| Python   | `pyproject.toml.hbs`, `.python-version`, `ruff.toml`, `src/__init__.py`, `AGENTS.md.hbs`, `.gitignore` |
| Go       | `go.mod.hbs`, `.golangci.yml`, `main.go`, `AGENTS.md.hbs`, `.gitignore`                                |
| Rust     | `Cargo.toml.hbs`, `clippy.toml`, `src/main.rs`, `AGENTS.md.hbs`, `.gitignore`                          |
| Java     | `pom.xml.hbs`, `checkstyle.xml`, `src/main/java/App.java.hbs`, `AGENTS.md.hbs`, `.gitignore`           |

Each AGENTS.md.hbs is language-aware — includes framework conventions, directory structure guidance, and harness skill usage tailored to that stack.

### Handlebars Context Variables

The render context is extended per language:

| Variable           | Type   | Available for                                  |
| ------------------ | ------ | ---------------------------------------------- |
| `projectName`      | string | All templates                                  |
| `level`            | string | JS/TS templates                                |
| `framework`        | string | All framework overlays                         |
| `language`         | string | All templates                                  |
| `goModulePath`     | string | Go templates (e.g., `github.com/user/project`) |
| `pythonMinVersion` | string | Python templates (e.g., `3.11`)                |
| `javaGroupId`      | string | Java templates (e.g., `com.example`)           |
| `rustEdition`      | string | Rust templates (e.g., `2021`)                  |

Language-specific variables are prompted during `harness init` or inferred by the AI skill.

### Template Resolution

Note: `resolveTemplate()` signature changes from `resolveTemplate(level, framework?)` to `resolveTemplate(level?, framework?, language?)` to accommodate non-JS languages where level is not applicable.

```
resolveTemplate(level?, framework?, language?):

1. If framework specified:
   a. Look up template.json with matching framework
   b. Read language from manifest
   c. If JS/TS language:
      - Resolve: base -> level -> framework (existing behavior)
   d. If non-JS language:
      - Resolve: language-base -> framework

2. If only language specified (bare scaffold):
   a. If JS/TS: resolve base -> level (existing behavior)
   b. If non-JS: resolve language-base only

3. If neither: existing behavior (base -> level)
```

### Auto-Detection

New `detectFramework(targetDir)` function in `TemplateEngine`:

1. List all templates with `detect` field in their manifest
2. For each template, check if detect patterns match files in `targetDir`
3. Score by number of patterns matched
4. Return ranked list of candidates (or empty)
5. If zero frameworks detected, prompt user to specify `--framework` manually
6. If multiple frameworks tie in score, present all tied candidates for user selection

Called by both CLI (`harness init` without flags on an existing directory) and the `/harness:initialize-project` skill.

### CLI Changes

```
harness init [--name <name>] [--level basic|intermediate|advanced]
             [--framework nextjs|react-vite|vue|express|nestjs|fastapi|django|gin|axum|spring-boot]
             [--language typescript|python|go|rust|java]
             [--force]
```

- `--framework` implies `--language` (validated against manifest)
- `--language` without `--framework` gives bare language scaffold
- If neither flag on an existing directory, run auto-detection and confirm with user
- `--force` overwrites existing files (current behavior preserved)

### Existing Project Overlay Behavior

- Default: skip files that already exist
- **New projects:** Render package config (`.hbs`) files as-is — no merge needed since there is no existing file
- **Existing projects:** Skip package config files (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`) entirely — do not overwrite or merge. Log a message listing any harness-specific dependencies the user should add manually. This avoids the need for TOML/XML/Go mod parsers.
- Merge `package.json` additively using existing `mergePackageJson()` (JS/TS only — parser already exists)
- Always write `AGENTS.md` if missing; if present, append framework-specific section (guarded by a section marker like `## FastAPI Conventions` — skip append if marker already exists)
- Always write/merge `harness.config.json`
- Write linter config only if none exists for that tool

### Post-Init `harness.config.json`

```json
{
  "template": {
    "level": null,
    "language": "python",
    "framework": "fastapi",
    "version": 1
  },
  "tooling": {
    "packageManager": "pip",
    "linter": "ruff",
    "formatter": "ruff",
    "testRunner": "pytest"
  }
}
```

Surfaces in harness skills — code review references the linter, AI suggests pytest not jest, etc.

## Success Criteria

1. `harness init --framework <name>` works for all 10 frameworks — produces a valid project scaffold with correct config files, dependencies, linter config, and AGENTS.md
2. `harness init --language <name>` works for all 5 languages — produces a bare language scaffold without a specific framework
3. Running `harness init --framework fastapi` in a directory with existing Python files does not clobber any user files; it adds harness config, AGENTS.md, and linter config only where missing
4. Running `harness init` in an existing FastAPI/Django/Go/etc. project correctly identifies the framework and presents it for confirmation
5. `harness init --framework fastapi --language go` produces a clear error, not a broken scaffold
6. Existing `harness init --level intermediate --framework nextjs` works identically to current behavior; no regressions
7. Post-init `harness.config.json` declares language, framework, and tooling so downstream skills can consume it
8. Each template's AGENTS.md includes framework-specific conventions, directory structure, and harness skill guidance
9. All `template.json` files pass Zod schema validation including new `language`, `tooling`, and `detect` fields
10. `/harness:initialize-project` skill leverages `detectFramework()` results to recommend a framework during initialization

## Implementation Order

### Phase 1: Engine Foundation

- Expand `template.json` Zod schema with `language`, `tooling`, `detect` fields
- Add language-aware resolution branch to `TemplateEngine.resolveTemplate()`
- Add `detectFramework()` function
- Add `--language` CLI flag to `harness init`
- Add existing-project detection logic: skip non-JSON package config files, log manual dependency instructions

### Phase 2: Language Base Templates

- Author `python-base/`, `go-base/`, `rust-base/`, `java-base/` templates
- Each includes: manifest, package config (`.hbs`), linter config, entry point, AGENTS.md.hbs, .gitignore
- Validate all bases work via `harness init --language <name>`

### Phase 3: JS/TS Framework Overlays

- Author `react-vite/`, `vue/`, `express/`, `nestjs/` templates
- Each extends `base` (existing JS/TS base), declares `language: "typescript"`, includes `detect` patterns
- Verify composition with all three levels (basic/intermediate/advanced)

### Phase 4: Non-JS Framework Overlays

- Author `fastapi/`, `django/`, `gin/`, `axum/`, `spring-boot/` templates
- Each extends its language base, includes `detect` patterns
- Verify overlay on both new and existing project directories

### Phase 5: Integration and Polish

- Wire `detectFramework()` into CLI auto-detection flow
- Update `/harness:initialize-project` skill to use detection results
- Update `harness.config.json` to persist tooling metadata
- Existing project AGENTS.md append logic
- End-to-end testing across all 10 frameworks and 5 bare language scaffolds
