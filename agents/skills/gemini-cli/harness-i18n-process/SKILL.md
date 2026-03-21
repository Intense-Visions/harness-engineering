# Harness i18n Process

> Cognitive mode: **advisory-guide**. Inject i18n considerations into brainstorming, planning, and review workflows. Adapt enforcement based on project configuration — gentle prompts when unconfigured, gate-mode validation when enabled.

## When to Use

- When `on_new_feature` triggers fire and the feature may touch user-facing strings
- When `on_review` triggers fire to validate i18n was considered in specs, plans, or code
- When brainstorming a feature that will have user-facing text, labels, messages, or notifications
- When planning tasks for a feature that involves UI, API responses, emails, or notifications
- When reviewing code changes that add or modify user-facing strings
- NOT for scanning code for i18n violations (use harness-i18n)
- NOT for setting up translation infrastructure (use harness-i18n-workflow)
- NOT for performing translations (use TMS tools or MCP integrations)

## Core Principle

**Make i18n impossible to forget.**

This skill does not scan code or manage translations. It ensures that i18n is considered at every stage of the development process — before code is written, while it is being planned, and when it is being reviewed. It operates in two modes:

- **Prompt mode** (default): Non-blocking nudges that seed i18n awareness. Used when i18n is not configured or is disabled. The goal is to make teams aware of i18n considerations without being annoying.
- **Gate mode** (configured): Validation that enforces i18n requirements. Used when `i18n.enabled: true` in `harness.config.json`. The strictness level (`permissive`, `standard`, `strict`) controls whether missing i18n produces informational notes, warnings, or blocking errors.

If you find yourself scanning source code for hardcoded strings, STOP. That is `harness-i18n`'s job. This skill operates on artifacts (specs, plans, reviews), not source code.

## Process

### Phase 1: CHECK-CONFIG — Determine Operating Mode

1. **Read harness configuration.** Check `harness.config.json` for the `i18n` block:
   - If `i18n.enabled: true` exists: enter **gate mode**. Load `i18n.strictness` (default: `standard`).
   - If `i18n.enabled: false` exists: enter **prompt mode** with reduced frequency. The team explicitly disabled i18n — respect that, but still nudge on obviously international features.
   - If no `i18n` block exists: enter **prompt mode**. The team has not considered i18n yet — this is where the skill adds the most value.

2. **Load context from configuration (gate mode only).** When in gate mode, read:
   - `i18n.targetLocales` — which locales are supported. Use this to provide specific guidance (e.g., "You are targeting Arabic — have you considered RTL layout for this feature?").
   - `i18n.platforms` — which platforms are in scope. Only validate i18n for relevant platforms.
   - `i18n.industry` — load industry-specific i18n guidance from `agents/skills/shared/i18n-knowledge/industries/{industry}.yaml` if configured.
   - `i18n.strictness` — determines enforcement level:
     - `permissive`: informational notes only, never block
     - `standard`: warnings for missing i18n in user-facing features, do not block
     - `strict`: errors that block progression when i18n is unaddressed

3. **Determine the current workflow context.** Identify which workflow triggered this skill:
   - **Brainstorming** (`on_new_feature` during `harness-brainstorming`): inject during Phase 2 EVALUATE.
   - **Planning** (`on_new_feature` during `harness-planning`): inject during task decomposition.
   - **Review** (`on_review` during `harness-code-review` or `harness-pre-commit-review`): inject during review checklist.

---

### Phase 2: INJECT — Add i18n Considerations

#### Prompt Mode (unconfigured or disabled)

Inject non-blocking i18n consideration prompts at the appropriate workflow point. These are suggestions, not requirements. Present them as questions the team should consider.

**During brainstorming (Phase 2 EVALUATE):**

Add the following consideration to the evaluation criteria:

```
i18n Consideration
==================
For this feature, which user-facing strings will need translation?
Consider:
- UI labels, button text, placeholder text, error messages
- Email or notification content
- API error responses shown to users
- Date, number, and currency formatting
- Text that may expand significantly in other languages (+35% for German, +60% for Finnish)
- Content that may need right-to-left layout (Arabic, Hebrew)

If this feature will be used by an international audience, consider enabling i18n:
Run `harness skill run harness-i18n-workflow` to set up translation infrastructure.
```

**During planning (task decomposition):**

Suggest adding i18n tasks to the plan:

```
i18n Tasks to Consider
======================
If this feature includes user-facing strings, consider adding these tasks:
- [ ] Extract user-facing strings into translation keys
- [ ] Update translation files for all target locales
- [ ] Run pseudo-locale testing to check for text overflow and truncation
- [ ] Verify date/number/currency formatting uses locale-aware APIs
- [ ] Test RTL layout if targeting RTL locales
```

**During code review:**

Add i18n items to the review checklist:

```
i18n Review Checklist
=====================
- [ ] No new hardcoded user-facing strings (should use translation keys)
- [ ] Date/number/currency formatting uses Intl APIs or framework equivalents
- [ ] No string concatenation for user-facing messages (use interpolation)
- [ ] New UI elements have adequate space for text expansion
- [ ] lang and dir attributes are set appropriately
```

#### Gate Mode (i18n.enabled: true)

Validate that the artifact under review addresses i18n requirements. The enforcement level depends on `i18n.strictness`.

**During brainstorming (Phase 2 EVALUATE):**

Check whether the feature evaluation discusses locale considerations. If the feature involves user-facing content and does not mention i18n:

- `permissive`: add an informational note suggesting locale considerations
- `standard`: add a warning: "This feature involves user-facing strings but does not discuss i18n requirements. Consider which strings need translation and which locales are affected."
- `strict`: add an error: "This feature involves user-facing strings but does not address i18n. Add a locale requirements section before proceeding."

When target locales are configured, provide specific guidance based on locale profiles from `agents/skills/shared/i18n-knowledge/locales/`:

- If `ar` or `he` in target locales: "This feature needs RTL layout consideration."
- If `de` or `fi` in target locales: "Expect 35-60% text expansion. Verify UI can accommodate longer strings."
- If `ja`, `zh-Hans`, or `ko` in target locales: "CJK scripts may need different font sizing and line-break rules."

**During planning (task decomposition):**

Validate that the plan includes i18n-related tasks for features that touch user-facing content. Check for:

- At least one task mentioning string extraction, translation keys, or i18n
- At least one task mentioning translation file updates (if target locales exist)
- At least one task mentioning locale testing or pseudo-localization (if strictness is standard or strict)

If missing:

- `permissive`: note suggesting i18n tasks
- `standard`: warning: "Plan for a user-facing feature does not include i18n tasks. Add tasks for string extraction, translation file updates, and locale testing."
- `strict`: error: "Plan for a user-facing feature is missing required i18n tasks. Add at minimum: string extraction task, translation update task. Plan cannot proceed without i18n coverage."

**During code review:**

Validate that the review artifact addresses i18n considerations. Do NOT scan source code directly — that is `harness-i18n`'s responsibility. Instead, check the review context:

- Does the PR description mention i18n impact (new strings, locale changes, formatting)?
- If the PR touches user-facing components (based on file paths and PR description), was `harness-i18n` run as part of the review?
- Does the review checklist include i18n items (hardcoded string check, locale-aware formatting)?

If the review does not address i18n for a user-facing change:

- `permissive`: informational note suggesting i18n review items
- `standard`: warning: "PR touches user-facing code but i18n was not addressed in the review. Recommend running `harness-i18n` on the changed files."
- `strict`: error: "PR touches user-facing code and i18n review is required. Run `harness-i18n` on the changed files before merging."

---

### Phase 3: VALIDATE — Verify i18n Was Addressed

After the inject phase, verify that the output artifact addresses i18n.

#### For Specs (brainstorming output)

Check the spec document for i18n coverage:

- Does it contain a "Localization", "i18n", or "Internationalization" section?
- Does it mention which strings are user-facing?
- Does it mention which locales are affected?
- Does it mention locale-specific formatting requirements (dates, numbers, currency)?

**Gate mode enforcement:**

- `permissive`: log result, do not block
- `standard`: warn if missing but allow progression
- `strict`: block progression if the spec lacks an i18n section and the feature touches user-facing content

#### For Plans (planning output)

Check the plan document for i18n tasks:

- Does it include at least one task with i18n-related keywords (i18n, translation, locale, localization, l10n)?
- Do the i18n tasks cover: extraction, file updates, and testing?

**Gate mode enforcement:**

- `permissive`: log result, do not block
- `standard`: warn if no i18n tasks found for user-facing feature
- `strict`: block progression if no i18n tasks exist

#### For Reviews (code review output)

Check the review output:

- Were i18n checklist items addressed?
- Were any new hardcoded strings flagged?
- If hardcoded strings were found, were they resolved or explicitly accepted?

**Gate mode enforcement:**

- `permissive`: log result, do not block
- `standard`: warn if i18n checklist was not completed
- `strict`: block if new hardcoded strings exist without explicit acceptance

#### Validation Report

Output a summary of the i18n validation:

```
i18n Process Validation
=======================
Mode:           gate (standard)
Workflow:        planning
Artifact:        docs/plans/2026-03-20-checkout-redesign-plan.md

Checks:
[PASS] Plan contains i18n-related task (Task 7: "Extract checkout strings")
[PASS] Plan includes translation file update task (Task 8: "Update locale files")
[WARN] Plan does not include pseudo-locale testing task

Result: PASS with warnings
```

## Harness Integration

- **`harness-brainstorming`** — Injects i18n considerations during Phase 2 (EVALUATE). In prompt mode, adds a suggestion block. In gate mode, validates that locale requirements are discussed.
- **`harness-planning`** — Injects i18n task suggestions during task decomposition. In gate mode, validates that the plan includes i18n tasks for user-facing features.
- **`harness-code-review`** / **`harness-pre-commit-review`** — Adds i18n checklist items to the review. In gate mode, validates that no new hardcoded strings are introduced.
- **`harness-i18n`** — The process skill defers detailed code scanning to the core i18n skill. During review, the process skill does a lightweight check; the full scan is harness-i18n's responsibility.
- **`harness-i18n-workflow`** — The process skill recommends running the workflow skill when i18n is not yet configured. In prompt mode, it suggests `harness skill run harness-i18n-workflow` for setup.
- **Knowledge base** at `agents/skills/shared/i18n-knowledge/` — Locale profiles provide specific guidance for configured target locales. Industry profiles provide domain-specific i18n prompts.
- **`harness.config.json`** — The `i18n` block drives mode selection and enforcement level. When the config changes, the skill automatically adapts its behavior.

## Success Criteria

- When i18n is unconfigured, brainstorming/planning receive a non-blocking nudge about locale considerations
- When `i18n.enabled: true` and `strictness: "standard"`, specs/plans missing i18n handling produce a warning
- When `i18n.enabled: true` and `strictness: "strict"`, specs/plans missing i18n handling produce an error that blocks progression
- Prompt mode suggestions are contextual -- they reference the feature being discussed, not generic boilerplate
- Gate mode validation references configured target locales and their specific requirements
- The skill never scans source code directly -- that is harness-i18n's job
- `harness validate` passes after all changes

## Examples

### Example 1: Prompt Mode During Brainstorming (Unconfigured Project)

**Context:** Team is brainstorming a new checkout flow. Project has no i18n configuration.

**Phase 1: CHECK-CONFIG**

No `i18n` block found in `harness.config.json`. Entering prompt mode.

**Phase 2: INJECT (brainstorming EVALUATE)**

```
i18n Consideration
==================
For the checkout flow, which user-facing strings will need translation?
Consider:
- Payment form labels ("Card number", "Expiry date", "CVV")
- Error messages ("Invalid card number", "Payment declined")
- Order summary text ("Subtotal", "Tax", "Total")
- Currency formatting (not all locales use $ or decimal points)
- Address form fields (vary significantly by country)

If this feature will be used by an international audience, consider enabling i18n:
Run `harness skill run harness-i18n-workflow` to set up translation infrastructure.
```

**Phase 3: VALIDATE**

```
i18n Process Validation
=======================
Mode:           prompt (unconfigured)
Workflow:        brainstorming
Result:         Suggestion provided (non-blocking)
```

### Example 2: Gate Mode During Planning (Configured Project, Standard Strictness)

**Context:** E-commerce project with i18n enabled, targeting es, fr, de, ja, ar. Planning a new product review feature.

**Phase 1: CHECK-CONFIG**

```
i18n config loaded:
  enabled: true
  strictness: standard
  targetLocales: [es, fr, de, ja, ar]
  platforms: [web]
  industry: ecommerce
Entering gate mode (standard).
```

**Phase 2: INJECT (planning task decomposition)**

Scanning plan for i18n tasks... Found 0 i18n-related tasks in the plan.

```
[WARN] i18n Tasks Missing
=========================
This plan covers a user-facing feature (product reviews) but includes no i18n tasks.
Your project targets 5 locales: es, fr, de, ja, ar.

Required i18n tasks for this feature:
- Extract review form labels and messages into translation keys
- Update translation files for es, fr, de, ja, ar
- Verify RTL layout for Arabic locale (review cards, rating display, text input)
- Test text expansion for German (+35%) on review form labels
- Add pseudo-locale testing for overflow detection

Industry note (ecommerce): Product reviews often contain user-generated content.
Ensure the review display component handles mixed-direction text (user reviews
in Arabic within an English UI, or vice versa).
```

**Phase 3: VALIDATE**

```
i18n Process Validation
=======================
Mode:           gate (standard)
Workflow:        planning
Artifact:        docs/plans/2026-03-20-product-reviews-plan.md

Checks:
[FAIL] No i18n-related tasks found in plan
[FAIL] No translation file update tasks
[FAIL] No locale testing tasks

Result: WARNING -- plan should include i18n tasks before execution
```

### Example 3: Gate Mode During Review (Configured Project, Strict)

**Context:** SaaS project with `strictness: "strict"`. Reviewing a PR that adds a new settings page.

**Phase 1: CHECK-CONFIG**

Entering gate mode (strict).

**Phase 2: INJECT (code review)**

```
i18n Review Validation
======================
Checking review context for i18n coverage...

PR: "Add settings page" (#142)
Changed files: src/components/Settings.tsx, src/components/SettingsForm.tsx
PR description mentions: new UI components, form fields, toast notifications

i18n review status:
  - PR description does not mention i18n impact: MISSING
  - harness-i18n scan not referenced in review: MISSING
  - Review checklist does not include i18n items: MISSING

[ERROR] PR touches user-facing code and i18n review is required.
Run `harness-i18n` on the changed files before merging.
Recommended: harness skill run harness-i18n --scope file --path src/components/Settings.tsx src/components/SettingsForm.tsx
```

**Phase 3: VALIDATE**

```
i18n Process Validation
=======================
Mode:           gate (strict)
Workflow:        review
Result:         BLOCKED -- i18n review not conducted for user-facing PR
Action:         Run harness-i18n scan on changed files, address findings, then re-review
```

## Gates

These are hard stops. Violating any gate means the process has broken down.

- **No source code scanning.** This skill operates on artifacts (specs, plans, review context), not source code. If you are running Grep/Glob on `.tsx` files to find hardcoded strings, STOP. That is `harness-i18n`'s job. During the review phase, check the review artifact (PR description, checklist, whether `harness-i18n` was run) — never scan the code directly.
- **Respect the configured mode.** If `i18n.enabled: false`, do not enforce gate-mode validation. If `i18n.enabled: true`, do not downgrade to prompt mode. The team made a configuration choice -- honor it.
- **Respect the configured strictness.** `permissive` never blocks. `standard` warns but does not block. `strict` blocks. Do not escalate or de-escalate the enforcement level.
- **Prompt mode is always dismissible.** In prompt mode, suggestions must be presented as questions or checklists the team can acknowledge and move past. Never block progression in prompt mode.
- **Gate mode requires specificity.** When flagging a missing i18n section or task, state exactly what is expected. "Add i18n section" is not specific enough. "Add a Localization section covering: which strings are user-facing, which locales are affected, formatting requirements" is specific.

## Escalation

- **When the feature clearly has no user-facing strings:** Skip injection. Not every feature needs i18n. Internal tooling, background jobs, data migrations, and infrastructure changes should not receive i18n prompts. Use judgment based on the feature description.
- **When the team repeatedly dismisses prompt-mode suggestions:** Do not escalate to gate mode. That is a configuration decision the team must make. Instead, note: "If i18n is relevant to your project, consider enabling it: run `harness skill run harness-i18n-workflow` to configure."
- **When gate-mode validation blocks a plan that genuinely does not need i18n:** The team can either add an explicit "i18n: not applicable -- this feature has no user-facing strings" note to the plan, or adjust `i18n.strictness` to `standard` or `permissive`.
- **When the spec/plan addresses i18n but not for all configured target locales:** In standard mode, warn about the gap. In strict mode, require explicit acknowledgment of which locales are deferred and why.
- **When industry-specific guidance conflicts with team practice:** Present the industry guidance as a recommendation, not a requirement. The team's established patterns take precedence unless strictness is set to strict.
