# Templates and Framework Overlays

Templates are the scaffolding system behind `harness init`. They generate a ready-to-use project structure with the right configuration, AGENTS.md knowledge map, tooling, and directory layout for your chosen language, adoption level, and framework.

## How It Works

Every template is a directory under `templates/` containing a `template.json` metadata file and a set of source files. Many files use Handlebars (`.hbs`) for variable substitution -- your project name, module path, and other context values are injected at render time.

Templates compose through two mechanisms:

- **Inheritance** -- level templates (basic, intermediate, advanced) extend the `base` template. Language-base templates (go-base, python-base, etc.) stand alone. Files from the parent are included first, then the child overlays or replaces them.
- **Framework overlays** -- framework templates layer on top of a base, adding framework-specific files and merging JSON configs. For TypeScript frameworks, the overlay merges with the level template. For non-JS frameworks, the overlay merges with the language-base template.

JSON files are deep-merged so that base configuration and overlay configuration combine cleanly. `package.json` dependencies are concatenated rather than overwritten.

## Quick Start

The recommended way to create a new project is through your AI agent:

```
/harness:initialize-project
```

This walks you through project setup interactively -- name, adoption level, framework -- and scaffolds everything including MCP server configuration.

For non-interactive use:

```bash
# TypeScript project at intermediate adoption level
harness init --name my-api --level intermediate

# TypeScript project with a framework overlay
harness init --name my-api --level intermediate --framework express

# Python project with FastAPI
harness init --name my-api --language python --framework fastapi

# Go project (no framework)
harness init --name my-service --language go

# Rust project with Axum
harness init --name my-service --language rust --framework axum

# Java project with Spring Boot
harness init --name my-service --language java --framework spring-boot
```

### CLI Options

| Flag                | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| `--name <name>`     | Project name (defaults to current directory name)                     |
| `--level <level>`   | Adoption level: `basic`, `intermediate`, `advanced` (TypeScript only) |
| `--framework <fw>`  | Framework overlay to apply                                            |
| `--language <lang>` | Target language: `typescript`, `python`, `go`, `rust`, `java`         |
| `--template <name>` | Specific template name (e.g., `orchestrator`)                         |
| `--force`           | Overwrite existing files                                              |

### Auto-Detection

When you run `harness init` without `--framework` or `--language` in an existing project, the engine scans for framework signatures. Each framework template defines detection patterns -- for example, the Express template looks for `"express"` in `package.json`, and the Django template looks for `"django"` in `requirements.txt` or `manage.py`. Detected frameworks are presented as suggestions.

## Template Catalog

### Base Template

The shared foundation for all TypeScript-level templates. Not used directly.

| File                | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `AGENTS.md.hbs`     | Knowledge map with project name and adoption level             |
| `docs/index.md.hbs` | Documentation landing page                                     |
| `.gitignore`        | Standard ignores for node_modules, dist, coverage              |
| `.agnix.toml`       | Agent configuration validation (agnix/Claude Code integration) |

### Adoption Level Templates (TypeScript)

These three templates target TypeScript/JavaScript projects at increasing levels of harness adoption. Each extends the base template.

#### Basic

**Use when:** Learning harness, simple projects, or gradual adoption.

```bash
harness init --name my-project --level basic
```

Scaffolds:

- `harness.config.json` -- layer definitions (types, domain, services, api), AGENTS.md path, docs directory
- `package.json` -- project metadata
- `src/index.ts` -- entry point
- `tsconfig.json` -- TypeScript configuration
- Everything from base (AGENTS.md, docs/index.md, .gitignore, .agnix.toml)

#### Intermediate

**Use when:** Most production projects. Adds enforcement tooling.

```bash
harness init --name my-project --level intermediate
```

Adds on top of basic:

- `eslint.config.mjs` -- ESLint configuration with harness rules
- `docs/principles.md` -- architectural principles documentation
- `docs/changes/.gitkeep` -- change log directory
- `harness.config.json` -- adds `forbiddenImports` rules and `boundaries.requireSchema` for the API layer
- `package.json` -- adds ESLint, Vitest, and harness ESLint plugin as dev dependencies
- Scaffold directories: `src/types/`, `src/domain/`, `src/services/` (matching the layer definitions)

#### Advanced

**Use when:** Complex architectures, multi-team projects, full agent-loop integration.

```bash
harness init --name my-project --level advanced
```

Adds on top of intermediate:

- `harness.config.json` -- adds `agent` configuration (executor, timeout) and `entropy` detection settings
- `agents/personas/.gitkeep` -- directory for custom agent persona definitions
- `docs/principles.md` -- architectural principles documentation
- `docs/changes/.gitkeep` -- change log directory

### Language Base Templates

Standalone templates for non-TypeScript languages. Each includes language-idiomatic tooling, a tailored AGENTS.md, and a `harness.config.json`.

#### Go (`go-base`)

```bash
harness init --name my-service --language go
```

| File                      | Purpose                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `main.go`                 | Application entry point                                                                   |
| `go.mod.hbs`              | Module definition (uses `goModulePath` variable, defaults to `github.com/example/<name>`) |
| `.golangci.yml`           | golangci-lint configuration                                                               |
| `AGENTS.md.hbs`           | Go-specific knowledge map (conventions, directory structure, tooling)                     |
| `harness.config.json.hbs` | Tooling: golangci-lint, gofmt, go test                                                    |
| `.gitignore`              | Go binary and vendor ignores                                                              |

#### Python (`python-base`)

```bash
harness init --name my-service --language python
```

| File                      | Purpose                                                                       |
| ------------------------- | ----------------------------------------------------------------------------- |
| `src/__init__.py`         | Package initializer                                                           |
| `pyproject.toml.hbs`      | Project metadata and dependencies (uses `pythonMinVersion`, defaults to 3.10) |
| `ruff.toml`               | Ruff linter/formatter configuration                                           |
| `.python-version`         | Python version pin                                                            |
| `AGENTS.md.hbs`           | Python-specific knowledge map (PEP 8, type hints, Ruff, pytest)               |
| `harness.config.json.hbs` | Tooling: Ruff, pytest, pip                                                    |
| `.gitignore`              | Python-specific ignores                                                       |

#### Java (`java-base`)

```bash
harness init --name my-service --language java
```

| File                         | Purpose                                                           |
| ---------------------------- | ----------------------------------------------------------------- |
| `src/main/java/App.java.hbs` | Application entry point                                           |
| `pom.xml.hbs`                | Maven project configuration (uses `javaGroupId` variable)         |
| `checkstyle.xml`             | Google Java Style Guide rules                                     |
| `AGENTS.md.hbs`              | Java-specific knowledge map (Java 17, Maven, JUnit 5, Checkstyle) |
| `harness.config.json.hbs`    | Tooling: Maven, Checkstyle, JUnit                                 |
| `.gitignore`                 | Java/Maven-specific ignores                                       |

#### Rust (`rust-base`)

```bash
harness init --name my-service --language rust
```

| File                      | Purpose                                                                   |
| ------------------------- | ------------------------------------------------------------------------- |
| `src/main.rs`             | Application entry point                                                   |
| `Cargo.toml.hbs`          | Package manifest (uses `rustEdition`, defaults to 2021)                   |
| `clippy.toml`             | Clippy linter configuration                                               |
| `AGENTS.md.hbs`           | Rust-specific knowledge map (Clippy, rustfmt, error handling conventions) |
| `harness.config.json.hbs` | Tooling: Cargo, Clippy, rustfmt                                           |
| `.gitignore`              | Rust/target-specific ignores                                              |

### Framework Overlay Templates

Framework overlays add framework-specific files and conventions on top of a base template. For TypeScript frameworks, they overlay onto a level template (basic/intermediate/advanced). For non-JS frameworks, they overlay onto the corresponding language-base template.

Each framework overlay also appends a conventions section to AGENTS.md with framework-specific guidance for AI agents.

#### TypeScript Frameworks

| Framework        | Command                  | Key Files                                                                                 | Conventions Added to AGENTS.md                                                                                          |
| ---------------- | ------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Express**      | `--framework express`    | `src/app.ts`, `src/lib/`, `package.json`                                                  | Routes in `src/routes/`, middleware in `src/middleware/`, error handling via centralized middleware, Vitest + supertest |
| **NestJS**       | `--framework nestjs`     | `src/main.ts`, `src/app.module.ts`, `src/lib/`, `nest-cli.json`, `package.json`           | Module-based architecture, decorators (`@Controller`, `@Injectable`), Nest CLI for scaffolding                          |
| **Next.js**      | `--framework nextjs`     | `src/app/layout.tsx`, `src/app/page.tsx`, `src/lib/`, `next.config.mjs`, `package.json`   | App Router (`src/app/`), Server Components by default, `next/image` and `next/link`, API routes in `src/app/api/`       |
| **React + Vite** | `--framework react-vite` | `src/App.tsx`, `src/main.tsx`, `src/lib/`, `index.html`, `vite.config.ts`, `package.json` | Function components with hooks, CSS modules or styled-components, Vitest for testing                                    |
| **Vue + Vite**   | `--framework vue`        | `src/App.vue`, `src/main.ts`, `src/lib/`, `index.html`, `vite.config.ts`, `package.json`  | Single File Components, `<script setup>` with Composition API, Vue Router, Pinia                                        |

#### Python Frameworks

| Framework   | Command                                 | Key Files                                                                        | Conventions Added to AGENTS.md                                                            |
| ----------- | --------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **FastAPI** | `--language python --framework fastapi` | `src/main.py`, `requirements.txt`                                                | Pydantic models for validation, async endpoints preferred, uvicorn for dev server, pytest |
| **Django**  | `--language python --framework django`  | `manage.py`, `src/settings.py`, `src/urls.py`, `src/wsgi.py`, `requirements.txt` | Settings at `src/settings.py`, management commands via `manage.py`, pytest-django         |

#### Go Frameworks

| Framework | Command                         | Key Files           | Conventions Added to AGENTS.md                                                        |
| --------- | ------------------------------- | ------------------- | ------------------------------------------------------------------------------------- |
| **Gin**   | `--language go --framework gin` | `main.go`, `go.mod` | Route grouping with `router.Group()`, middleware for logging/auth/recovery, `go test` |

#### Rust Frameworks

| Framework | Command                            | Key Files                   | Conventions Added to AGENTS.md                                                                               |
| --------- | ---------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Axum**  | `--language rust --framework axum` | `src/main.rs`, `Cargo.toml` | Extractors for request parsing (`Path`, `Query`, `Json`), shared state via `Extension`/`State`, `cargo test` |

#### Java Frameworks

| Framework       | Command                                   | Key Files                                   | Conventions Added to AGENTS.md                                                                             |
| --------------- | ----------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Spring Boot** | `--language java --framework spring-boot` | `src/main/java/Application.java`, `pom.xml` | `@SpringBootApplication` entry point, controller/service package structure, constructor injection, JUnit 5 |

### Orchestrator Template

A special-purpose template that generates a `harness.orchestrator.md` for the Harness Orchestrator daemon. This is not a project scaffold -- it configures autonomous agent orchestration.

```bash
harness init --template orchestrator
```

## What Every Project Gets

Regardless of template choice, every initialized project includes:

1. **`harness.config.json`** -- project configuration with layer definitions, tooling metadata, and template provenance
2. **`AGENTS.md`** -- a knowledge map tailored to the language and framework, giving AI agents context about the project structure, conventions, and tooling
3. **`.harness/.gitignore`** -- ensures runtime artifacts (graph data, session state, handoff files) are never committed
4. **MCP server configuration** -- `.mcp.json` and/or `.gemini/settings.json` are created automatically so AI agents can connect to the harness MCP server

## Template Composition in Detail

When you specify both a level and a framework (TypeScript path), or a language and a framework (non-JS path), the engine composes templates in order:

**TypeScript path:** `base` -> `level` (basic/intermediate/advanced) -> `framework` overlay

**Non-JS path:** `language-base` (go-base/python-base/etc.) -> `framework` overlay

At each step:

- **Non-JSON files:** the overlay wins (replaces the base file at the same path)
- **JSON files (.json.hbs):** deep-merged, with overlay values taking precedence for scalar fields
- **`package.json`:** dependency objects (`dependencies`, `devDependencies`, `peerDependencies`) are concatenated so both base and overlay dependencies are preserved

After file rendering and writing, the engine runs post-write steps:

1. **Tooling config** -- merges framework tooling metadata (package manager, linter, formatter, build tool, test runner) into `harness.config.json`
2. **AGENTS.md conventions** -- appends a framework-specific conventions section with idempotent markers to prevent duplication on re-runs
3. **`.harness/.gitignore`** -- creates the runtime artifact gitignore if it does not exist

## Customizing Generated Projects

Templates are starting points. After initialization:

- **Edit `harness.config.json`** to adjust layer definitions, forbidden imports, and boundary schemas for your architecture
- **Edit `AGENTS.md`** to add project-specific context, constraints, and gotchas that AI agents need to know
- **Add layers** by defining them in `harness.config.json` and creating the corresponding directories
- **Change tooling** by updating the `tooling` section in `harness.config.json` to match your actual package manager, linter, and test runner

There is currently no mechanism for user-defined custom templates. The template catalog is maintained within the harness CLI package. To request a new template, open an issue on the harness-engineering repository.

## Related

- [Getting Started](./getting-started.md) -- installation, first project walkthrough
- [Best Practices](./best-practices.md) -- patterns for organizing harness-managed projects
- [CLI Reference](../api/cli.md) -- full `harness init` option reference
- [Implementation Guide](../standard/implementation.md) -- adoption level roadmap (basic -> intermediate -> advanced)
