# Feedback Patterns

> System response design — immediate vs delayed feedback, optimistic updates, progress indicators, confirmation patterns, undo vs confirm, toast/snackbar/banner

## When to Use

- Designing user action responses — what the system communicates after a click, submit, or gesture
- Choosing between optimistic and pessimistic update strategies for data mutations
- Implementing notification and messaging patterns (toast, snackbar, banner, inline, modal)
- Deciding between destructive action confirmation (undo vs confirm dialog)
- Building progress indicators for multi-step or long-running operations
- Auditing an interface for feedback gaps — actions that produce no visible system response
- Designing error recovery flows that guide users back to a working state
- Evaluating feedback timing — is the response too fast (missed), too slow (frustrating), or poorly timed (interruptive)?

## Instructions

1. **Every user action must produce visible feedback within 100ms.** This is Jakob Nielsen's foundational threshold: actions with feedback under 100ms feel instantaneous. Between 100ms and 1 second, the user notices a delay but maintains flow. Over 1 second, the user's attention breaks and they need a progress indicator. Over 10 seconds, they need percentage completion or a time estimate. No action should ever produce zero feedback — a silent button click is a broken interface. Even if the backend operation takes seconds, acknowledge the click immediately with a visual state change (button press, spinner start, text update).

2. **Choose optimistic or pessimistic updates based on operation reversibility and failure rate.** The decision matrix:

   | Condition                            | Strategy      | Example                                  |
   | ------------------------------------ | ------------- | ---------------------------------------- |
   | Reversible + low failure rate (<5%)  | Optimistic    | Slack message send, GitHub star          |
   | Reversible + high failure rate (>5%) | Pessimistic   | File upload (network-dependent)          |
   | Irreversible + any failure rate      | Pessimistic   | Payment processing, account deletion     |
   | Irreversible + critical impact       | Confirm first | Stripe charge, data export, user removal |

   Optimistic updates show the success state immediately and roll back on failure. Slack displays your message in the channel instantly — if the server rejects it, the message shows a red warning icon with "Not delivered. Click to retry." The rollback is visible, actionable, and non-destructive. GitHub's star is optimistic: the star fills and the count increments on click, before the server confirms. If the server fails, the star unfills and the count reverts.

3. **Use the toast/snackbar/banner taxonomy correctly.** These three feedback containers serve different purposes and should not be used interchangeably:
   - **Toast (ephemeral, non-blocking, auto-dismissing).** For confirmations of low-stakes completed actions: "Settings saved," "Link copied." Auto-dismiss after 4-6 seconds. Position: top-right or bottom-center. No required action. Material Design snackbar spec: 4 seconds for single-line, 10 seconds for two-line. Never use toasts for errors — errors need to persist until addressed.
   - **Snackbar (ephemeral with action, non-blocking).** For completed actions that offer an undo opportunity: "Conversation archived. Undo." Auto-dismiss after 6-10 seconds. Must include one action (typically "Undo" or "View"). Gmail's snackbar after archiving is the canonical example: "Conversation archived" with an "Undo" link that persists for approximately 8 seconds.
   - **Banner (persistent, page-level, blocking or non-blocking).** For system-wide status that affects the user's session: offline state, pending migration, subscription expiring, maintenance window. Does not auto-dismiss — requires user action (dismiss, acknowledge, or resolve). Slack's yellow offline banner and GitHub's blue deployment notice bar are banners. Position: top of viewport, full width.

4. **Implement undo instead of confirmation for reversible destructive actions.** Confirmation dialogs ("Are you sure?") are failure patterns — users click "Yes" reflexively without reading. Research by Aza Raskin (Mozilla) showed that confirmation dialogs prevent less than 5% of unintended destructive actions because users develop muscle memory for the confirm button. Undo is superior: let the action happen immediately, show a snackbar with an undo option, and give the user 6-10 seconds to reverse it. Gmail pioneered this with "Undo Send" (originally a 5-second window, now configurable to 30 seconds). The action feels fast (no dialog interruption) and the safety net is always visible.

5. **Reserve confirmation dialogs for truly irreversible, high-consequence actions.** The threshold: if the action cannot be undone AND the consequences are significant (data loss, financial transaction, permanent account change), use a confirmation dialog. Stripe uses a confirmation dialog for refunds — the dialog names the specific amount and customer, requires explicit confirmation, and cannot be undone. GitHub uses a typed-confirmation pattern for repository deletion: you must type the repository name to confirm, preventing both accidental clicks and confirmation-dialog muscle memory.

6. **Design progress indicators based on operation characteristics.** The decision procedure:
   - **Determinate operations** (known total, known progress): use a progress bar with percentage. File uploads, multi-step wizards, bulk operations. Show the actual percentage, estimated time remaining, and current step. Vercel's build progress shows: step name ("Installing dependencies"), elapsed time, and a progress bar.
   - **Indeterminate operations** (unknown duration): use a spinner or indeterminate progress bar. API calls, search operations, server-side processing. Do NOT show a fake progress bar that fills linearly then stalls at 90% — users will notice and trust is destroyed. Use an honest spinner or a pulsing bar.
   - **Long operations (>10 seconds):** add a descriptive status message that updates as the operation progresses. Vercel's deployment flow: "Analyzing source" then "Building" then "Deploying to edge" then "Assigning domain" — each step update reassures the user that progress is happening.

7. **Stack feedback by urgency with a clear visual hierarchy.** When multiple feedback messages compete for attention, use a priority system:
   - **Critical (errors requiring action):** Inline at the source of the error, red, persistent, with recovery action. Highest priority — displayed immediately, displaces other feedback.
   - **Warning (potential issues):** Banner or inline, amber/yellow, persistent until dismissed or resolved.
   - **Success (action completed):** Toast or snackbar, green, auto-dismissing. Medium priority — queued behind active errors.
   - **Informational (status update):** Toast or subtle inline update, neutral color, auto-dismissing. Lowest priority — suppressed if higher-priority feedback is active.

   Never show a success toast while an error banner is active — the mixed signals confuse users about system state.

8. **Place feedback at the point of action whenever possible.** Inline feedback (next to the button that was clicked, below the field that has an error) is always more effective than remote feedback (a toast in the corner, a banner at the top of the page). The user's attention is already at the point of action — inline feedback requires zero eye movement. Stripe's form validation is entirely inline: error messages appear directly below the offending field, the field border turns red, and the error text describes exactly what is wrong ("Your card number is incomplete"). No toast, no banner, no modal — the feedback is exactly where the user is looking.

## Details

### Optimistic Update Architecture

Optimistic updates require three components working together:

**Immediate state mutation.** On user action, update the local UI state before the server responds. This means the UI must have a local state layer (React state, Zustand, Vuex, etc.) that can be modified independently of server state. When the user clicks "like," set `isLiked = true` and `likeCount += 1` in local state immediately.

**Background server request.** Simultaneously, send the mutation to the server. The request runs in the background while the user sees the success state.

**Rollback on failure.** If the server returns an error, revert the local state to its pre-mutation value AND show the user what happened. This is where most implementations fail — they revert silently, and the user does not understand why their action "undid itself." The correct pattern: revert the state, show a toast/inline error explaining the failure ("Could not save. Check your connection."), and offer a retry action. Slack implements this precisely: if a message send fails, the message stays visible but gets a red warning icon and "Not delivered — Click to retry."

**Conflict resolution.** When the server returns success but with modified data (e.g., the server sanitized the input), the local state must reconcile. Pattern: on server success response, overwrite local state with server state. This handles cases where the server modifies timestamps, normalizes text, assigns IDs, or applies business logic that changes the data from what the client optimistically displayed.

### Toast Positioning and Stacking

Toast positioning affects discoverability and readability. The conventions by platform:

- **Material Design:** Bottom-center, stacked upward if multiple. Max 1 visible at a time — new toasts replace existing ones.
- **Apple HIG:** Top-center (iOS notifications), brief, single-line.
- **Web convention:** Top-right (most common in web apps — Vercel, Linear, Stripe dashboard) or bottom-left (Gmail). Stack downward (top-right) or upward (bottom-left).

**Stacking rules.** Never show more than 3 toasts simultaneously — beyond 3, users stop reading them. When a new toast arrives while 3 are visible, dismiss the oldest. Group identical toasts: if 5 "Item saved" toasts fire in rapid succession, show one toast with a count: "5 items saved." Vercel groups deployment status updates into a single notification that updates its content rather than spawning new toasts.

### The Undo Window

The undo window duration directly impacts user behavior:

- **3-5 seconds:** Sufficient for "I immediately regretted that" reversals. Too short for the user to read the undo message, process it, and decide. Appropriate for trivial actions (marking as read, dismissing a notification).
- **6-10 seconds:** The optimal range for most destructive actions. Long enough to read, decide, and act. Gmail uses 5-30 seconds (configurable). Slack uses approximately 10 seconds for message deletion undo.
- **10-30 seconds:** For high-consequence actions where the user might need to verify before committing. Email recall (Gmail's "Undo Send" at 30 seconds), bulk operations, export jobs.

During the undo window, the server-side action should be deferred (not executed until the window expires) or logged for rollback. Gmail's "Undo Send" actually delays sending the email — it does not recall an already-sent email. This is important: the undo must be reliable, which means deferring is safer than rolling back.

### Feedback Timing Precision

The psychological breakpoints for feedback timing, validated across decades of HCI research:

- **0-100ms:** Perceived as instantaneous. The user feels direct control, as if manipulating a physical object. This is the target for all local state changes: toggling, selecting, typing.
- **100-300ms:** Perceived as "fast but noticeable." The user notices a slight delay but flow is not broken. Appropriate for client-server round trips on fast connections. Show a micro-interaction (button press state) to bridge this gap.
- **300ms-1s:** Perceived as a deliberate system action. The user knows the system is working. A spinner or progress indicator should appear at the 300ms mark — not before (premature spinners for fast operations create flicker) and not after (delayed spinners create anxiety).
- **1-5s:** The user's attention wanders. Progress indicators are mandatory. Add a status message explaining what is happening. Vercel shows "Analyzing source code..." during this window.
- **5-10s:** The user considers abandoning the task. Provide: progress percentage, estimated time remaining, and a cancel option. Long build processes should show streaming log output — watching text scroll reassures the user that the system is working.
- **>10s:** The user will switch context. Send a notification when complete (email, browser notification, in-app badge). Allow the user to navigate away without losing progress.

### Anti-Patterns

1. **The Silent Click.** A button that performs an action but provides no visual feedback — no state change, no toast, no animation. The user clicks, nothing happens, they click again (potentially duplicating the action), and eventually something changes with no connection to their click. Fix: every clickable element must change its visual state on click within one frame (16ms). Even if the backend response takes seconds, acknowledge the click with a press state, spinner, or "Saving..." text.

2. **Success Theater.** Showing a celebratory success state (checkmark animation, confetti, "All done!") before the backend has confirmed success. If the server then rejects the action, the user experienced a lie. Fix: if using optimistic updates, keep the success feedback proportional (subtle confirmation, not celebration) so that a rollback is not jarring. Reserve celebratory feedback for confirmed successes only.

3. **The Error Novel.** Displaying error messages that are paragraphs long, filled with technical details, and buried in a modal dialog that blocks all other interaction. Users do not read long error messages — they click "OK" to dismiss them. Fix: error messages should be one sentence maximum, written in the user's language, with a single clear action. Put technical details behind a "Show details" toggle for debugging purposes.

4. **Confirmation Dialog Addiction.** Using "Are you sure?" dialogs for every action: delete, archive, save, cancel, navigate away. Confirmation fatigue sets in after 2-3 dialogs and users click "Confirm" reflexively, defeating the purpose entirely. Fix: use undo for reversible actions, reserve confirmation for truly irreversible high-consequence actions (payment, permanent deletion, account changes), and never confirm non-destructive actions.

5. **Feedback Channel Mismatch.** Showing a success toast at the top-right corner of the screen while the user's attention is on a form at the bottom-left. The feedback fires but the user never sees it because it is outside their attentional focus. Fix: place feedback at the point of action. If you must use a remote notification (toast/banner), also provide inline feedback at the action source — a subtle checkmark next to the button, a field border color change, or an inline success message.

### Real-World Examples

**Slack Optimistic Messaging.** When you send a message in Slack, it appears in the channel immediately with full formatting. The only hint that it has not been confirmed by the server is a subtle clock icon where the timestamp will appear. On server confirmation (typically under 200ms), the clock icon is replaced by the actual timestamp — most users never see the clock. On failure, the message stays visible but shows a red warning icon with "Not delivered — Click to retry." The message text is preserved, so the user does not need to retype anything. This is the gold standard for optimistic updates.

**Vercel Deployment Progressive Feedback.** A Vercel deployment provides feedback at every stage: (1) "Queued" with a gray status (immediate acknowledgment), (2) "Building" with a yellow animated dot and streaming build log, (3) "Deploying" with a blue animated dot, (4) "Ready" with a green checkmark, preview URL, and deployment summary. Each stage transition includes the elapsed time. If a build fails, the error state shows the exact line of the build log where the failure occurred, with syntax highlighting. The feedback is progressive, informative, and actionable at every stage.

**Stripe Payment Confirmation.** After a successful payment, Stripe shows: (1) an animated checkmark draw (300ms), (2) a confirmation message ("Payment successful"), (3) a receipt summary (amount, last 4 digits, date), and (4) clear next steps ("Return to [merchant]" button). On failure, Stripe shows: (1) the specific field with the error (card number, expiry, CVC), (2) a human-readable error message ("Your card was declined. Try a different payment method."), and (3) the form pre-filled with valid fields so the user only needs to fix the problem field. The feedback addresses both success and failure with equal design attention.

**GitHub Typed Confirmation.** For repository deletion, GitHub requires the user to type the full repository name (e.g., "cwarner/my-project") into an input field before the "Delete this repository" button becomes enabled. This pattern prevents both accidental clicks and confirmation-dialog muscle memory — you cannot type a repository name reflexively. The input includes real-time validation: the button remains disabled until the typed text exactly matches the repository name. This is appropriate for irreversible, high-consequence actions.

**Linear Optimistic Status Updates.** Changing an issue's status in Linear (e.g., "In Progress" to "Done") updates immediately in the local UI — the status icon changes, the issue moves to the correct column in board view, and any filter/sort recalculates. The server sync happens asynchronously. If the server rejects the change (rare), the issue reverts with a subtle error toast. Because Linear is a single-player tool in practice (your own issue statuses), the failure rate is extremely low, making optimistic updates the correct strategy.

### Feedback Audit Checklist

For any interactive element, verify these feedback requirements:

1. **Click/tap acknowledgment under 100ms.** Does the element visually change state within one animation frame of being clicked? A button should show its press state, a toggle should begin its animation, a link should change color. If you click and nothing happens for 200ms, the feedback is broken.
2. **Operation progress for actions >1 second.** If the operation takes more than 1 second, is there a progress indicator? A spinner, a skeleton, a progress bar, or at minimum a "Loading..." text. Silent waits over 1 second feel like broken pages.
3. **Success confirmation that names the action.** After a successful operation, does the feedback name what happened? "Saved" is acceptable. "Settings updated successfully" is better. No feedback at all after a successful save is a critical gap.
4. **Error feedback that is actionable.** When an error occurs, does the message tell the user what to do? "Error" is useless. "Could not save. Try again." is minimal. "Your card number is incomplete — enter all 16 digits." is correct.
5. **No competing feedback channels.** Is the system showing a success toast while an error banner is active? Are two different feedback mechanisms (toast + inline) saying different things? Conflicting feedback is worse than no feedback.

## Source

- Nielsen, J. — "Response Times: The 3 Important Limits" (1993), feedback timing thresholds
- Raskin, A. — "Undoing the Undo" (2010), research on confirmation dialog ineffectiveness
- Material Design — Communication patterns, https://m3.material.io/foundations/interaction/states
- Gmail — Undo Send implementation and timing research
- Slack Engineering — "Real-Time Messaging Architecture" (2017), optimistic update patterns

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
