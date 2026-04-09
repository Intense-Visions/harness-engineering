# Empty and Error State Design

> Empty and error state design — empty states as onboarding, error states as recovery, 404 pages, zero-data states, degraded states, constructive error messages

## When to Use

- Designing any view that fetches data from an API, database, or external service — every such view has at least one empty state and one error state
- Building onboarding flows where the user's first experience is an empty dashboard, empty list, or empty workspace
- Creating search or filter interfaces that may return zero results
- Designing 404 pages, permission-denied screens, or other system-level error pages
- Building applications that must function gracefully under degraded conditions (slow network, partial API failure, expired sessions)
- Auditing an existing product where empty and error states were never designed — they default to blank screens or raw error strings
- Implementing offline-capable applications where network loss must not destroy the user experience
- Any time the "happy path" design is complete and the team is ready to address the other 80% of real-world user encounters

## Instructions

1. **Treat empty states as the first impression, not an afterthought.** For every new user, the empty state is the first screen they see. An empty dashboard is not a missing feature — it is the onboarding experience. The empty state must answer three questions: What is this page for? Why is there nothing here? What should I do next? GitHub's empty repository page answers all three: "This is your repository" (purpose), "You just created it" (why empty), and "Run these commands to push your first code" (what to do). If your empty state is a blank white page with the text "No items," you have failed at onboarding.

2. **Distinguish the three types of empty states.** Not all empty states are the same, and conflating them creates confusion:

   | Type               | Trigger                           | User Expectation              | Correct Response                                           |
   | ------------------ | --------------------------------- | ----------------------------- | ---------------------------------------------------------- |
   | First-use empty    | New account, no data created yet  | "Show me what to do"          | Onboarding illustration + primary CTA + example content    |
   | User-cleared empty | User deleted all items            | "Confirm this is intentional" | Confirmation + re-creation CTA + undo option               |
   | No-results empty   | Search or filter returned nothing | "Help me find what I want"    | Search suggestions + broaden-filter prompt + popular items |

   Airbnb handles no-results masterfully: when a search returns zero listings, the page shows "No exact matches" followed by flexible date suggestions, nearby location alternatives, and a prompt to adjust filters — turning a dead end into a discovery tool.

3. **Design error states for recovery, not blame.** Every error state must include: (a) what happened in plain language, (b) why it might have happened, (c) at least one concrete action the user can take. "Something went wrong" is useless. "We couldn't save your changes because the connection was lost. Your draft is saved locally. Try again when you're back online." tells the user what happened, why, and what to do. Stripe's payment error messages are the benchmark: "Your card was declined. Try a different payment method or contact your bank" gives the user two clear recovery paths.

4. **Use the error severity and scope matrix to choose the right treatment.**

   | Scope           | Low Severity (recoverable)                            | High Severity (terminal)                                |
   | --------------- | ----------------------------------------------------- | ------------------------------------------------------- |
   | Field-level     | Inline error below field, red border, suggestion text | Field disabled + explanation of why                     |
   | Component-level | Error message within component + retry button         | Component replaced with error card + alternative action |
   | Page-level      | Toast or banner at top + auto-retry in background     | Full-page error with illustration + recovery options    |
   | System-level    | Status bar indicator + cached data visible            | Maintenance page with expected resolution time          |

   The key principle: error scope should match the failure scope. A single failed API call should not produce a full-page error if the rest of the page content loaded successfully. GitHub demonstrates this — if the README fails to render in a repository, only the README section shows an error; the file tree, branch selector, and metadata remain fully functional.

5. **Design 404 pages as brand moments, not dead ends.** A 404 page is one of the most-visited error pages on any site. It is also an opportunity to express brand personality while helping the user recover. Every 404 must include: a clear statement that the page was not found, a search bar or navigation to help the user find what they wanted, links to popular or recent content, and a way to report the broken link. GitHub's 404 page with the Octocat in a parallax star field is iconic — it is memorable, on-brand, and includes a search bar and link to the homepage. A 404 that simply says "Not Found" in the browser's default font is a missed opportunity and a UX failure.

6. **Design degraded states for partial system failure.** Real applications rarely fail completely — they degrade. One microservice goes down while others remain healthy. The user's connection is slow but not gone. The CDN serves stale content. Degraded states require three design decisions: What cached or stale data can be shown? What functionality is reduced? How is the degradation communicated? Slack handles degraded state exceptionally: when the WebSocket connection drops, the app shows all cached messages with a yellow banner ("Connecting..."), queues new messages for sending when the connection returns, and timestamps stale data so users know it may not reflect the latest state.

7. **Make empty states educational.** The best empty states teach the user something about the product. Notion's empty page shows "Press '/' for commands" — simultaneously an empty state and a tutorial. Slack's empty channel says "This is the very beginning of the #channel-name channel" followed by the channel's purpose and a prompt to send the first message. Figma's empty canvas shows keyboard shortcuts for creating shapes. The empty state is free real estate for reducing the learning curve.

8. **Provide constructive error messages with specific remediation.** Vague errors cause support tickets. Specific errors enable self-service recovery. Compare:

   | Vague (causes support ticket) | Constructive (enables recovery)                                                                              |
   | ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
   | "Upload failed"               | "Upload failed: file exceeds 10MB limit. Compress your image or choose a smaller file."                      |
   | "Permission denied"           | "You don't have access to this project. Ask @jordan (project owner) to invite you."                          |
   | "Invalid input"               | "Email must include an @ symbol. Example: name@company.com"                                                  |
   | "Server error"                | "We're experiencing issues. Your work is saved locally. We'll auto-save to the server when things are back." |

## Details

### Empty State Anatomy

A well-designed empty state contains up to five elements, layered by importance:

**Illustration or icon** (optional but powerful). A custom illustration communicates brand personality and softens the experience. Dropbox uses unique illustrations for every empty folder state — each one reinforces the brand while making the empty state feel intentional rather than broken. The illustration should be relevant to the content type: an empty inbox shows a mailbox, an empty project list shows a rocket, an empty search shows a magnifying glass. Avoid generic clip art — if the illustration could appear on any product, it is not adding value.

**Headline** (required). A short, human sentence that names the state. "No notifications yet" is better than "Empty" or "0 items." The headline should be specific to the content: "No projects yet" not "Nothing here."

**Description** (required). One to two sentences explaining why this state exists and what the user can do about it. For first-use empty: "Create your first project to start collaborating with your team." For no-results: "Try broadening your search or removing some filters."

**Primary action** (required for first-use). A single, prominent button that advances the user to the next step. "Create project," "Import data," "Invite teammates." This button should be the most visually prominent element after the illustration. For no-results empty, the primary action might be "Clear filters" or "Search for something else."

**Secondary guidance** (optional). Links to documentation, example templates, or video tutorials. GitHub's empty repository page includes secondary links to GitHub's getting-started guides. This layer serves users who are not ready for the primary action but want to learn more.

### Error Recovery Patterns

**Inline retry.** For transient failures (network timeout, rate limit), show a retry button within the failed component. The retry should use exponential backoff (1s, 2s, 4s) and show attempt count after the first retry: "Retrying... (attempt 2 of 3)." After max retries, switch to a manual retry with explanation: "We tried 3 times. Check your connection and try again."

**Optimistic rollback.** When an optimistic update fails (the UI showed success before the server confirmed), the rollback must be visible and non-destructive. Do not silently remove the optimistic content — mark it with an error indicator and a retry button. Slack does this: a message that fails to send stays in the chat with a red warning icon and "Not delivered — Click to retry." The user's content is never lost.

**Graceful degradation chain.** When a primary data source fails, fall through alternatives: live data (primary) to cached data with staleness indicator (secondary) to static fallback content (tertiary) to error state with recovery action (last resort). A weather app that loses its API connection should show yesterday's forecast with "Last updated 18 hours ago," not a blank screen.

**Session recovery.** When an authenticated session expires mid-task, do not redirect to login and lose the user's work. Show an inline authentication prompt ("Your session expired. Enter your password to continue.") that preserves the current page state. After re-authentication, the user should be exactly where they were, with all form data and scroll position intact. Linear handles this well — an expired session shows a modal login overlay without navigating away from the current view.

### Zero-Data Design

Zero-data states deserve special attention because they represent the user's very first moment with your product. Principles for zero-data design:

**Show example content, not empty containers.** A project management tool should show a sample project with realistic tasks, not empty columns. Trello's onboarding creates a "Welcome Board" with pre-populated cards that teach the interaction model. The example content serves dual purpose: it demonstrates the product's value and teaches the UI patterns.

**Use progressive disclosure.** Do not show every empty section simultaneously. A new dashboard with six empty widgets is overwhelming. Show one section with a CTA, and reveal additional sections as the user creates content. Notion's approach: a new workspace has one empty page with a friendly prompt — not a grid of empty databases, boards, and calendars.

**Communicate time investment.** If setting up the first item takes significant effort, tell the user: "Creating your first project takes about 5 minutes." This sets expectations and reduces abandonment. Vercel's onboarding tells you "Import a project in 30 seconds" — framing the empty state as a quick action rather than a daunting task.

### 404 and System Error Pages

The best 404 pages share these characteristics:

**Brand consistency.** The 404 page should look like it belongs to the same product, with the same navigation, color palette, and typography. A user who encounters a 404 should never wonder if they accidentally left the site.

**Helpful navigation.** Include the site's main navigation, a search bar, and links to popular content. The user arrived at this page for a reason — help them find what they were looking for. If you can infer intent from the URL (e.g., `/blog/old-post-title`), suggest similar content.

**Personality without frustration.** Humor is appropriate on a 404 page only if it does not obscure the recovery path. GitHub's Octocat illustration is charming without making the user feel mocked. Avoid jokes that belittle the user ("Oops, you broke the internet!") — the user did nothing wrong.

**Tracking and alerting.** Every 404 hit should be logged with the referrer URL. If a specific 404 spikes in traffic, it means a link changed or broke — the error page should be a signal to fix the source, not just a destination for lost users.

### Anti-Patterns

1. **The Blank Abyss.** A data-dependent view that renders as a completely blank page when no data exists — no heading, no explanation, no action. The user cannot tell if the page is loading, broken, or intentionally empty. This is the most common empty state anti-pattern and the easiest to fix: every view that can have zero data items must have an explicit empty state with at least a headline and a CTA.

2. **The Blame-Shifting Error.** Error messages that imply the user did something wrong when the system failed. "You entered an invalid request" for a server error. "Please try again later" with no explanation of what went wrong. Error messages must be honest about fault: if the server failed, say "We're having trouble" not "Your request was invalid." Users are more forgiving of system failures than of being blamed for them.

3. **The Generic Catch-All.** Using one error message for every failure type: "Something went wrong. Please try again." This message provides zero diagnostic information, generates support tickets, and trains users to distrust your error messages because they are never specific enough to act on. Map each error code to a specific, actionable message. A 401 is not the same as a 500 is not the same as a timeout — do not display them identically.

4. **The Disappeared Content.** When an optimistic action fails, the UI silently removes the content the user just created. A message that "sent" then vanishes. A to-do that was "added" then disappears on refresh. Failed optimistic updates must be visible — show the failed item with an error state and a retry action, never silently delete it.

5. **The Crying Mascot.** An error page dominated by a large sad-face illustration or crying mascot character with a tiny, barely visible recovery link. The illustration-to-action ratio is inverted: 80% decoration, 20% utility. Error pages should prioritize the recovery path. The illustration is supporting material, not the main content.

### Real-World Examples

**GitHub's Empty Repository State.** When a user creates a new repository with no README, GitHub's empty state is a masterclass in onboarding design. The page shows the repository URL with copy buttons (HTTPS and SSH), then presents three complete code blocks: "create a new repository on the command line," "push an existing repository," and "import code from another repository." Each option is a complete, copy-pasteable workflow. The empty state eliminates the gap between "I created a repository" and "I have code in my repository" by providing every possible path forward, verbatim.

**GitHub's 404 Octocat Page.** GitHub's 404 features the Octocat floating through space with a parallax starfield that responds to mouse movement. It is visually memorable and immediately recognizable as a GitHub page. Below the illustration: "This is not the web page you are looking for" with a link to the homepage and a search form. The page reinforces brand identity while providing every recovery path a lost user needs.

**Slack's Empty Channel State.** When a user opens a newly created channel, Slack shows: the channel name with a decorative header, "This is the very beginning of the #channel-name channel," the channel purpose (if set during creation), the date the channel was created, and a prompt to write the first message. For direct message conversations, the empty state shows the other person's profile info, title, and timezone — contextual information that makes the empty state useful even before any messages are sent.

**Airbnb's No-Results Search.** When a search returns zero listings, Airbnb shows "No exact matches" as a headline, then provides three recovery paths: "Try changing your dates" (with suggested flexible date ranges), "Remove some filters" (with a list of active filters, each with a remove button), and "Explore nearby destinations" (with a grid of alternative locations with photos and prices). The no-results state is more interactive than many product pages — it aggressively guides the user toward a successful search rather than abandoning them at a dead end.

**Dropbox's Empty Folder Illustration.** Each empty folder in Dropbox shows a unique brand illustration relevant to the folder context. A shared folder shows people collaborating. A new personal folder shows an open box. The "Starred" view when empty shows a telescope with "Nothing starred yet — star files and folders so they're easy to find." Each illustration is on-brand, each message is specific to the empty state type, and each includes a clear next action.

**Apple's Error Recovery Patterns.** iOS handles system-level errors with a consistent pattern: a simple icon, a brief explanation, and one or two actions. When an app cannot connect to the App Store: "Cannot Connect to App Store" with a "Retry" button. When cellular data is disabled for an app: "Cellular Data Is Turned Off" with a direct link to Settings. The error messages are never technical ("Error -1009") and always include the most direct path to resolution.

## Source

- Norman, D. — _The Design of Everyday Things_ (2013), feedback and error recovery
- Krug, S. — _Don't Make Me Think_ (2014), first-time user experience
- Yablonski, J. — _Laws of UX_ (2020), aesthetic-usability effect on empty states
- Material Design — Empty states guidelines, https://m3.material.io/foundations/content/empty-states
- Nielsen Norman Group — "The Power of Empty States" (2019)

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
