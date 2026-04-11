# Plan: UX Writing Phase 1 -- Foundation Knowledge Skills

**Date:** 2026-04-10
**Spec:** docs/changes/ux-writing-knowledge-skills/proposal.md
**Estimated tasks:** 10
**Estimated time:** 45 minutes

## Goal

Create 8 foundation-level UX writing knowledge skills (`ux-` prefix) with full platform parity across claude-code, gemini-cli, cursor, and codex.

## Observable Truths (Acceptance Criteria)

1. When listing `agents/skills/claude-code/ux-*/`, the system shall show 8 directories: `ux-microcopy-principles`, `ux-voice-tone`, `ux-plain-language`, `ux-active-voice`, `ux-content-hierarchy`, `ux-writing-for-scanning`, `ux-inclusive-language`, `ux-internationalization-writing`.
2. Each of the 8 skill directories shall contain both `skill.yaml` and `SKILL.md` in all 4 platform directories (claude-code, gemini-cli, cursor, codex) -- 32 directories total, 64 files total.
3. Each `SKILL.md` shall be 150-250 lines, start with an `# H1` heading, contain `## Instructions` (required for knowledge type), `## When to Use`, `## Details`, `## Source`, `## Process`, `## Harness Integration`, `## Success Criteria`, at least 3 anti-patterns, and at least 2 worked examples from real production systems.
4. Each `skill.yaml` shall pass `SkillMetadataSchema` validation with `type: knowledge`, `tier: 3`, `cognitive_mode: advisory-guide`, `triggers: [manual]`, `platforms: [claude-code, gemini-cli, cursor, codex]`, `tools: []`.
5. The platform parity test (`agents/skills/tests/platform-parity.test.ts`) shall pass for all 8 new skills -- identical `skill.yaml` and `SKILL.md` across all 4 platforms.
6. Running `cd agents/skills && npx vitest run` shall introduce no new test failures beyond the 33 pre-existing failures from `stability` field issues.

## File Map

```
CREATE agents/skills/claude-code/ux-microcopy-principles/skill.yaml
CREATE agents/skills/claude-code/ux-microcopy-principles/SKILL.md
CREATE agents/skills/claude-code/ux-voice-tone/skill.yaml
CREATE agents/skills/claude-code/ux-voice-tone/SKILL.md
CREATE agents/skills/claude-code/ux-plain-language/skill.yaml
CREATE agents/skills/claude-code/ux-plain-language/SKILL.md
CREATE agents/skills/claude-code/ux-active-voice/skill.yaml
CREATE agents/skills/claude-code/ux-active-voice/SKILL.md
CREATE agents/skills/claude-code/ux-content-hierarchy/skill.yaml
CREATE agents/skills/claude-code/ux-content-hierarchy/SKILL.md
CREATE agents/skills/claude-code/ux-writing-for-scanning/skill.yaml
CREATE agents/skills/claude-code/ux-writing-for-scanning/SKILL.md
CREATE agents/skills/claude-code/ux-inclusive-language/skill.yaml
CREATE agents/skills/claude-code/ux-inclusive-language/SKILL.md
CREATE agents/skills/claude-code/ux-internationalization-writing/skill.yaml
CREATE agents/skills/claude-code/ux-internationalization-writing/SKILL.md
CREATE agents/skills/gemini-cli/ux-microcopy-principles/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-voice-tone/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-plain-language/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-active-voice/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-content-hierarchy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-writing-for-scanning/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-inclusive-language/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/gemini-cli/ux-internationalization-writing/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-microcopy-principles/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-voice-tone/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-plain-language/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-active-voice/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-content-hierarchy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-writing-for-scanning/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-inclusive-language/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/cursor/ux-internationalization-writing/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-microcopy-principles/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-voice-tone/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-plain-language/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-active-voice/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-content-hierarchy/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-writing-for-scanning/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-inclusive-language/{skill.yaml,SKILL.md}  (copy)
CREATE agents/skills/codex/ux-internationalization-writing/{skill.yaml,SKILL.md}  (copy)
```

**Total: 32 directories, 64 files (16 source files in claude-code + 48 identical copies across 3 platforms)**

## Skeleton

1. Create first skill (ux-microcopy-principles) with platform copies (~1 task, ~5 min)
2. Checkpoint: verify pattern passes schema, structure, and parity tests (~1 task, ~3 min)
3. Create remaining 7 foundation skills with platform copies (~7 tasks, ~35 min, parallelizable)
4. Run full validation suite (~1 task, ~3 min)

**Estimated total:** 10 tasks, ~45 minutes

## Template Reference

All skills follow the pattern established by `agents/skills/claude-code/design-empty-error-states/`. Key structural decisions derived from examining the template:

- **skill.yaml fields:** `name`, `version`, `description`, `cognitive_mode`, `type`, `tier`, `triggers`, `platforms`, `tools`, `paths`, `related_skills`, `stack_signals`, `keywords`, `metadata`, `state`, `depends_on`. Do NOT include `stability` (not in SkillMetadataSchema, causes test failures).
- **platforms list:** All 4 platforms listed in every copy (identical files across platforms, validated by platform-parity test).
- **SKILL.md sections for knowledge type:** `# Title`, `> blockquote description`, `## When to Use`, `## Instructions`, `## Details` (with `### Anti-Patterns` subsection), `## Source`, `## Process`, `## Harness Integration`, `## Success Criteria`.
- **Platform distribution:** Identical copies of both files to all 4 platform directories. The parity test at `agents/skills/tests/platform-parity.test.ts` enforces byte-identical content.

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
  - <2-5 related ux-* and design-* skills>
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

## Tasks

### Task 1: Create ux-microcopy-principles (pattern validation)

**Depends on:** none
**Files:** `agents/skills/claude-code/ux-microcopy-principles/skill.yaml`, `agents/skills/claude-code/ux-microcopy-principles/SKILL.md`

This is the first skill and serves as the pattern validator. Create it, copy to all platforms, and run tests before proceeding.

1. Create directory:

   ```bash
   mkdir -p agents/skills/claude-code/ux-microcopy-principles
   ```

2. Create `agents/skills/claude-code/ux-microcopy-principles/skill.yaml`:

   ```yaml
   name: ux-microcopy-principles
   version: '1.0.0'
   description: Microcopy principles — clarity, brevity, human voice, active voice, and the core rules all UI text follows
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
     - ux-voice-tone
     - ux-plain-language
     - ux-active-voice
   stack_signals: []
   keywords:
     - microcopy
     - ui-text
     - clarity
     - brevity
     - human-voice
   metadata:
     author: community
   state:
     persistent: false
     files: []
   depends_on: []
   ```

3. Create `agents/skills/claude-code/ux-microcopy-principles/SKILL.md` (150-250 lines):
   - Title: `# Microcopy Principles`
   - Blockquote matching skill.yaml description
   - `## When to Use`: writing button labels, error messages, tooltips, empty states, onboarding text, form labels, confirmation dialogs, notification text. NOT for: marketing copy, documentation, blog posts.
   - `## Instructions`: 6-8 numbered principles:
     1. Lead with the user's goal, not the system's action (Stripe: "Pay $49.99" not "Submit payment")
     2. Use 1st/2nd person for human voice ("You have 3 notifications" not "There are 3 notifications")
     3. Keep UI text under 2 lines -- if longer, restructure or use progressive disclosure (Slack message actions)
     4. Front-load the keyword in every label (GitHub: "Pull requests" not "List of pull requests")
     5. Use specific verbs over generic ones ("Save draft" not "OK", "Delete project" not "Confirm")
     6. Match the user's vocabulary -- test with the 5-second rule (Notion: "page" not "document instance")
     7. Write for the moment -- microcopy must make sense without reading the rest of the page (Apple: "Face ID is now set up")
     8. Eliminate filler words -- every word must earn its place ("3 items selected" not "You have selected a total of 3 items")
   - `## Details`: subsections for character limits by component type (buttons: 1-3 words, tooltips: 1 sentence, toasts: 1-2 sentences, empty states: 2-3 sentences), the five-second test methodology
   - `### Anti-Patterns`: 3+ with before/after: (1) The Robot Voice, (2) The Wall of Text, (3) The Vague Verb, (4) The Redundant Label
   - `### Real-World Examples`: Stripe checkout flow microcopy, GitHub pull request labels, Slack notification patterns
   - `## Source`: NNGroup microcopy guidelines, Kinneret Yifrah _Microcopy: The Complete Guide_, Material Design writing guidelines
   - `## Process`, `## Harness Integration`, `## Success Criteria` per template

4. Copy to all platforms:

   ```bash
   SKILL="ux-microcopy-principles"
   BASE="agents/skills/claude-code/${SKILL}"
   for PLATFORM in gemini-cli cursor codex; do
     mkdir -p "agents/skills/${PLATFORM}/${SKILL}"
     cp "${BASE}/skill.yaml" "agents/skills/${PLATFORM}/${SKILL}/skill.yaml"
     cp "${BASE}/SKILL.md" "agents/skills/${PLATFORM}/${SKILL}/SKILL.md"
   done
   ```

5. Run: `harness validate`
6. Commit: `feat(skills): add ux-microcopy-principles knowledge skill with platform parity`

---

### Task 2: Verify pattern passes all tests

**Depends on:** Task 1
**[checkpoint:human-verify]** -- Verify the pattern is correct before creating 7 more skills.

1. Run schema and structure validation:

   ```bash
   cd agents/skills && npx vitest run tests/structure.test.ts 2>&1 | grep -E "(ux-microcopy|FAIL|PASS|Tests)"
   ```

   Observe: `ux-microcopy-principles` tests pass (schema validation, h1 heading, required sections).

2. Run platform parity test:

   ```bash
   cd agents/skills && npx vitest run tests/platform-parity.test.ts 2>&1 | grep -E "(ux-microcopy|FAIL|PASS|Tests)"
   ```

   Observe: `ux-microcopy-principles` exists in all platforms with identical content.

3. Run references test:

   ```bash
   cd agents/skills && npx vitest run tests/references.test.ts 2>&1 | grep -E "(ux-microcopy|FAIL|PASS|Tests)"
   ```

   Observe: `ux-microcopy-principles/skill.yaml` conforms to schema.

4. Verify line count:

   ```bash
   wc -l agents/skills/claude-code/ux-microcopy-principles/SKILL.md
   ```

   Observe: between 150 and 250 lines.

5. Verify anti-pattern count:

   ```bash
   grep -c "^\d\." agents/skills/claude-code/ux-microcopy-principles/SKILL.md  # or manually count under Anti-Patterns
   ```

6. **Decision gate:** If any test fails, fix the pattern in Task 1 before proceeding. If all pass, proceed to Tasks 3-9 (which can run in parallel).

7. Run: `harness validate`

---

### Task 3: Create ux-voice-tone

**Depends on:** Task 2 (checkpoint passed)
**Parallel with:** Tasks 4-9
**Files:** `agents/skills/claude-code/ux-voice-tone/skill.yaml`, `agents/skills/claude-code/ux-voice-tone/SKILL.md`

1. Create `agents/skills/claude-code/ux-voice-tone/skill.yaml`:

   ```yaml
   name: ux-voice-tone
   version: '1.0.0'
   description: Voice and tone in UI writing — defining voice (constant) vs tone (contextual), formality calibration, and emotional register
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
     - ux-microcopy-principles
     - ux-plain-language
     - ux-inclusive-language
   stack_signals: []
   keywords:
     - voice
     - tone
     - formality
     - brand-voice
     - emotional-register
   metadata:
     author: community
   state:
     persistent: false
     files: []
   depends_on: []
   ```

2. Create `agents/skills/claude-code/ux-voice-tone/SKILL.md` (150-250 lines):
   - Title: `# Voice and Tone`
   - `## When to Use`: establishing product voice guidelines, calibrating tone for different contexts (error vs success vs neutral), writing for different emotional states (frustrated user vs delighted user), auditing existing UI text for consistency. NOT for: marketing brand guidelines, editorial voice for blog/docs.
   - `## Instructions`: 6-8 principles:
     1. Voice is constant, tone varies by context -- voice is personality, tone is mood (Slack: always casual voice, but serious tone for data deletion)
     2. Define your voice with 3-5 adjectives and their opposites ("Friendly, not familiar. Confident, not arrogant" -- Mailchimp)
     3. Calibrate formality to consequences -- higher stakes = more formal (Stripe: casual for dashboard, formal for payment failures)
     4. Match the user's emotional state before redirecting -- acknowledge frustration before offering solutions
     5. Use the tone spectrum: playful - neutral - serious - urgent -- map each UI context to a point on the spectrum
     6. Avoid false cheerfulness in negative moments ("Oops!" for a failed payment is tone-deaf)
     7. Test tone with the "read it out loud to a stranger" method
   - `## Details`: Voice documentation template (voice chart with do/don't columns), tone mapping matrix (context x urgency), formality ladder
   - `### Anti-Patterns`: (1) The Tone-Deaf Celebration, (2) The Corporate Robot, (3) The Inconsistent Personality, (4) The Forced Humor
   - `### Real-World Examples`: Mailchimp's voice and tone guide, Slack's personality in microcopy, Stripe's formality gradient
   - `## Source`: Mailchimp Content Style Guide, NNGroup "Tone of Voice" series, Kate Kiefer Lee _Nicely Said_
   - Standard `## Process`, `## Harness Integration`, `## Success Criteria`

3. Copy to all platforms (same command pattern as Task 1 with `SKILL="ux-voice-tone"`).
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-voice-tone knowledge skill with platform parity`

---

### Task 4: Create ux-plain-language

**Depends on:** Task 2
**Parallel with:** Tasks 3, 5-9
**Files:** `agents/skills/claude-code/ux-plain-language/skill.yaml`, `agents/skills/claude-code/ux-plain-language/SKILL.md`

1. Create `agents/skills/claude-code/ux-plain-language/skill.yaml`:

   ```yaml
   name: ux-plain-language
   version: '1.0.0'
   description: Plain language for UI — reading level targeting, jargon elimination, sentence structure for scanning
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
     - ux-microcopy-principles
     - ux-writing-for-scanning
     - ux-active-voice
     - design-readability
   stack_signals: []
   keywords:
     - plain-language
     - readability
     - jargon
     - reading-level
     - sentence-structure
   metadata:
     author: community
   state:
     persistent: false
     files: []
   depends_on: []
   ```

2. Create `agents/skills/claude-code/ux-plain-language/SKILL.md` (150-250 lines):
   - Title: `# Plain Language for UI`
   - `## When to Use`: writing any user-facing text, simplifying technical concepts for non-technical users, reducing reading level of existing UI text, writing help text and tooltips, creating onboarding copy. NOT for: developer-facing API documentation, internal tooling for domain experts.
   - `## Instructions`: 6-8 principles:
     1. Target a 6th-8th grade reading level for consumer products (Hemingway rule) -- use Flesch-Kincaid to measure
     2. Replace jargon with common words ("use" not "utilize", "start" not "initialize", "choose" not "select from the available options")
     3. One idea per sentence -- if a sentence has a comma and a conjunction, split it
     4. Prefer concrete nouns over abstract ones ("your file" not "the uploaded resource")
     5. Use the word the user would use to search for this feature (Google: "Undo send" not "Message recall")
     6. Define technical terms on first use when they cannot be avoided (GitHub: "Fork -- create your own copy")
     7. Cut nominalizations -- verb forms over noun forms ("decide" not "make a decision", "notify" not "send a notification")
   - `## Details`: Jargon replacement table (20+ common substitutions), reading level targets by audience (consumer: grade 6-8, prosumer: grade 8-10, developer: grade 10-12), sentence length guidelines (max 20 words for UI text)
   - `### Anti-Patterns`: (1) The Thesaurus Trap, (2) The Legalese Leak, (3) The Acronym Soup
   - `### Real-World Examples`: gov.uk's plain language transformation examples, Stripe's API error messages in plain language, Notion's feature naming
   - `## Source`: plainlanguage.gov, NNGroup "How Users Read on the Web", Flesch-Kincaid readability metrics, gov.uk content design manual
   - Standard sections

3. Copy to all platforms (same pattern with `SKILL="ux-plain-language"`).
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-plain-language knowledge skill with platform parity`

---

### Task 5: Create ux-active-voice

**Depends on:** Task 2
**Parallel with:** Tasks 3-4, 6-9
**Files:** `agents/skills/claude-code/ux-active-voice/skill.yaml`, `agents/skills/claude-code/ux-active-voice/SKILL.md`

1. Create `agents/skills/claude-code/ux-active-voice/skill.yaml`:

   ```yaml
   name: ux-active-voice
   version: '1.0.0'
   description: Active voice in UI writing — active vs passive voice, when passive is acceptable, verb-first patterns for buttons and actions
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
     - ux-microcopy-principles
     - ux-plain-language
   stack_signals: []
   keywords:
     - active-voice
     - passive-voice
     - verb-first
     - action-labels
     - imperative-mood
   metadata:
     author: community
   state:
     persistent: false
     files: []
   depends_on: []
   ```

2. Create `agents/skills/claude-code/ux-active-voice/SKILL.md` (150-250 lines):
   - Title: `# Active Voice in UI Writing`
   - `## When to Use`: writing button labels, menu items, error messages, instructions, confirmation dialogs, notification text, help text. NOT for: legal disclaimers, privacy policies, terms of service (where passive is sometimes legally required).
   - `## Instructions`: 5-7 principles:
     1. Default to active voice -- the user or system should be the subject ("We saved your changes" not "Your changes have been saved")
     2. Use imperative mood for all actionable elements -- buttons, links, menu items start with a verb ("Save draft", "Delete project", "Export data")
     3. Name the actor in error messages -- "We couldn't connect" not "Connection could not be established"
     4. Know when passive is correct -- when the actor is irrelevant or the object is the focus ("Your account was created on March 1" -- who created it doesn't matter)
     5. Use verb-noun pattern for buttons -- the verb is the action, the noun is the object ("Add member", "Create project", "Upload file")
     6. Avoid hidden verbs (nominalizations) -- "configure" not "perform configuration", "export" not "begin the export process"
     7. Test with the "by zombies" rule -- if you can add "by zombies" after the verb, it's passive
   - `## Details`: Active vs passive comparison table (10+ UI examples), verb-first pattern catalog for different component types, exceptions where passive voice is preferred
   - `### Anti-Patterns`: (1) The Passive Blame Dodge, (2) The Nominalization Cascade, (3) The Actionless Button
   - `### Real-World Examples`: GitHub's imperative commit message convention, Apple's HIG button label patterns, Stripe's active-voice error messages
   - `## Source`: Apple HIG Writing Guidelines, Material Design writing principles, Strunk & White _The Elements of Style_, NNGroup "Passive vs. Active Voice"
   - Standard sections

3. Copy to all platforms (same pattern with `SKILL="ux-active-voice"`).
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-active-voice knowledge skill with platform parity`

---

### Task 6: Create ux-content-hierarchy

**Depends on:** Task 2
**Parallel with:** Tasks 3-5, 7-9
**Files:** `agents/skills/claude-code/ux-content-hierarchy/skill.yaml`, `agents/skills/claude-code/ux-content-hierarchy/SKILL.md`

1. Create `agents/skills/claude-code/ux-content-hierarchy/skill.yaml`:

   ```yaml
   name: ux-content-hierarchy
   version: '1.0.0'
   description: Content hierarchy in UI — heading structure, progressive disclosure in text, inverted pyramid for interface writing
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
     - ux-writing-for-scanning
     - ux-microcopy-principles
     - design-information-architecture
   stack_signals: []
   keywords:
     - content-hierarchy
     - headings
     - progressive-disclosure
     - inverted-pyramid
     - information-architecture
   metadata:
     author: community
   state:
     persistent: false
     files: []
   depends_on: []
   ```

2. Create `agents/skills/claude-code/ux-content-hierarchy/SKILL.md` (150-250 lines):
   - Title: `# Content Hierarchy in UI`
   - `## When to Use`: structuring settings pages, organizing help documentation within the app, designing multi-step forms, creating dashboard layouts with text, writing feature announcements. NOT for: visual hierarchy (spacing, size, color) -- that is design, not content.
   - `## Instructions`: 6-8 principles:
     1. Apply inverted pyramid to every text block -- most important information first, details after (Notion: "Your workspace is on the Free plan" then details of what that means)
     2. Heading levels must match content hierarchy -- never skip levels, headings are an outline of the page
     3. Use progressive disclosure for complexity -- show the simple version, let users expand for details (GitHub: collapsed diffs with summary stats visible)
     4. Front-load the conclusion in every paragraph -- the first sentence should be standalone useful
     5. Group related items under clear category labels -- "Account" then "Billing" then "Notifications" not a flat list
     6. Use the 3-level rule -- if content goes deeper than 3 levels of nesting, restructure
     7. Differentiate primary, secondary, and tertiary content with distinct patterns (bold for key terms, regular for descriptions, muted for metadata)
   - `## Details`: Heading hierarchy patterns for common page types (settings, onboarding, help), progressive disclosure decision framework, content grouping strategies
   - `### Anti-Patterns`: (1) The Flat Wall, (2) The Deep Nest, (3) The Buried Lead
   - `### Real-World Examples`: GitHub's repository settings hierarchy, Stripe's dashboard content organization, Linear's issue detail progressive disclosure
   - `## Source`: NNGroup "Information Scent", inverted pyramid from journalism, Krug _Don't Make Me Think_ ch. 7
   - Standard sections

3. Copy to all platforms (same pattern with `SKILL="ux-content-hierarchy"`).
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-content-hierarchy knowledge skill with platform parity`

---

### Task 7: Create ux-writing-for-scanning

**Depends on:** Task 2
**Parallel with:** Tasks 3-6, 8-9
**Files:** `agents/skills/claude-code/ux-writing-for-scanning/skill.yaml`, `agents/skills/claude-code/ux-writing-for-scanning/SKILL.md`

1. Create `agents/skills/claude-code/ux-writing-for-scanning/skill.yaml`:

   ```yaml
   name: ux-writing-for-scanning
   version: '1.0.0'
   description: Writing for scanning — F-pattern, front-loading keywords, chunking, bullet vs prose decisions for UI text
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
     - ux-content-hierarchy
     - ux-plain-language
     - ux-microcopy-principles
     - design-readability
   stack_signals: []
   keywords:
     - scanning
     - f-pattern
     - front-loading
     - chunking
     - scanability
   metadata:
     author: community
   state:
     persistent: false
     files: []
   depends_on: []
   ```

2. Create `agents/skills/claude-code/ux-writing-for-scanning/SKILL.md` (150-250 lines):
   - Title: `# Writing for Scanning`
   - `## When to Use`: writing any UI text longer than one sentence, designing help pages, creating feature descriptions, writing changelog entries, composing email notifications. NOT for: legal text where completeness overrides scannability.
   - `## Instructions`: 6-8 principles:
     1. Front-load the keyword in every line -- users scan the first 2 words (eye-tracking: "Export data" not "Click here to export your data")
     2. Use the F-pattern -- users read the first line fully, then scan left edges of subsequent lines (NNGroup research)
     3. Bullets over prose when listing 3+ items -- a 5-item paragraph is unreadable, a 5-item list is scannable
     4. Chunk text into groups of 3-5 related items -- cognitive load research supports this limit (Miller's Law)
     5. Use bold for scannable anchors -- one bolded term per paragraph gives the scanning eye a landing point
     6. Keep paragraphs to 3 sentences max in UI context -- if longer, break into sub-sections or bullets
     7. Use parallel structure in lists -- every bullet starts with the same part of speech (verb-first or noun-first)
     8. Whitespace is content -- a blank line between groups communicates "new topic" faster than any heading
   - `## Details`: F-pattern layout with examples, bullet vs prose decision matrix, character-count guidelines per component, parallel structure examples
   - `### Anti-Patterns`: (1) The Prose Block, (2) The Endless List, (3) The Buried Keyword
   - `### Real-World Examples`: GitHub's changelog format, Notion's slash-command menu labels, Stripe's API documentation scannability patterns
   - `## Source`: NNGroup "F-Shaped Pattern for Reading Web Content", NNGroup "How Users Read on the Web", Miller "The Magical Number Seven"
   - Standard sections

3. Copy to all platforms (same pattern with `SKILL="ux-writing-for-scanning"`).
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-writing-for-scanning knowledge skill with platform parity`

---

### Task 8: Create ux-inclusive-language

**Depends on:** Task 2
**Parallel with:** Tasks 3-7, 9
**Files:** `agents/skills/claude-code/ux-inclusive-language/skill.yaml`, `agents/skills/claude-code/ux-inclusive-language/SKILL.md`

1. Create `agents/skills/claude-code/ux-inclusive-language/skill.yaml`:

   ```yaml
   name: ux-inclusive-language
   version: '1.0.0'
   description: Inclusive language in UI — gender-neutral, ability-neutral, culture-aware writing, avoiding idioms that exclude
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
     - ux-microcopy-principles
     - ux-voice-tone
     - ux-internationalization-writing
   stack_signals: []
   keywords:
     - inclusive-language
     - gender-neutral
     - accessibility
     - bias-free
     - culture-aware
   metadata:
     author: community
   state:
     persistent: false
     files: []
   depends_on: []
   ```

2. Create `agents/skills/claude-code/ux-inclusive-language/SKILL.md` (150-250 lines):
   - Title: `# Inclusive Language in UI`
   - `## When to Use`: writing any user-facing text, reviewing existing UI text for bias, designing forms that collect personal information, writing error messages and help text, creating onboarding flows. NOT for: quoted content where original language must be preserved, legal text with specific defined terms.
   - `## Instructions`: 6-8 principles:
     1. Use "they/them" as default singular pronoun in UI text -- "When a user logs in, they see their dashboard" (GitHub, Slack, Stripe all adopt this)
     2. Avoid ability-based metaphors -- "check" not "see", "select" not "click", "review" not "look at" (supports screen reader users)
     3. Replace gendered defaults -- "staffed" not "manned", "sales team" not "salesmen", "everyone" not "guys"
     4. Avoid idioms that assume cultural context -- "home run" and "level the playing field" mean nothing outside English-speaking cultures
     5. Use person-first or identity-first language based on community preference -- "person with a disability" or "disabled person" depending on context
     6. Design inclusive forms -- provide "Prefer not to say" options, do not require binary gender, use "Family name" not "Last name" (global sensitivity)
     7. Avoid violent metaphors in technical contexts -- "terminate" can be replaced with "end", "kill" with "stop", "abort" with "cancel"
   - `## Details`: Inclusive language substitution table (30+ replacements), form design inclusivity checklist, pronoun usage guidelines by language
   - `### Anti-Patterns`: (1) The Gendered Default, (2) The Ableist Metaphor, (3) The Cultural Assumption
   - `### Real-World Examples`: Microsoft's inclusive writing guide in practice, GitHub's rename from "master" to "main", Slack's inclusive emoji and language patterns
   - `## Source`: Microsoft Writing Style Guide (inclusive language chapter), W3C WCAG cognitive accessibility, Google developer documentation style guide, 18F content guide
   - Standard sections

3. Copy to all platforms (same pattern with `SKILL="ux-inclusive-language"`).
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-inclusive-language knowledge skill with platform parity`

---

### Task 9: Create ux-internationalization-writing

**Depends on:** Task 2
**Parallel with:** Tasks 3-8
**Files:** `agents/skills/claude-code/ux-internationalization-writing/skill.yaml`, `agents/skills/claude-code/ux-internationalization-writing/SKILL.md`

1. Create `agents/skills/claude-code/ux-internationalization-writing/skill.yaml`:

   ```yaml
   name: ux-internationalization-writing
   version: '1.0.0'
   description: Writing for internationalization — source strings that survive translation, concatenation traps, pluralization, date and number references
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
     - ux-inclusive-language
     - ux-plain-language
     - ux-microcopy-principles
     - design-i18n-design
   stack_signals: []
   keywords:
     - internationalization
     - i18n
     - translation
     - localization
     - pluralization
     - concatenation
   metadata:
     author: community
   state:
     persistent: false
     files: []
   depends_on: []
   ```

2. Create `agents/skills/claude-code/ux-internationalization-writing/SKILL.md` (150-250 lines):
   - Title: `# Writing for Internationalization`
   - `## When to Use`: writing source strings for any product that will be translated, designing UI text that includes numbers/dates/currencies, building features with pluralized counts, reviewing existing UI text for translation-readiness. NOT for: string extraction tooling (covered by `harness-i18n`), locale-specific content creation, right-to-left layout design.
   - `## Instructions`: 6-8 principles:
     1. Never concatenate strings to build sentences -- "Welcome, {name}!" is translatable, "Welcome, " + name + "!" breaks in languages with different word order (German, Japanese)
     2. Use ICU MessageFormat for pluralization -- English has 2 plural forms, Arabic has 6, Polish has 4 (never use `count === 1 ? "item" : "items"`)
     3. Do not embed UI text in code -- every user-visible string must be in a resource file, even "OK" and "Cancel"
     4. Keep sentences complete and self-contained -- translators need full context, not fragments assembled at runtime
     5. Avoid positional humor, puns, and wordplay -- they rarely survive translation ("I'm feeling lucky" required creative adaptation in every Google locale)
     6. Design for text expansion -- German text is ~30% longer than English, Finnish can be 40% longer. UI must accommodate.
     7. Reference dates, times, currencies with format tokens, not hardcoded formats -- "{date}" not "March 15" or "3/15", "{price}" not "$49.99"
     8. Write translator-friendly comments -- every string with a variable should have a comment explaining what the variable represents and the context
   - `## Details`: Concatenation trap examples (10+ patterns that break in translation), ICU MessageFormat syntax reference, text expansion ratios by language, translator comment conventions
   - `### Anti-Patterns`: (1) The Concatenation Trap, (2) The Hardcoded Format, (3) The Orphaned Fragment
   - `### Real-World Examples`: Mozilla's Pontoon translation platform string guidelines, Airbnb's i18n string patterns, Android resource string best practices
   - `## Source`: W3C Internationalization Best Practices, Unicode CLDR plural rules, ICU MessageFormat documentation, Google i18n guide
   - Standard sections

3. Copy to all platforms (same pattern with `SKILL="ux-internationalization-writing"`).
4. Run: `harness validate`
5. Commit: `feat(skills): add ux-internationalization-writing knowledge skill with platform parity`

---

### Task 10: Run full validation suite

**Depends on:** Tasks 1-9
**Files:** none (validation only)

1. Run all skill tests:

   ```bash
   cd agents/skills && npx vitest run
   ```

   Observe: no new failures. The 33 pre-existing `stability` field failures remain, but no new failures from the 8 `ux-*` skills.

2. Verify all 8 skills exist in all 4 platforms:

   ```bash
   for SKILL in ux-microcopy-principles ux-voice-tone ux-plain-language ux-active-voice ux-content-hierarchy ux-writing-for-scanning ux-inclusive-language ux-internationalization-writing; do
     for PLATFORM in claude-code gemini-cli cursor codex; do
       if [ ! -f "agents/skills/${PLATFORM}/${SKILL}/skill.yaml" ] || [ ! -f "agents/skills/${PLATFORM}/${SKILL}/SKILL.md" ]; then
         echo "MISSING: ${PLATFORM}/${SKILL}"
       fi
     done
   done
   echo "Verification complete"
   ```

   Observe: no "MISSING" output.

3. Verify all SKILL.md files are 150-250 lines:

   ```bash
   for SKILL in ux-microcopy-principles ux-voice-tone ux-plain-language ux-active-voice ux-content-hierarchy ux-writing-for-scanning ux-inclusive-language ux-internationalization-writing; do
     LINES=$(wc -l < "agents/skills/claude-code/${SKILL}/SKILL.md")
     if [ "$LINES" -lt 150 ] || [ "$LINES" -gt 250 ]; then
       echo "OUT OF RANGE: ${SKILL} has ${LINES} lines"
     fi
   done
   echo "Line count check complete"
   ```

   Observe: no "OUT OF RANGE" output.

4. Run: `harness validate`
5. Run: `harness check-deps`

## Traceability

| Observable Truth                                   | Delivered By                                       |
| -------------------------------------------------- | -------------------------------------------------- |
| 1. Eight `ux-*/` directories in claude-code        | Tasks 1, 3-9                                       |
| 2. All 4 platforms have copies (32 dirs, 64 files) | Tasks 1, 3-9 (copy step), Task 10 (verification)   |
| 3. SKILL.md 150-250 lines with required sections   | Tasks 1, 3-9 (content), Task 10 (line count check) |
| 4. skill.yaml passes SkillMetadataSchema           | Task 2 (pattern check), Task 10 (full suite)       |
| 5. Platform parity test passes                     | Task 2 (pattern check), Task 10 (full suite)       |
| 6. No new test failures                            | Task 10 (full suite)                               |
