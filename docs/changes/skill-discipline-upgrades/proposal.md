# Skill Discipline Upgrades

**Keywords:** discipline, evidence, red-flags, rationalizations, skills, SKILL.md, template, citations, safety

## Overview

Skill Discipline Upgrades adds structured discipline patterns — Evidence Requirements and Red Flags/Rationalizations to Reject — to 8 high-traffic skills. A shared template defines 3 universal discipline patterns, and each skill adds 3-5 domain-specific red flags and rationalizations. This makes skills safer and more reliable without requiring code changes — all deliverables are SKILL.md edits plus one new template file.

### Goals

1. Every upgraded skill requires evidence citations for technical claims, with `[UNVERIFIED]` prefix for uncited assertions
2. Every upgraded skill has domain-specific Red Flags that catch the most dangerous failure modes
3. Every upgraded skill has Rationalizations to Reject that block common reasoning traps
4. A reusable discipline template exists for future skill authors to adopt the pattern

### Non-goals

- Upgrading all 70+ domain skills (organic adoption after the pattern is proven)
- CI enforcement of discipline sections (follow-up after pattern validation)
- Session state integration or anti-pattern scans (separate infrastructure work)
- Changes to skill runtime, MCP tools, or CLI code

## Decisions

| Decision                | Choice                                                         | Rationale                                                                                                                           |
| ----------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Discipline patterns     | Evidence Requirements + Red Flags + Rationalizations to Reject | Evidence forces citation; Red Flags catch dangerous output; Rationalizations block reasoning traps. Already proven in 5 core skills |
| Delivery model          | Shared template + domain overrides                             | 3 universal patterns ensure consistency; domain layer captures what's actually dangerous per area; template enables future adoption |
| Skill selection         | 4 high-frequency workflow skills + 4 high-risk domain skills   | Covers both dimensions: skills that run most often AND skills where wrong output is most costly                                     |
| Scope                   | SKILL.md edits + one new template file                         | Maximum leverage per effort; discipline is prompt engineering, not runtime enforcement                                              |
| Section placement       | Immediately before Escalation section                          | Consistent, unambiguous placement across all skills                                                                                 |
| Red Flag format         | Each must contain a quoted phrase the agent would say          | Makes "concrete" mechanically testable — not subjective quality judgment                                                            |
| Implementation ordering | Workflow skills first, then domain skills                      | Workflow skills calibrate the pattern before applying to higher-risk domain skills                                                  |

### Target Skills

| Skill                          | Directory                                                 | Selection Rationale                                                         |
| ------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `harness-code-review`          | `agents/skills/claude-code/harness-code-review/`          | Runs in every review pipeline; wrong review advice wastes developer time    |
| `harness-security-scan`        | `agents/skills/claude-code/harness-security-scan/`        | Security findings must be trustworthy; false confidence is dangerous        |
| `harness-architecture-advisor` | `agents/skills/claude-code/harness-architecture-advisor/` | Architectural advice shapes long-term codebase health; bad advice compounds |
| `harness-enforce-architecture` | `agents/skills/claude-code/harness-enforce-architecture/` | Auto-fixes import violations; wrong fixes break builds                      |
| `harness-auth`                 | `agents/skills/claude-code/harness-auth/`                 | Authentication mistakes have severe security consequences                   |
| `harness-api-design`           | `agents/skills/claude-code/harness-api-design/`           | API design errors are expensive to fix once consumers depend on them        |
| `harness-database`             | `agents/skills/claude-code/harness-database/`             | Database mistakes cause data loss and production outages                    |
| `harness-deployment`           | `agents/skills/claude-code/harness-deployment/`           | Deployment errors directly affect production availability                   |

## Technical Design

### Discipline Template

Location: `agents/skills/templates/discipline-template.md` (new file in new directory)

This template defines the universal patterns that every upgraded skill inherits verbatim, plus placeholders for domain-specific content.

```markdown
## Evidence Requirements

When this skill makes claims about existing code, architecture, or behavior,
it MUST cite evidence using one of:

1. **File reference:** `file:line` format (e.g., `src/auth.ts:42`)
2. **Code pattern reference:** `file` with description (e.g., `src/utils/hash.ts` —
   "existing bcrypt wrapper")
3. **Test/command output:** Inline or referenced output from a test run or CLI command
4. **Session evidence:** Write to the `evidence` session section via `manage_state`

**Uncited claims:** Technical assertions without citations MUST be prefixed with
`[UNVERIFIED]`. Example: `[UNVERIFIED] The auth middleware supports refresh tokens`.

## Red Flags

### Universal

These apply to ALL skills. If you catch yourself doing any of these, STOP.

- **"I believe the codebase does X"** — Stop. Read the code and cite a file:line
  reference. Belief is not evidence.
- **"Let me recommend [pattern] for this"** without checking existing patterns — Stop.
  Search the codebase first. The project may already have a convention.
- **"While we're here, we should also [unrelated improvement]"** — Stop. Flag the idea
  but do not expand scope beyond the stated task.

### Domain-Specific

<!-- Add 3-5 red flags specific to this skill's domain.
     Each MUST contain a quoted phrase the agent would say.
     Format: **"<quoted phrase>"** — <why it's dangerous and what to do instead> -->

## Rationalizations to Reject

### Universal

These reasoning patterns sound plausible but lead to bad outcomes. Reject them.

- **"It's probably fine"** — "Probably" is not evidence. Verify before asserting.
- **"This is best practice"** — Best practice in what context? Cite the source and
  confirm it applies to this codebase.
- **"We can fix it later"** — If it is worth flagging, it is worth documenting now
  with a concrete follow-up plan.

### Domain-Specific

<!-- Add 3-5 rationalizations specific to this skill's domain.
     Format: **"<rationalization>"** — <why it's wrong and what to do instead> -->
```

### Domain-Specific Content

Each skill gets 3-5 domain-specific Red Flags and 3-5 Rationalizations to Reject. These are illustrative examples — the implementer must produce the full set of 3-5 per skill.

#### harness-code-review

**Red Flags:**

- **"The change looks reasonable, approving"** — Stop. Have you read every changed file? Approval without full review is rubber-stamping.
- **"Let me fix this issue I found"** — Stop. Review identifies issues; it does not fix them. Suggest the fix, do not apply it.
- **"This is a minor style issue"** — Stop. Is it a style issue or a readability/maintainability concern? Classify accurately.

**Rationalizations:**

- **"The tests pass, so the logic must be correct"** — Tests can be incomplete. Review the logic independently.
- **"This is how it was done elsewhere in the codebase"** — Existing patterns can be wrong. Evaluate the pattern, not just its precedent.
- **"It's just a refactor, low risk"** — Refactors change behavior surfaces. Review them with the same rigor as feature changes.

#### harness-security-scan

**Red Flags:**

- **"This finding is in test code, so it's not a real issue"** — Stop. Test code can leak secrets, establish bad patterns, and be copy-pasted to production.
- **"This dependency is widely used, so it's safe"** — Stop. Popularity is not a security guarantee. Check CVE databases.
- **"This is a low-severity finding, skipping"** — Stop. Low-severity findings compound. Document why you are deprioritizing.

**Rationalizations:**

- **"No attacker would find this"** — Security by obscurity. If the code is wrong, flag it.
- **"We're behind a firewall"** — Network boundaries change. Code should be secure at every layer.
- **"The framework handles this for us"** — Verify the framework's behavior. Misuse of a secure framework is still insecure.

#### harness-architecture-advisor

**Red Flags:**

- **"You should introduce an abstraction layer here"** without checking duplication metrics — Stop. Abstractions are justified by measured duplication or coupling, not intuition.
- **"This module is getting too large"** without checking line counts or complexity — Stop. "Too large" needs a number.
- **"Consider migrating to [technology]"** without a cost-benefit analysis — Stop. Migration advice without concrete tradeoffs is harmful.

**Rationalizations:**

- **"This will be easier to maintain"** — Easier for whom? Cite the maintenance burden with evidence.
- **"It's the modern approach"** — Modernity is not a design criterion. Fitness for purpose is.
- **"Other teams do it this way"** — Other teams have different constraints. Evaluate on this codebase's merits.

#### harness-enforce-architecture

**Red Flags:**

- **"Auto-fixing this import to use the correct layer"** without verifying the replacement module exists — Stop. Verify the target exists and exports the needed symbol.
- **"This file is in a test directory, skipping violation"** — Stop. Test directories have architectural rules too. Check the constraint definition.
- **"Removing this circular dependency by moving the import"** without tracing downstream effects — Stop. Moving imports can break consumers.

**Rationalizations:**

- **"The violation is minor — just one import"** — One violation sets a precedent. Enforce or document an exception.
- **"This is a generated file"** — Generated files can still violate architecture if the generator is misconfigured. Check the source.
- **"It works, so the architecture must be fine"** — Working code with bad architecture is technical debt with interest.

#### harness-auth

**Red Flags:**

- **"Let's store the token in localStorage for convenience"** — Stop. localStorage is accessible to XSS. Use httpOnly cookies or secure storage.
- **"We can use a simple hash for passwords"** — Stop. Passwords require slow hashing (bcrypt, scrypt, argon2). Fast hashes are crackable.
- **"Let's implement our own JWT validation"** — Stop. Use a vetted library. Custom crypto is a known source of vulnerabilities.

**Rationalizations:**

- **"No one would guess this token format"** — Security by obscurity. Tokens must be cryptographically secure regardless of format.
- **"This is an internal service, auth is less critical"** — Internal services are lateral movement targets. Authenticate all boundaries.
- **"The session timeout is just for UX"** — Session management is a security control. Treat timeout values as security-relevant.

#### harness-api-design

**Red Flags:**

- **"Adding this required field to the existing endpoint"** — Stop. Adding required fields to existing endpoints breaks all current consumers.
- **"Changing the response shape to be cleaner"** — Stop. Changing response shape without versioning is a breaking change.
- **"Returning the full object for convenience"** — Stop. Over-fetching exposes unnecessary data. Return only what the consumer needs.

**Rationalizations:**

- **"It's an internal API, breaking changes are fine"** — Internal consumers break too. Version it or coordinate the migration.
- **"We can add pagination later"** — Lists without pagination become production incidents at scale. Add it now.
- **"The field name is obvious enough"** — API field names are a public contract. Follow existing naming conventions explicitly.

#### harness-database

**Red Flags:**

- **"Running this migration in production"** without a rollback plan — Stop. Every migration must have a tested reverse migration.
- **"Adding an index to speed up this query"** without checking write patterns — Stop. Indexes speed reads but slow writes. Check both access patterns.
- **"Dropping this column, it's unused"** — Stop. Verify no application code references it, including ORMs, background jobs, and analytics queries.

**Rationalizations:**

- **"The table is small, we don't need an index"** — Tables grow. Plan for the steady state, not the current state.
- **"We can denormalize later if performance is an issue"** — Denormalization decisions are hard to reverse. Decide consciously now.
- **"The ORM handles this for us"** — ORMs generate SQL that may not match your performance expectations. Review generated queries.

#### harness-deployment

**Red Flags:**

- **"Deploying without a health check endpoint"** — Stop. Without health checks, the orchestrator cannot detect failed deployments.
- **"Skipping canary deployment, it's a small change"** — Stop. Small changes cause outages too. Follow the deployment policy.
- **"Rolling back manually if something goes wrong"** — Stop. Manual rollback under incident pressure fails. Automate it.

**Rationalizations:**

- **"It's just a config change, not a code change"** — Config changes cause outages at the same rate as code changes. Deploy them with the same rigor.
- **"We tested this in staging"** — Staging is not production. Traffic patterns, data volume, and edge cases differ.
- **"Downtime will be brief"** — Brief is not zero. Quantify the expected impact and communicate it to stakeholders.

### Upgrade Process

For each target skill:

1. Read the existing SKILL.md in full
2. Locate the Escalation section
3. Insert immediately before Escalation:
   - `## Evidence Requirements` — copied verbatim from template
   - `## Red Flags` — universal section from template + 3-5 domain-specific entries
   - `## Rationalizations to Reject` — universal section from template + 3-5 domain-specific entries
4. Verify no existing content was removed or altered
5. Run `harness validate` to confirm project health

## Success Criteria

1. A discipline template exists at `agents/skills/templates/discipline-template.md` with universal Evidence Requirements, 3 Red Flags, and 3 Rationalizations to Reject
2. All 8 target skills have an Evidence Requirements section requiring `[UNVERIFIED]` prefix for uncited claims
3. All 8 target skills have 3 universal Red Flags (verbatim from template) plus 3-5 domain-specific Red Flags
4. All 8 target skills have 3 universal Rationalizations to Reject (verbatim from template) plus 3-5 domain-specific Rationalizations
5. Every domain-specific Red Flag contains a quoted phrase the agent would say (mechanically verifiable)
6. Every domain-specific Rationalization names the exact bad reasoning in quotes and states why it is wrong
7. New sections are placed immediately before the Escalation section in every upgraded skill
8. No existing SKILL.md content is removed or altered — all changes are additive
9. `harness validate` passes after all upgrades

## Implementation Order

1. **Phase 1: Template** — Create `agents/skills/templates/` directory and write `discipline-template.md` with universal patterns and authoring guidance for domain-specific content
2. **Phase 2: Workflow skills** — Upgrade `harness-code-review`, `harness-security-scan`, `harness-architecture-advisor`, `harness-enforce-architecture`. These skills run most frequently and calibrate the pattern before applying to domain skills.
3. **Phase 3: Domain skills** — Upgrade `harness-auth`, `harness-api-design`, `harness-database`, `harness-deployment`. Apply the pattern validated in Phase 2 to high-risk domain skills.
4. **Phase 4: Validation** — Run `harness validate` across all upgraded skills. Verify no regressions in existing skill behavior. Confirm section placement consistency.
