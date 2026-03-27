# Harness UX Copy

> Audit microcopy, error messages, and UI strings for voice/tone consistency, clarity, and actionability. Produces a structured report with specific rewrites and a project voice guide when none exists.

## When to Use

- When reviewing a PR that adds or changes user-facing text (labels, error messages, tooltips, onboarding flows)
- When establishing or enforcing a voice/tone guide across a product
- When error messages are vague, blame the user, or lack actionable next steps
- NOT for internationalization string extraction (use harness-i18n)
- NOT for accessibility auditing of non-text elements (use harness-accessibility)
- NOT for marketing copy or landing page content outside the application

## Process

### Phase 1: DISCOVER -- Locate UI String Sources

1. **Resolve project root.** Use provided path or cwd.

2. **Locate voice/tone guide.** Search for `VOICE.md`, `STYLE.md`, `docs/voice-guide.md`, `docs/tone.md`, or a `voice` section in `harness.config.json`. If no guide is found, flag this as a gap and use sensible defaults (clear, concise, respectful, action-oriented).

3. **Identify string sources.** Scan the project for UI text using multiple strategies:
   - Component files: `src/**/components/**/*.{tsx,jsx,vue,svelte}` for inline text
   - String constants: `src/**/strings*`, `src/**/messages*`, `src/**/copy*` for centralized copy
   - i18n files: `src/**/i18n/**`, `locales/`, `translations/` for translation keys
   - Error definitions: files containing `throw new Error`, `toast.error`, `setError`, `addNotification`
   - Form labels: files containing `label=`, `placeholder=`, `aria-label=`, `helperText=`

4. **Determine audit scope.** If `--scope` is provided, filter to the specified category. If triggered by a PR, scope to changed files only using `git diff --name-only`.

5. **Build string inventory.** Extract all user-facing strings with their source location, category (error, label, help, onboarding, confirmation, empty-state), and surrounding context.

6. **Report discovery summary.** Output the count of strings found by category and source type:
   ```
   Discovery: 142 strings found
     Errors: 23 | Labels: 48 | Help text: 31 | Onboarding: 12 | Empty states: 8 | Other: 20
     Sources: 18 components, 3 string files, 2 i18n bundles
   ```

---

### Phase 2: AUDIT -- Evaluate Copy Quality

1. **Check error messages against quality rules.** Every error message must satisfy:
   - **What happened:** Describe the problem without technical jargon
   - **Why it happened:** Provide context when possible (not "An error occurred")
   - **What to do next:** Include an actionable recovery step
   - **No blame language:** Avoid "you failed to," "invalid input," "wrong password" -- prefer "we couldn't," "please check," "that password didn't match"

2. **Check labels and form text.** Evaluate:
   - **Clarity:** Can the user understand what is expected without additional context?
   - **Consistency:** Are similar fields labeled the same way across the app? (e.g., "Email" vs "Email address" vs "E-mail")
   - **Brevity:** Are labels concise without sacrificing clarity?
   - **Placeholder misuse:** Are placeholders being used as labels? (accessibility anti-pattern)

3. **Check voice/tone alignment.** Compare strings against the voice guide (or defaults):
   - **Formality level:** Is the tone consistent? (e.g., mixing "gonna" with "We regret to inform you")
   - **Pronoun usage:** Is first/second person used consistently? ("your account" vs "the account")
   - **Technical jargon:** Are technical terms exposed to non-technical users?
   - **Emotional tone:** Are error states empathetic? Are success states appropriately celebratory?

4. **Check empty states and onboarding.** Evaluate:
   - Do empty states explain what will appear and how to get started?
   - Do onboarding flows use progressive disclosure?
   - Are CTAs clear and specific? ("Add your first project" vs "Get started")

5. **Check confirmation dialogs.** Evaluate:
   - Is the consequence of the action clearly stated?
   - Are button labels specific? ("Delete project" vs "OK")
   - Is the destructive action visually distinct?

6. **Classify findings by severity:**
   - **Error:** Misleading text, blame language, missing recovery steps, accessibility violations
   - **Warning:** Inconsistent terminology, vague CTAs, jargon exposure
   - **Info:** Style preferences, minor tone adjustments, punctuation inconsistencies

---

### Phase 3: GUIDE -- Produce Recommendations

1. **Generate specific rewrites.** For every error and warning finding, provide:
   - The current string (with file location)
   - The recommended rewrite
   - The rule that triggered the finding
   - A brief rationale

2. **Produce consistency patches.** When terminology is inconsistent (e.g., "Sign in" vs "Log in"), recommend a single canonical term and list all locations that need updating.

3. **Generate voice guide draft.** If no voice guide was found in Phase 1, produce a draft `VOICE.md` covering:
   - Brand voice attributes (3-5 adjectives with examples)
   - Tone spectrum (how voice changes by context: error, success, onboarding, help)
   - Word list (preferred terms and terms to avoid)
   - Punctuation and capitalization rules
   - Example patterns for common UI scenarios

4. **Produce error message template.** Generate a reusable template for error messages:

   ```
   [What happened]. [Why / context]. [What to do next].
   Example: "We couldn't save your changes. The file may have been modified by someone else. Try refreshing the page and saving again."
   ```

5. **Prioritize recommendations.** Order by impact: error-severity findings first, then warnings grouped by frequency (most repeated patterns first), then informational suggestions.

---

### Phase 4: VALIDATE -- Verify Recommendations

1. **Check rewrites preserve meaning.** Verify each recommended rewrite conveys the same information as the original. Flag any rewrite that changes the semantic meaning.

2. **Check i18n compatibility.** If the project uses i18n:
   - Verify recommended strings do not break interpolation variables (`{count}`, `{{name}}`)
   - Verify string key references remain valid
   - Flag any rewrites that would require translator review

3. **Check length constraints.** Verify rewrites fit within UI constraints:
   - Button labels: typically under 25 characters
   - Toast messages: typically under 100 characters
   - Form labels: typically under 40 characters
   - Flag any rewrite that significantly increases string length

4. **Output structured report.** Present findings in a format suitable for PR review:

   ```
   UX Copy Audit: [PASS/NEEDS_ATTENTION/FAIL]
   Strings audited: N
   Findings: E errors, W warnings, I info

   ERRORS:
   [UXC-ERR-001] src/components/LoginForm.tsx:42
     Current: "Invalid credentials"
     Recommended: "That email and password combination didn't match. Please try again or reset your password."
     Rule: error-missing-recovery-step

   WARNINGS:
   [UXC-WARN-001] Inconsistent terminology: "Sign in" (4 occurrences) vs "Log in" (2 occurrences)
     Recommendation: Standardize on "Sign in" across all 6 locations.
   ```

5. **Verify voice guide completeness.** If a voice guide was generated, confirm it covers all required sections and includes at least 3 examples per section.

---

## Harness Integration

- **`harness skill run harness-ux-copy`** -- Primary command for running the UX copy audit.
- **`harness validate`** -- Run after applying recommended changes to verify project health.
- **`Glob`** -- Used to locate string sources, component files, and voice guides.
- **`Grep`** -- Used to extract inline strings, error patterns, and label attributes from source files.
- **`Read`** -- Used to read voice guides, component files, and string constant files.
- **`Write`** -- Used to generate voice guide drafts when none exists.
- **`emit_interaction`** -- Used to present findings and request confirmation on bulk terminology changes.

## Success Criteria

- All user-facing strings in scope are audited
- Every error message is evaluated for what-happened, why, and what-to-do-next
- Terminology inconsistencies are identified with canonical term recommendations
- Specific rewrites are provided for every error and warning finding
- Rewrites preserve semantic meaning and i18n compatibility
- Voice guide exists (found or generated) with actionable patterns
- Report follows structured format with severity classification

## Examples

### Example: React Application with Vague Error Messages

```
Phase 1: DISCOVER
  Scanned: 34 components, 2 string files, 1 i18n bundle
  Found: 89 strings (18 errors, 32 labels, 14 help text, 25 other)
  Voice guide: not found (will generate draft)

Phase 2: AUDIT
  [UXC-ERR-001] src/components/CheckoutForm.tsx:78
    "Payment failed" -- missing context and recovery step
  [UXC-ERR-002] src/components/SignupForm.tsx:33
    "Invalid email" -- blame language, no guidance
  [UXC-WARN-001] Terminology inconsistency:
    "Shopping cart" (3 files) vs "Cart" (5 files) vs "Basket" (1 file)
  [UXC-WARN-002] src/components/EmptyOrders.tsx:12
    "No orders" -- empty state missing guidance on what to do

Phase 3: GUIDE
  Rewrite: "Payment failed" ->
    "Your payment didn't go through. Please check your card details and try again, or use a different payment method."
  Rewrite: "Invalid email" ->
    "Please enter a valid email address, like name@example.com."
  Terminology: Standardize on "Cart" (most frequent, shortest)
  Generated: VOICE.md draft with friendly-professional tone

Phase 4: VALIDATE
  All rewrites preserve original meaning: YES
  i18n interpolation variables intact: YES
  Length constraints met: 1 warning (payment rewrite exceeds toast limit, suggest truncated variant)
  Result: NEEDS_ATTENTION -- 2 errors, 2 warnings
```

### Example: Vue.js SaaS Dashboard with Existing Voice Guide

```
Phase 1: DISCOVER
  Voice guide found: docs/VOICE.md (professional, empathetic, action-oriented)
  Scanned: 52 components, 4 string files
  Scope: PR diff (8 changed files, 14 new/modified strings)

Phase 2: AUDIT
  [UXC-ERR-001] src/views/Settings.vue:145
    "Error: 403 Forbidden" -- exposes HTTP status, no user context
  [UXC-WARN-001] src/views/Dashboard.vue:67
    "Click here to learn more" -- vague CTA, accessibility concern
  [UXC-INFO-001] src/components/Sidebar.vue:23
    "Organisations" -- British spelling, rest of app uses American English

Phase 3: GUIDE
  Rewrite: "Error: 403 Forbidden" ->
    "You don't have permission to change these settings. Ask your workspace admin to update your role."
  Rewrite: "Click here to learn more" ->
    "Learn how to configure integrations"
  Consistency: Standardize on American English per voice guide

Phase 4: VALIDATE
  All rewrites align with VOICE.md tone: YES
  Result: NEEDS_ATTENTION -- 1 error, 1 warning, 1 info
```

### Example: Next.js E-commerce with i18n (next-intl)

```
Phase 1: DISCOVER
  i18n framework: next-intl (detected via next.config.js and messages/ directory)
  Locales: en, es, fr, de
  Scanned: messages/en.json (312 keys)
  Scope: --scope errors

Phase 2: AUDIT
  [UXC-ERR-001] messages/en.json -> errors.generic
    "Something went wrong" -- no context, no recovery
  [UXC-ERR-002] messages/en.json -> errors.network
    "Network error" -- technical, no user action
  [UXC-ERR-003] messages/en.json -> checkout.cardDeclined
    "Your card was declined" -- blame language

Phase 3: GUIDE
  Rewrite: errors.generic ->
    "Something unexpected happened on our end. Please try again, or contact support if the problem continues."
  Rewrite: errors.network ->
    "We're having trouble connecting. Please check your internet connection and try again."
  Rewrite: checkout.cardDeclined ->
    "This card couldn't be processed. Please try a different card or contact your bank."
  Note: All rewrites use {variable} interpolation compatible with next-intl

Phase 4: VALIDATE
  Interpolation variables preserved: YES (no variables in affected keys)
  Translator review needed: YES (3 keys modified, flag for es/fr/de update)
  Result: NEEDS_ATTENTION -- 3 errors requiring translator coordination
```

## Gates

- **No rewrite may change semantic meaning.** If a recommended rewrite alters what the user understands about the situation or available actions, it is rejected. Rewrites improve clarity and tone, not content.
- **No breaking i18n interpolation.** Rewrites must preserve all interpolation variables exactly as they appear in the original string. A rewrite that drops `{count}` or renames `{{userName}}` is invalid.
- **No applying bulk changes without confirmation.** When a terminology standardization affects more than 5 files, present the change list and wait for human confirmation before recommending the batch edit.
- **No generating a voice guide that contradicts an existing one.** If a voice guide exists, recommendations must align with it. If the guide itself has problems, flag them separately rather than overriding.

## Escalation

- **When the voice guide conflicts with accessibility best practices:** Flag the conflict. Accessibility requirements take precedence over voice guide preferences. Example: the guide says "use playful language for errors" but playful error messages can confuse screen reader users. Recommend a voice guide amendment.
- **When terminology standardization has brand implications:** If the inconsistency involves brand-specific terms (product names, feature names), do not auto-recommend. Present the variants and escalate to the product team: "Found 3 variants of the product tier name. This needs a product decision."
- **When rewrites significantly increase string length:** If a rewrite exceeds UI constraints and cannot be shortened without losing critical information, flag the constraint: "This error message needs more space than the current toast component allows. Consider using an inline error or expanding the toast max-width."
- **When error messages require backend changes:** If an error message improvement requires the backend to send more specific error codes or context, document the dependency: "Improving this message requires the API to distinguish between 'card declined' and 'card expired' -- currently both return PAYMENT_FAILED."
