# Initialize Harness Project

Scaffold a new project that follows harness engineering practices.

## Context

Use this skill when starting a new project or converting an existing project to use harness engineering practices.

## Prerequisites

- Node.js installed
- npm or pnpm available
- Target directory exists (can be empty or existing project)

## Steps

1. **Check prerequisites**

   Use the shell tool:
   ```bash
   node --version && (pnpm --version || npm --version)
   ```

   Ensure Node.js 18+ is installed.

2. **Navigate to project directory**

   Confirm the target directory:
   ```bash
   pwd && ls -la
   ```

3. **Run initialization**

   Use the shell tool:
   ```bash
   harness init
   ```

   This creates:
   - `harness.config.json` - Configuration file
   - `AGENTS.md` - Context engineering file
   - `docs/` - Documentation directory

4. **Verify created files**

   Use the shell tool:
   ```bash
   ls -la && cat harness.config.json
   ```

5. **Customize configuration**

   Edit `harness.config.json` to set:
   - Project name
   - Layer configuration
   - Documentation paths

6. **Run initial validation**

   Use the shell tool:
   ```bash
   harness validate --json
   ```

   Should pass with no issues.

7. **Commit initial setup**

   Use the shell tool:
   ```bash
   git add harness.config.json AGENTS.md docs/
   git commit -m "chore: initialize harness engineering"
   ```

## Success Criteria

- [ ] harness.config.json created and valid
- [ ] AGENTS.md created with basic structure
- [ ] docs/ directory exists
- [ ] Initial validation passes
- [ ] Files committed to git

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| CLI not found | harness not installed | `npm install -g @harness-engineering/cli` |
| Permission denied | Directory not writable | Check permissions |
| Files exist | Project already initialized | Use `harness init --force` to overwrite |

## Examples

### Example: New Project

```
$ harness init

Initializing harness engineering...

Created:
  ✓ harness.config.json
  ✓ AGENTS.md
  ✓ docs/

Next steps:
  1. Edit harness.config.json to configure layers
  2. Update AGENTS.md with your project structure
  3. Run `harness validate` to verify setup
```

### Example: Existing Project

```
$ harness init

Found existing project. Adding harness engineering...

Created:
  ✓ harness.config.json
  ✓ AGENTS.md
  ~ docs/ (already exists, skipped)

Note: Review generated AGENTS.md and update with your existing structure.
```
