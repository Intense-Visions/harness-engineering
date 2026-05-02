# Plan: Phase 2 -- Language Base Templates

**Date:** 2026-03-27
**Spec:** docs/changes/multi-language-templates/proposal.md
**Phase:** 2 of 5
**Estimated tasks:** 10
**Estimated time:** 35 minutes

## Goal

Author production `python-base/`, `go-base/`, `rust-base/`, and `java-base/` templates under `templates/` so that `harness init --language <name>` produces a valid bare scaffold for each language, and existing snapshot/content tests pass alongside new language-specific tests.

## Observable Truths (Acceptance Criteria)

1. When `harness init --language python` runs on an empty directory, the system shall produce `pyproject.toml`, `.python-version`, `ruff.toml`, `src/__init__.py`, `AGENTS.md`, `.gitignore`, and `harness.config.json`.
2. When `harness init --language go` runs on an empty directory, the system shall produce `go.mod`, `.golangci.yml`, `main.go`, `AGENTS.md`, `.gitignore`, and `harness.config.json`.
3. When `harness init --language rust` runs on an empty directory, the system shall produce `Cargo.toml`, `clippy.toml`, `src/main.rs`, `AGENTS.md`, `.gitignore`, and `harness.config.json`.
4. When `harness init --language java` runs on an empty directory, the system shall produce `pom.xml`, `checkstyle.xml`, `src/main/java/App.java`, `AGENTS.md`, `.gitignore`, and `harness.config.json`.
5. Each `template.json` shall pass `TemplateMetadataSchema.safeParse()` validation (verified by the existing `template-content.test.ts` which auto-discovers all template dirs).
6. Each language base's `harness.config.json.hbs` shall render to valid JSON containing `template.language` and `tooling` fields matching the language's tooling manifest.
7. Each AGENTS.md.hbs shall render with the correct `projectName` and language-specific conventions (directory structure, linter, test runner, entry point).
8. `cd packages/cli && npx vitest run tests/templates/` shall pass with all existing and new tests.
9. Existing JS/TS snapshot tests shall continue to pass unchanged (no regressions).

## File Map

```
CREATE templates/python-base/template.json
CREATE templates/python-base/pyproject.toml.hbs
CREATE templates/python-base/.python-version
CREATE templates/python-base/ruff.toml
CREATE templates/python-base/src/__init__.py
CREATE templates/python-base/AGENTS.md.hbs
CREATE templates/python-base/.gitignore
CREATE templates/python-base/harness.config.json.hbs

CREATE templates/go-base/template.json
CREATE templates/go-base/go.mod.hbs
CREATE templates/go-base/.golangci.yml
CREATE templates/go-base/main.go
CREATE templates/go-base/AGENTS.md.hbs
CREATE templates/go-base/.gitignore
CREATE templates/go-base/harness.config.json.hbs

CREATE templates/rust-base/template.json
CREATE templates/rust-base/Cargo.toml.hbs
CREATE templates/rust-base/clippy.toml
CREATE templates/rust-base/src/main.rs
CREATE templates/rust-base/AGENTS.md.hbs
CREATE templates/rust-base/.gitignore
CREATE templates/rust-base/harness.config.json.hbs

CREATE templates/java-base/template.json
CREATE templates/java-base/pom.xml.hbs
CREATE templates/java-base/checkstyle.xml
CREATE templates/java-base/src/main/java/App.java.hbs
CREATE templates/java-base/AGENTS.md.hbs
CREATE templates/java-base/.gitignore
CREATE templates/java-base/harness.config.json.hbs

MODIFY packages/cli/tests/templates/snapshot.test.ts (add language base snapshot tests)
MODIFY packages/cli/tests/templates/__snapshots__/snapshot.test.ts.snap (auto-updated by vitest -u)
```

Note: `packages/cli/tests/templates/template-content.test.ts` already auto-discovers all template dirs via `fs.readdirSync(TEMPLATES_DIR)` -- it will automatically validate the new `template.json` files without modification.

## Tasks

### Task 1: Create python-base template

**Depends on:** none
**Files:** `templates/python-base/template.json`, `templates/python-base/pyproject.toml.hbs`, `templates/python-base/.python-version`, `templates/python-base/ruff.toml`, `templates/python-base/src/__init__.py`, `templates/python-base/AGENTS.md.hbs`, `templates/python-base/.gitignore`, `templates/python-base/harness.config.json.hbs`

1. Create `templates/python-base/template.json`:

   ```json
   {
     "name": "python-base",
     "description": "Python language base scaffold with Ruff linting and pytest",
     "version": 1,
     "language": "python",
     "tooling": {
       "packageManager": "pip",
       "linter": "ruff",
       "formatter": "ruff",
       "testRunner": "pytest"
     },
     "mergeStrategy": { "json": "deep-merge", "files": "overlay-wins" }
   }
   ```

2. Create `templates/python-base/pyproject.toml.hbs`:

   ```toml
   [project]
   name = "{{projectName}}"
   version = "0.1.0"
   description = ""
   requires-python = ">={{pythonMinVersion}}"
   dependencies = []

   [project.optional-dependencies]
   dev = [
     "pytest>=7.0",
     "ruff>=0.4.0",
   ]

   [tool.ruff]
   line-length = 88

   [tool.pytest.ini_options]
   testpaths = ["tests"]
   ```

3. Create `templates/python-base/.python-version`:

   ```
   3.10
   ```

4. Create `templates/python-base/ruff.toml`:

   ```toml
   line-length = 88
   target-version = "py310"

   [lint]
   select = ["E", "F", "I", "N", "W", "UP"]
   ```

5. Create `templates/python-base/src/__init__.py`:

   ```python

   ```

   (empty file)

6. Create `templates/python-base/AGENTS.md.hbs`:

   ```markdown
   # {{projectName}} Knowledge Map

   ## About This Project

   {{projectName}} -- A Python project managed with Harness Engineering practices.

   ## Language & Tooling

   - **Language:** Python (>={{pythonMinVersion}})
   - **Linter/Formatter:** Ruff
   - **Test runner:** pytest
   - **Package manager:** pip

   ## Directory Structure

   - `src/` -- Application source code
   - `tests/` -- Test files (pytest)
   - `pyproject.toml` -- Project metadata and dependencies

   ## Conventions

   - Follow PEP 8 style (enforced by Ruff)
   - Use type hints for function signatures
   - Tests live in `tests/` and mirror `src/` structure
   - Import sorting managed by Ruff (isort rules)

   ## Harness Skills

   - Use `harness-brainstorming` for design exploration
   - Use `harness-planning` to break features into atomic tasks
   - Use `harness-execution` to implement tasks with TDD
   - Refer to `harness.config.json` for project tooling configuration
   ```

7. Create `templates/python-base/.gitignore`:

   ```
   __pycache__/
   *.py[cod]
   *$py.class
   .venv/
   venv/
   env/
   .env
   .env.local
   dist/
   build/
   *.egg-info/
   .pytest_cache/
   .ruff_cache/
   .mypy_cache/
   *.log
   ```

8. Create `templates/python-base/harness.config.json.hbs`:

   ```json
   {
     "version": 1,
     "name": "{{projectName}}",
     "agentsMapPath": "./AGENTS.md",
     "docsDir": "./docs",
     "template": {
       "language": "python",
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

9. Run: `cd packages/cli && npx vitest run tests/templates/template-content.test.ts`
10. Observe: `python-base/template.json is valid` passes
11. Commit: `feat(templates): add python-base language template`

---

### Task 2: Create go-base template

**Depends on:** none (parallel with Task 1)
**Files:** `templates/go-base/template.json`, `templates/go-base/go.mod.hbs`, `templates/go-base/.golangci.yml`, `templates/go-base/main.go`, `templates/go-base/AGENTS.md.hbs`, `templates/go-base/.gitignore`, `templates/go-base/harness.config.json.hbs`

1. Create `templates/go-base/template.json`:

   ```json
   {
     "name": "go-base",
     "description": "Go language base scaffold with golangci-lint",
     "version": 1,
     "language": "go",
     "tooling": {
       "packageManager": "go",
       "linter": "golangci-lint",
       "formatter": "gofmt",
       "buildTool": "go",
       "testRunner": "go test"
     },
     "mergeStrategy": { "json": "deep-merge", "files": "overlay-wins" }
   }
   ```

2. Create `templates/go-base/go.mod.hbs`:

   ```
   module {{goModulePath}}

   go 1.21
   ```

3. Create `templates/go-base/.golangci.yml`:

   ```yaml
   linters:
     enable:
       - errcheck
       - govet
       - staticcheck
       - unused
       - gosimple
       - ineffassign
     disable:
       - depguard

   run:
     timeout: 5m

   issues:
     max-issues-per-linter: 50
   ```

4. Create `templates/go-base/main.go`:

   ```go
   package main

   import "fmt"

   func main() {
   	fmt.Println("Hello, world!")
   }
   ```

5. Create `templates/go-base/AGENTS.md.hbs`:

   ```markdown
   # {{projectName}} Knowledge Map

   ## About This Project

   {{projectName}} -- A Go project managed with Harness Engineering practices.

   ## Language & Tooling

   - **Language:** Go
   - **Module:** {{goModulePath}}
   - **Linter:** golangci-lint
   - **Formatter:** gofmt
   - **Test runner:** go test

   ## Directory Structure

   - `main.go` -- Application entry point
   - `go.mod` -- Module definition and dependencies
   - `internal/` -- Private application packages (by convention)
   - `pkg/` -- Public library packages (by convention)

   ## Conventions

   - Follow Effective Go guidelines
   - Use `gofmt` for formatting (enforced by golangci-lint)
   - Tests live alongside source files as `_test.go` suffix
   - Error handling: always check returned errors, never discard
   - Package names are lowercase, single-word, no underscores

   ## Harness Skills

   - Use `harness-brainstorming` for design exploration
   - Use `harness-planning` to break features into atomic tasks
   - Use `harness-execution` to implement tasks with TDD
   - Refer to `harness.config.json` for project tooling configuration
   ```

6. Create `templates/go-base/.gitignore`:

   ```
   # Binaries
   *.exe
   *.exe~
   *.dll
   *.so
   *.dylib

   # Test binary
   *.test

   # Output
   *.out
   /bin/
   /dist/

   # Environment
   .env
   .env.local

   # IDE
   .idea/
   .vscode/

   # Go
   vendor/
   ```

7. Create `templates/go-base/harness.config.json.hbs`:

   ```json
   {
     "version": 1,
     "name": "{{projectName}}",
     "agentsMapPath": "./AGENTS.md",
     "docsDir": "./docs",
     "template": {
       "language": "go",
       "version": 1
     },
     "tooling": {
       "packageManager": "go",
       "linter": "golangci-lint",
       "formatter": "gofmt",
       "testRunner": "go test"
     }
   }
   ```

8. Run: `cd packages/cli && npx vitest run tests/templates/template-content.test.ts`
9. Observe: `go-base/template.json is valid` passes
10. Commit: `feat(templates): add go-base language template`

---

### Task 3: Create rust-base template

**Depends on:** none (parallel with Tasks 1-2)
**Files:** `templates/rust-base/template.json`, `templates/rust-base/Cargo.toml.hbs`, `templates/rust-base/clippy.toml`, `templates/rust-base/src/main.rs`, `templates/rust-base/AGENTS.md.hbs`, `templates/rust-base/.gitignore`, `templates/rust-base/harness.config.json.hbs`

1. Create `templates/rust-base/template.json`:

   ```json
   {
     "name": "rust-base",
     "description": "Rust language base scaffold with Clippy linting",
     "version": 1,
     "language": "rust",
     "tooling": {
       "packageManager": "cargo",
       "linter": "clippy",
       "formatter": "rustfmt",
       "buildTool": "cargo",
       "testRunner": "cargo test"
     },
     "mergeStrategy": { "json": "deep-merge", "files": "overlay-wins" }
   }
   ```

2. Create `templates/rust-base/Cargo.toml.hbs`:

   ```toml
   [package]
   name = "{{projectName}}"
   version = "0.1.0"
   edition = "{{rustEdition}}"

   [dependencies]
   ```

3. Create `templates/rust-base/clippy.toml`:

   ```toml
   cognitive-complexity-threshold = 25
   too-many-arguments-threshold = 7
   ```

4. Create `templates/rust-base/src/main.rs`:

   ```rust
   fn main() {
       println!("Hello, world!");
   }
   ```

5. Create `templates/rust-base/AGENTS.md.hbs`:

   ```markdown
   # {{projectName}} Knowledge Map

   ## About This Project

   {{projectName}} -- A Rust project managed with Harness Engineering practices.

   ## Language & Tooling

   - **Language:** Rust (edition {{rustEdition}})
   - **Package manager:** Cargo
   - **Linter:** Clippy
   - **Formatter:** rustfmt
   - **Test runner:** cargo test

   ## Directory Structure

   - `src/main.rs` -- Application entry point
   - `src/lib.rs` -- Library root (when applicable)
   - `Cargo.toml` -- Package manifest and dependencies
   - `tests/` -- Integration tests

   ## Conventions

   - Follow Rust API guidelines
   - Use `rustfmt` for formatting
   - Run `cargo clippy` before committing
   - Tests: unit tests in `#[cfg(test)]` modules, integration tests in `tests/`
   - Error handling: use `Result<T, E>` and the `?` operator, avoid `.unwrap()` in production code

   ## Harness Skills

   - Use `harness-brainstorming` for design exploration
   - Use `harness-planning` to break features into atomic tasks
   - Use `harness-execution` to implement tasks with TDD
   - Refer to `harness.config.json` for project tooling configuration
   ```

6. Create `templates/rust-base/.gitignore`:

   ```
   /target/
   Cargo.lock
   .env
   .env.local
   *.log

   # IDE
   .idea/
   .vscode/
   ```

7. Create `templates/rust-base/harness.config.json.hbs`:

   ```json
   {
     "version": 1,
     "name": "{{projectName}}",
     "agentsMapPath": "./AGENTS.md",
     "docsDir": "./docs",
     "template": {
       "language": "rust",
       "version": 1
     },
     "tooling": {
       "packageManager": "cargo",
       "linter": "clippy",
       "formatter": "rustfmt",
       "testRunner": "cargo test"
     }
   }
   ```

8. Run: `cd packages/cli && npx vitest run tests/templates/template-content.test.ts`
9. Observe: `rust-base/template.json is valid` passes
10. Commit: `feat(templates): add rust-base language template`

---

### Task 4: Create java-base template

**Depends on:** none (parallel with Tasks 1-3)
**Files:** `templates/java-base/template.json`, `templates/java-base/pom.xml.hbs`, `templates/java-base/checkstyle.xml`, `templates/java-base/src/main/java/App.java.hbs`, `templates/java-base/AGENTS.md.hbs`, `templates/java-base/.gitignore`, `templates/java-base/harness.config.json.hbs`

1. Create `templates/java-base/template.json`:

   ```json
   {
     "name": "java-base",
     "description": "Java language base scaffold with Checkstyle and Maven",
     "version": 1,
     "language": "java",
     "tooling": {
       "packageManager": "maven",
       "linter": "checkstyle",
       "buildTool": "maven",
       "testRunner": "junit"
     },
     "mergeStrategy": { "json": "deep-merge", "files": "overlay-wins" }
   }
   ```

2. Create `templates/java-base/pom.xml.hbs`:

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <project xmlns="http://maven.apache.org/POM/4.0.0"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
     <modelVersion>4.0.0</modelVersion>

     <groupId>{{javaGroupId}}</groupId>
     <artifactId>{{projectName}}</artifactId>
     <version>0.1.0</version>
     <packaging>jar</packaging>

     <properties>
       <maven.compiler.source>17</maven.compiler.source>
       <maven.compiler.target>17</maven.compiler.target>
       <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
     </properties>

     <dependencies>
       <dependency>
         <groupId>org.junit.jupiter</groupId>
         <artifactId>junit-jupiter</artifactId>
         <version>5.10.0</version>
         <scope>test</scope>
       </dependency>
     </dependencies>

     <build>
       <plugins>
         <plugin>
           <groupId>org.apache.maven.plugins</groupId>
           <artifactId>maven-checkstyle-plugin</artifactId>
           <version>3.3.0</version>
           <configuration>
             <configLocation>checkstyle.xml</configLocation>
           </configuration>
         </plugin>
       </plugins>
     </build>
   </project>
   ```

3. Create `templates/java-base/checkstyle.xml`:

   ```xml
   <?xml version="1.0"?>
   <!DOCTYPE module PUBLIC
     "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"
     "https://checkstyle.org/dtds/configuration_1_3.dtd">
   <module name="Checker">
     <property name="charset" value="UTF-8"/>
     <module name="TreeWalker">
       <module name="WhitespaceAround"/>
       <module name="NeedBraces"/>
       <module name="LeftCurly"/>
       <module name="RightCurly"/>
       <module name="EmptyBlock"/>
       <module name="AvoidStarImport"/>
       <module name="UnusedImports"/>
     </module>
     <module name="FileLength">
       <property name="max" value="500"/>
     </module>
     <module name="NewlineAtEndOfFile"/>
   </module>
   ```

4. Create `templates/java-base/src/main/java/App.java.hbs`:

   ```java
   package {{javaGroupId}};

   public class App {
       public static void main(String[] args) {
           System.out.println("Hello, world!");
       }
   }
   ```

5. Create `templates/java-base/AGENTS.md.hbs`:

   ```markdown
   # {{projectName}} Knowledge Map

   ## About This Project

   {{projectName}} -- A Java project managed with Harness Engineering practices.

   ## Language & Tooling

   - **Language:** Java 17
   - **Build tool:** Maven
   - **Linter:** Checkstyle
   - **Test runner:** JUnit 5
   - **Group ID:** {{javaGroupId}}

   ## Directory Structure

   - `src/main/java/` -- Application source code
   - `src/test/java/` -- Test files (JUnit 5)
   - `pom.xml` -- Maven project configuration
   - `checkstyle.xml` -- Code style rules

   ## Conventions

   - Follow Google Java Style Guide (Checkstyle enforced)
   - Use Java 17 language features
   - Tests live in `src/test/java/` mirroring `src/main/java/` structure
   - Use JUnit 5 assertions and lifecycle annotations
   - Prefer dependency injection over static methods

   ## Harness Skills

   - Use `harness-brainstorming` for design exploration
   - Use `harness-planning` to break features into atomic tasks
   - Use `harness-execution` to implement tasks with TDD
   - Refer to `harness.config.json` for project tooling configuration
   ```

6. Create `templates/java-base/.gitignore`:

   ```
   target/
   *.class
   *.jar
   *.war
   .env
   .env.local
   *.log

   # IDE
   .idea/
   .vscode/
   *.iml
   .classpath
   .project
   .settings/
   ```

7. Create `templates/java-base/harness.config.json.hbs`:

   ```json
   {
     "version": 1,
     "name": "{{projectName}}",
     "agentsMapPath": "./AGENTS.md",
     "docsDir": "./docs",
     "template": {
       "language": "java",
       "version": 1
     },
     "tooling": {
       "packageManager": "maven",
       "linter": "checkstyle",
       "buildTool": "maven",
       "testRunner": "junit"
     }
   }
   ```

8. Run: `cd packages/cli && npx vitest run tests/templates/template-content.test.ts`
9. Observe: `java-base/template.json is valid` passes
10. Commit: `feat(templates): add java-base language template`

---

### Task 5: Add language base snapshot tests

**Depends on:** Tasks 1-4
**Files:** `packages/cli/tests/templates/snapshot.test.ts`

1. Open `packages/cli/tests/templates/snapshot.test.ts` and add a new describe block after the existing level-based snapshot loop:

   ```typescript
   // After the existing for...of loop for levels, add:

   const languageBases = [
     { language: 'python', expectedFile: 'pyproject.toml' },
     { language: 'go', expectedFile: 'go.mod' },
     { language: 'rust', expectedFile: 'Cargo.toml' },
     { language: 'java', expectedFile: 'pom.xml' },
   ] as const;

   for (const { language, expectedFile } of languageBases) {
     it(`${language}-base template output matches snapshot`, () => {
       const resolved = engine.resolveTemplate(undefined, undefined, language);
       if (!resolved.ok) throw new Error(resolved.error.message);

       const rendered = engine.render(resolved.value, {
         projectName: 'snapshot-test',
         language,
       });
       if (!rendered.ok) throw new Error(rendered.error.message);

       const fileMap = Object.fromEntries(
         rendered.value.files.map((f) => [f.relativePath, f.content])
       );

       // Verify key file exists before snapshot
       expect(fileMap[expectedFile]).toBeDefined();
       expect(fileMap).toMatchSnapshot();
     });
   }
   ```

2. Run: `cd packages/cli && npx vitest run tests/templates/snapshot.test.ts -- --update`
3. Observe: 4 new snapshot tests pass and snapshot file is updated
4. Run: `cd packages/cli && npx vitest run tests/templates/snapshot.test.ts`
5. Observe: All tests pass (existing JS/TS snapshots + 4 new language snapshots)
6. Commit: `test(templates): add language base snapshot tests`

---

### Task 6: Add language base render integration tests

**Depends on:** Tasks 1-4
**Files:** `packages/cli/tests/templates/engine.test.ts`

1. Open `packages/cli/tests/templates/engine.test.ts`. At the bottom (before the closing `});`), add a new `describe` block for production template rendering:

   ```typescript
   describe('language base render (production templates)', () => {
     const PROD_TEMPLATES = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
     let prodEngine: TemplateEngine;

     beforeEach(() => {
       prodEngine = new TemplateEngine(PROD_TEMPLATES);
     });

     it('resolves and renders python-base', () => {
       const resolved = prodEngine.resolveTemplate(undefined, undefined, 'python');
       expect(resolved.ok).toBe(true);
       if (!resolved.ok) return;

       const rendered = prodEngine.render(resolved.value, {
         projectName: 'my-py-app',
         language: 'python',
       });
       expect(rendered.ok).toBe(true);
       if (!rendered.ok) return;

       const paths = rendered.value.files.map((f) => f.relativePath);
       expect(paths).toContain('pyproject.toml');
       expect(paths).toContain('.python-version');
       expect(paths).toContain('ruff.toml');
       expect(paths).toContain('src/__init__.py');
       expect(paths).toContain('AGENTS.md');
       expect(paths).toContain('.gitignore');
       expect(paths).toContain('harness.config.json');

       const pyproject = rendered.value.files.find((f) => f.relativePath === 'pyproject.toml');
       expect(pyproject!.content).toContain('name = "my-py-app"');
       expect(pyproject!.content).toContain('requires-python = ">=3.10"');

       const config = rendered.value.files.find((f) => f.relativePath === 'harness.config.json');
       const parsed = JSON.parse(config!.content);
       expect(parsed.template.language).toBe('python');
       expect(parsed.tooling.linter).toBe('ruff');
     });

     it('resolves and renders go-base', () => {
       const resolved = prodEngine.resolveTemplate(undefined, undefined, 'go');
       expect(resolved.ok).toBe(true);
       if (!resolved.ok) return;

       const rendered = prodEngine.render(resolved.value, {
         projectName: 'my-go-app',
         language: 'go',
       });
       expect(rendered.ok).toBe(true);
       if (!rendered.ok) return;

       const paths = rendered.value.files.map((f) => f.relativePath);
       expect(paths).toContain('go.mod');
       expect(paths).toContain('.golangci.yml');
       expect(paths).toContain('main.go');
       expect(paths).toContain('AGENTS.md');
       expect(paths).toContain('.gitignore');
       expect(paths).toContain('harness.config.json');

       const gomod = rendered.value.files.find((f) => f.relativePath === 'go.mod');
       expect(gomod!.content).toContain('module github.com/example/my-go-app');

       const agents = rendered.value.files.find((f) => f.relativePath === 'AGENTS.md');
       expect(agents!.content).toContain('Go project');
       expect(agents!.content).toContain('golangci-lint');
     });

     it('resolves and renders rust-base', () => {
       const resolved = prodEngine.resolveTemplate(undefined, undefined, 'rust');
       expect(resolved.ok).toBe(true);
       if (!resolved.ok) return;

       const rendered = prodEngine.render(resolved.value, {
         projectName: 'my-rust-app',
         language: 'rust',
       });
       expect(rendered.ok).toBe(true);
       if (!rendered.ok) return;

       const paths = rendered.value.files.map((f) => f.relativePath);
       expect(paths).toContain('Cargo.toml');
       expect(paths).toContain('clippy.toml');
       expect(paths).toContain('src/main.rs');
       expect(paths).toContain('AGENTS.md');
       expect(paths).toContain('.gitignore');
       expect(paths).toContain('harness.config.json');

       const cargo = rendered.value.files.find((f) => f.relativePath === 'Cargo.toml');
       expect(cargo!.content).toContain('name = "my-rust-app"');
       expect(cargo!.content).toContain('edition = "2021"');
     });

     it('resolves and renders java-base', () => {
       const resolved = prodEngine.resolveTemplate(undefined, undefined, 'java');
       expect(resolved.ok).toBe(true);
       if (!resolved.ok) return;

       const rendered = prodEngine.render(resolved.value, {
         projectName: 'my-java-app',
         language: 'java',
       });
       expect(rendered.ok).toBe(true);
       if (!rendered.ok) return;

       const paths = rendered.value.files.map((f) => f.relativePath);
       expect(paths).toContain('pom.xml');
       expect(paths).toContain('checkstyle.xml');
       expect(paths).toContain('src/main/java/App.java');
       expect(paths).toContain('AGENTS.md');
       expect(paths).toContain('.gitignore');
       expect(paths).toContain('harness.config.json');

       const pom = rendered.value.files.find((f) => f.relativePath === 'pom.xml');
       expect(pom!.content).toContain('<artifactId>my-java-app</artifactId>');
       expect(pom!.content).toContain('<groupId>com.example.my-java-app</groupId>');
     });

     it('renders harness.config.json with valid JSON for all languages', () => {
       for (const lang of ['python', 'go', 'rust', 'java'] as const) {
         const resolved = prodEngine.resolveTemplate(undefined, undefined, lang);
         if (!resolved.ok) throw new Error(resolved.error.message);

         const rendered = prodEngine.render(resolved.value, {
           projectName: `test-${lang}`,
           language: lang,
         });
         if (!rendered.ok) throw new Error(rendered.error.message);

         const config = rendered.value.files.find((f) => f.relativePath === 'harness.config.json');
         expect(config).toBeDefined();
         const parsed = JSON.parse(config!.content);
         expect(parsed.version).toBe(1);
         expect(parsed.template.language).toBe(lang);
         expect(parsed.tooling).toBeDefined();
       }
     });
   });
   ```

2. Run: `cd packages/cli && npx vitest run tests/templates/engine.test.ts`
3. Observe: All new and existing tests pass
4. Commit: `test(templates): add language base render integration tests`

---

### Task 7: Add write integration tests for language bases

**Depends on:** Tasks 1-4
**Files:** `packages/cli/tests/templates/engine.test.ts`

1. In the same `language base render (production templates)` describe block added in Task 6, add:

   ```typescript
   it('writes python-base to disk and produces expected files', () => {
     const resolved = prodEngine.resolveTemplate(undefined, undefined, 'python');
     if (!resolved.ok) throw new Error(resolved.error.message);

     const rendered = prodEngine.render(resolved.value, {
       projectName: 'disk-test',
       language: 'python',
     });
     if (!rendered.ok) throw new Error(rendered.error.message);

     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-py-'));
     const writeResult = prodEngine.write(rendered.value, tmpDir, {
       overwrite: false,
       language: 'python',
     });
     expect(writeResult.ok).toBe(true);
     if (!writeResult.ok) return;

     expect(fs.existsSync(path.join(tmpDir, 'pyproject.toml'))).toBe(true);
     expect(fs.existsSync(path.join(tmpDir, '.python-version'))).toBe(true);
     expect(fs.existsSync(path.join(tmpDir, 'ruff.toml'))).toBe(true);
     expect(fs.existsSync(path.join(tmpDir, 'src', '__init__.py'))).toBe(true);
     expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
     expect(fs.existsSync(path.join(tmpDir, '.gitignore'))).toBe(true);
     expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);

     fs.rmSync(tmpDir, { recursive: true });
   });

   it('skips pyproject.toml in existing Python project without --force', () => {
     const resolved = prodEngine.resolveTemplate(undefined, undefined, 'python');
     if (!resolved.ok) throw new Error(resolved.error.message);

     const rendered = prodEngine.render(resolved.value, {
       projectName: 'existing-py',
       language: 'python',
     });
     if (!rendered.ok) throw new Error(rendered.error.message);

     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-py-existing-'));
     fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\nname = "existing"\n');

     const writeResult = prodEngine.write(rendered.value, tmpDir, {
       overwrite: false,
       language: 'python',
     });
     expect(writeResult.ok).toBe(true);
     if (!writeResult.ok) return;

     expect(writeResult.value.skippedConfigs).toContain('pyproject.toml');
     const content = fs.readFileSync(path.join(tmpDir, 'pyproject.toml'), 'utf-8');
     expect(content).toContain('existing');
     // Other files should still be written
     expect(writeResult.value.written).toContain('AGENTS.md');

     fs.rmSync(tmpDir, { recursive: true });
   });
   ```

2. Run: `cd packages/cli && npx vitest run tests/templates/engine.test.ts`
3. Observe: All tests pass
4. Commit: `test(templates): add write integration tests for language bases`

---

### Task 8: Verify template-content.test.ts auto-validates all new templates

**Depends on:** Tasks 1-4
**Files:** none (verification only)

This is a verification-only task. The existing `template-content.test.ts` auto-discovers all directories under `templates/` and validates each `template.json` via `TemplateMetadataSchema.safeParse()`.

1. Run: `cd packages/cli && npx vitest run tests/templates/template-content.test.ts`
2. Observe output includes:
   - `python-base/template.json is valid` -- pass
   - `go-base/template.json is valid` -- pass
   - `rust-base/template.json is valid` -- pass
   - `java-base/template.json is valid` -- pass
   - All existing template validations still pass
3. No commit needed (verification only)

---

### Task 9: Run full template test suite

**Depends on:** Tasks 5, 6, 7, 8
**Files:** none (verification only)

[checkpoint:human-verify] -- Full test suite run; verify no regressions before final commit.

1. Run: `cd packages/cli && npx vitest run tests/templates/`
2. Observe: ALL tests pass, including:
   - `engine.test.ts` -- existing mock-fixture tests + new production render tests + write tests
   - `snapshot.test.ts` -- existing JS/TS snapshots + 4 new language base snapshots
   - `template-content.test.ts` -- all template.json files valid (including 4 new)
   - `schema.test.ts` -- schema tests pass
   - `merger.test.ts` -- merger tests pass
3. No commit needed (verification only)

---

### Task 10: Update architecture baseline if needed

**Depends on:** Task 9
**Files:** depends on project setup (may require running `npx harness arch-baseline` or equivalent)

From Phase 1 learnings: "Arch baselines must be updated alongside code changes to avoid pre-commit hook failures."

1. Check if the project has an architecture baseline command: look for `arch-baseline` or similar in `package.json` scripts or harness CLI.
2. If a baseline update is needed, run the appropriate command.
3. Run: `cd packages/cli && npx vitest run tests/templates/`
4. Verify all tests still pass.
5. Commit (if baseline files changed): `chore: update architecture baseline for language base templates`

## Parallel Execution Opportunities

- **Tasks 1-4** are fully independent and can be executed in parallel (each creates a separate template directory with no shared files).
- **Tasks 5, 6, 7** depend on Tasks 1-4 but are independent of each other (they modify different test files or different sections of the same test file).
  - Note: Tasks 6 and 7 both add to `engine.test.ts`. If running in parallel, Task 7's additions go inside the describe block created by Task 6. If sequential, Task 7 is appended inside that block.
- **Task 8** is a verification step independent of Tasks 5-7.
- **Tasks 9-10** are sequential gates.

## Traceability

| Observable Truth                          | Delivered by                         |
| ----------------------------------------- | ------------------------------------ |
| 1. Python scaffold files                  | Task 1, Task 7 (write test)          |
| 2. Go scaffold files                      | Task 2, Task 6 (render test)         |
| 3. Rust scaffold files                    | Task 3, Task 6 (render test)         |
| 4. Java scaffold files                    | Task 4, Task 6 (render test)         |
| 5. template.json schema validation        | Tasks 1-4, Task 8                    |
| 6. harness.config.json renders valid JSON | Tasks 1-4, Task 6 (config test)      |
| 7. AGENTS.md language-aware content       | Tasks 1-4, Task 6 (agents assertion) |
| 8. All template tests pass                | Task 9                               |
| 9. No JS/TS regressions                   | Task 5 (existing snapshots), Task 9  |
