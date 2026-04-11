# Plan: UX Writing Phase 2 -- Contextual Knowledge Skills

**Date:** 2026-04-10
**Spec:** docs/changes/ux-writing-knowledge-skills/proposal.md
**Estimated tasks:** 20
**Estimated time:** 85 minutes

## Goal

Create 17 contextual UX writing knowledge skills (`ux-` prefix, Phase 2) with full platform parity across claude-code, gemini-cli, cursor, and codex, building on the 8 foundation skills from Phase 1.

## Observable Truths (Acceptance Criteria)

1. When listing `agents/skills/claude-code/ux-*/`, the system shall show 25 directories total -- 8 foundation skills from Phase 1 plus 17 new contextual skills.
2. Each of the 17 new skill directories shall contain both `skill.yaml` and `SKILL.md` in all 4 platform directories (claude-code, gemini-cli, cursor, codex) -- 68 directories total, 136 files total.
3. Each `SKILL.md` shall be 150-250 lines, start with an `# H1` heading, contain `## When to Use`, `## Instructions`, `## Details` (with `### Anti-Patterns` subsection containing at least 3 anti-patterns and `### Real-World Examples` subsection with at least 2 worked examples from real production systems), `## Source`, `## Process`, `## Harness Integration`, `## Success Criteria`.
4. Each `skill.yaml` shall pass `SkillMetadataSchema` validation with `type: knowledge`, `tier: 3`, `cognitive_mode: advisory-guide`, `triggers: [manual]`, `platforms: [claude-code, gemini-cli, cursor, codex]`, `tools: []`.
5. Each `skill.yaml` shall contain `related_skills` referencing 1-3 foundation `ux-*` skills and any relevant `design-*` or `a11y-*` skills per the spec cross-reference table.
6. The platform parity test (`agents/skills/tests/platform-parity.test.ts`) shall pass for all 17 new skills -- identical `skill.yaml` and `SKILL.md` across all 4 platforms.
7. Running `cd agents/skills && npx vitest run tests/schema.test.ts` shall pass with no new failures.
8. Running `harness validate` shall pass after all tasks are complete.

## File Map

```
CREATE agents/skills/claude-code/ux-error-messages/{skill.yaml,SKILL.md}
CREATE agents/skills/claude-code/ux-error-severity/{skill.yaml,SKILL.md}
CREATE agents/skills/claude-code/ux-empty-states/{skill.yaml,SKILL.md}
CREATE agents/skills/claude-code/ux-onboarding-copy/{skill.yaml,SKILL.md}
CREATE agents/skills/claude-code/ux-button-cta-copy/{skill.yaml,SKILL.md}
CREATE agents/skills/claude-code/ux-form-labels/{skill.yaml,SKILL.md}
CREATE agents/skills/claude-code/ux-confirmation-dialogs/{skill.yaml,SKILL.md}
CREATE agents/skills/claude-code/ux-notification-copy/{skill.yaml,SKILL.md}
CREATE agents/skills/claude-code/ux-tooltip-contextual-help/{skill.yaml,SKILL.md}
CREATE agents/skills/claude-code/ux-loading-states/{skill.yaml,SKILL.md}
CREATE agents/skills/claude-code/ux-success-feedback/{skill.yaml,SKILL.md}
CREATE agents/skills/claude-code/ux-navigation-labels/{skill.yaml,SKILL.md}
CREATE agents/skills/claude-code/ux-permission-access-copy/{skill.yaml,SKILL.md}
CREATE agents/skills/claude-code/ux-settings-preferences/{skill.yaml,SKILL.md}
CREATE agents/skills/claude-code/ux-data-table-copy/{skill.yaml,SKILL.md}
CREATE agents/skills/claude-code/ux-search-copy/{skill.yaml,SKILL.md}
CREATE agents/skills/claude-code/ux-destructive-action-copy/{skill.yaml,SKILL.md}
CREATE agents/skills/gemini-cli/ux-error-messages/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-error-severity/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-empty-states/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-onboarding-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-button-cta-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-form-labels/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-confirmation-dialogs/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-notification-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-tooltip-contextual-help/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-loading-states/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-success-feedback/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-navigation-labels/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-permission-access-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-settings-preferences/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-data-table-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-search-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-destructive-action-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-error-messages/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-error-severity/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-empty-states/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-onboarding-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-button-cta-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-form-labels/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-confirmation-dialogs/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-notification-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-tooltip-contextual-help/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-loading-states/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-success-feedback/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-navigation-labels/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-permission-access-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-settings-preferences/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-data-table-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-search-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-destructive-action-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-error-messages/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-error-severity/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-empty-states/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-onboarding-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-button-cta-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-form-labels/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-confirmation-dialogs/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-notification-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-tooltip-contextual-help/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-loading-states/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-success-feedback/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-navigation-labels/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-permission-access-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-settings-preferences/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-data-table-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-search-copy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-destructive-action-copy/{skill.yaml,SKILL.md}  (copy)
```

**Total: 68 directories, 136 files (34 source files in claude-code + 102 identical copies across 3 platforms)**

## Skeleton

1. Wave A: Error and input skills (~7 tasks, ~30 min) -- ux-error-messages, ux-error-severity, ux-empty-states, ux-onboarding-copy, ux-button-cta-copy, ux-form-labels + checkpoint
2. Wave B: Interaction and feedback skills (~7 tasks, ~30 min) -- ux-confirmation-dialogs, ux-notification-copy, ux-tooltip-contextual-help, ux-loading-states, ux-success-feedback, ux-navigation-labels + checkpoint
3. Wave C: Specialized context skills (~5 tasks, ~20 min) -- ux-permission-access-copy, ux-settings-preferences, ux-data-table-copy, ux-search-copy, ux-destructive-action-copy
4. Final validation (~1 task, ~5 min) -- schema tests, parity tests, harness validate

**Estimated total:** 20 tasks, ~85 minutes

## Template Reference

All skills follow the exact pattern established by Phase 1 foundation skills (e.g., `agents/skills/claude-code/ux-microcopy-principles/`). Key structural decisions:

- **skill.yaml fields:** `name`, `version`, `description`, `cognitive_mode`, `type`, `tier`, `triggers`, `platforms`, `tools`, `paths`, `related_skills`, `stack_signals`, `keywords`, `metadata`, `state`, `depends_on`. Do NOT include `stability` (not in SkillMetadataSchema, causes test failures).
- **platforms list:** All 4 platforms listed in every copy (identical files across platforms, validated by platform-parity test).
- **SKILL.md sections for knowledge type:** `# Title`, `> blockquote description`, `## When to Use`, `## Instructions`, `## Details` (with `### Anti-Patterns` and `### Real-World Examples` subsections), `## Source`, `## Process`, `## Harness Integration`, `## Success Criteria`.
- **Platform distribution:** Identical copies of both files to all 4 platform directories.

### skill.yaml Template (adapt per skill)

```yaml
name: ux-<skill-name>
version: '1.0.0'
description: <one-line description matching SKILL.md blockquote>
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - <1-3 foundation ux-* skills>
  - <relevant design-* or a11y-* skills>
stack_signals: []
keywords:
  - <3-6 domain keywords>
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

### SKILL.md Template (adapt per skill)

```markdown
# <Title>

> <one-line description>

## When to Use

- 3-5 trigger scenarios
- 1-2 NOT-for exclusions

## Instructions

1. Numbered principles (5-8 per skill)
   - Each with real production examples (Stripe, GitHub, Slack, Notion, etc.)
   - Tables where comparison aids understanding

## Details

### <Subsection for deeper treatment>

<Deeper treatment of nuanced aspects>

### Anti-Patterns

1. <anti-pattern name.> <description with before/after examples>
2. <anti-pattern name.> <description with before/after examples>
3. <anti-pattern name.> <description with before/after examples>

### Real-World Examples

<2+ worked examples from real production systems>

## Source

- Citations with links (NNGroup, Google Material, Apple HIG, etc.)

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- 3-5 observable outcomes
```

### Platform Copy Command (run after each skill is created)

```bash
SKILL="ux-<name>"
BASE="agents/skills/claude-code/${SKILL}"
for PLATFORM in gemini-cli cursor codex; do
  mkdir -p "agents/skills/${PLATFORM}/${SKILL}"
  cp "${BASE}/skill.yaml" "agents/skills/${PLATFORM}/${SKILL}/skill.yaml"
  cp "${BASE}/SKILL.md" "agents/skills/${PLATFORM}/${SKILL}/SKILL.md"
done
```

## Skill Content Specifications

Each skill below includes: title, description (for skill.yaml and blockquote), related_skills, keywords, When to Use triggers, Instructions principles, Details subsections, Anti-Patterns, Real-World Example sources, and Source citations. The executor must write 150-250 lines of SKILL.md content following these specifications.

---

### 1. ux-error-messages

- **Title:** Error Messages
- **Description:** What went wrong, why it matters, how to fix it -- the three-part error pattern for clear, actionable error communication
- **Related skills:** `ux-microcopy-principles`, `ux-voice-tone`, `ux-plain-language`, `design-empty-error-states`, `design-feedback-patterns`
- **Keywords:** error-messages, validation, user-feedback, error-recovery, inline-errors
- **When to Use triggers:**
  - Writing form validation error messages (inline, summary, or toast)
  - Composing system error messages (500, timeout, connectivity)
  - Creating API error responses that surface to users
  - Writing permission-denied or authorization error text
  - NOT for: error logging or developer-facing error messages
  - NOT for: empty state copy (see ux-empty-states)
- **Instructions principles (5-8):**
  1. Use the three-part pattern: what went wrong, why, how to fix it. Stripe: "Your card was declined. The issuing bank did not approve the transaction. Try a different payment method or contact your bank."
  2. Place errors inline next to the field that caused them -- not in a summary banner alone. GitHub's form validation highlights the specific field in red with the message directly below.
  3. Write errors in plain language, never expose technical codes or stack traces. "Something went wrong" is better than "Error 500: Internal Server Exception" -- but "We couldn't save your changes. Try again in a few minutes." is better than both.
  4. Use the same voice as the rest of the product -- errors are not exempt from tone guidelines. Slack's error messages maintain conversational tone even when things break.
  5. Tell the user what to do next -- every error must have a recovery path. If no user action can fix it, say when the team is investigating or when to retry.
  6. Do not blame the user. "That password is too short" not "You entered an invalid password." Passive attribution to the input, not the person.
  7. Be specific about constraints. "Password must be at least 8 characters" not "Invalid password." Stripe shows exact requirements that are not met.
  8. Differentiate between field-level and page-level errors. Field-level: "Email address is required." Page-level: "2 fields need your attention" with links to each.
- **Details subsections:**
  - Error Message Anatomy (the three-part structure with table showing each part)
  - Inline vs Summary vs Toast Error Placement (when to use each, with examples)
  - Error Tone Calibration (how severity affects word choice)
- **Anti-Patterns (3+):**
  1. The Cryptic Code -- showing error codes, technical jargon, or stack traces to users
  2. The Blame Game -- "You entered an invalid value" instead of "This field requires a number"
  3. The Dead End -- error messages with no recovery path or next step
  4. The Generic Catch-All -- "Something went wrong" with no additional context or action
- **Real-World Examples:** Stripe's payment error flow, GitHub's form validation, Notion's sync error handling
- **Source citations:** NNGroup "Error Message Guidelines," Google Material Design error states, Microcopy: The Complete Guide ch. 7

---

### 2. ux-error-severity

- **Title:** Error Severity Communication
- **Description:** Calibrating error tone to severity -- field validation vs system failure vs data loss, matching urgency to consequence
- **Related skills:** `ux-error-messages`, `ux-microcopy-principles`, `ux-voice-tone`, `design-feedback-patterns`
- **Keywords:** error-severity, validation, system-errors, data-loss, warning-levels, tone-calibration
- **When to Use triggers:**
  - Deciding between warning, error, and critical severity for a message
  - Writing data loss or irreversible action warnings
  - Calibrating tone for field validation vs system outage
  - Designing error hierarchies for forms with multiple issues
  - NOT for: error message content and structure (see ux-error-messages)
  - NOT for: destructive action confirmation dialogs (see ux-destructive-action-copy)
- **Instructions principles (5-8):**
  1. Map severity to visual and textual weight -- field validation is calm and instructional, system errors are direct, data loss is urgent and specific.
  2. Use a four-tier severity model: info (blue), warning (yellow/amber), error (red), critical (red + icon + blocking). Each tier has distinct copy patterns.
  3. Match punctuation and sentence structure to severity -- suggestions use periods, critical errors use direct imperatives.
  4. Never escalate minor issues to high severity -- "password too short" is not a critical error. Overuse of red/urgent styling trains users to ignore real warnings.
  5. For data-loss scenarios, name the specific data at risk. "Your unsaved changes will be lost" not "Are you sure?"
  6. System errors should communicate timeline -- "We're looking into this" vs "Try again in a few minutes" vs "Service unavailable until 3:00 PM EST."
- **Details subsections:**
  - Severity Tier Matrix (table: tier, visual treatment, copy pattern, example)
  - Escalation Patterns (when to upgrade severity based on frequency or impact)
  - Recovery Urgency Mapping (how recovery instructions change by severity)
- **Anti-Patterns (3+):**
  1. The Boy Who Cried Wolf -- every error styled as critical, desensitizing users to actual emergencies
  2. The Calm Catastrophe -- data loss warnings that use the same casual tone as field validation
  3. The Severity Mismatch -- red error styling on informational messages like "Email already subscribed"
- **Real-World Examples:** Figma's autosave conflict resolution, AWS Console's tiered alert system, VS Code's problem panel severity levels
- **Source citations:** NNGroup "Indicators, Validations, and Notifications," Apple HIG alerts and notifications, Material Design component guidelines for snackbars/banners

---

### 3. ux-empty-states

- **Title:** Empty States
- **Description:** First-use, user-cleared, and no-results empty states -- motivating action, setting expectations, and turning blank screens into onramps
- **Related skills:** `ux-microcopy-principles`, `ux-onboarding-copy`, `ux-writing-for-scanning`, `design-empty-error-states`, `design-loading-patterns`
- **Keywords:** empty-states, first-use, zero-data, no-results, onboarding, blank-slate
- **When to Use triggers:**
  - Designing first-use screens when a user has no data yet
  - Writing zero-results messages for search or filter operations
  - Creating user-cleared states after all items are completed or removed
  - Writing error-state empty screens (failed to load content)
  - NOT for: loading states before data arrives (see ux-loading-states)
  - NOT for: onboarding flows and welcome sequences (see ux-onboarding-copy)
- **Instructions principles (5-8):**
  1. Classify the empty state type -- first-use, user-cleared, no-results, and error each need different copy. First-use motivates. User-cleared celebrates. No-results guides. Error explains.
  2. Always include one clear CTA. Notion's empty page: "Press '/' for commands." GitHub's empty repo: "Create a new file or upload an existing file." One action, not a menu.
  3. Show the value of filling the empty state, not just how to fill it. "Track your team's progress" is motivating. "Click 'New Project' to create a project" is mechanical.
  4. For no-results, suggest specific recovery actions. "No results for 'reciepe'. Did you mean 'recipe'?" or "Try broadening your search or removing filters."
  5. Keep empty state copy under 3 sentences. The screen is already sparse -- a paragraph of text makes it feel heavier, not more helpful.
  6. Use illustrations judiciously -- an illustration without actionable text is decoration, not UX.
- **Details subsections:**
  - Empty State Type Matrix (table: type, goal, tone, CTA pattern, example)
  - First-Use vs Returning-User Empty States (different messaging for new vs experienced)
  - No-Results Recovery Patterns (spelling suggestions, filter relaxation, browse alternatives)
- **Anti-Patterns (3+):**
  1. The Barren Wasteland -- completely blank screen with no guidance, just whitespace
  2. The Instruction Manual -- paragraphs of explanation on how to use the feature in an empty state
  3. The Sad Illustration -- decorative illustration with no actionable text or CTA
- **Real-World Examples:** Notion's blank page experience, GitHub's empty repository setup, Slack's empty channel state, Linear's no-results search
- **Source citations:** NNGroup "The Power of Empty States," Material Design empty states guidance, Invision's Empty States design patterns

---

### 4. ux-onboarding-copy

- **Title:** Onboarding Copy
- **Description:** Progressive disclosure, value-first framing, reducing anxiety, and welcome flows that convert sign-ups into active users
- **Related skills:** `ux-microcopy-principles`, `ux-voice-tone`, `ux-writing-for-scanning`, `ux-empty-states`
- **Keywords:** onboarding, welcome-flow, first-run, progressive-disclosure, activation, setup-wizard
- **When to Use triggers:**
  - Writing welcome screens and first-run experiences
  - Creating setup wizard step descriptions and progress indicators
  - Writing feature discovery tooltips and coach marks
  - Composing trial/freemium upgrade prompts during onboarding
  - NOT for: empty states after onboarding is complete (see ux-empty-states)
  - NOT for: tooltip and contextual help patterns outside onboarding (see ux-tooltip-contextual-help)
- **Instructions principles (5-8):**
  1. Lead with value, not features. "Start tracking your team's progress" not "Welcome to Project Management Tool v3.2." Slack's onboarding: "You're all set. Now invite your team."
  2. One action per screen. Multi-step wizards must focus each step on a single decision. Notion's onboarding asks one question per screen: "What will you use Notion for?"
  3. Show progress transparently. "Step 2 of 4" removes anxiety about how long setup will take. Never hide the total number of steps.
  4. Use progressive disclosure -- do not explain everything on the first screen. Figma introduces tools one at a time through contextual prompts, not a feature tour.
  5. Reduce anxiety about reversibility. "You can change this later in Settings" removes commitment paralysis. Stripe's onboarding reassures: "You can update your business details anytime."
  6. Skip steps where possible. "Skip for now" should be available on non-critical setup steps. Forced completion drives abandonment.
  7. Celebrate completion. The final onboarding screen should confirm success and point to the first real action. "You're ready. Create your first project."
- **Details subsections:**
  - Onboarding Flow Types (setup wizard, progressive coach marks, contextual discovery)
  - Step Copy Structure (title, description, CTA, skip option, progress indicator)
  - Anxiety Reducers (reversibility, social proof, time estimates)
- **Anti-Patterns (3+):**
  1. The Feature Tour -- walking users through every feature before they can use the product
  2. The Commitment Trap -- forcing users to make irreversible decisions during onboarding without a "change later" option
  3. The Information Dump -- showing all settings and options on the first screen instead of progressive disclosure
- **Real-World Examples:** Slack's workspace setup flow, Notion's personalization onboarding, Stripe's business verification wizard, Figma's interactive tutorial
- **Source citations:** NNGroup "User Onboarding UX Patterns," Appcues State of User Onboarding report, Samuel Hulick -- _The Elements of User Onboarding_

---

### 5. ux-button-cta-copy

- **Title:** Button and CTA Copy
- **Description:** Verb-noun pattern, specificity over vagueness, context-sensitive labels, and writing buttons that tell users exactly what will happen
- **Related skills:** `ux-microcopy-principles`, `ux-active-voice`, `ux-plain-language`
- **Keywords:** buttons, cta, call-to-action, verb-noun, action-labels, submit-buttons
- **When to Use triggers:**
  - Writing primary and secondary action button labels
  - Naming CTA buttons in modals, dialogs, and forms
  - Writing link text that acts as an action trigger
  - Choosing between generic and specific button labels
  - NOT for: navigation links and menu items (see ux-navigation-labels)
  - NOT for: confirmation dialog button patterns (see ux-confirmation-dialogs)
- **Instructions principles (5-8):**
  1. Use the verb-noun pattern: "Save draft," "Delete project," "Send invitation." The verb names the action, the noun names the object. Stripe: "Add payment method." GitHub: "Create pull request."
  2. Never use generic verbs alone -- "OK," "Submit," "Confirm," "Done," "Yes," "No" are all ambiguous without context. Linear: "Create issue" not "Submit."
  3. Match the button label to the page context. A form that creates an account should have "Create account" not "Submit." A form that sends a message should have "Send message" not "Done."
  4. Primary buttons get specific verbs; secondary buttons get safe defaults. "Delete project" (primary, destructive) and "Cancel" (secondary, safe). Never put the destructive action on the safe-looking button.
  5. Keep button text to 1-4 words. If you need more words, the action is too complex for a single button -- split it into steps.
  6. Front-load the verb. "Export CSV" not "CSV Export." "Create team" not "New team creation."
  7. For stateful buttons, show the current action: "Save" becomes "Saving..." becomes "Saved." Figma's save button reflects the real-time state.
- **Details subsections:**
  - Button Label Length Guidelines (table: button type, word count, examples)
  - Primary vs Secondary vs Tertiary Label Conventions
  - Stateful Button Copy (idle, loading, success, error states)
- **Anti-Patterns (3+):**
  1. The Generic Submit -- using "Submit" on every form regardless of what the form does
  2. The Ambiguous Pair -- "Yes" and "No" buttons that require re-reading the question to understand
  3. The Noun Button -- buttons that are just nouns ("Settings," "Report") without verbs, leaving the action unclear
- **Real-World Examples:** Stripe's checkout CTA ("Pay $49.99"), GitHub's PR merge button states, Linear's issue creation flow, Notion's page action buttons
- **Source citations:** NNGroup "Writing Clear Button Labels," Material Design button guidelines, Apple HIG buttons documentation

---

### 6. ux-form-labels

- **Title:** Form Labels and Helper Text
- **Description:** Label clarity, helper text placement, placeholder anti-patterns, required-field indication, and writing forms that users complete without confusion
- **Related skills:** `ux-microcopy-principles`, `ux-plain-language`, `ux-error-messages`, `design-form-ux`, `a11y-form-patterns`
- **Keywords:** form-labels, helper-text, placeholder, required-fields, input-labels, field-descriptions
- **When to Use triggers:**
  - Writing form field labels and descriptions
  - Adding helper text, hints, or format examples below fields
  - Deciding what to put in placeholder text vs labels
  - Indicating required vs optional fields
  - Writing fieldset legends and form section headers
  - NOT for: form validation error messages (see ux-error-messages)
  - NOT for: form layout and visual design (see design-form-ux)
- **Instructions principles (5-8):**
  1. Labels must be visible at all times -- never rely on placeholder text as the only label. Placeholders disappear on focus, leaving users without context. This is both a UX and accessibility failure.
  2. Use the shortest unambiguous label. "Email" not "Email address" if context is clear. "Full name" not "Please enter your first and last name." Stripe: "Card number" -- two words.
  3. Place helper text below the field, not above. Helper text above competes with the label; below, it supports the input. GitHub: "This will be the name of your repository" below the repo name field.
  4. Use placeholders only for format examples, never for instructions. Placeholder: "jane@example.com" (format). Not placeholder: "Enter your email address" (instruction that vanishes).
  5. Mark the minority -- if most fields are required, mark only optional ones "(optional)." If most are optional, mark only required ones with asterisk. Never mark both.
  6. Group related fields with clear section headers. "Billing address" and "Shipping address" are distinct sections, not one long form.
  7. Show constraints before the user encounters them. "Must be at least 8 characters" as helper text prevents errors before they happen.
- **Details subsections:**
  - Label vs Placeholder vs Helper Text (table showing purpose, persistence, and examples for each)
  - Required/Optional Field Indication Patterns
  - Accessibility Requirements for Form Labels (programmatic association, screen reader considerations)
- **Anti-Patterns (3+):**
  1. The Placeholder-as-Label -- using placeholder text as the only label, which disappears when users type
  2. The Redundant Stack -- label "Name," placeholder "Enter your name," helper text "Type your name here" -- three elements saying the same thing
  3. The Hidden Constraint -- not revealing field requirements until after submission fails
- **Real-World Examples:** Stripe's payment form (minimal labels, format-only placeholders), GitHub's repository creation form, Shopify's address form patterns
- **Source citations:** NNGroup "Placeholders in Form Fields Are Harmful," Material Design text field guidelines, Apple HIG text fields, W3C WCAG 1.3.1 Info and Relationships

---

### 7. ux-confirmation-dialogs

- **Title:** Confirmation Dialogs
- **Description:** Destructive action copy, consequence clarity, specific button labels, and writing dialogs that prevent accidental actions without creating friction
- **Related skills:** `ux-microcopy-principles`, `ux-button-cta-copy`, `ux-voice-tone`, `design-feedback-patterns`
- **Keywords:** confirmation-dialogs, destructive-actions, modal-copy, dialog-buttons, consequence-clarity
- **When to Use triggers:**
  - Writing confirmation dialogs for destructive or irreversible actions
  - Composing dialog titles, body text, and button labels
  - Deciding when a confirmation dialog is warranted vs unnecessary friction
  - Writing double-confirmation patterns for high-risk actions
  - NOT for: informational or notification modals (see ux-notification-copy)
  - NOT for: generic button labeling outside dialogs (see ux-button-cta-copy)
- **Instructions principles (5-8):**
  1. Title the dialog with the action as a question. "Delete this project?" not "Are you sure?" or "Confirm deletion." The user must know what action they are confirming without reading the body.
  2. Body text states the specific consequence in one sentence. "This will permanently delete 'Acme Dashboard' and all 47 tasks. This action cannot be undone." Name the object, quantify the impact, state reversibility.
  3. Primary action button uses the destructive verb: "Delete project," "Remove member," "Cancel subscription." Never "OK," "Yes," or "Confirm."
  4. Secondary (safe) button says "Cancel" or names the safe alternative: "Keep project." Never use ambiguous pairs like "Yes"/"No."
  5. Use destructive button styling (red) for irreversible actions. Non-destructive confirmations (e.g., "Publish article?") use standard primary styling.
  6. For the most dangerous actions, add friction: type-to-confirm patterns. GitHub requires typing the repository name before deleting. This prevents muscle-memory clicks.
  7. Do not use confirmation dialogs for reversible actions. If the user can undo, use a toast with "Undo" link instead. Slack does not confirm message deletion -- it shows "Message deleted" with an undo option.
- **Details subsections:**
  - Confirmation Dialog Anatomy (title, body, primary button, secondary button -- with examples)
  - When to Confirm vs When to Allow Undo (decision matrix)
  - Type-to-Confirm Patterns (when and how to implement)
- **Anti-Patterns (3+):**
  1. The Yes/No Trap -- "Are you sure?" with "Yes" and "No" buttons that require re-reading the question
  2. The Confirmation Fatigue -- confirming every action, even reversible ones, until users click "OK" without reading
  3. The Vague Consequence -- "Are you sure you want to continue?" with no explanation of what "continuing" does
- **Real-World Examples:** GitHub's repository deletion (type-to-confirm), Slack's undo pattern for reversible actions, Stripe's subscription cancellation flow, Notion's page deletion with trash recovery
- **Source citations:** NNGroup "Confirmation Dialogs Can Prevent User Errors," Material Design dialog guidelines, Apple HIG alert guidelines

---

### 8. ux-notification-copy

- **Title:** Notification Copy
- **Description:** Urgency calibration, actionability, toast vs banner vs modal decisions, and writing notifications users actually read
- **Related skills:** `ux-microcopy-principles`, `ux-voice-tone`, `ux-writing-for-scanning`, `design-feedback-patterns`
- **Keywords:** notifications, toast, snackbar, banner, push-notifications, alerts, urgency
- **When to Use triggers:**
  - Writing toast/snackbar messages for transient feedback
  - Composing banner notifications for persistent information
  - Writing push notification titles and body text
  - Deciding notification urgency and delivery channel
  - NOT for: error messages and validation (see ux-error-messages)
  - NOT for: confirmation dialogs and modals (see ux-confirmation-dialogs)
- **Instructions principles (5-8):**
  1. Match the notification channel to the urgency. Toast for transient acknowledgment ("Copied to clipboard"). Banner for persistent context ("Your trial ends in 3 days"). Modal for blocking decisions ("Update required").
  2. Lead with the outcome, not the event. "File uploaded" not "Upload process complete." "Jordan commented on your PR" not "New comment notification."
  3. Keep toasts to one sentence, under 120 characters. The user has 3-5 seconds to read before it disappears. Slack: "Message pinned."
  4. Include an action when relevant. "Changes saved. Undo" is more useful than "Changes saved." The action must be immediately clickable.
  5. Banners must explain why they persist. "Your account is limited until you verify your email. Resend verification." The user needs to understand why the banner won't go away.
  6. Push notifications: front-load the sender or context. "Jordan: Can you review the PR?" not "You have a new message." The lock screen shows truncated text -- the first 5 words must convey the essential information.
  7. Never use notifications for marketing. Product notifications lose trust when mixed with promotional content.
- **Details subsections:**
  - Notification Channel Matrix (table: channel, urgency, persistence, character limit, example)
  - Push Notification Anatomy (title, body, action, icon -- with truncation considerations)
  - Notification Frequency and Batching Guidelines
- **Anti-Patterns (3+):**
  1. The Notification Spam -- notifying for every minor event, desensitizing users to important alerts
  2. The Truncated Mystery -- push notifications that get cut off before conveying the essential information
  3. The Non-Actionable Alert -- "Something happened" with no action button and no detail on what to do
- **Real-World Examples:** Slack's notification hierarchy (DM vs channel vs thread), GitHub's notification batching, Linear's concise update notifications, Stripe's webhook event notifications
- **Source citations:** NNGroup "Push Notifications UX," Material Design snackbar/banner guidelines, Apple HIG notification guidelines

---

### 9. ux-tooltip-contextual-help

- **Title:** Tooltip and Contextual Help
- **Description:** When to use tooltips vs inline help, progressive disclosure of complexity, character limits, and helping without interrupting
- **Related skills:** `ux-microcopy-principles`, `ux-writing-for-scanning`, `ux-content-hierarchy`
- **Keywords:** tooltips, contextual-help, inline-help, progressive-disclosure, info-icons, help-text
- **When to Use triggers:**
  - Adding tooltips to icons, labels, or interactive elements
  - Deciding between tooltips, inline help text, and help modals
  - Writing contextual help for complex settings or features
  - Creating info-icon (i) help patterns for dense UIs
  - NOT for: form field helper text and labels (see ux-form-labels)
  - NOT for: onboarding coach marks and feature tours (see ux-onboarding-copy)
- **Instructions principles (5-8):**
  1. Tooltips are for supplemental information, not essential information. If the user needs the tooltip to understand the interface, the interface needs better labels.
  2. Keep tooltip text under 80 characters -- one sentence maximum. If you need more, use inline help, a help panel, or a "Learn more" link.
  3. Trigger tooltips on hover (desktop) and long-press (mobile). Never require a click to see a tooltip -- that is a popover, which has different UX requirements.
  4. Front-load the useful information. "Copies the link to clipboard" not "When you click this button, it will copy the current page's URL to your clipboard." The first 3 words should convey the action.
  5. Use consistent info-icon (i) patterns for settings and dense UIs. Figma uses (i) icons next to advanced settings that open explanatory popovers.
  6. Do not repeat the label in the tooltip. If the button says "Export," the tooltip should say "Download as CSV" -- adding specificity, not restating.
- **Details subsections:**
  - Tooltip vs Inline Help vs Help Panel Decision Matrix
  - Tooltip Positioning and Timing Best Practices
  - Info-Icon Patterns for Complex Settings
- **Anti-Patterns (3+):**
  1. The Essay Tooltip -- cramming a paragraph of text into a tooltip that overflows the screen
  2. The Parrot Tooltip -- tooltip that restates the label verbatim ("Settings: Opens settings")
  3. The Hidden Essential -- critical information hidden behind a tooltip instead of displayed inline
- **Real-World Examples:** Figma's property inspector tooltips, GitHub's icon action tooltips, Stripe Dashboard's info-icon help patterns, Notion's keyboard shortcut tooltips
- **Source citations:** NNGroup "Tooltip Guidelines," Material Design tooltips specification, Apple HIG help and tooltips

---

### 10. ux-loading-states

- **Title:** Loading State Copy
- **Description:** Progress transparency, expectation setting, skeleton screen copy, time estimates, and turning wait time into informed patience
- **Related skills:** `ux-microcopy-principles`, `ux-voice-tone`, `design-loading-patterns`
- **Keywords:** loading-states, progress-indicators, skeleton-screens, spinners, time-estimates, wait-states
- **When to Use triggers:**
  - Writing text for loading spinners and progress bars
  - Deciding between spinner, skeleton screen, and progress indicator
  - Adding time estimates or step descriptions during long operations
  - Writing text for partial-load states (some content ready, some loading)
  - NOT for: empty states before first data load (see ux-empty-states)
  - NOT for: success/completion messages after loading (see ux-success-feedback)
- **Instructions principles (5-8):**
  1. Choose the right loading pattern for the duration. Under 1 second: no indicator needed. 1-3 seconds: spinner. 3-10 seconds: progress bar with text. Over 10 seconds: step-by-step progress with time estimate.
  2. Be specific about what is loading. "Loading messages..." not just "Loading..." Notion: "Setting up your workspace." Specificity reassures that the system is doing real work.
  3. For long operations, show progress steps. "Step 2 of 4: Importing contacts..." gives the user a mental model of the process and reduces perceived wait time.
  4. Use skeleton screens for content-heavy pages. Show the layout structure without content to reduce perceived load time. Skeleton screens need no text -- the visual structure communicates "content is coming."
  5. Provide time estimates when possible. "This usually takes about 30 seconds" sets expectations. Stripe's onboarding: "Verifying your identity. This usually takes a few minutes."
  6. Never use "Please wait" -- it adds no information and feels patronizing. Replace with what the system is doing or how long it will take.
- **Details subsections:**
  - Loading Pattern Decision Matrix (table: duration, pattern, copy, example)
  - Progress Indicator Copy (determinate vs indeterminate, percentage vs steps)
  - Background Processing Patterns (when to let users continue while loading happens)
- **Anti-Patterns (3+):**
  1. The Eternal Spinner -- a generic spinner with no text, no progress indication, and no time estimate
  2. The Please Wait -- "Please wait while we process your request" as the only loading message with no further detail
  3. The Frozen Screen -- no loading indicator at all, leaving the user wondering if their action registered
- **Real-World Examples:** Stripe's identity verification progress, Notion's workspace setup loading, GitHub's CI/CD build progress, Linear's optimistic UI updates
- **Source citations:** NNGroup "Progress Indicators Make a Slow System Less Insufferable," Material Design progress indicators, Apple HIG progress indicators

---

### 11. ux-success-feedback

- **Title:** Success Feedback Copy
- **Description:** Confirmation messages, celebration calibration, next-step prompts after completion, and writing success states that reinforce confidence
- **Related skills:** `ux-microcopy-principles`, `ux-voice-tone`, `ux-notification-copy`, `design-feedback-patterns`
- **Keywords:** success-messages, confirmation, celebration, completion, feedback, next-steps
- **When to Use triggers:**
  - Writing success confirmation messages after completed actions
  - Calibrating celebration intensity for different achievements
  - Adding next-step prompts after task completion
  - Writing success states for multi-step workflows
  - NOT for: loading and progress indicators (see ux-loading-states)
  - NOT for: notification delivery channel decisions (see ux-notification-copy)
- **Instructions principles (5-8):**
  1. Confirm the specific action, not a generic success. "Project created" not "Success!" "Invoice sent to jane@acme.com" not "Done." Stripe: "Payment successful" -- two words naming the exact outcome.
  2. Match celebration intensity to achievement magnitude. Saving a draft: simple checkmark, no text needed. Completing onboarding: "You're all set! Create your first project." Stripe uses confetti for first successful payment -- appropriate for a milestone.
  3. Always suggest a next step after major completions. "Your project is ready. Invite your team or start adding tasks." The next step prevents the "now what?" moment.
  4. Use past tense for completed actions: "Saved," "Sent," "Published." Not present tense ("Saving") or future tense ("Will be saved").
  5. For multi-step workflows, acknowledge both the step and overall progress. "Step 3 complete. One more step to go." Then final: "All done! Your account is fully set up."
  6. Ephemeral confirmations (toasts) should auto-dismiss after 3-5 seconds. Persistent confirmations (success pages) should have a clear exit path.
- **Details subsections:**
  - Celebration Calibration Scale (table: action magnitude, feedback type, copy pattern, example)
  - Next-Step Prompt Patterns (contextual suggestions after different completion types)
  - Multi-Step Completion Messaging
- **Anti-Patterns (3+):**
  1. The Overcelebration -- confetti and exclamation marks for saving a form field
  2. The Silent Success -- action completes with no visible confirmation, leaving the user uncertain
  3. The Dead End Success -- "Done!" with no next step, leaving the user staring at a completion screen
- **Real-World Examples:** Stripe's payment confirmation flow, GitHub's PR merge success, Notion's publish confirmation, Linear's issue completion feedback
- **Source citations:** NNGroup "Visibility of System Status," Material Design feedback guidelines, Podmajersky -- _Strategic Writing for UX_ ch. 8

---

### 12. ux-navigation-labels

- **Title:** Navigation Labels
- **Description:** Menu item naming, breadcrumb clarity, tab labels, sidebar organization, and writing navigation that users scan without thinking
- **Related skills:** `ux-microcopy-principles`, `ux-writing-for-scanning`, `ux-content-hierarchy`, `design-information-architecture`, `design-navigation-ux`
- **Keywords:** navigation, menu-labels, breadcrumbs, tabs, sidebar, wayfinding
- **When to Use triggers:**
  - Naming primary and secondary navigation menu items
  - Writing breadcrumb trail labels
  - Labeling tab groups and tab items
  - Organizing sidebar navigation hierarchies
  - NOT for: button and CTA labels (see ux-button-cta-copy)
  - NOT for: information architecture decisions (see design-information-architecture)
- **Instructions principles (5-8):**
  1. Front-load the distinguishing keyword. "Notifications" not "Your notifications." "Projects" not "Project management." In a sidebar, users scan the first word of each item.
  2. Use nouns for navigation, verbs for actions. Navigation labels describe destinations: "Settings," "Dashboard," "Team." Action buttons describe operations: "Create project," "Export data."
  3. Keep navigation labels to 1-2 words. Three words maximum. GitHub: "Issues," "Pull requests," "Actions," "Projects." Every label is instantly scannable.
  4. Be mutually exclusive -- no two navigation items should sound like they lead to the same place. "Settings" and "Preferences" in the same nav is confusing. Pick one.
  5. Use consistent grammatical structure. If top-level items are nouns ("Dashboard," "Projects," "Reports"), keep them all nouns. Do not mix "Dashboard" with "View reports" and "Manage team."
  6. Breadcrumbs should use the page title, not a description. "Home > Projects > Acme Dashboard" not "Home > All your projects > The Acme Dashboard project."
  7. Tab labels must describe the content, not the action. "Activity," "Members," "Settings" -- not "View activity," "Manage members," "Change settings."
- **Details subsections:**
  - Navigation Label Patterns by Component (sidebar, tabs, breadcrumbs, mega-menu)
  - Hierarchy and Depth Naming Conventions
  - Icon-Only vs Icon+Label vs Label-Only Navigation
- **Anti-Patterns (3+):**
  1. The Verbose Nav -- navigation items that are full sentences or phrases ("View all of your notifications and alerts")
  2. The Synonym Pair -- two navigation items that sound the same ("Settings" and "Preferences," "Dashboard" and "Overview")
  3. The Verb-Noun Mix -- mixing grammatical forms in the same navigation level ("Dashboard," "Manage team," "Reports," "Create project")
- **Real-World Examples:** GitHub's repository navigation tabs, Notion's sidebar hierarchy, Stripe Dashboard's primary navigation, Linear's sidebar organization
- **Source citations:** NNGroup "Navigation Label Clarity," Material Design navigation patterns, Apple HIG navigation guidelines, Krug -- _Don't Make Me Think_

---

### 13. ux-permission-access-copy

- **Title:** Permission and Access Copy
- **Description:** Role-based messaging, upgrade prompts, "you don't have access" patterns, and gating copy that explains restrictions without frustrating users
- **Related skills:** `ux-microcopy-principles`, `ux-voice-tone`, `ux-plain-language`
- **Keywords:** permissions, access-control, role-based, gating, upgrade-prompts, authorization
- **When to Use triggers:**
  - Writing "access denied" or "permission required" messages
  - Creating upgrade/upsell prompts for gated features
  - Writing role-based messaging for different user tiers
  - Explaining why a feature is locked and how to unlock it
  - NOT for: authentication errors (wrong password, etc.) (see ux-error-messages)
  - NOT for: onboarding permission requests (camera, notifications) (see ux-onboarding-copy)
- **Instructions principles (5-8):**
  1. Explain what the user cannot do and why, not just that they cannot do it. "You need admin access to delete projects. Contact your workspace admin." not "Permission denied."
  2. Name the specific permission or role required. "Only workspace admins can manage billing" is actionable. "You don't have permission" is not.
  3. Provide a clear path to gaining access. "Request access," "Contact admin," or "Upgrade to Pro." Every permission gate must have a next step.
  4. For upgrade prompts, lead with the value, not the gate. "Unlock unlimited projects with Pro" is motivating. "This feature is not available on your plan" is discouraging.
  5. Do not make users feel punished for being on a lower tier. "You've used 3 of 3 projects. Upgrade for unlimited." is neutral. "You've reached your limit" is negative.
  6. Show locked features visually but disable them -- do not hide them entirely. Users should know what is available at higher tiers. Figma shows Pro features with a lock icon and upgrade CTA.
- **Details subsections:**
  - Permission Denied Message Anatomy (what, why, next step)
  - Upgrade Prompt Copy Patterns (value-first vs feature-gate approaches)
  - Role-Based Messaging Matrix (admin, editor, viewer -- different messages for each)
- **Anti-Patterns (3+):**
  1. The Brick Wall -- "Permission denied" with no explanation and no path forward
  2. The Shame Prompt -- making users feel bad about their current plan or role
  3. The Hidden Feature -- completely hiding gated features so users never discover what they are missing
- **Real-World Examples:** Figma's Pro feature lock icons, GitHub's organization role permissions, Slack's workspace admin access patterns, Notion's plan-based feature gates
- **Source citations:** NNGroup "Error Messages for Access Denied," Material Design states and permissions, Intercom's upgrade prompt research

---

### 14. ux-settings-preferences

- **Title:** Settings and Preferences Copy
- **Description:** Toggle descriptions, preference explanations, consequence previews for settings changes, and writing settings that users configure confidently
- **Related skills:** `ux-microcopy-principles`, `ux-plain-language`, `ux-writing-for-scanning`
- **Keywords:** settings, preferences, toggles, configuration, switch-labels, option-descriptions
- **When to Use triggers:**
  - Writing toggle/switch labels and descriptions
  - Describing the consequence of changing a setting
  - Creating settings section headers and organization
  - Writing preference explanation text for complex options
  - NOT for: form field labels in data-entry forms (see ux-form-labels)
  - NOT for: permission and access settings (see ux-permission-access-copy)
- **Instructions principles (5-8):**
  1. Label toggles with what happens when ON, not the setting name. "Send email notifications" not "Email notifications." The label should read as a sentence: "[ ] Send email notifications."
  2. Add a one-line description below each non-obvious setting. "Automatically save changes every 30 seconds" explains what the toggle does. Without it, "Autosave" might mean different things to different users.
  3. Show consequences before the user changes the setting. "Turning this off will remove your data from search results within 24 hours." Stripe: "Disabling 3D Secure may increase fraud risk."
  4. Group related settings with clear section headers. "Notifications," "Privacy," "Appearance" -- not a flat list of 30 toggles.
  5. Use the same grammatical structure for all toggles in a section. All start with verbs: "Send email notifications," "Show online status," "Allow search indexing." Not a mix of nouns and verb phrases.
  6. For destructive settings (e.g., "Delete account"), use the same patterns as destructive actions -- red styling, consequence text, confirmation.
- **Details subsections:**
  - Toggle Label Conventions (verb-phrase pattern, ON/OFF state clarity)
  - Settings Organization Patterns (grouping, hierarchy, search)
  - Consequence Preview Patterns (inline text, confirmation dialog, preview mode)
- **Anti-Patterns (3+):**
  1. The Mystery Toggle -- a toggle with only a label ("Sync") and no description of what it does or what changes when toggled
  2. The Jargon Setting -- technical terms without explanation ("Enable WebSocket fallback," "Use hardware acceleration")
  3. The Surprise Consequence -- changing a setting with no warning that triggers a significant side effect
- **Real-World Examples:** GitHub's notification settings (granular toggles with descriptions), Slack's preference panels, Stripe Dashboard's webhook settings, Notion's workspace settings organization
- **Source citations:** NNGroup "Toggle Switch Guidelines," Material Design settings guidelines, Apple HIG settings patterns

---

### 15. ux-data-table-copy

- **Title:** Data Table Copy
- **Description:** Column headers, empty cells, truncation patterns, filter/sort labels, and writing tables that communicate data clearly at every density
- **Related skills:** `ux-microcopy-principles`, `ux-writing-for-scanning`, `ux-plain-language`
- **Keywords:** data-tables, column-headers, empty-cells, truncation, filters, sort-labels
- **When to Use triggers:**
  - Writing column headers for data tables
  - Handling empty cell states and null values
  - Writing filter and sort control labels
  - Creating table action labels (row actions, bulk actions)
  - Writing table pagination and summary text
  - NOT for: data visualization and chart labels (see design-data-viz-design)
  - NOT for: search and filter UX patterns (see ux-search-copy)
- **Instructions principles (5-8):**
  1. Column headers must be 1-3 words and front-load the distinguishing term. "Created" not "Date created." "Status" not "Current status." "Amount" not "Transaction amount." The header is not a description -- it is a scannable label.
  2. Never leave empty cells blank -- use a consistent placeholder. "--" or "N/A" with a tooltip explaining why. GitHub: "--" for empty cells in comparison tables. Blank cells look like bugs.
  3. Truncate long cell content with ellipsis and provide full text on hover/click. "Acme Corp..." with tooltip "Acme Corporation International Ltd." Show the most identifying portion before truncating.
  4. Filter labels should name the attribute, not the action. "Status," "Date range," "Assignee" -- not "Filter by status." The filter context is already established by the filter bar UI.
  5. Sort labels should indicate current state and available action. "Name (A-Z)" indicates ascending. Clicking should sort descending. The label always reflects the current sort, not the next sort.
  6. Bulk action labels should include the count. "Delete 3 items" not just "Delete." Stripe: "Export 47 transactions."
  7. Table pagination: "Showing 1-25 of 342 results" -- current range and total. Not just page numbers.
- **Details subsections:**
  - Column Header Conventions (length, format, alignment by data type)
  - Empty Cell and Null Value Patterns
  - Table Action Label Patterns (row actions, bulk actions, inline editing)
- **Anti-Patterns (3+):**
  1. The Verbose Header -- column headers that are full phrases ("The date on which this transaction was created")
  2. The Blank Cell -- empty cells with no indicator, indistinguishable from loading or missing data
  3. The Truncation Mystery -- truncated text with no way to see the full content
- **Real-World Examples:** Stripe's transaction tables (column headers, filters, bulk actions), GitHub's issues list, Notion's database views, Linear's issue tables
- **Source citations:** NNGroup "Data Tables: Four Major User Tasks," Material Design data table guidelines, Apple HIG table views

---

### 16. ux-search-copy

- **Title:** Search Copy
- **Description:** Search placeholder text, zero-results messaging, autocomplete hints, search scope indicators, and guiding users to find what they need
- **Related skills:** `ux-microcopy-principles`, `ux-plain-language`, `ux-empty-states`
- **Keywords:** search, search-placeholder, zero-results, autocomplete, search-scope, search-filters
- **When to Use triggers:**
  - Writing search input placeholder text
  - Composing zero-results messages with recovery suggestions
  - Writing autocomplete and suggestion labels
  - Indicating search scope (what is being searched)
  - Writing search filter labels and applied filter indicators
  - NOT for: general empty state copy (see ux-empty-states)
  - NOT for: data table filter labels (see ux-data-table-copy)
- **Instructions principles (5-8):**
  1. Placeholder text should indicate the search scope. "Search issues..." not just "Search..." GitHub: "Search or jump to..." tells users the input does more than search.
  2. Zero-results must offer specific recovery paths. "No results for 'reciepe'. Did you mean 'recipe'?" or "No matching issues. Try removing the 'closed' filter." Never just "No results found."
  3. Show the search scope explicitly when multiple scopes exist. "Searching in: All projects" or "Results from: Engineering workspace." Users need to know what they are NOT searching.
  4. Autocomplete suggestions should show context, not just the matching term. "Project: Acme Dashboard" or "User: Jane Smith (jane@acme.com)" -- type and identifying detail.
  5. Show result count immediately. "47 results for 'authentication'" sets expectations. If results are filtered, show: "47 of 312 results (filtered by: Open)."
  6. For slow searches, show results as they stream in. "Showing first results..." with a count that updates. Do not wait for all results before showing any.
- **Details subsections:**
  - Search Placeholder Conventions (scope indication, action hint, character limits)
  - Zero-Results Recovery Patterns (spelling correction, filter relaxation, browse alternatives)
  - Autocomplete and Suggestion Display Patterns
- **Anti-Patterns (3+):**
  1. The Bare Minimum -- "No results" with no suggestions, corrections, or alternative actions
  2. The Vague Scope -- search input with no indication of what it searches ("Search..." could mean anything)
  3. The Silent Filter -- search results filtered by an invisible parameter the user does not know about
- **Real-World Examples:** GitHub's command palette search (scoped, with keyboard shortcuts), Stripe's Dashboard search (entity type indicators), Notion's search with filter chips, Slack's message search with date/channel scoping
- **Source citations:** NNGroup "Search UX Best Practices," Material Design search patterns, Algolia's search UX guidelines

---

### 17. ux-destructive-action-copy

- **Title:** Destructive Action Copy
- **Description:** Irreversibility warnings, undo availability, double-confirmation patterns, cooldown messaging, and writing copy that prevents accidental data loss
- **Related skills:** `ux-microcopy-principles`, `ux-confirmation-dialogs`, `ux-button-cta-copy`, `ux-error-severity`
- **Keywords:** destructive-actions, irreversibility, undo, data-loss, delete-confirmation, danger-zone
- **When to Use triggers:**
  - Writing delete, remove, or cancel-subscription actions
  - Designing undo vs confirm patterns for destructive operations
  - Writing "danger zone" sections in settings
  - Adding cooldown or delay messaging for irreversible actions
  - NOT for: generic confirmation dialog patterns (see ux-confirmation-dialogs)
  - NOT for: error messages about failed destructive actions (see ux-error-messages)
- **Instructions principles (5-8):**
  1. Name the exact data at risk. "This will permanently delete 'Acme Dashboard' and all 47 tasks, 12 comments, and 3 attachments." Not "This will delete the project and its contents."
  2. State irreversibility explicitly. "This action cannot be undone" or "This is permanent." If the action IS reversible (soft delete, trash), say so: "Moved to trash. You can restore it within 30 days."
  3. Use a severity ladder: undo (low), confirm (medium), type-to-confirm (high), cooldown (critical). Match the friction to the consequence.
  4. Separate destructive actions visually from safe actions. GitHub's "Danger zone" is at the bottom of settings, visually distinct, requiring separate confirmation.
  5. For account/subscription cancellation, show what the user will lose. "You will lose access to: 47 projects, 12 team members, and all Pro features." Concrete losses are more effective than abstract warnings.
  6. Implement grace periods where possible. "Your account will be deleted in 14 days. You can cancel this anytime before then." Stripe: subscription cancellation takes effect at period end, not immediately.
  7. After a destructive action completes, confirm what was destroyed and offer recovery if available. "Project deleted. You have 30 days to restore from trash."
- **Details subsections:**
  - Severity Ladder (table: level, friction type, example, when to use)
  - Danger Zone UI Patterns (visual separation, progressive disclosure of destructive options)
  - Grace Period and Soft Delete Messaging
- **Anti-Patterns (3+):**
  1. The Casual Delete -- destructive action with the same styling and friction as creating a new item
  2. The Phantom Undo -- claiming "you can undo this" when the action is actually irreversible
  3. The Buried Warning -- irreversibility warning in small text below the fold while the delete button is prominently displayed
- **Real-World Examples:** GitHub's danger zone (repo deletion, transfer, archive), Stripe's subscription cancellation flow, Notion's trash and permanent delete, Slack's workspace deletion with cooldown
- **Source citations:** NNGroup "Preventing User Errors," Material Design dialog guidelines for destructive actions, Apple HIG destructive actions

---

## Tasks

### Task 1: Create ux-error-messages with platform copies

**Depends on:** none
**Files:** `agents/skills/claude-code/ux-error-messages/skill.yaml`, `agents/skills/claude-code/ux-error-messages/SKILL.md`, + 3 platform copies

1. Create directory:

   ```bash
   mkdir -p agents/skills/claude-code/ux-error-messages
   ```

2. Create `agents/skills/claude-code/ux-error-messages/skill.yaml` using the template above with:
   - name: `ux-error-messages`
   - description: `Error messages -- what went wrong, why it matters, how to fix it, the three-part error pattern for clear, actionable error communication`
   - related_skills: `[ux-microcopy-principles, ux-voice-tone, ux-plain-language, design-empty-error-states, design-feedback-patterns]`
   - keywords: `[error-messages, validation, user-feedback, error-recovery, inline-errors]`

3. Create `agents/skills/claude-code/ux-error-messages/SKILL.md` (150-250 lines) following the content specification for skill #1 above. Must include:
   - `## When to Use` with 4+ triggers and 2 NOT-for exclusions
   - `## Instructions` with 8 numbered principles, each with real production examples (Stripe, GitHub, Slack, Notion)
   - `## Details` with subsections: Error Message Anatomy, Inline vs Summary vs Toast Error Placement, Error Tone Calibration
   - `### Anti-Patterns` with 4 anti-patterns (Cryptic Code, Blame Game, Dead End, Generic Catch-All)
   - `### Real-World Examples` with Stripe payment errors and GitHub form validation
   - `## Source` with NNGroup, Google Material, Microcopy Complete Guide citations
   - `## Process`, `## Harness Integration`, `## Success Criteria`

4. Copy to all platforms:

   ```bash
   SKILL="ux-error-messages"
   BASE="agents/skills/claude-code/${SKILL}"
   for PLATFORM in gemini-cli cursor codex; do
     mkdir -p "agents/skills/${PLATFORM}/${SKILL}"
     cp "${BASE}/skill.yaml" "agents/skills/${PLATFORM}/${SKILL}/skill.yaml"
     cp "${BASE}/SKILL.md" "agents/skills/${PLATFORM}/${SKILL}/SKILL.md"
   done
   ```

5. Run: `harness validate`
6. Commit: `feat(skills): add ux-error-messages knowledge skill with platform parity`

---

### Task 2: Create ux-error-severity with platform copies

**Depends on:** none (parallelizable with Tasks 1, 3-6)
**Files:** `agents/skills/claude-code/ux-error-severity/skill.yaml`, `agents/skills/claude-code/ux-error-severity/SKILL.md`, + 3 platform copies

1. Create directory and files following skill #2 specification above:
   - name: `ux-error-severity`
   - description: `Error severity communication -- calibrating error tone to severity, from field validation to system failure to data loss`
   - related_skills: `[ux-error-messages, ux-microcopy-principles, ux-voice-tone, design-feedback-patterns]`
   - keywords: `[error-severity, validation, system-errors, data-loss, warning-levels, tone-calibration]`

2. Create SKILL.md (150-250 lines) with content per skill #2 specification: Severity Tier Matrix, Escalation Patterns, Recovery Urgency Mapping, 3+ anti-patterns (Boy Who Cried Wolf, Calm Catastrophe, Severity Mismatch), real-world examples (Figma, AWS Console, VS Code).

3. Copy to all platforms using the platform copy command.
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-error-severity knowledge skill with platform parity`

---

### Task 3: Create ux-empty-states with platform copies

**Depends on:** none (parallelizable with Tasks 1-2, 4-6)
**Files:** `agents/skills/claude-code/ux-empty-states/skill.yaml`, `agents/skills/claude-code/ux-empty-states/SKILL.md`, + 3 platform copies

1. Create directory and files following skill #3 specification above:
   - name: `ux-empty-states`
   - description: `Empty states -- first-use, user-cleared, and no-results patterns that motivate action, set expectations, and turn blank screens into onramps`
   - related_skills: `[ux-microcopy-principles, ux-onboarding-copy, ux-writing-for-scanning, design-empty-error-states, design-loading-patterns]`
   - keywords: `[empty-states, first-use, zero-data, no-results, onboarding, blank-slate]`

2. Create SKILL.md (150-250 lines) with content per skill #3 specification: Empty State Type Matrix, First-Use vs Returning-User, No-Results Recovery Patterns, 3+ anti-patterns (Barren Wasteland, Instruction Manual, Sad Illustration), real-world examples (Notion, GitHub, Slack, Linear).

3. Copy to all platforms using the platform copy command.
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-empty-states knowledge skill with platform parity`

---

### Task 4: Create ux-onboarding-copy with platform copies

**Depends on:** none (parallelizable with Tasks 1-3, 5-6)
**Files:** `agents/skills/claude-code/ux-onboarding-copy/skill.yaml`, `agents/skills/claude-code/ux-onboarding-copy/SKILL.md`, + 3 platform copies

1. Create directory and files following skill #4 specification above:
   - name: `ux-onboarding-copy`
   - description: `Onboarding copy -- progressive disclosure, value-first framing, reducing anxiety, and welcome flows that convert sign-ups into active users`
   - related_skills: `[ux-microcopy-principles, ux-voice-tone, ux-writing-for-scanning, ux-empty-states]`
   - keywords: `[onboarding, welcome-flow, first-run, progressive-disclosure, activation, setup-wizard]`

2. Create SKILL.md (150-250 lines) with content per skill #4 specification: Onboarding Flow Types, Step Copy Structure, Anxiety Reducers, 3+ anti-patterns (Feature Tour, Commitment Trap, Information Dump), real-world examples (Slack, Notion, Stripe, Figma).

3. Copy to all platforms using the platform copy command.
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-onboarding-copy knowledge skill with platform parity`

---

### Task 5: Create ux-button-cta-copy with platform copies

**Depends on:** none (parallelizable with Tasks 1-4, 6)
**Files:** `agents/skills/claude-code/ux-button-cta-copy/skill.yaml`, `agents/skills/claude-code/ux-button-cta-copy/SKILL.md`, + 3 platform copies

1. Create directory and files following skill #5 specification above:
   - name: `ux-button-cta-copy`
   - description: `Button and CTA copy -- verb-noun pattern, specificity over vagueness, context-sensitive labels that tell users exactly what will happen`
   - related_skills: `[ux-microcopy-principles, ux-active-voice, ux-plain-language]`
   - keywords: `[buttons, cta, call-to-action, verb-noun, action-labels, submit-buttons]`

2. Create SKILL.md (150-250 lines) with content per skill #5 specification: Button Label Length Guidelines, Primary vs Secondary vs Tertiary, Stateful Button Copy, 3+ anti-patterns (Generic Submit, Ambiguous Pair, Noun Button), real-world examples (Stripe, GitHub, Linear, Notion).

3. Copy to all platforms using the platform copy command.
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-button-cta-copy knowledge skill with platform parity`

---

### Task 6: Create ux-form-labels with platform copies

**Depends on:** none (parallelizable with Tasks 1-5)
**Files:** `agents/skills/claude-code/ux-form-labels/skill.yaml`, `agents/skills/claude-code/ux-form-labels/SKILL.md`, + 3 platform copies

1. Create directory and files following skill #6 specification above:
   - name: `ux-form-labels`
   - description: `Form labels and helper text -- label clarity, helper text placement, placeholder anti-patterns, required-field indication for forms users complete without confusion`
   - related_skills: `[ux-microcopy-principles, ux-plain-language, ux-error-messages, design-form-ux, a11y-form-patterns]`
   - keywords: `[form-labels, helper-text, placeholder, required-fields, input-labels, field-descriptions]`

2. Create SKILL.md (150-250 lines) with content per skill #6 specification: Label vs Placeholder vs Helper Text table, Required/Optional Field Indication, Accessibility Requirements, 3+ anti-patterns (Placeholder-as-Label, Redundant Stack, Hidden Constraint), real-world examples (Stripe, GitHub, Shopify).

3. Copy to all platforms using the platform copy command.
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-form-labels knowledge skill with platform parity`

---

### Task 7: Wave A Checkpoint -- Validate first 6 skills

**Depends on:** Tasks 1-6
**Files:** none (validation only)

[checkpoint:human-verify] -- Verify the pattern is correct before proceeding with Waves B and C.

1. Run schema validation:

   ```bash
   cd agents/skills && npx vitest run tests/schema.test.ts
   ```

2. Run platform parity test:

   ```bash
   cd agents/skills && npx vitest run tests/platform-parity.test.ts
   ```

3. Verify line counts for all 6 SKILL.md files are 150-250 lines:

   ```bash
   for skill in ux-error-messages ux-error-severity ux-empty-states ux-onboarding-copy ux-button-cta-copy ux-form-labels; do
     wc -l agents/skills/claude-code/${skill}/SKILL.md
   done
   ```

4. Verify each SKILL.md contains required sections:

   ```bash
   for skill in ux-error-messages ux-error-severity ux-empty-states ux-onboarding-copy ux-button-cta-copy ux-form-labels; do
     echo "=== ${skill} ==="
     grep -c "## When to Use\|## Instructions\|## Details\|### Anti-Patterns\|### Real-World Examples\|## Source\|## Process\|## Harness Integration\|## Success Criteria" agents/skills/claude-code/${skill}/SKILL.md
   done
   ```

   Each skill should show count of 9 (all required sections present).

5. Verify each SKILL.md has at least 3 anti-patterns:

   ```bash
   for skill in ux-error-messages ux-error-severity ux-empty-states ux-onboarding-copy ux-button-cta-copy ux-form-labels; do
     echo "${skill}: $(grep -c '^[0-9]\+\.' agents/skills/claude-code/${skill}/SKILL.md | head -1) anti-patterns (check manually)"
   done
   ```

6. Run: `harness validate`
7. Present results for human approval before proceeding to Wave B.

---

### Task 8: Create ux-confirmation-dialogs with platform copies

**Depends on:** Task 7 (Wave A checkpoint approved)
**Files:** `agents/skills/claude-code/ux-confirmation-dialogs/skill.yaml`, `agents/skills/claude-code/ux-confirmation-dialogs/SKILL.md`, + 3 platform copies

1. Create directory and files following skill #7 specification above:
   - name: `ux-confirmation-dialogs`
   - description: `Confirmation dialogs -- destructive action copy, consequence clarity, specific button labels that prevent accidental actions without creating friction`
   - related_skills: `[ux-microcopy-principles, ux-button-cta-copy, ux-voice-tone, design-feedback-patterns]`
   - keywords: `[confirmation-dialogs, destructive-actions, modal-copy, dialog-buttons, consequence-clarity]`

2. Create SKILL.md (150-250 lines) with content per skill #7 specification: Confirmation Dialog Anatomy, When to Confirm vs Allow Undo, Type-to-Confirm Patterns, 3+ anti-patterns (Yes/No Trap, Confirmation Fatigue, Vague Consequence), real-world examples (GitHub, Slack, Stripe, Notion).

3. Copy to all platforms using the platform copy command.
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-confirmation-dialogs knowledge skill with platform parity`

---

### Task 9: Create ux-notification-copy with platform copies

**Depends on:** Task 7 (parallelizable with Tasks 8, 10-13)
**Files:** `agents/skills/claude-code/ux-notification-copy/skill.yaml`, `agents/skills/claude-code/ux-notification-copy/SKILL.md`, + 3 platform copies

1. Create directory and files following skill #8 specification above:
   - name: `ux-notification-copy`
   - description: `Notification copy -- urgency calibration, actionability, toast vs banner vs modal decisions, and writing notifications users actually read`
   - related_skills: `[ux-microcopy-principles, ux-voice-tone, ux-writing-for-scanning, design-feedback-patterns]`
   - keywords: `[notifications, toast, snackbar, banner, push-notifications, alerts, urgency]`

2. Create SKILL.md (150-250 lines) with content per skill #8 specification: Notification Channel Matrix, Push Notification Anatomy, Frequency and Batching Guidelines, 3+ anti-patterns (Notification Spam, Truncated Mystery, Non-Actionable Alert), real-world examples (Slack, GitHub, Linear, Stripe).

3. Copy to all platforms using the platform copy command.
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-notification-copy knowledge skill with platform parity`

---

### Task 10: Create ux-tooltip-contextual-help with platform copies

**Depends on:** Task 7 (parallelizable with Tasks 8-9, 11-13)
**Files:** `agents/skills/claude-code/ux-tooltip-contextual-help/skill.yaml`, `agents/skills/claude-code/ux-tooltip-contextual-help/SKILL.md`, + 3 platform copies

1. Create directory and files following skill #9 specification above:
   - name: `ux-tooltip-contextual-help`
   - description: `Tooltip and contextual help -- when to use tooltips vs inline help, progressive disclosure of complexity, character limits, and helping without interrupting`
   - related_skills: `[ux-microcopy-principles, ux-writing-for-scanning, ux-content-hierarchy]`
   - keywords: `[tooltips, contextual-help, inline-help, progressive-disclosure, info-icons, help-text]`

2. Create SKILL.md (150-250 lines) with content per skill #9 specification: Tooltip vs Inline Help vs Help Panel Decision Matrix, Positioning and Timing, Info-Icon Patterns, 3+ anti-patterns (Essay Tooltip, Parrot Tooltip, Hidden Essential), real-world examples (Figma, GitHub, Stripe, Notion).

3. Copy to all platforms using the platform copy command.
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-tooltip-contextual-help knowledge skill with platform parity`

---

### Task 11: Create ux-loading-states with platform copies

**Depends on:** Task 7 (parallelizable with Tasks 8-10, 12-13)
**Files:** `agents/skills/claude-code/ux-loading-states/skill.yaml`, `agents/skills/claude-code/ux-loading-states/SKILL.md`, + 3 platform copies

1. Create directory and files following skill #10 specification above:
   - name: `ux-loading-states`
   - description: `Loading state copy -- progress transparency, expectation setting, skeleton screen copy, time estimates, and turning wait time into informed patience`
   - related_skills: `[ux-microcopy-principles, ux-voice-tone, design-loading-patterns]`
   - keywords: `[loading-states, progress-indicators, skeleton-screens, spinners, time-estimates, wait-states]`

2. Create SKILL.md (150-250 lines) with content per skill #10 specification: Loading Pattern Decision Matrix, Progress Indicator Copy, Background Processing Patterns, 3+ anti-patterns (Eternal Spinner, Please Wait, Frozen Screen), real-world examples (Stripe, Notion, GitHub, Linear).

3. Copy to all platforms using the platform copy command.
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-loading-states knowledge skill with platform parity`

---

### Task 12: Create ux-success-feedback with platform copies

**Depends on:** Task 7 (parallelizable with Tasks 8-11, 13)
**Files:** `agents/skills/claude-code/ux-success-feedback/skill.yaml`, `agents/skills/claude-code/ux-success-feedback/SKILL.md`, + 3 platform copies

1. Create directory and files following skill #11 specification above:
   - name: `ux-success-feedback`
   - description: `Success feedback copy -- confirmation messages, celebration calibration, next-step prompts after completion that reinforce user confidence`
   - related_skills: `[ux-microcopy-principles, ux-voice-tone, ux-notification-copy, design-feedback-patterns]`
   - keywords: `[success-messages, confirmation, celebration, completion, feedback, next-steps]`

2. Create SKILL.md (150-250 lines) with content per skill #11 specification: Celebration Calibration Scale, Next-Step Prompt Patterns, Multi-Step Completion Messaging, 3+ anti-patterns (Overcelebration, Silent Success, Dead End Success), real-world examples (Stripe, GitHub, Notion, Linear).

3. Copy to all platforms using the platform copy command.
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-success-feedback knowledge skill with platform parity`

---

### Task 13: Create ux-navigation-labels with platform copies

**Depends on:** Task 7 (parallelizable with Tasks 8-12)
**Files:** `agents/skills/claude-code/ux-navigation-labels/skill.yaml`, `agents/skills/claude-code/ux-navigation-labels/SKILL.md`, + 3 platform copies

1. Create directory and files following skill #12 specification above:
   - name: `ux-navigation-labels`
   - description: `Navigation labels -- menu item naming, breadcrumb clarity, tab labels, sidebar organization, and writing navigation users scan without thinking`
   - related_skills: `[ux-microcopy-principles, ux-writing-for-scanning, ux-content-hierarchy, design-information-architecture, design-navigation-ux]`
   - keywords: `[navigation, menu-labels, breadcrumbs, tabs, sidebar, wayfinding]`

2. Create SKILL.md (150-250 lines) with content per skill #12 specification: Navigation Label Patterns by Component, Hierarchy and Depth Naming, Icon-Only vs Icon+Label vs Label-Only, 3+ anti-patterns (Verbose Nav, Synonym Pair, Verb-Noun Mix), real-world examples (GitHub, Notion, Stripe, Linear).

3. Copy to all platforms using the platform copy command.
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-navigation-labels knowledge skill with platform parity`

---

### Task 14: Wave B Checkpoint -- Validate skills 7-12

**Depends on:** Tasks 8-13
**Files:** none (validation only)

[checkpoint:human-verify] -- Quick verification before Wave C.

1. Run schema and parity tests:

   ```bash
   cd agents/skills && npx vitest run tests/schema.test.ts && npx vitest run tests/platform-parity.test.ts
   ```

2. Verify line counts for Wave B SKILL.md files are 150-250 lines:

   ```bash
   for skill in ux-confirmation-dialogs ux-notification-copy ux-tooltip-contextual-help ux-loading-states ux-success-feedback ux-navigation-labels; do
     wc -l agents/skills/claude-code/${skill}/SKILL.md
   done
   ```

3. Run: `harness validate`
4. Proceed to Wave C.

---

### Task 15: Create ux-permission-access-copy with platform copies

**Depends on:** Task 14 (parallelizable with Tasks 16-19)
**Files:** `agents/skills/claude-code/ux-permission-access-copy/skill.yaml`, `agents/skills/claude-code/ux-permission-access-copy/SKILL.md`, + 3 platform copies

1. Create directory and files following skill #13 specification above:
   - name: `ux-permission-access-copy`
   - description: `Permission and access copy -- role-based messaging, upgrade prompts, access-denied patterns that explain restrictions without frustrating users`
   - related_skills: `[ux-microcopy-principles, ux-voice-tone, ux-plain-language]`
   - keywords: `[permissions, access-control, role-based, gating, upgrade-prompts, authorization]`

2. Create SKILL.md (150-250 lines) with content per skill #13 specification.
3. Copy to all platforms using the platform copy command.
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-permission-access-copy knowledge skill with platform parity`

---

### Task 16: Create ux-settings-preferences with platform copies

**Depends on:** Task 14 (parallelizable with Tasks 15, 17-19)
**Files:** `agents/skills/claude-code/ux-settings-preferences/skill.yaml`, `agents/skills/claude-code/ux-settings-preferences/SKILL.md`, + 3 platform copies

1. Create directory and files following skill #14 specification above:
   - name: `ux-settings-preferences`
   - description: `Settings and preferences copy -- toggle descriptions, preference explanations, consequence previews for settings users configure confidently`
   - related_skills: `[ux-microcopy-principles, ux-plain-language, ux-writing-for-scanning]`
   - keywords: `[settings, preferences, toggles, configuration, switch-labels, option-descriptions]`

2. Create SKILL.md (150-250 lines) with content per skill #14 specification.
3. Copy to all platforms using the platform copy command.
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-settings-preferences knowledge skill with platform parity`

---

### Task 17: Create ux-data-table-copy with platform copies

**Depends on:** Task 14 (parallelizable with Tasks 15-16, 18-19)
**Files:** `agents/skills/claude-code/ux-data-table-copy/skill.yaml`, `agents/skills/claude-code/ux-data-table-copy/SKILL.md`, + 3 platform copies

1. Create directory and files following skill #15 specification above:
   - name: `ux-data-table-copy`
   - description: `Data table copy -- column headers, empty cells, truncation patterns, filter and sort labels for tables that communicate data clearly at every density`
   - related_skills: `[ux-microcopy-principles, ux-writing-for-scanning, ux-plain-language]`
   - keywords: `[data-tables, column-headers, empty-cells, truncation, filters, sort-labels]`

2. Create SKILL.md (150-250 lines) with content per skill #15 specification.
3. Copy to all platforms using the platform copy command.
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-data-table-copy knowledge skill with platform parity`

---

### Task 18: Create ux-search-copy with platform copies

**Depends on:** Task 14 (parallelizable with Tasks 15-17, 19)
**Files:** `agents/skills/claude-code/ux-search-copy/skill.yaml`, `agents/skills/claude-code/ux-search-copy/SKILL.md`, + 3 platform copies

1. Create directory and files following skill #16 specification above:
   - name: `ux-search-copy`
   - description: `Search copy -- search placeholder text, zero-results messaging, autocomplete hints, search scope indicators for guiding users to find what they need`
   - related_skills: `[ux-microcopy-principles, ux-plain-language, ux-empty-states]`
   - keywords: `[search, search-placeholder, zero-results, autocomplete, search-scope, search-filters]`

2. Create SKILL.md (150-250 lines) with content per skill #16 specification.
3. Copy to all platforms using the platform copy command.
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-search-copy knowledge skill with platform parity`

---

### Task 19: Create ux-destructive-action-copy with platform copies

**Depends on:** Task 14 (parallelizable with Tasks 15-18)
**Files:** `agents/skills/claude-code/ux-destructive-action-copy/skill.yaml`, `agents/skills/claude-code/ux-destructive-action-copy/SKILL.md`, + 3 platform copies

1. Create directory and files following skill #17 specification above:
   - name: `ux-destructive-action-copy`
   - description: `Destructive action copy -- irreversibility warnings, undo availability, double-confirmation patterns, cooldown messaging that prevents accidental data loss`
   - related_skills: `[ux-microcopy-principles, ux-confirmation-dialogs, ux-button-cta-copy, ux-error-severity]`
   - keywords: `[destructive-actions, irreversibility, undo, data-loss, delete-confirmation, danger-zone]`

2. Create SKILL.md (150-250 lines) with content per skill #17 specification.
3. Copy to all platforms using the platform copy command.
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-destructive-action-copy knowledge skill with platform parity`

---

### Task 20: Final Validation -- All 17 contextual skills

**Depends on:** Tasks 15-19
**Files:** none (validation only)

1. Verify all 17 skills exist in all 4 platforms (68 directories, 136 files):

   ```bash
   for skill in ux-error-messages ux-error-severity ux-empty-states ux-onboarding-copy ux-button-cta-copy ux-form-labels ux-confirmation-dialogs ux-notification-copy ux-tooltip-contextual-help ux-loading-states ux-success-feedback ux-navigation-labels ux-permission-access-copy ux-settings-preferences ux-data-table-copy ux-search-copy ux-destructive-action-copy; do
     for platform in claude-code gemini-cli cursor codex; do
       if [ ! -f "agents/skills/${platform}/${skill}/skill.yaml" ] || [ ! -f "agents/skills/${platform}/${skill}/SKILL.md" ]; then
         echo "MISSING: ${platform}/${skill}"
       fi
     done
   done
   echo "Check complete"
   ```

2. Run full schema validation:

   ```bash
   cd agents/skills && npx vitest run tests/schema.test.ts
   ```

3. Run platform parity test:

   ```bash
   cd agents/skills && npx vitest run tests/platform-parity.test.ts
   ```

4. Verify all SKILL.md files are 150-250 lines:

   ```bash
   for skill in ux-error-messages ux-error-severity ux-empty-states ux-onboarding-copy ux-button-cta-copy ux-form-labels ux-confirmation-dialogs ux-notification-copy ux-tooltip-contextual-help ux-loading-states ux-success-feedback ux-navigation-labels ux-permission-access-copy ux-settings-preferences ux-data-table-copy ux-search-copy ux-destructive-action-copy; do
     lines=$(wc -l < agents/skills/claude-code/${skill}/SKILL.md)
     if [ "$lines" -lt 150 ] || [ "$lines" -gt 250 ]; then
       echo "OUT OF RANGE: ${skill} = ${lines} lines"
     else
       echo "OK: ${skill} = ${lines} lines"
     fi
   done
   ```

5. Verify total ux-\* skill count is 25 (8 foundation + 17 contextual):

   ```bash
   ls -d agents/skills/claude-code/ux-*/ | wc -l
   ```

6. Run full test suite to check for regressions:

   ```bash
   cd agents/skills && npx vitest run
   ```

7. Run: `harness validate`
8. Commit: `test(skills): verify all 17 ux-writing contextual skills pass validation`

---

## Acceptance Criteria Traceability

| Observable Truth                                      | Delivered by Task(s)                                 |
| ----------------------------------------------------- | ---------------------------------------------------- |
| 1. 25 total ux-\* directories                         | Tasks 1-6, 8-13, 15-19 (17 new + 8 existing)         |
| 2. 68 directories, 136 files across 4 platforms       | Tasks 1-6, 8-13, 15-19 (platform copy in each)       |
| 3. SKILL.md 150-250 lines with required sections      | Tasks 1-6, 8-13, 15-19 (verified at Tasks 7, 14, 20) |
| 4. skill.yaml passes schema validation                | Tasks 7, 14, 20 (schema test runs)                   |
| 5. related_skills references foundation + design/a11y | Tasks 1-6, 8-13, 15-19 (specified per skill)         |
| 6. Platform parity test passes                        | Tasks 7, 14, 20 (parity test runs)                   |
| 7. Schema tests pass with no new failures             | Task 20 (full test suite)                            |
| 8. harness validate passes                            | Task 20 (final validation)                           |
