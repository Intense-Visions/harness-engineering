# Validate Context Engineering

> Validate AGENTS.md quality and evolve it as the codebase changes. Good context engineering means AI agents always have accurate, current knowledge about the project.

## When to Use
- After adding new files, modules, or packages to the project
- After renaming, moving, or deleting significant files
- After changing public APIs, architectural patterns, or conventions
- When onboarding a new contributor (human or AI) and want to verify context is current
- When `on_context_check` or `on_pre_commit` triggers fire
- Periodically (weekly or per-sprint) as a hygiene check
- NOT when making trivial changes (typo fixes, comment updates, formatting)
- NOT during active feature development — run this between features or at cycle boundaries

## Process

### Phase 1: Audit — Run Automated Checks

1. **Run `harness validate`** to check overall project health. Review any context-related warnings or errors in the output.

2. **Run `harness check-docs`** to detect documentation gaps, broken links, and stale references. Capture the full output for analysis.

3. **Review AGENTS.md manually.** Automated tools catch structural issues but miss semantic drift. Read each section and ask: "Is this still true?"

### Phase 2: Detect Gaps

Categorize findings into four types:

1. **Undocumented files.** New source files, modules, or packages that are not mentioned in AGENTS.md or any knowledge map section. These are the highest priority — an AI agent encountering these files has no context.

2. **Broken links.** References to files, functions, or URLs that no longer exist. These actively mislead agents.

3. **Stale sections.** Content that was accurate when written but no longer reflects reality. Examples: renamed functions still referenced by old name, removed features still described, changed conventions not updated.

4. **Missing context.** Sections that exist but lack critical information. A module is listed but its purpose, constraints, or relationships are not explained. An AI agent can find the file but does not understand why it exists or how to use it correctly.

### Phase 3: Suggest Updates

For each gap, generate a specific suggestion:

- **Undocumented files:** Draft a new section or entry with the file path, purpose, key exports, and relationship to existing modules. Use the existing AGENTS.md style and structure.
- **Broken links:** Identify the correct target (renamed file, moved function) or recommend removal if the target was deleted.
- **Stale sections:** Draft replacement text that reflects current reality. Show the diff between old and new.
- **Missing context:** Draft additional content that fills the gap. Focus on what an AI agent needs to know: purpose, constraints, relationships, and gotchas.

### Phase 4: Apply with Approval

1. **Present all suggestions as a grouped list.** Organize by section of AGENTS.md for easy review.

2. **Apply approved changes.** Update AGENTS.md with the approved suggestions. Preserve existing formatting and style.

3. **Re-run `harness check-docs`** to verify all fixes are clean. No new issues should be introduced.

4. **Commit the update.** Use a descriptive commit message that summarizes what was updated and why.

## What Makes Good AGENTS.md Content

Good context engineering treats AGENTS.md as a **dynamic knowledge base**, not a static document.

- **Accuracy over completeness.** A small, accurate AGENTS.md is better than a comprehensive but stale one. Every statement must be verifiable against the current codebase.
- **Purpose-first descriptions.** Do not just list files. Explain WHY each module exists, what problem it solves, and what constraints apply to it.
- **Relationship mapping.** Show how modules connect. Which modules depend on which? What are the boundaries? An agent reading one section should understand how it fits into the whole.
- **Gotchas and constraints.** Document the non-obvious. What will break if someone does X? What patterns must be followed? What is forbidden and why?
- **Change-friendly structure.** Organize so that adding a new module means adding one section, not updating ten places. Use consistent formatting so automated tools can parse it.
- **Actionable guidance.** Every section should help an agent make correct decisions. "This module handles authentication" is less useful than "This module handles authentication. All auth changes must go through the AuthService class. Direct database access for auth data is forbidden — use the repository layer."

## Harness Integration

- **`harness validate`** — Full project health check. Reports context gaps as part of overall validation.
- **`harness check-docs`** — Focused documentation audit. Detects broken links, missing references, stale sections, and undocumented files.
- **`harness fix-drift`** — Auto-fix simple drift issues (broken links, renamed references). Use after manual review confirms the fixes are correct.

## Success Criteria

- `harness check-docs` passes with zero errors and zero warnings
- Every source file that contains public API or architectural significance is referenced in AGENTS.md
- All file paths and function names in AGENTS.md match the current codebase
- All links (internal and external) resolve correctly
- AGENTS.md sections accurately describe current module purposes, constraints, and relationships
- A new AI agent reading AGENTS.md can navigate the codebase and make correct decisions without additional guidance

## Examples

### Example: New module added but not documented

**Audit output from `harness check-docs`:**
```
WARNING: Undocumented file detected: src/services/notification-service.ts
  - File contains 3 public exports: NotificationService, NotificationType, sendNotification
  - File is imported by 4 other modules
  - No AGENTS.md section references this file
```

**Suggested update:**
```markdown
### Notification Service (`src/services/notification-service.ts`)

Handles all outbound notifications (email, Slack, webhook). All notification delivery
must go through `NotificationService` — direct use of transport libraries (nodemailer,
Slack SDK) outside this module is forbidden.

- `NotificationType` — enum of supported notification channels
- `sendNotification()` — primary entry point; routes to the correct transport
- Requires `NOTIFICATION_CONFIG` environment variables to be set
- Respects rate limits defined in `harness.config.json` under `notifications`
```

**Apply:** Add the section under the Services heading in AGENTS.md. Re-run `harness check-docs` to confirm the warning is resolved.

### Example: Renamed function still referenced by old name

**Audit output:**
```
ERROR: Broken reference in AGENTS.md line 47: `calculateShipping()`
  - Function was renamed to `computeShippingCost()` in commit abc123
  - Located in src/services/shipping.ts
```

**Fix:** Replace `calculateShipping()` with `computeShippingCost()` in AGENTS.md. Verify no other references to the old name exist.

## Escalation

- **When AGENTS.md is severely outdated (>20 issues):** Do not attempt to fix everything at once. Prioritize: broken links first, then undocumented public APIs, then stale descriptions. Batch the work across multiple commits.
- **When you are unsure whether a section is stale:** Check git blame for the section and compare against recent changes to the referenced files. If the section has not been updated since the referenced files changed, it is likely stale.
- **When the project has no AGENTS.md:** Escalate to the human. Creating an AGENTS.md from scratch is a significant decision about project structure and should be done intentionally, not automatically.
