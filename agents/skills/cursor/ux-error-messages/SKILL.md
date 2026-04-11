# Error Messages

> Error messages — what went wrong, why it matters, how to fix it, the three-part error pattern for clear, actionable error communication

## When to Use

- Writing form validation error messages (inline, summary banner, or toast)
- Composing system error messages (500 errors, timeouts, connectivity failures)
- Creating API error responses that surface to end users
- Writing permission-denied or authorization error text
- Handling field-level and page-level validation across complex forms
- NOT for: error logging or developer-facing error messages (stack traces, debug output)
- NOT for: empty state copy shown when no content exists (see ux-empty-states)
- NOT for: severity tier selection and escalation patterns (see ux-error-severity)

## Instructions

1. **Use the three-part pattern: what went wrong, why, how to fix it.** Every useful error message answers three questions: What failed? Why did it fail? What should the user do now? Stripe's payment decline: "Your card was declined. The issuing bank did not approve the transaction. Try a different payment method or contact your bank." Each clause serves one of the three purposes. A message with only "Card declined" leaves users stranded. A message with all three parts gives them a path forward. For system errors where the cause is unknown, omit the "why" rather than guessing — "We couldn't save your changes. Try again in a few minutes" is honest and actionable even without a known cause.

2. **Place errors inline next to the field that caused them.** Error messages must appear in the same visual zone as the problem. GitHub highlights the specific field in red with the error message directly below it. A summary banner ("3 fields have errors") without inline messages requires the user to hunt for problems. Use both: inline messages for each field plus a page-level summary that links to each field, especially on long forms. Never display only a top-of-page summary for field-specific errors — the user should not have to scroll from the top banner back down to the field to understand what needs fixing.

3. **Write errors in plain language — never expose technical codes or stack traces.** "Something went wrong" is better than "Error 500: Internal Server Exception" but "We couldn't save your changes. Try again in a few minutes." is better than both. Users do not understand HTTP codes, database exceptions, or stack traces. Translating technical failures into human language is the error writer's primary job. Notion translates sync conflicts: "Someone else edited this page. We've saved both versions — choose which to keep." No mention of merge conflicts or version hashes. Every technical error should be caught at the UI layer and replaced with a human sentence.

4. **Use the same voice as the rest of the product — errors are not exempt from tone guidelines.** Slack's error messages maintain conversational tone even when things break: "Hmm, we can't reach our servers. Check your connection." Stripe maintains professional directness: "Your account is currently under review." Error states are the product's worst moment — a tonal mismatch makes them worse. If the product uses "you" and contractions elsewhere, use them in errors too. Reserve formal, impersonal language only if the product's baseline voice is formal and impersonal. An error that sounds robotic in a conversational product signals that the error was never reviewed by a writer.

5. **Tell the user what to do next — every error must have a recovery path.** If user action can fix the error, name that action specifically. If no user action can fix it, say when the team is investigating, provide a status page link, or state when to retry. "Our servers are down. Check status.stripe.com for updates." is better than "Service unavailable." GitHub provides a link to their status page from every server error. Never leave the user with a problem and no path forward — even "Contact support" or "Try again later" is a recovery path. A dead-end error message is a product failure, not just a writing failure.

6. **Do not blame the user.** Attribute the problem to the input or the system, never to the person. "That password is too short" not "You entered an invalid password." "This email is already registered" not "You already have an account." "The file is too large" not "You uploaded a file that's too big." Passive attribution to the object ("the file," "that password") is gentler than active attribution to the user ("you uploaded," "you entered"). Linear: "This name is already taken" not "You chose a name that's already in use." The user is already frustrated by the error; do not layer on fault attribution.

7. **Be specific about constraints before and after errors occur.** "Password must be at least 8 characters, include one uppercase letter and one number" — show this as helper text before errors, and reference the specific unmet constraint in the error: "Password needs at least one number." Stripe shows the exact card requirement that was not met. Specificity eliminates the guessing game of "what does 'invalid password' actually mean?" and gives users actionable information they can use immediately to fix the issue. Vague errors like "Invalid input" require the user to guess what specifically is wrong.

8. **Differentiate between field-level and page-level errors with distinct patterns.** Field-level messages are brief and inline: "Email address is required." Page-level messages describe the aggregate: "2 fields need your attention before continuing." For forms with many fields, a sticky page-level banner that links to each error field saves users from scrolling to find problems. Shopify's checkout shows a count-and-anchor pattern: "Please fix 2 errors below" with anchor links to each field. Both levels serve different navigation needs — page-level for orientation, field-level for resolution.

## Details

### Error Message Anatomy

The three-part error structure maps directly to user cognitive needs:

| Part       | Question Answered | Example                                      | Required?  |
| ---------- | ----------------- | -------------------------------------------- | ---------- |
| What       | What failed?      | "Your card was declined."                    | Always     |
| Why        | What caused it?   | "The issuing bank did not approve."          | When known |
| How to fix | What to do next   | "Try a different card or contact your bank." | Always     |

For user-caused errors (form validation), the "why" is usually the constraint: "Password must include a number." For system errors, the "why" is the cause when known ("Our servers are temporarily unavailable") or omitted when not. The "how to fix" must always be present unless nothing can be done, in which case offer a status path ("Check status.stripe.com").

### Error Placement Decision Matrix

Selecting the wrong placement undermines the error's effectiveness. A transient network error in a blocking modal is disproportionate. A session expiration in a toast that auto-dismisses is a security and usability failure.

| Error Type               | Placement            | Persistence     | Character Limit       |
| ------------------------ | -------------------- | --------------- | --------------------- |
| Field validation         | Inline, below field  | Until corrected | 1-2 short sentences   |
| Multi-field form error   | Page banner + inline | Until corrected | Count + links to each |
| System error (transient) | Toast / snackbar     | 5-8 seconds     | 120 characters        |
| System error (blocking)  | Modal dialog         | Until dismissed | 2-3 sentences         |
| Inline save failure      | Inline near trigger  | Until resolved  | 1 sentence + action   |

### Error Tone Calibration by Error Category

Error tone should match severity and the product's baseline voice:

- **Field validation:** Calm, instructional, non-alarming. "Email address is required." Present tense, no exclamation.
- **User mistake (recoverable):** Direct but gentle. "This email is already registered. Try logging in instead."
- **System error (transient):** Empathetic, explains situation. "We're having trouble connecting. We'll keep trying."
- **System error (persistent):** Direct with status path. "Our service is unavailable. Check status.stripe.com."
- **Destructive / irreversible:** Clear, unambiguous, never softened. "This action cannot be undone."

### Writing Error Messages for Async Operations

Async operations — uploads, exports, background syncs — require a different error model. The user has moved on by the time the error occurs, so the error must re-establish context:

- **Name the operation that failed:** "Your CSV export failed." not "Export failed."
- **State when it failed:** "Your export failed 2 minutes ago." for non-blocking async errors.
- **Offer a retry path:** "Try exporting again" should be a button, not just text.
- **Confirm what was saved vs lost:** "Your changes were saved, but the export did not complete."

Stripe's export errors follow this pattern. GitHub's Actions failure notifications include the step that failed, the exit code reason in plain language, and a direct link to the failing run. Async error messages must be complete enough to stand alone — the user cannot see the original trigger.

### Anti-Patterns

1. **The Cryptic Code.** Exposing error codes, technical exceptions, or stack traces directly to users. "Error 0x80004005: Unspecified error," "NullPointerException at line 247," "ECONNREFUSED." Users cannot act on these. The fix: catch all errors at the UI layer and translate into human language. The technical code can appear in a collapsed "details" section for support teams, but never as the primary message. Showing raw technical output signals that the error path was never designed — it was just left unhandled.

2. **The Blame Game.** Error messages that explicitly or implicitly fault the user. "You entered an invalid value." "You chose a username that is already taken." "Your session expired because you were inactive." Reframe: name the issue without a subject ("That username is taken"), or use the object as subject ("The session timed out after 30 minutes of inactivity"). The user already feels frustrated — do not add guilt. Blaming the user also trains them to distrust the product when errors occur.

3. **The Dead End.** Error messages with no recovery path, no next step, no action. "Something went wrong." "Error occurred." "Unable to process your request." These messages tell the user what happened (minimally) but offer no resolution. Every error must have at minimum one of: a specific action the user can take, a link to support, a status page URL, or a "Retry" button. A dead-end error is the product equivalent of a locked door with no sign explaining how to get in.

4. **The Generic Catch-All.** Using a single vague error for all failure modes — "Something went wrong, please try again" — regardless of whether the issue is a network timeout, validation failure, permission error, or server crash. Each error type warrants a distinct message. A form validation error ("Password is too short") and a connectivity error ("We can't reach our servers") are completely different problems requiring completely different responses. Generic catch-alls hide useful debugging information from users and signal that error states were not designed intentionally.

### Real-World Examples

**Stripe's Payment Error Flow.** Stripe distinguishes between card-specific and account-level errors with different message patterns. Card decline: "Your card was declined. The issuing bank did not approve this charge. Try a different card or contact your bank." Incorrect CVV: "Your card's security code is incorrect. Check the 3-digit number on the back of your card." Each message names the exact problem and provides a specific next step. Stripe never shows raw decline codes to end users — those go only to the merchant dashboard. Stripe's error taxonomy is exhaustive: over 30 distinct decline reasons each with a unique user-facing message.

**GitHub's Form Validation.** GitHub highlights error fields with a red border and places the error message directly below the field. Repository name conflict: "Name has already been taken." Username requirements: "Username may only contain alphanumeric characters or single hyphens, and cannot begin or end with a hyphen." GitHub relies entirely on inline messages, keeping the feedback localized to the problem field. When multiple fields fail, GitHub focuses on the first field — not all at once — to avoid overwhelming the user.

**Notion's Sync Error Handling.** Notion surfaces sync conflicts with a non-blocking notification: "Someone else edited this page while you were working. We've kept both versions — choose which to keep." This three-part message names what happened, explains the consequence (both versions preserved), and provides a clear action (choose). The tone matches Notion's calm, collaborative voice. Notion avoids panic language like "WARNING: conflict detected" — the situation is resolved, so the message is calm.

**Shopify's Checkout Errors.** Shopify uses a page-level error count ("Please fix 2 errors to continue") with anchor links to each field, combined with inline messages below each field. This dual-layer approach is the gold standard for long or multi-section forms. The count gives scope; the anchor links eliminate scrolling; the inline messages provide specific context at the point of correction. Shopify also retains the user's valid data across the error — the fields that were correct remain filled.

## Source

- NNGroup — "Error Message Guidelines" (2001, updated 2020), https://www.nngroup.com/articles/error-message-guidelines/
- Google Material Design — Text field error states, https://m3.material.io/components/text-fields/guidelines
- Yifrah, K. — _Microcopy: The Complete Guide_ (2017), ch. 7: Error Messages
- Nielsen, J. — "User Interface Design Heuristics #9: Help users recognize, diagnose, and recover from errors" (1994)
- Podmajersky, T. — _Strategic Writing for UX_ (2019), error and failure state patterns
- Wroblewski, L. — _Web Form Design_ (2008), inline validation and error placement research

### Internationalizing Error Messages

Error messages that work in English may fail in other languages. Design error copy for localization:

- **Avoid string concatenation:** "Your " + fieldName + " is invalid" breaks in languages with different word order. Write complete sentences: "That email address is not valid."
- **Avoid relative time expressions:** "Please try again in a few minutes" is difficult to localize consistently. Use explicit guidance: "Please try again in 5 minutes" or "Please try again later."
- **Gender-neutral phrasing:** "Your account has been locked" avoids gendered constructions that may not translate directly.
- **Avoid idioms:** "Something went sideways" does not translate. "Something went wrong" does.
- **Test with German:** German compound words and longer translations regularly reveal UI overflow issues in error message containers. If the error container holds German error copy, it will hold all major languages.

Error messages that are designed for localization from the start are shorter, more literal, and easier for translators — which is also a benefit for English-language users who benefit from the same clarity.

## Process

1. Identify whether the error is field-level, form-level, or system-level — each requires a different placement and pattern.
2. Write the three-part message: what failed, why it failed (when known), what to do next.
3. Remove any technical language, error codes, or jargon — translate to user vocabulary.
4. Verify the tone matches the product's voice guidelines and does not assign blame to the user.
5. Confirm the message includes a recovery action or link — no dead ends.

### Error Message Review Checklist

Before shipping any error message, verify each item:

| Check                      | Pass Criteria                                             |
| -------------------------- | --------------------------------------------------------- |
| Three-part structure       | What + why (if known) + how to fix                        |
| No technical language      | No codes, exceptions, or stack traces visible             |
| Placement correct          | Field-level inline; system-level in appropriate component |
| No user blame              | No "you entered," "you chose," "your mistake"             |
| Recovery path present      | Action button, retry link, or status URL                  |
| Tone matches product voice | Same voice as success states and onboarding               |
| Constraint specificity     | Names the specific unmet constraint, not "invalid"        |
| Async context preserved    | Async error re-establishes what was being processed       |

Failing any item in this checklist means the error message needs revision before shipping. Incomplete error messages erode user trust in proportion to their frequency — in a product where errors happen often (form-heavy workflows, developer tools), error message quality directly affects overall product quality perception.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- All error messages follow the three-part structure: what, why (when known), how to fix.
- Field-level errors appear inline next to the field, not only in a top-of-page summary.
- No error message exposes technical codes, exception names, or stack traces to users.
- Every error message includes a recovery action, retry option, or status link — no dead ends.
- Error tone matches the product's voice guidelines and avoids attributing blame to the user.
- Async operation errors re-establish context and include a specific retry or escalation path.
