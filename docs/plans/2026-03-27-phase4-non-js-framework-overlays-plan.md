# Plan: Phase 4 -- Non-JS Framework Overlays

**Date:** 2026-03-27
**Spec:** docs/changes/multi-language-templates/proposal.md
**Estimated tasks:** 9
**Estimated time:** 35 minutes

## Goal

Create five non-JS framework overlay templates (fastapi, django, gin, axum, spring-boot) that extend their respective language bases, include detect patterns for auto-detection, and pass all engine, snapshot, and content tests.

## Observable Truths (Acceptance Criteria)

1. When `resolveTemplate(undefined, 'fastapi', 'python')` is called, the system shall return files from both python-base and the fastapi overlay, with the overlay's `src/main.py` replacing the base's `src/__init__.py` entry point.
2. When `resolveTemplate(undefined, 'django', 'python')` is called, the system shall return python-base files merged with django overlay files including `manage.py`, `src/settings.py`, `src/urls.py`, and `src/wsgi.py`.
3. When `resolveTemplate(undefined, 'gin', 'go')` is called, the system shall return go-base files with the gin overlay's `main.go` replacing the base `main.go`.
4. When `resolveTemplate(undefined, 'axum', 'rust')` is called, the system shall return rust-base files with axum overlay's `src/main.rs` replacing the base `src/main.rs`.
5. When `resolveTemplate(undefined, 'spring-boot', 'java')` is called, the system shall return java-base files with spring-boot overlay's `src/main/java/Application.java` replacing the base `src/main/java/App.java`.
6. When a directory contains `requirements.txt` with "fastapi", `detectFramework()` shall return a candidate with `framework: 'fastapi'`.
7. When a directory contains `go.mod` with "gin-gonic", `detectFramework()` shall return a candidate with `framework: 'gin'`.
8. When a directory contains `Cargo.toml` with "axum", `detectFramework()` shall return a candidate with `framework: 'axum'`.
9. When a directory contains `pom.xml` with "spring-boot", `detectFramework()` shall return a candidate with `framework: 'spring-boot'`.
10. When a directory contains `requirements.txt` with "django" or `manage.py` with "django", `detectFramework()` shall return a candidate with `framework: 'django'`.
11. The system shall validate all template.json files via `TemplateMetadataSchema` -- `template-content.test.ts` passes.
12. The system shall produce stable snapshot output for all 5 overlays -- `snapshot.test.ts` passes.
13. If the target directory already has a `requirements.txt` (or `go.mod`, `Cargo.toml`, `pom.xml`), write with `overwrite: false` shall skip that config file and report it in `skippedConfigs`.
14. All existing 100 tests shall continue to pass (no regressions).

## File Map

```
CREATE templates/fastapi/template.json
CREATE templates/fastapi/requirements.txt.hbs
CREATE templates/fastapi/src/main.py

CREATE templates/django/template.json
CREATE templates/django/requirements.txt.hbs
CREATE templates/django/manage.py.hbs
CREATE templates/django/src/settings.py.hbs
CREATE templates/django/src/urls.py
CREATE templates/django/src/wsgi.py

CREATE templates/gin/template.json
CREATE templates/gin/go.mod.hbs
CREATE templates/gin/main.go

CREATE templates/axum/template.json
CREATE templates/axum/Cargo.toml.hbs
CREATE templates/axum/src/main.rs

CREATE templates/spring-boot/template.json
CREATE templates/spring-boot/pom.xml.hbs
CREATE templates/spring-boot/src/main/java/Application.java.hbs

MODIFY packages/cli/tests/templates/engine.test.ts (add non-JS overlay resolution + detection + write tests)
MODIFY packages/cli/tests/templates/snapshot.test.ts (add 5 non-JS overlay snapshot entries)
```

## Tasks

### Task 1: Create fastapi production template

**Depends on:** none
**Files:** `templates/fastapi/template.json`, `templates/fastapi/requirements.txt.hbs`, `templates/fastapi/src/main.py`

1. Create directory `templates/fastapi/src/`.

2. Create `templates/fastapi/template.json`:

   ```json
   {
     "name": "fastapi",
     "description": "FastAPI web framework scaffold",
     "version": 1,
     "language": "python",
     "framework": "fastapi",
     "extends": "python-base",
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

3. Create `templates/fastapi/requirements.txt.hbs`:

   ```
   fastapi>=0.100.0
   uvicorn[standard]>=0.23.0
   ```

4. Create `templates/fastapi/src/main.py`:

   ```python
   from fastapi import FastAPI

   app = FastAPI()


   @app.get("/")
   async def root():
       return {"message": "Hello, world!"}
   ```

5. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/templates/template-content.test.ts`
6. Observe: all template-content tests pass (fastapi/template.json is auto-discovered and validated).
7. Commit: `feat(templates): add fastapi framework overlay template`

### Task 2: Create django production template

**Depends on:** none
**Files:** `templates/django/template.json`, `templates/django/requirements.txt.hbs`, `templates/django/manage.py.hbs`, `templates/django/src/settings.py.hbs`, `templates/django/src/urls.py`, `templates/django/src/wsgi.py`

1. Create directories `templates/django/src/`.

2. Create `templates/django/template.json`:

   ```json
   {
     "name": "django",
     "description": "Django web framework scaffold",
     "version": 1,
     "language": "python",
     "framework": "django",
     "extends": "python-base",
     "tooling": {
       "packageManager": "pip",
       "linter": "ruff",
       "formatter": "ruff",
       "buildTool": "setuptools",
       "testRunner": "pytest",
       "lockFile": "requirements.txt"
     },
     "detect": [
       { "file": "requirements.txt", "contains": "django" },
       { "file": "pyproject.toml", "contains": "django" },
       { "file": "manage.py", "contains": "django" }
     ]
   }
   ```

3. Create `templates/django/requirements.txt.hbs`:

   ```
   django>=4.2
   ```

4. Create `templates/django/manage.py.hbs`:

   ```python
   #!/usr/bin/env python
   """Django's command-line utility for administrative tasks."""
   import os
   import sys


   def main():
       os.environ.setdefault("DJANGO_SETTINGS_MODULE", "{{projectName}}.settings")
       try:
           from django.core.management import execute_from_command_line
       except ImportError as exc:
           raise ImportError(
               "Couldn't import Django. Are you sure it's installed?"
           ) from exc
       execute_from_command_line(sys.argv)


   if __name__ == "__main__":
       main()
   ```

5. Create `templates/django/src/settings.py.hbs`:

   ```python
   """Django settings for {{projectName}} project."""

   from pathlib import Path

   BASE_DIR = Path(__file__).resolve().parent.parent

   SECRET_KEY = "change-me-in-production"

   DEBUG = True

   ALLOWED_HOSTS = []

   INSTALLED_APPS = [
       "django.contrib.admin",
       "django.contrib.auth",
       "django.contrib.contenttypes",
       "django.contrib.sessions",
       "django.contrib.messages",
       "django.contrib.staticfiles",
   ]

   MIDDLEWARE = [
       "django.middleware.security.SecurityMiddleware",
       "django.contrib.sessions.middleware.SessionMiddleware",
       "django.middleware.common.CommonMiddleware",
       "django.middleware.csrf.CsrfViewMiddleware",
       "django.contrib.auth.middleware.AuthenticationMiddleware",
       "django.contrib.messages.middleware.MessageMiddleware",
       "django.middleware.clickjacking.XFrameOptionsMiddleware",
   ]

   ROOT_URLCONF = "{{projectName}}.urls"

   WSGI_APPLICATION = "{{projectName}}.wsgi.application"

   DATABASES = {
       "default": {
           "ENGINE": "django.db.backends.sqlite3",
           "NAME": BASE_DIR / "db.sqlite3",
       }
   }

   DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
   ```

6. Create `templates/django/src/urls.py`:

   ```python
   from django.contrib import admin
   from django.urls import path

   urlpatterns = [
       path("admin/", admin.site.urls),
   ]
   ```

7. Create `templates/django/src/wsgi.py`:

   ```python
   """WSGI config."""

   import os

   from django.core.wsgi import get_wsgi_application

   os.environ.setdefault("DJANGO_SETTINGS_MODULE", "src.settings")

   application = get_wsgi_application()
   ```

8. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/templates/template-content.test.ts`
9. Observe: all template-content tests pass.
10. Commit: `feat(templates): add django framework overlay template`

### Task 3: Create gin production template

**Depends on:** none
**Files:** `templates/gin/template.json`, `templates/gin/go.mod.hbs`, `templates/gin/main.go`

1. Create directory `templates/gin/`.

2. Create `templates/gin/template.json`:

   ```json
   {
     "name": "gin",
     "description": "Gin web framework scaffold",
     "version": 1,
     "language": "go",
     "framework": "gin",
     "extends": "go-base",
     "tooling": {
       "packageManager": "go",
       "linter": "golangci-lint",
       "formatter": "gofmt",
       "buildTool": "go",
       "testRunner": "go test"
     },
     "detect": [
       { "file": "go.mod", "contains": "gin-gonic" },
       { "file": "go.sum", "contains": "gin-gonic" }
     ]
   }
   ```

3. Create `templates/gin/go.mod.hbs`:

   ```
   module {{goModulePath}}

   go 1.21

   require github.com/gin-gonic/gin v1.9.1
   ```

4. Create `templates/gin/main.go`:

   ```go
   package main

   import (
   	"net/http"

   	"github.com/gin-gonic/gin"
   )

   func main() {
   	r := gin.Default()
   	r.GET("/", func(c *gin.Context) {
   		c.JSON(http.StatusOK, gin.H{"message": "Hello, world!"})
   	})
   	r.Run(":8080")
   }
   ```

5. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/templates/template-content.test.ts`
6. Observe: all template-content tests pass.
7. Commit: `feat(templates): add gin framework overlay template`

### Task 4: Create axum production template

**Depends on:** none
**Files:** `templates/axum/template.json`, `templates/axum/Cargo.toml.hbs`, `templates/axum/src/main.rs`

1. Create directories `templates/axum/src/`.

2. Create `templates/axum/template.json`:

   ```json
   {
     "name": "axum",
     "description": "Axum web framework scaffold",
     "version": 1,
     "language": "rust",
     "framework": "axum",
     "extends": "rust-base",
     "tooling": {
       "packageManager": "cargo",
       "linter": "clippy",
       "formatter": "rustfmt",
       "buildTool": "cargo",
       "testRunner": "cargo test"
     },
     "detect": [{ "file": "Cargo.toml", "contains": "axum" }]
   }
   ```

3. Create `templates/axum/Cargo.toml.hbs`:

   ```toml
   [package]
   name = "{{projectName}}"
   version = "0.1.0"
   edition = "{{rustEdition}}"

   [dependencies]
   axum = "0.7"
   tokio = { version = "1", features = ["full"] }
   ```

4. Create `templates/axum/src/main.rs`:

   ```rust
   use axum::{routing::get, Router};

   async fn root() -> &'static str {
       "Hello, world!"
   }

   #[tokio::main]
   async fn main() {
       let app = Router::new().route("/", get(root));
       let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
       axum::serve(listener, app).await.unwrap();
   }
   ```

5. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/templates/template-content.test.ts`
6. Observe: all template-content tests pass.
7. Commit: `feat(templates): add axum framework overlay template`

### Task 5: Create spring-boot production template

**Depends on:** none
**Files:** `templates/spring-boot/template.json`, `templates/spring-boot/pom.xml.hbs`, `templates/spring-boot/src/main/java/Application.java.hbs`

1. Create directories `templates/spring-boot/src/main/java/`.

2. Create `templates/spring-boot/template.json`:

   ```json
   {
     "name": "spring-boot",
     "description": "Spring Boot web framework scaffold",
     "version": 1,
     "language": "java",
     "framework": "spring-boot",
     "extends": "java-base",
     "tooling": {
       "packageManager": "maven",
       "linter": "checkstyle",
       "buildTool": "maven",
       "testRunner": "junit"
     },
     "detect": [{ "file": "pom.xml", "contains": "spring-boot" }]
   }
   ```

3. Create `templates/spring-boot/pom.xml.hbs`:

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <project xmlns="http://maven.apache.org/POM/4.0.0"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
     <modelVersion>4.0.0</modelVersion>

     <parent>
       <groupId>org.springframework.boot</groupId>
       <artifactId>spring-boot-starter-parent</artifactId>
       <version>3.2.0</version>
     </parent>

     <groupId>{{javaGroupId}}</groupId>
     <artifactId>{{projectName}}</artifactId>
     <version>0.1.0</version>
     <packaging>jar</packaging>

     <properties>
       <java.version>17</java.version>
     </properties>

     <dependencies>
       <dependency>
         <groupId>org.springframework.boot</groupId>
         <artifactId>spring-boot-starter-web</artifactId>
       </dependency>
       <dependency>
         <groupId>org.springframework.boot</groupId>
         <artifactId>spring-boot-starter-test</artifactId>
         <scope>test</scope>
       </dependency>
     </dependencies>

     <build>
       <plugins>
         <plugin>
           <groupId>org.springframework.boot</groupId>
           <artifactId>spring-boot-maven-plugin</artifactId>
         </plugin>
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

4. Create `templates/spring-boot/src/main/java/Application.java.hbs`:

   ```java
   package {{javaGroupId}};

   import org.springframework.boot.SpringApplication;
   import org.springframework.boot.autoconfigure.SpringBootApplication;
   import org.springframework.web.bind.annotation.GetMapping;
   import org.springframework.web.bind.annotation.RestController;

   @SpringBootApplication
   @RestController
   public class Application {
       public static void main(String[] args) {
           SpringApplication.run(Application.class, args);
       }

       @GetMapping("/")
       public String root() {
           return "Hello, world!";
       }
   }
   ```

5. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/templates/template-content.test.ts`
6. Observe: all template-content tests pass.
7. Commit: `feat(templates): add spring-boot framework overlay template`

### Task 6: Add non-JS framework overlay resolution and render tests

**Depends on:** Tasks 1-5
**Files:** `packages/cli/tests/templates/engine.test.ts`

1. Add a new `describe` block `'Non-JS framework overlay resolution (production templates)'` to `packages/cli/tests/templates/engine.test.ts`, inside the top-level `describe('TemplateEngine')` block, after the existing `'JS/TS framework auto-detection'` block.

2. Add the following test code:

   ```typescript
   describe('Non-JS framework overlay resolution (production templates)', () => {
     const PROD_TEMPLATES = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
     let prodEngine: TemplateEngine;

     beforeEach(() => {
       prodEngine = new TemplateEngine(PROD_TEMPLATES);
     });

     it('resolves and renders fastapi overlay with python-base', () => {
       const resolved = prodEngine.resolveTemplate(undefined, 'fastapi', 'python');
       expect(resolved.ok).toBe(true);
       if (!resolved.ok) return;

       const rendered = prodEngine.render(resolved.value, {
         projectName: 'my-api',
         language: 'python',
         framework: 'fastapi',
       });
       expect(rendered.ok).toBe(true);
       if (!rendered.ok) return;

       const paths = rendered.value.files.map((f) => f.relativePath);
       // FastAPI overlay files
       expect(paths).toContain('src/main.py');
       expect(paths).toContain('requirements.txt');
       // Python-base inherited files
       expect(paths).toContain('pyproject.toml');
       expect(paths).toContain('ruff.toml');
       expect(paths).toContain('.python-version');
       expect(paths).toContain('AGENTS.md');
       expect(paths).toContain('harness.config.json');
       expect(paths).toContain('.gitignore');

       const mainPy = rendered.value.files.find((f) => f.relativePath === 'src/main.py');
       expect(mainPy!.content).toContain('FastAPI');
       expect(mainPy!.content).toContain('@app.get');

       const reqs = rendered.value.files.find((f) => f.relativePath === 'requirements.txt');
       expect(reqs!.content).toContain('fastapi');
       expect(reqs!.content).toContain('uvicorn');
     });

     it('resolves and renders django overlay with python-base', () => {
       const resolved = prodEngine.resolveTemplate(undefined, 'django', 'python');
       expect(resolved.ok).toBe(true);
       if (!resolved.ok) return;

       const rendered = prodEngine.render(resolved.value, {
         projectName: 'my-site',
         language: 'python',
         framework: 'django',
       });
       expect(rendered.ok).toBe(true);
       if (!rendered.ok) return;

       const paths = rendered.value.files.map((f) => f.relativePath);
       expect(paths).toContain('manage.py');
       expect(paths).toContain('src/settings.py');
       expect(paths).toContain('src/urls.py');
       expect(paths).toContain('src/wsgi.py');
       expect(paths).toContain('requirements.txt');
       // Python-base inherited
       expect(paths).toContain('pyproject.toml');
       expect(paths).toContain('AGENTS.md');

       const managePy = rendered.value.files.find((f) => f.relativePath === 'manage.py');
       expect(managePy!.content).toContain('my-site');
       expect(managePy!.content).toContain('DJANGO_SETTINGS_MODULE');

       const settings = rendered.value.files.find((f) => f.relativePath === 'src/settings.py');
       expect(settings!.content).toContain('my-site');
     });

     it('resolves and renders gin overlay with go-base', () => {
       const resolved = prodEngine.resolveTemplate(undefined, 'gin', 'go');
       expect(resolved.ok).toBe(true);
       if (!resolved.ok) return;

       const rendered = prodEngine.render(resolved.value, {
         projectName: 'my-server',
         language: 'go',
         framework: 'gin',
       });
       expect(rendered.ok).toBe(true);
       if (!rendered.ok) return;

       const paths = rendered.value.files.map((f) => f.relativePath);
       expect(paths).toContain('main.go');
       expect(paths).toContain('go.mod');
       expect(paths).toContain('.golangci.yml');
       expect(paths).toContain('AGENTS.md');
       expect(paths).toContain('harness.config.json');

       const mainGo = rendered.value.files.find((f) => f.relativePath === 'main.go');
       expect(mainGo!.content).toContain('gin-gonic/gin');
       expect(mainGo!.content).toContain('gin.Default');

       const goMod = rendered.value.files.find((f) => f.relativePath === 'go.mod');
       expect(goMod!.content).toContain('gin-gonic/gin');
       expect(goMod!.content).toContain('github.com/example/my-server');
     });

     it('resolves and renders axum overlay with rust-base', () => {
       const resolved = prodEngine.resolveTemplate(undefined, 'axum', 'rust');
       expect(resolved.ok).toBe(true);
       if (!resolved.ok) return;

       const rendered = prodEngine.render(resolved.value, {
         projectName: 'my-service',
         language: 'rust',
         framework: 'axum',
       });
       expect(rendered.ok).toBe(true);
       if (!rendered.ok) return;

       const paths = rendered.value.files.map((f) => f.relativePath);
       expect(paths).toContain('src/main.rs');
       expect(paths).toContain('Cargo.toml');
       expect(paths).toContain('clippy.toml');
       expect(paths).toContain('AGENTS.md');
       expect(paths).toContain('harness.config.json');

       const mainRs = rendered.value.files.find((f) => f.relativePath === 'src/main.rs');
       expect(mainRs!.content).toContain('axum');
       expect(mainRs!.content).toContain('Router');
       expect(mainRs!.content).toContain('tokio');

       const cargo = rendered.value.files.find((f) => f.relativePath === 'Cargo.toml');
       expect(cargo!.content).toContain('axum');
       expect(cargo!.content).toContain('tokio');
       expect(cargo!.content).toContain('name = "my-service"');
     });

     it('resolves and renders spring-boot overlay with java-base', () => {
       const resolved = prodEngine.resolveTemplate(undefined, 'spring-boot', 'java');
       expect(resolved.ok).toBe(true);
       if (!resolved.ok) return;

       const rendered = prodEngine.render(resolved.value, {
         projectName: 'my-app',
         language: 'java',
         framework: 'spring-boot',
       });
       expect(rendered.ok).toBe(true);
       if (!rendered.ok) return;

       const paths = rendered.value.files.map((f) => f.relativePath);
       expect(paths).toContain('src/main/java/Application.java');
       expect(paths).toContain('pom.xml');
       expect(paths).toContain('checkstyle.xml');
       expect(paths).toContain('AGENTS.md');
       expect(paths).toContain('harness.config.json');

       const app = rendered.value.files.find(
         (f) => f.relativePath === 'src/main/java/Application.java'
       );
       expect(app!.content).toContain('@SpringBootApplication');
       expect(app!.content).toContain('SpringApplication.run');

       const pom = rendered.value.files.find((f) => f.relativePath === 'pom.xml');
       expect(pom!.content).toContain('spring-boot-starter-web');
       expect(pom!.content).toContain('spring-boot-starter-parent');
       expect(pom!.content).toContain('<artifactId>my-app</artifactId>');
     });

     it('overlay metadata is set for non-JS frameworks', () => {
       for (const [fw, lang] of [
         ['fastapi', 'python'],
         ['django', 'python'],
         ['gin', 'go'],
         ['axum', 'rust'],
         ['spring-boot', 'java'],
       ] as const) {
         const resolved = prodEngine.resolveTemplate(undefined, fw, lang);
         expect(resolved.ok).toBe(true);
         if (!resolved.ok) return;
         expect(resolved.value.overlayMetadata).toBeDefined();
         expect(resolved.value.overlayMetadata!.framework).toBe(fw);
         expect(resolved.value.overlayMetadata!.language).toBe(lang);
       }
     });

     it('all five non-JS overlay template.json files have valid detect patterns', () => {
       const templates = prodEngine.listTemplates();
       expect(templates.ok).toBe(true);
       if (!templates.ok) return;
       for (const fw of ['fastapi', 'django', 'gin', 'axum', 'spring-boot']) {
         const meta = templates.value.find((t) => t.framework === fw);
         expect(meta).toBeDefined();
         expect(meta!.detect).toBeDefined();
         expect(meta!.detect!.length).toBeGreaterThan(0);
         expect(meta!.extends).toBeDefined();
       }
     });
   });
   ```

3. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/templates/engine.test.ts`
4. Observe: all tests pass, including the 7 new tests.
5. Commit: `test(templates): add non-JS framework overlay resolution and render tests`

### Task 7: Add non-JS framework auto-detection tests

**Depends on:** Tasks 1-5
**Files:** `packages/cli/tests/templates/engine.test.ts`

1. Add a new `describe` block `'Non-JS framework auto-detection (production templates)'` to `packages/cli/tests/templates/engine.test.ts`, after the block added in Task 6.

2. Add the following test code:

   ```typescript
   describe('Non-JS framework auto-detection (production templates)', () => {
     const PROD_TEMPLATES = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
     let prodEngine: TemplateEngine;

     beforeEach(() => {
       prodEngine = new TemplateEngine(PROD_TEMPLATES);
     });

     it('detects fastapi from requirements.txt', () => {
       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
       fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'fastapi==0.100.0\nuvicorn\n');

       const result = prodEngine.detectFramework(tmpDir);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       const names = result.value.map((c) => c.framework);
       expect(names).toContain('fastapi');

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('detects django from requirements.txt', () => {
       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
       fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'django>=4.2\n');

       const result = prodEngine.detectFramework(tmpDir);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       const names = result.value.map((c) => c.framework);
       expect(names).toContain('django');

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('detects django from manage.py', () => {
       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
       fs.writeFileSync(path.join(tmpDir, 'manage.py'), '#!/usr/bin/env python\nimport django\n');

       const result = prodEngine.detectFramework(tmpDir);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       const names = result.value.map((c) => c.framework);
       expect(names).toContain('django');

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('detects gin from go.mod', () => {
       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
       fs.writeFileSync(
         path.join(tmpDir, 'go.mod'),
         'module example.com/app\n\ngo 1.21\n\nrequire github.com/gin-gonic/gin v1.9.1\n'
       );

       const result = prodEngine.detectFramework(tmpDir);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       const names = result.value.map((c) => c.framework);
       expect(names).toContain('gin');

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('detects axum from Cargo.toml', () => {
       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
       fs.writeFileSync(
         path.join(tmpDir, 'Cargo.toml'),
         '[package]\nname = "test"\n\n[dependencies]\naxum = "0.7"\ntokio = "1"\n'
       );

       const result = prodEngine.detectFramework(tmpDir);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       const names = result.value.map((c) => c.framework);
       expect(names).toContain('axum');

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('detects spring-boot from pom.xml', () => {
       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
       fs.writeFileSync(
         path.join(tmpDir, 'pom.xml'),
         '<project><parent><artifactId>spring-boot-starter-parent</artifactId></parent></project>'
       );

       const result = prodEngine.detectFramework(tmpDir);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       const names = result.value.map((c) => c.framework);
       expect(names).toContain('spring-boot');

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('scores django higher with multiple matching files', () => {
       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
       fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'django>=4.2\n');
       fs.writeFileSync(path.join(tmpDir, 'manage.py'), '#!/usr/bin/env python\nimport django\n');

       const result = prodEngine.detectFramework(tmpDir);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       const django = result.value.find((c) => c.framework === 'django');
       expect(django).toBeDefined();
       expect(django!.score).toBe(2);

       fs.rmSync(tmpDir, { recursive: true });
     });
   });
   ```

3. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/templates/engine.test.ts`
4. Observe: all tests pass, including the 7 new detection tests.
5. Commit: `test(templates): add non-JS framework auto-detection tests`

### Task 8: Add non-JS framework overlay snapshot tests

**Depends on:** Tasks 1-5
**Files:** `packages/cli/tests/templates/snapshot.test.ts`

1. In `packages/cli/tests/templates/snapshot.test.ts`, add a new `const` array and loop after the existing `frameworkOverlays` loop (before the closing `});` of the top-level describe).

2. Add the following code:

   ```typescript
   const nonJsOverlays = [
     { framework: 'fastapi', language: 'python' as const, expectedFile: 'src/main.py' },
     { framework: 'django', language: 'python' as const, expectedFile: 'manage.py' },
     { framework: 'gin', language: 'go' as const, expectedFile: 'main.go' },
     { framework: 'axum', language: 'rust' as const, expectedFile: 'src/main.rs' },
     {
       framework: 'spring-boot',
       language: 'java' as const,
       expectedFile: 'src/main/java/Application.java',
     },
   ] as const;

   for (const { framework, language, expectedFile } of nonJsOverlays) {
     it(`${framework} overlay with ${language}-base matches snapshot`, () => {
       const resolved = engine.resolveTemplate(undefined, framework, language);
       if (!resolved.ok) throw new Error(resolved.error.message);

       const rendered = engine.render(resolved.value, {
         projectName: 'snapshot-test',
         language,
         framework,
       });
       if (!rendered.ok) throw new Error(rendered.error.message);

       const fileMap = Object.fromEntries(
         rendered.value.files.map((f) => [f.relativePath, f.content])
       );

       expect(fileMap[expectedFile]).toBeDefined();
       expect(fileMap).toMatchSnapshot();
     });
   }
   ```

3. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/templates/snapshot.test.ts --update`
   (First run with `--update` to generate initial snapshots.)
4. Run again without `--update`: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/templates/snapshot.test.ts`
5. Observe: all 16 snapshot tests pass (11 existing + 5 new).
6. Commit: `test(templates): add non-JS framework overlay snapshot tests`

### Task 9: Add non-JS framework write-to-disk and existing-project tests

[checkpoint:human-verify] -- Verify all prior tasks pass before adding write tests.

**Depends on:** Tasks 1-7
**Files:** `packages/cli/tests/templates/engine.test.ts`

1. Add a new `describe` block `'Non-JS framework write to disk (production templates)'` to `packages/cli/tests/templates/engine.test.ts`, after the detection tests block.

2. Add the following test code:

   ```typescript
   describe('Non-JS framework write to disk (production templates)', () => {
     const PROD_TEMPLATES = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
     let prodEngine: TemplateEngine;

     beforeEach(() => {
       prodEngine = new TemplateEngine(PROD_TEMPLATES);
     });

     it('writes fastapi overlay to new directory', () => {
       const resolved = prodEngine.resolveTemplate(undefined, 'fastapi', 'python');
       if (!resolved.ok) throw new Error(resolved.error.message);

       const rendered = prodEngine.render(resolved.value, {
         projectName: 'test-fastapi',
         language: 'python',
         framework: 'fastapi',
       });
       if (!rendered.ok) throw new Error(rendered.error.message);

       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-fastapi-'));
       const writeResult = prodEngine.write(rendered.value, tmpDir, {
         overwrite: false,
         language: 'python',
       });
       expect(writeResult.ok).toBe(true);
       if (!writeResult.ok) return;

       expect(fs.existsSync(path.join(tmpDir, 'src', 'main.py'))).toBe(true);
       expect(fs.existsSync(path.join(tmpDir, 'requirements.txt'))).toBe(true);
       expect(fs.existsSync(path.join(tmpDir, 'pyproject.toml'))).toBe(true);
       expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('skips requirements.txt in existing fastapi project', () => {
       const resolved = prodEngine.resolveTemplate(undefined, 'fastapi', 'python');
       if (!resolved.ok) throw new Error(resolved.error.message);

       const rendered = prodEngine.render(resolved.value, {
         projectName: 'existing-fastapi',
         language: 'python',
         framework: 'fastapi',
       });
       if (!rendered.ok) throw new Error(rendered.error.message);

       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-fastapi-existing-'));
       // Pre-existing requirements.txt
       fs.writeFileSync(
         path.join(tmpDir, 'requirements.txt'),
         'fastapi==0.100.0\nuvicorn\ncustom-dep\n'
       );

       const writeResult = prodEngine.write(rendered.value, tmpDir, {
         overwrite: false,
         language: 'python',
       });
       expect(writeResult.ok).toBe(true);
       if (!writeResult.ok) return;

       // requirements.txt should NOT be overwritten
       const content = fs.readFileSync(path.join(tmpDir, 'requirements.txt'), 'utf-8');
       expect(content).toContain('custom-dep');
       // But other files should be written
       expect(writeResult.value.written).toContain('src/main.py');
       expect(writeResult.value.written).toContain('AGENTS.md');

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('skips go.mod in existing gin project', () => {
       const resolved = prodEngine.resolveTemplate(undefined, 'gin', 'go');
       if (!resolved.ok) throw new Error(resolved.error.message);

       const rendered = prodEngine.render(resolved.value, {
         projectName: 'existing-gin',
         language: 'go',
         framework: 'gin',
       });
       if (!rendered.ok) throw new Error(rendered.error.message);

       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-gin-existing-'));
       fs.writeFileSync(path.join(tmpDir, 'go.mod'), 'module example.com/existing\n\ngo 1.21\n');

       const writeResult = prodEngine.write(rendered.value, tmpDir, {
         overwrite: false,
         language: 'go',
       });
       expect(writeResult.ok).toBe(true);
       if (!writeResult.ok) return;

       expect(writeResult.value.skippedConfigs).toContain('go.mod');
       const content = fs.readFileSync(path.join(tmpDir, 'go.mod'), 'utf-8');
       expect(content).toContain('example.com/existing');

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('skips Cargo.toml in existing axum project', () => {
       const resolved = prodEngine.resolveTemplate(undefined, 'axum', 'rust');
       if (!resolved.ok) throw new Error(resolved.error.message);

       const rendered = prodEngine.render(resolved.value, {
         projectName: 'existing-axum',
         language: 'rust',
         framework: 'axum',
       });
       if (!rendered.ok) throw new Error(rendered.error.message);

       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-axum-existing-'));
       fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '[package]\nname = "existing"\n');

       const writeResult = prodEngine.write(rendered.value, tmpDir, {
         overwrite: false,
         language: 'rust',
       });
       expect(writeResult.ok).toBe(true);
       if (!writeResult.ok) return;

       expect(writeResult.value.skippedConfigs).toContain('Cargo.toml');

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('skips pom.xml in existing spring-boot project', () => {
       const resolved = prodEngine.resolveTemplate(undefined, 'spring-boot', 'java');
       if (!resolved.ok) throw new Error(resolved.error.message);

       const rendered = prodEngine.render(resolved.value, {
         projectName: 'existing-spring',
         language: 'java',
         framework: 'spring-boot',
       });
       if (!rendered.ok) throw new Error(rendered.error.message);

       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-spring-existing-'));
       fs.writeFileSync(
         path.join(tmpDir, 'pom.xml'),
         '<project><groupId>com.existing</groupId></project>'
       );

       const writeResult = prodEngine.write(rendered.value, tmpDir, {
         overwrite: false,
         language: 'java',
       });
       expect(writeResult.ok).toBe(true);
       if (!writeResult.ok) return;

       expect(writeResult.value.skippedConfigs).toContain('pom.xml');
       const content = fs.readFileSync(path.join(tmpDir, 'pom.xml'), 'utf-8');
       expect(content).toContain('com.existing');

       fs.rmSync(tmpDir, { recursive: true });
     });
   });
   ```

3. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/templates/engine.test.ts`
4. Observe: all tests pass.
5. Run full test suite: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/templates/`
6. Observe: all 5 test files pass, zero failures, no regressions.
7. Commit: `test(templates): add non-JS framework write-to-disk and existing-project tests`

## Traceability

| Observable Truth                       | Delivered by                                 |
| -------------------------------------- | -------------------------------------------- |
| 1. fastapi resolves with python-base   | Task 1, Task 6                               |
| 2. django resolves with python-base    | Task 2, Task 6                               |
| 3. gin resolves with go-base           | Task 3, Task 6                               |
| 4. axum resolves with rust-base        | Task 4, Task 6                               |
| 5. spring-boot resolves with java-base | Task 5, Task 6                               |
| 6. detectFramework finds fastapi       | Task 1, Task 7                               |
| 7. detectFramework finds gin           | Task 3, Task 7                               |
| 8. detectFramework finds axum          | Task 4, Task 7                               |
| 9. detectFramework finds spring-boot   | Task 5, Task 7                               |
| 10. detectFramework finds django       | Task 2, Task 7                               |
| 11. All template.json validated        | Tasks 1-5 (auto by template-content.test.ts) |
| 12. Snapshot tests stable              | Task 8                                       |
| 13. Existing-project skip logic works  | Task 9                                       |
| 14. No regressions                     | Task 9 (full suite)                          |
