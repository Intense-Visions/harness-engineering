# Plan: Docs Phase 2 — CLI Reference Generator Reconciliation

**Date:** 2026-04-01
**Spec:** docs/changes/docs-auto-generation/proposal.md
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Verify and reconcile the existing CLI reference generator in `scripts/generate-docs.mjs` against the spec requirements, fixing the three identified gaps: missing option defaults, missing argument descriptions, and missing link to the features overview.

## Observable Truths (Acceptance Criteria)

1. When `node scripts/generate-docs.mjs` is run, `docs/reference/cli-commands.md` is produced with the auto-generated header.
2. The generated CLI reference groups commands by command group (Top-Level, Agent, Ci, Graph, Hooks, Integrations, Learnings, Linter, Orchestrator, Perf, Persona, Skill, State).
3. When a command has options with default values (e.g., `harness check-docs --min-coverage`), the generated output includes `(default: "80")` after the description.
4. When a command has arguments with descriptions (e.g., `harness add <type> <name>`), the generated output includes argument descriptions below the command heading.
5. The generated CLI reference contains a link to `../guides/features-overview.md` in the introductory section.
6. `harness validate` passes after all changes.

## File Map

- MODIFY `scripts/generate-docs.mjs` (add default values to options, add argument descriptions, add features overview link)
- MODIFY `docs/reference/cli-commands.md` (regenerated output — reflects all three fixes)

## Tasks

### Task 1: Add option default values to formatCommand

**Depends on:** none
**Files:** `scripts/generate-docs.mjs`

1. Open `scripts/generate-docs.mjs` and locate the `formatCommand` function (line 77).

2. In the options rendering loop (line 92-96), modify the line that builds the option description to append the default value when present. Change:

   ```javascript
   lines.push(`- ${flags} — ${opt.description}\n`);
   ```

   to:

   ```javascript
   const defaultStr =
     opt.defaultValue !== undefined && opt.defaultValue !== false
       ? ` (default: ${JSON.stringify(opt.defaultValue)})`
       : '';
   lines.push(`- ${flags} — ${opt.description}${defaultStr}\n`);
   ```

3. Run: `node scripts/generate-docs.mjs`

4. Verify the generated `docs/reference/cli-commands.md` contains default values. Check that:
   - `harness check-docs` shows `--min-coverage` with `(default: "80")`
   - `harness check-security` shows `--severity` with `(default: "warning")`
   - `harness init` shows `--level` with `(default: "basic")`
   - Boolean defaults like `false` are excluded (the `!== false` guard)

5. Run: `npx harness validate`

6. Commit: `fix(docs): include option default values in CLI reference generator`

---

### Task 2: Add argument descriptions to formatCommand

**Depends on:** none (can run parallel with Task 1)
**Files:** `scripts/generate-docs.mjs`

1. Open `scripts/generate-docs.mjs` and locate the `formatCommand` function (line 77).

2. After the command description block (after line 86 `lines.push(`${cmd.description()}\n\n`);`), add argument descriptions. Insert after the description block and before the options block:

   ```javascript
   // Arguments with descriptions
   if (args.length > 0) {
     const describedArgs = args.filter((a) => a.description);
     if (describedArgs.length > 0) {
       lines.push('**Arguments:**\n\n');
       for (const a of describedArgs) {
         const req = a.required ? 'required' : 'optional';
         lines.push(`- \`${a.name()}\` (${req}) — ${a.description}\n`);
       }
       lines.push('\n');
     }
   }
   ```

3. Run: `node scripts/generate-docs.mjs`

4. Verify the generated `docs/reference/cli-commands.md` contains argument descriptions. Check that:
   - `harness add <type> <name>` shows an **Arguments:** section with `type` described as "Component type (layer, module, doc, skill, persona)" and `name` described as "Component name"
   - `harness skill run <name>` shows `name` described as "Skill name (e.g., harness-tdd)"
   - Commands without argument descriptions (e.g., `harness perf bench [glob]` where glob has empty description) do NOT show an empty Arguments section

5. Run: `npx harness validate`

6. Commit: `fix(docs): include argument descriptions in CLI reference generator`

---

### Task 3: Add link to features overview in header

**Depends on:** none (can run parallel with Tasks 1-2)
**Files:** `scripts/generate-docs.mjs`

1. Open `scripts/generate-docs.mjs` and locate the `generateCliReference` function (line 32).

2. Modify the intro lines array (lines 37-41) to add a link to the features overview. Change:

   ```javascript
   const lines = [
     HEADER,
     '# CLI Command Reference\n\n',
     'Complete reference for all `harness` CLI commands and subcommands.\n\n',
   ];
   ```

   to:

   ```javascript
   const lines = [
     HEADER,
     '# CLI Command Reference\n\n',
     'Complete reference for all `harness` CLI commands and subcommands. ',
     'See the [Features Overview](../guides/features-overview.md) for narrative documentation.\n\n',
   ];
   ```

3. Run: `node scripts/generate-docs.mjs`

4. Verify the generated `docs/reference/cli-commands.md` header contains the link text `[Features Overview](../guides/features-overview.md)`.

5. Run: `npx harness validate`

6. Commit: `fix(docs): add features overview link to CLI reference header`

---

### Task 4: Regenerate docs and final validation

**Depends on:** Tasks 1, 2, 3
**Files:** `scripts/generate-docs.mjs`, `docs/reference/cli-commands.md`

[checkpoint:human-verify] — Review the complete generated output before committing.

1. Run: `node scripts/generate-docs.mjs`

2. Verify all observable truths:

   a. **Auto-generated header**: First line is `<!-- AUTO-GENERATED — do not edit. Run \`pnpm run generate-docs\` to regenerate. -->`

   b. **Command groups**: Run `grep "^## " docs/reference/cli-commands.md` and confirm all 13 groups appear:
   - Top-Level Commands, Agent Commands, Ci Commands, Graph Commands, Hooks Commands, Integrations Commands, Learnings Commands, Linter Commands, Orchestrator Commands, Perf Commands, Persona Commands, Skill Commands, State Commands

   c. **Option defaults**: Run `grep "default:" docs/reference/cli-commands.md` and confirm defaults appear for `--min-coverage`, `--severity`, `--level`, `--type`, `--timeout`, etc.

   d. **Argument descriptions**: Run `grep -A4 "Arguments:" docs/reference/cli-commands.md | head -20` and confirm argument descriptions appear for commands like `add`, `skill run`, `install`.

   e. **Features overview link**: Run `grep "features-overview" docs/reference/cli-commands.md` and confirm the link is present.

   f. **Command count**: Run `grep -c "^### " docs/reference/cli-commands.md` and confirm 64 commands are documented.

3. Run: `npx harness validate`

4. Run: `node scripts/generate-docs.mjs --check` to verify the freshness check passes (docs match what was just generated).

5. Commit: `docs(reference): regenerate CLI reference with defaults, arg descriptions, and overview link`
