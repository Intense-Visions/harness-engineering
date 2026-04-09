# UI State Design

> UI state inventory — empty, loading, partial, error, success, offline, disabled, read-only, and how each state communicates system status

## When to Use

- Designing a new component or view that fetches data, accepts input, or depends on network availability
- Auditing an existing interface for missing state coverage — most production bugs live in unhandled states
- Building a component library or design system that needs state documentation per component
- Reviewing pull requests that add UI components without accounting for all possible states
- Planning error handling strategy across an application
- Designing offline-capable or progressive web applications
- Implementing accessibility — screen readers must announce state changes correctly
- Any time a user might encounter a condition other than "happy path with full data"

## Instructions

1. **Enumerate every possible state before writing any UI code.** For each component or view, walk through the complete state inventory: empty, loading, partial data, error, success, offline, disabled, and read-only. Write them down explicitly. Vercel's deployment dashboard handles nine distinct states for a single deployment card: queued, building, deploying, ready, error, canceled, stale, archived, and rolling back. Each has a unique visual treatment. Missing even one creates a jarring undefined-state flash.

2. **Map each state to a visual treatment.** Every state needs three decisions: (a) what the user sees, (b) what action is available, and (c) what the screen reader announces. Use this matrix:

   | State     | Visual Signal                 | Available Actions         | Announcement Pattern           |
   | --------- | ----------------------------- | ------------------------- | ------------------------------ |
   | Empty     | Illustration + prompt         | Primary CTA               | "No items. Create your first." |
   | Loading   | Skeleton / spinner            | None or cancel            | "Loading content"              |
   | Partial   | Real data + skeleton gaps     | Interact with loaded data | "Content partially loaded"     |
   | Error     | Error message + retry         | Retry, go back, contact   | "Error: [message]. Retry?"     |
   | Success   | Confirmation + next step      | Continue, dismiss         | "Success: [action] completed"  |
   | Offline   | Cached data + offline badge   | Read-only, queue actions  | "You are offline"              |
   | Disabled  | Reduced opacity + tooltip     | None (tooltip explains)   | "[Control] disabled: [reason]" |
   | Read-only | Full data, no edit affordance | Copy, export              | "[Field] read-only"            |

3. **Design empty states as onboarding opportunities, not dead ends.** An empty state is the first thing a new user sees. It must answer three questions: What is this page for? Why is it empty? What should I do? GitHub's empty repository page is the canonical example: it explains what a repository is, shows why it is empty ("You created this just now"), and provides exact commands to push code.

4. **Distinguish between "no data yet" and "no results."** A search that returns nothing is fundamentally different from a fresh account with no data. "No results for 'xyzzy'" needs a suggestion to broaden the search. "No projects yet" needs a create button. Mixing these states confuses users about whether the system is broken or their query is wrong.

5. **Use progressive state transitions, not binary flips.** Moving from loading to loaded should feel continuous. Skeleton screens that morph into real content (as used by Facebook, LinkedIn, and Slack) create continuity. A spinner that disappears and is replaced by fully-rendered content creates a perceptual discontinuity — the user must re-orient to a completely new visual layout.

6. **Make error states actionable.** Every error state must include at least one action the user can take. "Something went wrong" with no button is a dead end. Stripe's payment error states always include: (a) what went wrong in plain language, (b) a specific suggestion ("Check your card number"), and (c) a retry mechanism. The error message itself becomes an affordance for recovery.

7. **Communicate disabled reasons proactively.** A disabled button with no explanation is a puzzle. Always pair disabled states with a tooltip, helper text, or inline explanation that says why the control is disabled and what the user needs to do to enable it. Linear disables the "Create Issue" button when no project is selected and shows "Select a project first" as helper text — the disabled state teaches rather than blocks.

8. **Design offline states as first-class experiences.** For applications that may lose connectivity, offline is not an error — it is a state. Show cached data with a subtle offline indicator (Slack uses a yellow banner: "You're not connected to the Internet"). Queue user actions for replay when connectivity returns. Never show a blank screen when cached data is available.

## Details

### The Nine-State Inventory

**Empty state** is the most underdesigned state in production software. It appears in three variants: (1) first-use empty — the user has never created anything, (2) cleared empty — the user deleted all items, and (3) no-results empty — a filter or search returned nothing. Each variant needs different messaging. Notion's empty page shows a minimal prompt ("Press '/' for commands") that simultaneously teaches the interaction model. Airbnb's empty wishlist shows curated suggestions — the empty state itself becomes a discovery surface.

**Loading state** must match the expected content layout. A spinner is appropriate only when the content layout is unpredictable (e.g., a search whose result format varies). When the layout is known — a profile page, a dashboard grid, a settings panel — use skeleton screens that mirror the actual content structure. Facebook pioneered this pattern: their skeleton screens match the exact dimensions of the post, avatar, and text block they will replace. This reduces perceived load time by 15-30% compared to spinners (research by Nielsen Norman Group).

**Partial data state** occurs when some API calls resolve before others, when paginated data is still loading, or when a WebSocket connection delivers incremental updates. The decision is whether to show what you have or wait for everything. The rule: show partial data if the already-loaded content is independently useful. GitHub's pull request page loads the description and metadata first, then comments stream in below. The user can begin reading immediately. Conversely, a checkout page should not show partial data — displaying a total without all line items is misleading.

**Error state** has two dimensions: severity (recoverable vs terminal) and scope (field-level vs page-level vs system-level). A field validation error is low severity, field scope — show it inline. A 500 server error is high severity, page scope — replace the page content with an error message and recovery options. A network timeout is medium severity, component scope — show a retry button on the affected component without disrupting the rest of the page. Vercel's build error pages display the full error log with syntax highlighting, a "Redeploy" button, and links to relevant documentation — turning a frustrating error into a debugging workflow.

**Success state** is where most designers stop and most users get lost. A success message without a next step leaves the user asking "Now what?" After Stripe processes a payment, the success state shows: confirmation of what happened, a receipt summary, and clear next steps (view in dashboard, send receipt, return to store). The success state is a navigation waypoint, not a destination.

**Offline state** requires a data freshness indicator. When showing cached data, communicate its age: "Last updated 5 minutes ago" (acceptable) vs "Last updated 3 days ago" (user should know this data may be stale). Service workers should cache the most recent successful response for every critical view. Slack shows full cached channel history offline with a "Connecting..." banner — users can read everything, they just cannot send.

**Disabled state** must be visually distinct from read-only. Disabled means "this control exists but you cannot use it right now" — reduced opacity (typically 0.4-0.6) and a `not-allowed` cursor. Read-only means "this data is presented for viewing" — full opacity, no interactive affordances, but no suggestion that interaction is broken. A disabled input has a grayed label and a `not-allowed` cursor. A read-only input has a normal label, no border, and looks like static text with a subtle background.

**Read-only state** is often conflated with disabled but serves a completely different purpose. Read-only says "you can see this but editing is not available to you" — common in shared documents, audit logs, or permission-restricted views. Google Docs' "Viewer" mode removes all editing UI and shows a clean reading experience. The user never wonders if something is broken because there are no disabled controls — the editing affordances simply do not exist.

### State Transition Timing

State transitions have timing requirements that affect perceived quality:

- **Loading to content:** Under 100ms, show no loading state — the content appears instant. 100ms-1s, show a skeleton screen. Over 1s, show a skeleton with a progress indicator. Over 10s, show a skeleton with an estimated time remaining and a cancel option. These thresholds come from Jakob Nielsen's response time research (1993, validated repeatedly).
- **Action to success:** Optimistic updates should render in under 50ms (one frame at 20fps). The success state should persist for at least 2 seconds before auto-dismissing — shorter than 2 seconds and users miss it. Slack's message send is optimistic: the message appears in the chat immediately (under 50ms), with a subtle "sending" indicator that resolves to a timestamp on server confirmation.
- **Error appearance:** Error states should animate in, not pop. A 200-300ms ease-in transition gives the user time to notice the change. Instant error appearance (0ms) feels like the page "jumped" and users may not register what changed.

### State Composition in Complex Views

Real views compose multiple independent state machines. A dashboard might have: navigation (loaded), header stats (loading), main chart (error), and sidebar list (partial). Each component manages its own state independently. The critical rule: **one component's error must not block another component's content.** GitHub's repository page demonstrates this — if the README fails to render, the file tree, branch selector, and metadata still display. The README section shows its own error state in isolation.

When multiple components are loading simultaneously, stagger skeleton appearances by 50-100ms to create a cascade effect rather than a simultaneous flash. This makes the loading feel progressive and intentional.

### State Persistence Across Sessions

Certain UI states must persist across browser sessions and page refreshes:

- **Form drafts:** If a user has partially completed a form (issue creation, comment composition, settings changes), their input should survive page refresh and browser close. GitHub auto-saves issue draft content to `localStorage`. Linear persists draft issues across sessions.
- **View preferences:** Column widths, sort order, filter selections, collapsed/expanded sidebar sections should persist per user. These are not "data" — they are UI state that users expect to remain stable. Store in `localStorage` for anonymous users, in user preferences for authenticated users.
- **Dismissed notices:** If a user dismisses a banner or onboarding tooltip, it should stay dismissed. Store dismissed states by ID in `localStorage` or user preferences. Never show a dismissed notice again unless the content has materially changed.
- **Navigation position:** If a user was on page 4 of a paginated list, returning to that view should restore page 4, not reset to page 1. For infinite scroll views, store the scroll position and loaded item count. Slack restores exact scroll position within channels.

### Anti-Patterns

1. **The Boolean Trap.** Modeling state as `isLoading: boolean` and `hasError: boolean` creates impossible combinations (`isLoading: true, hasError: true`). This leads to race conditions where the UI shows both a spinner and an error message simultaneously. Fix: use a discriminated union / state machine with mutually exclusive states: `{ status: 'idle' | 'loading' | 'error' | 'success', data?: T, error?: Error }`. Libraries like XState or Zag enforce this at the type level.

2. **The Empty White Screen.** Showing a blank white page while data loads, with no skeleton, spinner, or indication that anything is happening. Users interpret a blank screen as a broken page and leave within 2-3 seconds. Every view must have a defined loading state — if you are unsure what to show, a centered spinner is better than nothing, and a skeleton screen is better than a spinner.

3. **Error Messages Written for Developers.** Showing raw error strings like "TypeError: Cannot read property 'name' of undefined" or HTTP status codes like "Error 500" to end users. Error messages must be written in the user's language, describe what happened from their perspective, and offer a concrete recovery action. "We couldn't load your projects. Check your connection and try again." is always better than "FETCH_FAILED: Network Error."

4. **Disabled Without Explanation.** A submit button that is grayed out with no tooltip, no helper text, and no indication of what the user must do to enable it. The user clicks repeatedly, nothing happens, frustration builds. Every disabled control must have an associated explanation visible on hover, focus, or as persistent helper text.

5. **Optimistic Without Rollback.** Showing a success state optimistically (before server confirmation) without a plan for what happens when the server rejects the action. The user sees "Message sent," the server returns a 403, and the message silently disappears. Optimistic updates require a visible rollback: re-insert the failed item with an error indicator and a retry action.

### Real-World Examples

**Vercel Deployment States.** A single deployment card cycles through: Queued (gray dot, "Waiting..."), Building (animated yellow dot, build log streaming), Deploying (animated blue dot, "Deploying to edge"), Ready (green checkmark, preview URL), Error (red X, error summary with "View Logs" link), Canceled (gray slash, "Canceled by [user]"). Each state has a distinct color, icon, label, and available action. The transitions animate smoothly — the dot color morphs rather than swaps. This is a masterclass in state design for a single component.

**Slack Message Lifecycle.** A message traverses: Composing (text in input, real-time character display), Sending (message appears in chat with subtle opacity reduction and clock icon), Sent (full opacity, timestamp replaces clock), Failed (red warning icon, "Not delivered — click to retry"), Edited (original content replaced, "(edited)" suffix), Deleted ("This message was deleted" placeholder). Every state is visually distinct and every failure state includes a recovery action.

**GitHub Repository Empty State.** A new repository with no commits shows: a clear heading ("Quick setup"), the repository URL with a copy button, and two complete workflow paths ("...or create a new repository on the command line" and "...or push an existing repository"). It also shows import options for migrating from other platforms. The empty state anticipates every user's likely next action and provides the exact commands needed.

**Linear Issue States.** Linear defines a strict state machine for issues: Backlog, Todo, In Progress, Done, Canceled. Each state has a unique icon shape and color. Transitions are constrained — you cannot move from Backlog directly to Done without passing through intermediate states (unless explicitly overridden). The state machine prevents impossible states and the visual system makes the current state instantly scannable in a list of hundreds of issues.

**Stripe Payment Form Field States.** Each input field in Stripe's checkout form cycles through five visual states independently: Empty (gray border, placeholder visible), Focused (blue border, placeholder fades, label floats), Filled (gray border, value displayed, green checkmark if valid), Error (red border, error message below, red icon), and Disabled (light gray background, reduced opacity). The states are managed per-field, not per-form — the card number can be in an error state while the expiry is focused and the CVC is empty. This independent state management prevents a single validation error from disrupting the entire form experience.

### State Documentation for Design Systems

When building a component library, every component must have its states documented explicitly. The documentation format should include:

**State matrix per component.** For each component, create a matrix listing every state and its visual specification:

| Component | State    | Background   | Border | Text Color | Icon    | Opacity | Cursor      |
| --------- | -------- | ------------ | ------ | ---------- | ------- | ------- | ----------- |
| Button    | Default  | Primary blue | None   | White      | None    | 1.0     | pointer     |
| Button    | Hover    | Blue-dark    | None   | White      | None    | 1.0     | pointer     |
| Button    | Active   | Blue-darker  | None   | White      | None    | 1.0     | pointer     |
| Button    | Disabled | Gray-200     | None   | Gray-500   | None    | 0.5     | not-allowed |
| Button    | Loading  | Primary blue | None   | Hidden     | Spinner | 0.8     | wait        |

**Transition definitions.** Document how each state transitions to the next: duration, easing curve, which properties animate. Material Design documents this for every component — their button spec includes exact animation values for each state transition (100ms ease-in for press, 200ms ease-out for release, 150ms for focus ring appearance).

**Compound state rules.** Some states can coexist (focused + error, hover + disabled). Document which combinations are valid and how they resolve visually. A focused error field should show both the focus ring and the error border — typically by using the error color for the focus ring rather than the default blue.

## Source

- Norman, D. — _The Design of Everyday Things_ (2013), feedback and system state visibility
- Nielsen, J. — "Response Times: The 3 Important Limits" (1993), timing thresholds for loading states
- Material Design — States documentation, https://m3.material.io/foundations/interaction/states
- Facebook Engineering — "Building Skeleton Screens" (2017), perceived performance research
- Vercel Design System — Deployment state patterns

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
