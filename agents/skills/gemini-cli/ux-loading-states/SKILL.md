# Loading States

> Loading state copy — progress transparency, expectation setting, and writing text that reduces perceived wait time and prevents users from abandoning

## When to Use

- Writing loading screen copy for initial app load and data fetching
- Composing progress messages for file uploads, exports, deployments, and async operations
- Writing skeleton screen copy (rare — usually none needed)
- Creating multi-step progress indicators for long-running processes
- Writing "still working" reassurance copy for unexpectedly long waits
- NOT for: success feedback after loading completes (see ux-success-feedback)
- NOT for: error messages when loading fails (see ux-error-messages)
- NOT for: empty states shown when no content is found (see ux-empty-states)

## Instructions

1. **Name what is loading — never just "Loading..."** "Loading your dashboard" not "Loading..." "Fetching transactions from the last 30 days" not "Please wait." "Connecting to your GitHub account" not "Processing." Naming what is loading does two things: it confirms to the user that they took the right action (the system is loading what they asked for), and it sets expectations for what will appear when loading completes. Generic "Loading..." is acceptable for sub-second interactions where naming adds no value. For anything over one second, name the specific operation. The specificity also helps users diagnose slow loads — "Fetching transactions" that takes 20 seconds tells the user the database query is slow, not the page render.

2. **Show progress for anything over 3 seconds.** Under 3 seconds: a spinner or loading indicator with no copy is sufficient — users will wait without anxiety. Over 3 seconds: add copy that names the operation and, if possible, shows progress. Over 10 seconds: add a time estimate or step indicator. Over 30 seconds: add reassurance and an explanation. The 3-second threshold is research-backed (NNGroup: users expect pages to load in under 3 seconds, and anxiety begins after 3 seconds of waiting). The copy requirement scales with the wait time because user anxiety scales with uncertainty.

3. **Time estimates reduce perceived wait — use them for operations over 10 seconds.** "Usually takes about 30 seconds." "This typically takes 2-5 minutes." "Large files may take up to 10 minutes." The estimate sets an expectation. Users who expect a 30-second wait experience it as normal; users who expect an instant result experience a 5-second wait as a failure. Time estimates must be honest — if "usually takes 30 seconds" is actually "usually takes 2 minutes," users will distrust all time estimates in the product. When uncertain, give a range ("2-5 minutes") rather than a fixed estimate. Stripe's verification process shows "This usually takes a few seconds" for fast paths and "Verification may take 1-2 business days" for manual review paths.

4. **Use present participle for in-progress operations.** "Saving..." not "Save in progress." "Uploading..." not "Upload is being processed." "Processing payment..." not "Payment is being processed." "Analyzing..." not "Analysis underway." The present participle (-ing form) is the natural language form for ongoing actions. It is shorter, more direct, and matches how people describe activities in conversation. The ellipsis after the present participle signals incompleteness — the action is ongoing. Without the ellipsis, "Saving" reads as a label, not a state.

5. **Multi-step processes benefit from step indicators.** "Step 2 of 4: Analyzing data." "Verifying identity (3 of 5)." "Building your workspace... Creating channels, inviting members, configuring settings." Step indicators serve two purposes: they show progress (reducing anxiety) and they name each step (providing context for what is happening). GitHub Actions displays each job step as it runs, with individual step names and durations. Vercel shows deployment phases: "Building... Deploying to CDN... Running health checks..." Each phase is named, so users understand why each one takes as long as it does.

6. **Reassure users on unexpectedly long waits.** Show "Still working..." or "This is taking longer than usual — thanks for your patience" at the 10-second mark for operations that promised to be fast. At the 30-second mark, add context: "Large datasets take more time to process." At the 60-second mark, offer an alternative if one exists: "You can continue working and we'll notify you when this is done." Silence during a long wait is the worst outcome — the user cannot distinguish between normal slowness, a stalled operation, and a complete failure. Reassurance copy tells the user the system is still alive and working.

7. **Skeleton screens need no copy — the layout communicates structure.** Skeleton screens (grey placeholder shapes in the layout of the content that will load) show the structure before data arrives. They do not need loading copy because the visual structure already communicates "content is coming." Adding "Loading your dashboard" on top of a skeleton screen is redundant — the skeleton already shows that the dashboard is loading. The exception: if the skeleton screen has a section where the layout cannot predict what will appear (variable-length content, unknown number of items), add a brief label for that section only: "Loading notifications..."

8. **Never fake progress — the progress bar must reflect reality.** A progress bar that jumps to 99% and stalls for 30 seconds is worse than no progress bar. Users who see 99% believe the operation is nearly complete and wait. At 30 seconds, they realize the bar is not real. The trust damage from a fake progress bar extends beyond the loading state — users distrust all subsequent progress indicators. If the actual progress cannot be measured, use indeterminate progress (a looping animation) rather than a fake bar. When progress can be measured (file upload percentage, step count), use a real progress bar that accurately reflects the operation.

## Details

### Loading Copy by Wait Duration

Scale copy complexity to wait duration:

| Duration      | Copy Level          | Pattern                        | Example                                         |
| ------------- | ------------------- | ------------------------------ | ----------------------------------------------- |
| < 1 second    | None                | Visual indicator only          | Spinner                                         |
| 1-3 seconds   | Minimal             | Operation name only            | "Loading dashboard"                             |
| 3-10 seconds  | Standard            | Operation + present participle | "Fetching your transactions..."                 |
| 10-30 seconds | Standard + estimate | Operation + estimate           | "Analyzing data... Usually takes 15 seconds."   |
| 30-60 seconds | Extended + steps    | Step indicator + context       | "Step 2 of 4: Processing your payment history"  |
| 60+ seconds   | Full reassurance    | Step + estimate + alternative  | "Still processing... We'll notify you by email" |

### Multi-Step Progress Patterns

For operations with discrete steps, name each step and show position:

**Linear progress:** "Step 2 of 5: Verifying identity" — clear, counts toward a known total.

**Phase progress:** "Building → Deploying → Running health checks" with current phase highlighted — shows all phases upfront, reducing anxiety about unknown duration.

**Log-style progress:** Real-time log entries (GitHub Actions style) — ideal for technical users who want to see what is happening. Each log line names the operation and its outcome.

**Percentage progress:** "37% complete — uploading file.zip" — works only when actual percentage is measurable (file upload, batch processing). Never use for unknown-duration operations.

### Operations That Need Time Estimates

Some operations consistently take long enough to warrant time estimates in the loading copy:

| Operation Type       | Typical Duration | Estimate Pattern                             |
| -------------------- | ---------------- | -------------------------------------------- |
| Large file upload    | 10s - 5min       | "Usually takes about [N] minutes"            |
| Data export          | 15s - 2min       | "Exports typically take 30-60 seconds"       |
| Account verification | 2s - 2 days      | "Usually instant, sometimes takes a minute"  |
| AI/ML processing     | 5s - 30s         | "Analysis takes about 10-20 seconds"         |
| Database migration   | 1min - 30min     | "Large migrations can take up to 30 minutes" |
| Build / deployment   | 30s - 10min      | Shows per-step timing (GitHub Actions model) |

### Async Operation Loading Patterns

For operations that run in the background and complete after the user has navigated away:

1. **Acknowledge receipt:** "We're processing your export. You can keep working — we'll notify you when it's ready."
2. **Show status in a persistent location:** A "Jobs" or "Activity" panel that shows running operations.
3. **Notify on completion:** Send in-app notification or email when the async operation completes.
4. **Handle failure gracefully:** If the operation fails after the user has navigated away, the failure notification must re-establish full context — what was being processed, what failed, and what to do next.

GitHub's Actions, Vercel's deployments, and Stripe's data exports all use this async pattern. The loading copy in the trigger screen ("We'll send you an email when your export is ready") sets the expectation that this is async and positions the completion notification as the primary feedback.

### Loading Copy for First-Load vs Subsequent Loads

First load (the first time a user sees a screen) and subsequent loads (returning to a screen after navigation) have different tolerance levels and different copy needs:

**First load:** The user does not yet know what the screen contains. "Loading your dashboard" sets the expectation. A skeleton screen showing the dashboard's layout also sets the expectation visually. Both can coexist.

**Subsequent load:** The user knows what is coming — they have seen this screen before. A skeleton screen alone is often sufficient. Adding "Loading your dashboard" for a user who visits the dashboard daily is unnecessary; they know what is loading.

**Stale data refresh:** When the user is viewing a screen and data refreshes in the background: "Updating..." in a subtle indicator, not a full loading overlay. Replacing the visible content with a full loading screen for a background refresh is disproportionate. Stripe's transaction list uses a subtle "Refreshing..." indicator when new transactions arrive, not a full loading screen.

When possible, detect whether the user is loading a screen for the first time and show richer loading copy, then progressively reduce loading copy for subsequent visits as the user builds familiarity.

### Anti-Patterns

1. **The Generic Spinner.** A spinner with no copy, no label, no progress indication, for an operation that takes 10+ seconds. The user stares at a spinning circle with no information about what is happening, whether it is progressing, or when it will finish. For operations under 3 seconds, this is acceptable. For anything longer, name the operation. The generic spinner is the loading equivalent of "Something went wrong" — it conveys that the system is doing something, but nothing specific or useful.

2. **The Time Lie.** "Just a moment" for a 60-second operation. "This will only take a second" for a 20-second operation. "Almost done" displayed for 45 seconds. Time lies are uniquely damaging because they create a specific expectation — "a moment" means 2-3 seconds to most users — and then violate it. The user who hears "just a moment" and waits 60 seconds does not just experience a long wait; they experience a broken promise. Use honest time estimates ("Usually 30-60 seconds") or no estimate at all rather than optimistic lies.

3. **The Silent Failure.** A loading indicator that stops spinning (or a progress bar that stops advancing) with no explanation. The operation has failed, but the UI still shows a loading state. The user waits indefinitely because there is no failure message. Loading states must always have a defined failure path — if the operation times out or fails, the loading copy must be replaced with an error message. The silent failure is worse than a loud failure because the user cannot distinguish between "still loading" and "stuck."

4. **The Progress Paradox.** A progress bar that reaches 99% and stays there for longer than the 0-99% journey took. The progress bar promised completion and then stopped. This is more frustrating than a slow indeterminate spinner because it created a specific expectation ("almost done") and then violated it. If the final step of a multi-step operation is unpredictably long (compiling, finalizing, verifying), use an indeterminate indicator for that final step rather than a fake 99% bar.

### Real-World Examples

**GitHub Actions Progress Steps.** GitHub Actions shows each step of a CI/CD workflow as a named, timed entry in real-time. "Set up job: 3s," "Checkout code: 4s," "Install dependencies: 47s," "Run tests: 1m 23s." Each step is named, each step shows its duration as it runs, and each step's outcome (green checkmark, red X) is shown when complete. This level of transparency means users understand where time is being spent, can identify bottlenecks, and can accurately predict when the build will complete. The step-by-step disclosure is the gold standard for multi-step loading copy.

**Stripe's Payment Processing.** Stripe's checkout shows "Processing..." during payment submission — the present participle is appropriate for the 2-3 second window. For Stripe's verification flows (which can take seconds to minutes depending on the verification path), the copy adapts: "Verifying your information..." for fast paths, "This verification may take a few minutes — we'll let you know when it's complete" for slower paths. Stripe never shows a fake progress bar for verification — it uses indeterminate indicators because the timing is genuinely unpredictable.

**Vercel's Deployment Log.** Vercel shows real-time deployment logs during site builds: "Cloning repository," "Installing dependencies," "Building application," "Deploying to edge network." Each phase shows elapsed time, and the log expands to show individual commands and their outputs. For technical users (Vercel's audience), this transparency is exactly right — they want to see what is happening, not be told to wait. Vercel's loading state is the anti-pattern to generic spinners: it shows more information, not less, during long operations.

**Linear's Data Sync Indicator.** Linear shows a persistent sync indicator in the sidebar that names the current sync operation: "Syncing issues..." or "Syncing with GitHub..." The indicator is subtle (small, in the sidebar) but always present during sync — users never wonder whether their data is up to date. When sync completes, the indicator disappears silently. When sync fails, the indicator changes to an error state with a "Retry" option. Linear's approach to loading states is to make them ambient — present enough to inform, subtle enough not to interrupt.

## Source

- NNGroup — "Response Times: The 3 Important Limits" (1993, updated 2014), https://www.nngroup.com/articles/response-times-3-important-limits/
- NNGroup — "Skeleton Screens" (2021), https://www.nngroup.com/articles/skeleton-screens/
- Google Material Design — Progress indicators, https://m3.material.io/components/progress-indicators/guidelines
- Apple Human Interface Guidelines — Progress indicators, https://developer.apple.com/design/human-interface-guidelines/progress-indicators
- Yifrah, K. — _Microcopy: The Complete Guide_ (2017), loading and processing state copy patterns

## Process

1. Identify the expected duration of the loading operation and select the appropriate copy level from the duration table.
2. Write the loading copy in present participle form, naming the specific operation being performed.
3. For operations over 10 seconds, add a time estimate or step indicator.
4. For operations over 60 seconds or that run asynchronously, add a reassurance message and an async completion notification path.
5. Define the failure path — what copy appears if the loading operation times out or fails.

### Loading State Copy Review Checklist

Before shipping loading state copy, verify each item:

| Check                                            | Pass Criteria                                              |
| ------------------------------------------------ | ---------------------------------------------------------- |
| Operations over 3s are named                     | "Loading your dashboard" not generic "Loading..."          |
| Present participle form used                     | "Saving..." not "Save in progress"                         |
| Time estimate present for 10s+ operations        | "Usually takes 30 seconds" or similar                      |
| Step indicators for multi-step operations        | "Step 2 of 4: Analyzing data"                              |
| Reassurance at 10s mark                          | "Still working..." for operations that promised to be fast |
| No fake progress bars                            | Indeterminate indicator used when progress is unmeasurable |
| Failure path defined                             | Error state copy exists for every loading state            |
| Async operations confirm receipt, not completion | "Started — we'll email you" not premature "Complete"       |

Loading states are often the last copy element added to a feature and the first to be shipped without review. A loading state that shows "Loading..." for 45 seconds is indistinguishable from a hang — users cannot tell whether the product is working or broken. Every loading state needs a corresponding failure state that makes the distinction clear.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- All loading states name the specific operation, not just "Loading..." for operations over 3 seconds.
- Present participle form ("Saving...", "Processing...") is used for all in-progress operations.
- Time estimates appear for operations expected to take over 10 seconds.
- Multi-step operations show step position and name (e.g., "Step 2 of 4: Analyzing data").
- No progress bar stalls at 99% — indeterminate indicators used when final step timing is unpredictable.
- All loading states have a defined failure path — no silent failures where the spinner spins indefinitely.
