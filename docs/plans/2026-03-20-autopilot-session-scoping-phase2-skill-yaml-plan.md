# Phase 2: Update skill.yaml state declaration

## Objective

Update the `state.files` list in `skill.yaml` for the harness-autopilot skill on both platforms (claude-code and gemini-cli) to use glob patterns for session-scoped state files instead of singleton paths. This aligns the YAML declarations with the session directory structure introduced in Phase 1.

## Context

- **Spec:** docs/changes/autopilot-session-scoping/proposal.md
- **Phase 1 complete:** SKILL.md on both platforms already updated with session-scoped paths
- **Platform parity required:** Both copies must be identical (enforced by `agents/skills/tests/platform-parity.test.ts`)

## Current State (both platforms identical)

```yaml
state:
  persistent: true
  files:
    - .harness/autopilot-state.json
    - .harness/state.json
    - .harness/learnings.md
```

## Target State (from spec)

```yaml
state:
  persistent: true
  files:
    - .harness/sessions/*/autopilot-state.json
    - .harness/sessions/*/state.json
    - .harness/sessions/*/handoff.json
    - .harness/learnings.md
```

## Changes

1. Replace `.harness/autopilot-state.json` with `.harness/sessions/*/autopilot-state.json`
2. Replace `.harness/state.json` with `.harness/sessions/*/state.json`
3. Add `.harness/sessions/*/handoff.json` (was missing from the old declaration entirely)
4. Keep `.harness/learnings.md` unchanged (global file, not session-scoped)

## Tasks

### Task 1: Update skill.yaml on both platforms

**Type:** auto

**Files:**

- `agents/skills/claude-code/harness-autopilot/skill.yaml`
- `agents/skills/gemini-cli/harness-autopilot/skill.yaml`

**Action:**

In both files, replace lines 43-46 (the `state.files` list) with the target state shown above. Both files must be identical after the change. Stage both files together.

The full `state:` block should read:

```yaml
state:
  persistent: true
  files:
    - .harness/sessions/*/autopilot-state.json
    - .harness/sessions/*/state.json
    - .harness/sessions/*/handoff.json
    - .harness/learnings.md
```

**Verify:**

```bash
# 1. Files are identical
diff agents/skills/claude-code/harness-autopilot/skill.yaml agents/skills/gemini-cli/harness-autopilot/skill.yaml

# 2. Glob patterns present
grep 'sessions/\*/' agents/skills/claude-code/harness-autopilot/skill.yaml

# 3. handoff.json included
grep 'handoff.json' agents/skills/claude-code/harness-autopilot/skill.yaml

# 4. No singleton state paths remain
grep -c '\.harness/autopilot-state\.json' agents/skills/claude-code/harness-autopilot/skill.yaml
# Expected: 0

grep -c '\.harness/state\.json' agents/skills/claude-code/harness-autopilot/skill.yaml
# Expected: 0
```

**Done:** Both skill.yaml files contain session-scoped glob patterns and are identical.

### Task 2: Run validation tests

**Type:** auto

**Files:** (none modified, validation only)

**Action:**

Run the skills test suite to confirm YAML schema validation and platform parity both pass.

```bash
cd agents/skills && npx vitest run
```

**Verify:** All tests pass, specifically:

- `structure.test.ts` -- skill.yaml parses and validates against schema
- `platform-parity.test.ts` -- claude-code and gemini-cli copies are identical

**Done:** `npx vitest run` exits 0 with no failures.

## Success Criteria

- Both `skill.yaml` files declare session-scoped glob patterns matching the spec
- `handoff.json` is included in the state file list (was previously missing)
- `learnings.md` remains as a global (non-session-scoped) path
- No singleton `.harness/autopilot-state.json` or `.harness/state.json` paths remain
- Platform parity and structure tests pass
