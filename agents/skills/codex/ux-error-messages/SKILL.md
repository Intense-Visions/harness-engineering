# Error Messages

> Error messages — what went wrong, why it matters, how to fix it, the three-part error pattern for clear, actionable error communication

## When to Use

- Writing form validation error messages (inline, summary, or toast)
- Composing system error messages (500 errors, timeouts, connectivity failures)
- Creating API error responses that surface to end users
- Writing permission-denied or authorization error text
- Handling field-level and page-level validation across complex forms
- NOT for: error logging or developer-facing error messages (stack traces, debug output)
- NOT for: empty state copy shown when no content exists (see ux-empty-states)

## Instructions

1. **Use the three-part pattern: what went wrong, why, how to fix it.** Every useful error message answers three questions: What failed? Why did it fail? What should the user do now? Stripe's payment decline: "Your card was declined. The issuing bank did not approve the transaction. Try a different payment method or contact your bank." Each clause serves one of the three purposes. A message with only part one ("Card declined") leaves users stranded. A message with all three ("Your card was declined. The bank rejected the charge. Try a different card.") gives them a path forward.

2. **Place errors inline next to the field that caused them.** Error messages must appear in the same visual zone as the problem. GitHub highlights the specific field in red with the error message directly below it. A summary banner ("3 fields have errors") without inline messages requires the user to hunt for problems. Use both: inline messages for each field plus a page-level summary that links to each field, especially on long forms. Never display only a top-of-page summary for field-specific errors.

3. **Write errors in plain language -- never expose technical codes or stack traces.** "Something went wrong" is better than "Error 500: Internal Server Exception" but "We couldn't save your changes. Try again in a few minutes." is better than both. Users do not understand HTTP codes, database exceptions, or stack traces. Translating technical failures into human language is the error writer's primary job. Notion translates sync conflicts: "Someone else edited this page. We've saved both versions -- choose which to keep." No mention of merge conflicts or version hashes.

4. **Use the same voice as the rest of the product -- errors are not exempt from tone guidelines.** Slack's error messages maintain conversational tone even when things break: "Hmm, we can't reach our servers. Check your connection." Stripe maintains professional directness: "Your account is currently under review." Error states are the product's worst moment -- a tonal mismatch makes them worse. If the product uses "you" and contractions elsewhere, use them in errors too.

5. **Tell the user what to do next -- every error must have a recovery path.** If user action can fix the error, name that action specifically. If no user action can fix it, say when the team is investigating, provide a status page link, or state when to retry. "Our servers are down. Check status.stripe.com for updates." is better than "Service unavailable." GitHub provides a link to their status page from every server error. Never leave the user with a problem and no path forward.

6. **Do not blame the user.** Attribute the problem to the input or the system, never to the person. "That password is too short" not "You entered an invalid password." "This email is already registered" not "You already have an account." "The file is too large" not "You uploaded a file that's too big." Passive attribution to the object ("the file," "that password") is gentler than active attribution to the user ("you uploaded," "you entered"). Linear: "This name is already taken" not "You chose a name that's already in use."

7. **Be specific about constraints before and after errors occur.** "Password must be at least 8 characters, include one uppercase letter and one number" -- show this as helper text before errors, and reference the specific unmet constraint in the error: "Password needs at least one number." Stripe shows the exact card requirement that is not met. Specificity eliminates the guessing game of "what does 'invalid password' actually mean?"

8. **Differentiate between field-level and page-level errors with distinct patterns.** Field-level messages are brief and inline: "Email address is required." Page-level messages describe the aggregate: "2 fields need your attention before continuing." For forms with many fields, a sticky page-level banner that links to each error field saves users from scrolling to find problems. Shopify's checkout shows a count-and-anchor pattern: "Please fix 2 errors below" with anchor links to each field.

## Details

### Error Message Anatomy

The three-part error structure maps directly to user cognitive needs:

| Part       | Question Answered | Example                                      | Required?  |
| ---------- | ----------------- | -------------------------------------------- | ---------- |
| What       | What failed?      | "Your card was declined."                    | Always     |
| Why        | What caused it?   | "The issuing bank did not approve."          | When known |
| How to fix | What to do next   | "Try a different card or contact your bank." | Always     |

For user-caused errors (form validation), the "why" is usually the constraint: "Password must include a number." For system errors, the "why" is the cause when known ("Our servers are temporarily unavailable") or omitted when not. The "how to fix" must always be present unless nothing can be done, in which case offer a status path ("Check status.stripe.com").

### Inline vs Summary vs Toast Error Placement

Each placement serves a different purpose and moment:

**Inline (below the field):** Best for field validation errors discovered on blur or submit. Appears immediately adjacent to the problem. Maximum 2 sentences. GitHub, Stripe, and Shopify all default to inline validation for form errors.

**Summary banner (top of form):** Used when the user submits a form with multiple errors. Lists all errors with links to each field. Useful when fields may be off-screen. Works in conjunction with inline messages, never as a replacement.

**Toast / snackbar:** Used for system-level errors that are not tied to a specific field -- network failures, save failures, permission errors. Auto-dismisses after 5-8 seconds (longer than success toasts due to higher information density). Always include an action: "Retry" or "Dismiss."

**Modal / blocking dialog:** Reserved for critical errors that prevent any further action -- session expiration, account suspension, required updates. Blocks interaction until resolved.

### Error Tone Calibration

Error tone should match the severity and the product's voice:

- **Field validation:** Calm, instructional, non-alarming. "Email address is required." Present tense, no exclamation.
- **User mistake (recoverable):** Direct but gentle. "This email is already registered. Try logging in instead."
- **System error (transient):** Empathetic, explains the situation. "We're having trouble connecting. We'll keep trying."
- **System error (persistent):** Direct with status path. "Our service is unavailable. Check status.stripe.com."
- **Destructive / irreversible:** Clear, unambiguous, never softened. "This action cannot be undone."

### Anti-Patterns

1. **The Cryptic Code.** Exposing error codes, technical exceptions, or stack traces directly to users. "Error 0x80004005: Unspecified error," "NullPointerException at line 247," "ECONNREFUSED." Users cannot act on these. The fix: catch all errors at the UI layer and translate them into human language. The technical code can appear in a collapsed "details" section for support teams, but never as the primary message.

2. **The Blame Game.** Error messages that explicitly or implicitly fault the user for the error. "You entered an invalid value." "You chose a username that is already taken." "Your session expired because you were inactive." Reframe: name the issue without a subject ("That username is taken"), or use the object as subject ("The session timed out after 30 minutes of inactivity"). The user already feels frustrated -- do not add guilt.

3. **The Dead End.** Error messages with no recovery path, no next step, no action. "Something went wrong." "Error occurred." "Unable to process your request." These messages tell the user what happened (minimally) but offer no resolution. Every error must have at minimum one of: a specific action the user can take, a link to support, a status page URL, or a "Retry" button.

4. **The Generic Catch-All.** Using a single vague error message for all failure modes -- "Something went wrong, please try again" -- regardless of whether the issue is a network timeout, a validation failure, a permission error, or a server crash. Each error type warrants a distinct message. A form validation error ("Password is too short") and a connectivity error ("We can't reach our servers") are completely different problems requiring completely different responses from the user.

### Real-World Examples

**Stripe's Payment Error Flow.** Stripe distinguishes between card-specific errors and account-level errors with different message patterns. Card decline: "Your card was declined. The issuing bank did not approve this charge. Try a different card or contact your bank." Card insufficient funds: "Your card has insufficient funds. Try a different payment method." Incorrect CVV: "Your card's security code is incorrect. Check the 3-digit number on the back of your card." Each message names the exact problem and provides a specific next step. Stripe never shows raw decline codes to end users -- those go only to the merchant dashboard.

**GitHub's Form Validation.** GitHub highlights error fields with a red border and places the error message directly below the field, using consistent formatting: "[Field name] [problem]." Repository name conflict: "Name has already been taken." Username requirements: "Username may only contain alphanumeric characters or single hyphens, and cannot begin or end with a hyphen." The page-level error summary is not used -- GitHub relies entirely on inline messages, keeping the feedback localized to the problem.

**Notion's Sync Error Handling.** Notion surfaces sync conflicts with a non-blocking notification: "Someone else edited this page while you were working. We've kept both versions -- choose which to keep." This three-part message names what happened, explains the consequence (both versions preserved), and provides a clear action (choose). The tone matches Notion's calm, collaborative voice. Unlike a harsh "Conflict detected," Notion's message implies the system handled the situation gracefully and only needs user input to resolve the last step.

**Shopify's Checkout Errors.** Shopify's checkout uses a page-level error count ("Please fix 2 errors to continue") with anchor links to each field, combined with inline messages below each field. This dual-layer approach is the gold standard for long or multi-section forms. The count gives the user a mental model of the scope; the anchor links eliminate scrolling; the inline messages provide specific context at the point of correction.

## Source

- NNGroup — "Error Message Guidelines" (2001, updated 2020), https://www.nngroup.com/articles/error-message-guidelines/
- Google Material Design — Text field error states, https://m3.material.io/components/text-fields/guidelines
- Yifrah, K. — _Microcopy: The Complete Guide_ (2017), ch. 7: Error Messages
- Nielsen, J. — "User Interface Design Heuristics #9: Help users recognize, diagnose, and recover from errors" (1994)
- Podmajersky, T. — _Strategic Writing for UX_ (2019), error and failure state patterns

## Process

1. Identify whether the error is field-level, form-level, or system-level -- each requires a different placement and pattern.
2. Write the three-part message: what failed, why it failed (when known), what to do next.
3. Remove any technical language, error codes, or jargon -- translate to user vocabulary.
4. Verify the tone matches the product's voice guidelines and does not assign blame to the user.
5. Confirm the message includes a recovery action or link -- no dead ends.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- All error messages follow the three-part structure: what, why, how to fix.
- Field-level errors appear inline next to the field, not only in a top-of-page summary.
- No error message exposes technical codes, exception names, or stack traces to users.
- Every error message includes a recovery action, retry option, or status link -- no dead ends.
- Error tone matches the product's voice guidelines and avoids attributing blame to the user.
