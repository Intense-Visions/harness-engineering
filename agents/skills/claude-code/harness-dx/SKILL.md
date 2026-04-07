# Harness DX

> Audit developer experience artifacts -- README quality, API documentation coverage, getting-started guides, and example code validation. Produces a structured DX scorecard with specific improvements and scaffolds missing documentation.

## When to Use

- When preparing a library, SDK, or open-source project for release and developer adoption matters
- When reviewing a PR that changes public API surface and documentation should match
- When onboarding friction is high and you need to identify where developers get stuck
- NOT for internal architecture documentation (use harness-docs-pipeline)
- NOT for user-facing product copy (use harness-ux-copy)
- NOT for API design decisions like REST vs GraphQL (use harness-api-design)

## Process

### Phase 1: AUDIT -- Evaluate Documentation Quality

1. **Resolve project root.** Use provided path or cwd.

2. **Locate documentation artifacts.** Search for:
   - README files: `README.md`, `README.rst`, `readme.md`
   - Getting started: `GETTING_STARTED.md`, `QUICKSTART.md`, `docs/getting-started.md`
   - API docs: `docs/api/`, `API.md`, generated docs in `docs/`, `site/`
   - Examples: `examples/`, `demos/`, `samples/`, code blocks in README
   - Changelog: `CHANGELOG.md`, `CHANGES.md`, `HISTORY.md`
   - Contributing: `CONTRIBUTING.md`, `.github/CONTRIBUTING.md`

3. **Score README completeness.** Check for the presence and quality of each section:
   - **Title and description** (what is this project?) -- 0-2 points
   - **Installation/setup** (how do I get it?) -- 0-3 points
   - **Quick example** (show me it working in under 30 seconds) -- 0-3 points
   - **API reference or link** (where is the full documentation?) -- 0-2 points
   - **Contributing guide or link** -- 0-1 point
   - **License** -- 0-1 point
   - Total: score out of 12, grade A (10+), B (7-9), C (4-6), D (0-3)

4. **Evaluate installation instructions.** Check:
   - Are all package managers covered? (npm, yarn, pnpm for JS; pip, poetry for Python; cargo for Rust)
   - Are prerequisites listed? (Node version, OS requirements, system dependencies)
   - Is there a one-liner to get started? (copy-paste friendly)
   - Do the instructions work on all documented platforms?

5. **Assess API documentation coverage.** For every exported function, class, or endpoint:
   - Is it documented?
   - Does it have parameter descriptions?
   - Does it have a usage example?
   - Does it have return type documentation?
   - Calculate coverage percentage: `documented / total * 100`

6. **Check for time-to-hello-world.** Estimate the number of steps from `git clone` to seeing the project work. Fewer than 5 steps is good. More than 10 is a problem.

---

### Phase 2: EXTRACT -- Identify and Validate Examples

1. **Extract code examples from documentation.** Parse all markdown files for fenced code blocks with language annotations. Track:
   - File location and line number
   - Language (js, ts, python, bash, etc.)
   - Whether it is a complete runnable example or a fragment

2. **Extract standalone examples.** Scan `examples/`, `demos/`, `samples/` for:
   - Example projects with their own package.json/requirements.txt
   - Single-file examples
   - Example README files explaining what each example demonstrates

3. **Validate example syntax.** For each extracted code example:
   - Check for syntax errors (missing imports, unclosed brackets, invalid syntax)
   - Check for references to APIs that no longer exist (stale examples)
   - Check that import paths match the actual package name and exports

4. **Run executable examples.** When `--validate-examples` is set:
   - For JavaScript/TypeScript: attempt `node` or `tsx` execution
   - For Python: attempt `python` execution
   - For shell commands: validate they reference real scripts and flags
   - Record pass/fail for each example with error output

5. **Check example freshness.** Compare examples against the current API surface:
   - Are there deprecated APIs used in examples?
   - Are there new APIs with no examples?
   - When was each example file last modified relative to the source it demonstrates?

6. **Build coverage map.** Map examples to the APIs they demonstrate. Identify APIs with zero examples (documentation gaps).

---

### Phase 3: SCAFFOLD -- Generate Missing Documentation

1. **Generate README sections.** For any missing README section identified in Phase 1:
   - Draft installation instructions by reading `package.json`, `setup.py`, `Cargo.toml`, or equivalent
   - Draft a quick-start example using the project's main export
   - Draft a features list from the project's exports and test descriptions

2. **Generate API documentation stubs.** For undocumented exports:
   - Extract function signatures, parameter types, and return types from source
   - Generate JSDoc/docstring stubs with parameter descriptions inferred from type names
   - Include a usage example skeleton derived from test files when available

3. **Generate example files.** For APIs with no examples:
   - Create a minimal working example in `examples/`
   - Include comments explaining each step
   - Ensure the example is self-contained (includes imports, setup, and cleanup)

4. **Generate getting-started guide.** If no quickstart exists:
   - Write a step-by-step guide from installation through first meaningful use
   - Include expected output at each step
   - Target under 5 minutes to complete

5. **Propose documentation structure.** If documentation is scattered or missing:
   - Recommend a `docs/` directory structure
   - Map content to sections (guides, reference, examples, tutorials)
   - Suggest a documentation site generator if the project is large enough (Docusaurus, MkDocs, mdBook)

---

### Phase 4: VALIDATE -- Verify Documentation Accuracy

1. **Check link integrity.** Verify all links in documentation:
   - Internal links: do referenced files and anchors exist?
   - External links: are they well-formed? (do not make HTTP requests)
   - Badge URLs: are shields.io and similar badge URLs using the correct repo/package name?

2. **Check version consistency.** Verify documentation matches the current version:
   - Does the installation section reference the correct package version?
   - Do API examples use the current function signatures?
   - Is the changelog up to date with the latest release?

3. **Check cross-references.** Verify README links to detailed docs, and detailed docs link back to the README and to each other where appropriate.

4. **Output DX scorecard.** Present the complete audit results:

   ```
   DX Scorecard: [GRADE]
   README: [score]/12 ([grade])
   API Coverage: [N]% ([documented]/[total] exports)
   Examples: [working]/[total] passing
   Time to Hello World: ~[N] steps
   Links: [valid]/[total] verified

   GAPS:
   - Missing: getting-started guide
   - Missing: 12 undocumented exports
   - Broken: examples/advanced.ts references removed API

   GENERATED:
   - docs/getting-started.md (draft)
   - 4 API documentation stubs added
   - examples/basic-usage.ts created
   ```

5. **Verify scaffolded content compiles.** If documentation was generated, verify:
   - Generated code examples have valid syntax
   - Generated markdown renders correctly (no broken formatting)
   - Generated files are placed in the correct directories

---

## Harness Integration

- **`harness skill run harness-dx`** -- Primary command for running the DX audit.
- **`harness validate`** -- Run after scaffolding documentation to verify project health.
- **`Glob`** -- Used to locate README files, documentation directories, example folders, and API docs.
- **`Grep`** -- Used to extract exported symbols, find documentation comments, and locate code examples in markdown.
- **`Read`** -- Used to read documentation files, package manifests, and source files for API extraction.
- **`Write`** -- Used to scaffold missing documentation, generate example files, and create getting-started guides.
- **`Bash`** -- Used to run example validation, check link targets, and execute code snippets.
- **`emit_interaction`** -- Used to present the DX scorecard and request confirmation before generating scaffolded files.

## Success Criteria

- README is scored against all 6 completeness criteria with specific gap identification
- API documentation coverage percentage is calculated against actual exported surface
- All code examples in documentation are syntax-checked
- Executable examples pass when `--validate-examples` is set
- Missing documentation is scaffolded with accurate, runnable content
- DX scorecard provides an at-a-glance quality grade
- Time-to-hello-world is estimated and actionable if too high

## Examples

### Example: Node.js SDK with Sparse Documentation

```
Phase 1: AUDIT
  README score: 5/12 (C)
    Present: title, description, license
    Missing: installation, quick example, API reference link, contributing
  API coverage: 23% (7/30 exports documented)
  Time to hello world: ~14 steps (too many, target: <5)

Phase 2: EXTRACT
  Code examples found: 3 (all in README)
  examples/ directory: empty
  Validation: 2/3 examples pass syntax check
  Broken: README line 45 references `sdk.connect()` -- renamed to `sdk.init()` in v2.0

Phase 3: SCAFFOLD
  Generated: docs/getting-started.md (5-step quickstart)
  Generated: examples/basic-usage.ts (demonstrates init, query, cleanup)
  Generated: 23 JSDoc stubs from TypeScript signatures
  README patches: added installation section, updated broken example

Phase 4: VALIDATE
  Links: 8/10 valid (2 broken anchors in README)
  Generated examples: syntax valid
  DX Scorecard: C -> B (projected after applying changes)
```

### Example: Python Library with Comprehensive Docs (Sphinx)

```
Phase 1: AUDIT
  README score: 11/12 (A)
    Missing only: contributing guide link
  API coverage: 89% (142/160 functions documented)
  Sphinx docs at docs/_build/html: present, 45 pages
  Time to hello world: ~4 steps (good)

Phase 2: EXTRACT
  Code examples: 28 in docs, 12 in examples/
  Validation: 37/40 pass (3 use deprecated pandas.append)
  Stale examples: 3 files last modified 8 months ago, source changed since

Phase 3: SCAFFOLD
  Generated: 18 docstring stubs for undocumented functions
  Updated: 3 stale examples to use pandas.concat
  Added: CONTRIBUTING.md link to README

Phase 4: VALIDATE
  Links: 52/52 valid
  DX Scorecard: A (maintained, minor freshness issues resolved)
```

### Example: Rust CLI Tool Missing Getting Started

```
Phase 1: AUDIT
  README score: 7/12 (B)
    Present: title, description, installation (cargo install), license, API link
    Missing: quick example showing actual CLI usage, contributing
  API coverage: N/A (CLI tool, not library)
  CLI help text: present via clap derive
  Time to hello world: ~6 steps

Phase 2: EXTRACT
  Code examples: 2 in README (both installation commands)
  examples/ directory: 1 example config file, no runnable examples
  Missing: actual usage examples showing command output

Phase 3: SCAFFOLD
  Generated: docs/getting-started.md with:
    1. cargo install myctl
    2. myctl init
    3. myctl run --config example.toml
    (with expected output at each step)
  Generated: examples/basic-config.toml with annotated comments
  Generated: README quick-example section with terminal output

Phase 4: VALIDATE
  CLI help flags match documented flags: YES
  Config example matches current schema: YES
  DX Scorecard: B -> A (projected after applying changes)
```

## Rationalizations to Reject

| Rationalization                                                                                                                                        | Reality                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The README has an installation section but it only covers npm — yarn and pnpm users can figure it out. I'll mark installation as complete."           | Installation instructions must cover all package managers the project supports. If `yarn.lock` or `pnpm-lock.yaml` exists alongside `package-lock.json`, all three installers must be documented. Partial coverage is scored as partial, not complete.                     |
| "This code example in the README uses the old `sdk.connect()` API — but it still parses syntactically, so it passes the syntax check."                 | Stale API references are broken examples regardless of syntax validity. A syntactically valid example that calls a renamed or removed function fails the freshness check and must be flagged as broken in the scorecard.                                                   |
| "The API function's behavior is complex, but I can infer what it does from the name `parseAndValidate` — I'll write the docstring stub based on that." | Documentation must be derived from actual source code: type signatures, test files, and existing docs. Inferring behavior from function names produces fabricated documentation. Flag functions that cannot be documented from source as requiring developer-written docs. |
| "The getting-started guide already exists in the wiki — it's not in the repo, but I'll mark the quickstart as present."                                | Documentation must be locatable from the repository root. A wiki link from the README satisfies the API reference link criterion only if the link is explicit. A guide that requires knowing where the wiki is does not meet the discoverability requirement.              |
| "There are 18 undocumented exports — I'll generate all 18 JSDoc stubs and commit them without showing the user first."                                 | Scaffolded documentation must be presented for review before being written. Generated stubs may contain inaccurate parameter descriptions or wrong return type assumptions. Use `emit_interaction` to present scaffolded content and wait for approval.                    |

## Gates

- **No scaffolding without human confirmation.** Generated documentation is always presented as a draft for review. Do not commit generated files automatically. Use `emit_interaction` to present scaffolded content and wait for approval.
- **No overwriting existing documentation.** If a README section already exists, do not replace it. Only fill gaps. Existing content may have been carefully written and should not be clobbered.
- **No fabricating API behavior.** Generated documentation and examples must be derived from actual source code (type signatures, test files, existing docs). Do not guess what an undocumented function does based on its name alone.
- **No marking stale examples as passing.** If an example references a renamed or removed API, it is broken regardless of whether it happens to still parse syntactically.

## Escalation

- **When API documentation requires domain expertise:** If function behavior cannot be inferred from types and tests alone, flag it: "These 5 functions need developer-written documentation -- their behavior is domain-specific and cannot be reliably inferred."
- **When examples require external services:** If running an example requires a database, API key, or external service, flag the dependency rather than failing: "This example requires a running PostgreSQL instance. Consider adding a Docker Compose file for example dependencies."
- **When documentation tooling is broken:** If Sphinx, TypeDoc, or other doc generators fail to build, report the error but do not attempt to fix the toolchain. That is outside this skill's scope.
- **When README and API docs contradict each other:** Flag the contradiction with both sources quoted. Do not choose which one is correct -- the developer must resolve the conflict: "README says `init()` accepts a string, but the TypeDoc shows it accepts `InitConfig`. Which is current?"
