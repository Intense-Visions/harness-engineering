# Empty States

> Empty states — first-use, user-cleared, and no-results patterns that motivate action, set expectations, and turn blank screens into onramps

## When to Use

- Designing first-use screens when a user has no data yet (fresh accounts, new workspaces)
- Writing zero-results messages for search or filter operations
- Creating user-cleared states after all items are completed, deleted, or removed
- Writing error-state empty screens (failed to load content, permission denied)
- Building empty states for data tables, dashboards, timelines, and activity feeds
- NOT for: loading states before data arrives (see ux-loading-states)
- NOT for: onboarding flows and welcome sequences spanning multiple screens (see ux-onboarding-copy)
- NOT for: error messages for system failures (see ux-error-messages)

## Instructions

1. **Classify the empty state type before writing any copy.** First-use, user-cleared, no-results, and error-empty each need different copy, tone, and CTA. First-use motivates: the user is new and needs to understand the value of filling the space. User-cleared celebrates: the user accomplished something (inbox zero, completed all tasks). No-results guides: the user searched and found nothing, and needs help adjusting. Error-empty explains: something failed to load and the user needs a recovery path. Writing the wrong type of copy — motivational text for a no-results screen — creates confusion and erodes trust. A "Create your first project!" message on a filtered no-results screen actively misleads users who know their projects exist.

2. **Always include exactly one clear CTA.** Notion's empty page: "Press '/' for commands." GitHub's empty repository: "Create a new file or upload an existing file." The CTA must be a specific action, not a generic invitation. Multiple CTAs on an empty state create decision paralysis. If there are multiple paths forward (create, import, invite), choose the single most common one as the primary CTA and surface others as secondary text or links beneath the primary button. The hierarchy of options must be unmistakable — one primary, at most two secondary, and nothing that creates a fork without guidance.

3. **Show the value of filling the empty state, not just how to fill it.** "Track your team's progress in real time" is motivating. "Click 'New Project' to create a project" is mechanical. The motivational framing answers the implicit user question: "Why would I bother?" Linear's empty issues state: "No issues. Ship fast." — the absence of issues is reframed as an achievement, and the CTA is implied by the feature's purpose. Value-first copy converts passive first-time users into active ones. Show the outcome, then the action — not the action alone. The user needs to believe the effort of creating content is worth it.

4. **For no-results states, suggest specific recovery actions.** "No results for 'reciepe'" should be followed by a spelling suggestion ("Did you mean 'recipe'?"), a filter relaxation option ("Try removing the 'closed' filter"), or a browse alternative ("Browse all issues"). Never show just "No results found" without at least one recovery path. Linear's no-results state suggests broadening search terms and provides a one-click option to clear all filters. GitHub's code search suggests checking the search syntax or expanding to all branches. The recovery path must match the type of search — structured search needs filter controls, full-text search needs spelling help.

5. **Keep empty state copy under 3 sentences total.** The screen is already visually sparse — a paragraph of text makes it feel heavier, not more helpful. A headline (one phrase or question), a brief explanation (one sentence, optional), and a CTA (one button or link) is the maximum. Slack's empty channel state: "This is the very beginning of the #general channel." — one sentence, historically resonant, leaves room for the first message. The brevity of the copy matches the openness of the space. If you need more than three sentences, you are writing documentation, not an empty state.

6. **Use illustrations judiciously — copy must carry the message independently.** An illustration without actionable text is decoration. The empty state must work without the illustration in case it fails to load, is below the fold, or the user is using a screen reader. Write the copy as if there is no illustration. If the illustration adds meaning, reference it implicitly. Notion's empty page illustration of a hand holding a pencil works because the text explains the action — the illustration reinforces rather than replaces the message. Test the empty state with illustrations hidden — if it still communicates, the copy is doing its job.

7. **Detect first-use versus returning-user context and serve different copy.** First-use empty states need motivational context because the user does not yet understand the product. Returning-user empty states — after the user has deleted all content or cleared a queue — need brevity and respect, because the user already understands the product. "All caught up." is sufficient for an inbox-zero state for an experienced user; the same screen shown to a new user needs the motivational context. When detection is not possible, default to returning-user brevity rather than first-use verbosity — experienced users are more likely to hit empty states repeatedly.

8. **Error-empty states must distinguish between recoverable and unrecoverable failures.** "Couldn't load your projects. Try again." is recoverable — user can retry. "You don't have permission to view this content. Contact your workspace admin." is escalation required — user cannot self-resolve. The error-empty state must name the failure type and provide the appropriate recovery path: retry for transient errors, contact support or admin for permission issues, status page for system outages. Never show an empty state illustration with "No content here" when the actual cause is a permissions failure — the mismatch between visual tone (empty, neutral) and reality (blocked, error) misleads users.

## Details

### Empty State Type Matrix

Selecting the wrong type creates the wrong emotional register. A celebratory tone on an error-empty screen is jarring. A motivational tone on a no-results screen is irrelevant. Always classify before writing.

| Type         | User Goal           | Tone        | CTA Pattern              | Example                              |
| ------------ | ------------------- | ----------- | ------------------------ | ------------------------------------ |
| First-use    | Understand value    | Inviting    | Verb-noun primary action | "Create your first project"          |
| User-cleared | Confirm completion  | Celebratory | Optional next challenge  | "Inbox zero. Enjoy the peace."       |
| No-results   | Find alternatives   | Helpful     | Specific recovery action | "No results. Try removing filters."  |
| Error-empty  | Recover or escalate | Empathetic  | Retry or support link    | "Couldn't load projects. Try again." |

### First-Use vs Returning-User Empty States

**First-use empty state:** The user has never created content. Emphasize starting value and low risk. Stripe's empty transactions table for new merchants: "No transactions yet. Create a payment link to start accepting payments." The assumption is the user is unfamiliar with the workflow. Surface the "aha moment" — show what this space will look like when populated, not just how to fill it.

**Returning-user empty state:** The user deleted all content or cleared a queue. They are familiar with the product. Skip the explanation and go straight to the action. "All caught up. Create a new issue." or "No open invoices." For returning users, brevity signals respect for their expertise. A returning user who has deleted all their projects does not need to be told what a project is.

When possible, detect first-use vs returning-user status to serve the appropriate version. If not detectable, default to returning-user brevity.

### No-Results Recovery Patterns

No-results states should offer at minimum one of these recovery paths, matched to the search type:

- **Spelling suggestion:** "Did you mean 'authentication'?" with a clickable link to that search.
- **Filter relaxation:** "Showing results in 'Engineering' only. Search all workspaces." with a one-click option.
- **Scope expansion:** "No results in this project. Search across all projects."
- **Browse alternative:** "No results for 'API documentation'. Browse all docs."
- **Clear all:** A single button to reset all filters and return to the full list.
- **Query tips:** For structured search (code, SQL, commands), show syntax help inline.

Linear combines filter relaxation with browse alternatives. GitHub's search provides detailed syntax help when no results are found. The goal is to never leave the user stranded with only "No results" and a back button.

### Copy Length by Empty State Location

Different screens have different density tolerances for empty state copy:

| Screen Type         | Headline          | Body               | CTA                 |
| ------------------- | ----------------- | ------------------ | ------------------- |
| Full page           | 4-8 words         | 1-2 sentences      | 1 primary button    |
| Panel / sidebar     | 3-6 words         | 1 sentence or none | 1 link or button    |
| Data table row area | 4-8 words         | 1 sentence or none | 1 inline link       |
| Modal / dialog      | 3-6 words         | 1 sentence or none | 1 primary + 1 close |
| Card / widget       | 2-4 words or icon | None               | 1 link              |

### Anti-Patterns

1. **The Barren Wasteland.** A completely blank screen with no guidance, no illustration, no text, and no CTA. The user stares at white space with no understanding of what the space is for or what to do next. This most commonly occurs in developer-first products where the empty state was never designed. The fix: every empty state requires at minimum a headline and a CTA — a one-sentence explanation of what the user can create or do in this space is the minimum viable empty state.

2. **The Instruction Manual.** A paragraph or more of explanation about how to use the feature in the empty state, overwhelming the user at the moment they need the most encouragement. "Welcome to Projects! Projects help you organize your work into containers. You can add tasks, set deadlines, invite team members, and track progress. To get started, click the 'New Project' button in the top right corner..." This is documentation, not an empty state. Condense to one phrase, one optional sentence, one CTA.

3. **The Sad Illustration.** A decorative illustration (an empty box, a sad robot, a blank page with question marks) with no actionable text, no CTA, and no explanation. The illustration communicates "nothing is here" visually but gives the user nowhere to go. Empty state illustrations should always be accompanied by text that explains what should be here and how to add it. An illustration without text is visual wallpaper — it aestheticizes the problem without solving it.

4. **The Wrong Type.** Using first-use motivational copy for a no-results state, or user-cleared celebratory copy for an error-empty state. "Create your first project!" shown when all projects are filtered by "Archived" actively misleads the user into thinking they have no projects. The empty state type must match the actual situation. If the product cannot detect the difference between first-use and filtered-empty, default to neutral language that works for both: "No projects to show" with filter controls visible is better than "Create your first project" when projects may exist but are hidden.

### Real-World Examples

**Notion's Blank Page Experience.** Notion's empty page state uses a single instructional line: "Press '/' for commands" with a secondary line "Start writing, or drag files here." The minimalism matches the product's philosophy that a blank page is potential, not a problem. The hint teaches the primary interaction model (the slash command) in context. Notion removes the hint after the user has used it a few times, transitioning to true blank-slate for experienced users. This adaptive behavior — showing motivation to new users, then getting out of the way — is the ideal empty state lifecycle.

**GitHub's Empty Repository Setup.** GitHub's empty repository page is the gold standard for first-use empty states in developer tools. It provides the exact git commands to initialize and push a new repository, copy buttons for each command block, and multiple paths (new file, README, .gitignore, upload files). The technical nature of the content means more text is appropriate here than in most empty states. GitHub trusts its users enough to show them commands rather than hiding complexity behind a "Get started" button. The empty state teaches the workflow rather than abstracting it.

**Slack's Empty Channel State.** When a channel is first created, Slack shows: "This is the very beginning of the #[channel-name] channel." This simple message sets context (this is the start), establishes ownership (this is your channel), and creates a sense of occasion. No CTA is needed — the user knows what to do (send a message). The message disappears once the first message is sent — it is contextually relevant only at the moment of creation.

**Linear's No-Results Search.** Linear's search returns "No results for '[term]'" with two recovery paths: clear the search and see all results, or search across all teams. The zero-results state also surfaces keyboard shortcuts to refine the search. Linear avoids suggestions and spelling corrections because its search is structured (searching issues, projects, members) rather than full-text — the recovery paths it offers match its actual capabilities rather than importing patterns from full-text search that would not work here.

## Source

- NNGroup — "The Power of Empty States" (2017), https://www.nngroup.com/articles/empty-state-mobile-app-nice-to-have/
- Google Material Design — Empty states guidance, https://m3.material.io/foundations/layout/understanding-layout/parts-of-a-layout
- Invision — "How to Design Empty States," https://www.invisionapp.com/inside-design/empty-state-design/
- Yifrah, K. — _Microcopy: The Complete Guide_ (2017), empty state and zero-data patterns
- Hulick, S. — _The Elements of User Onboarding_ (2013), first-use and value-first patterns

### Empty States in Feature-Gated Contexts

When an empty state is caused by a plan or permissions limitation — not the absence of data — the copy must address the actual cause:

**Plan gate empty state:** "Analytics are available on the Pro plan. Upgrade to see your traffic data →." The copy names what is missing (analytics), explains why (Pro plan), and offers the next step (upgrade). Do not show a generic empty state illustration with "No data yet" — the user may have data, they just cannot see it. Misrepresenting a plan gate as an absence of data confuses users and erodes trust.

**Permission gate empty state:** "You don't have access to this workspace. Contact your admin to request access." The copy distinguishes between "no content exists" and "you can't see the content that exists" — a critical distinction for user mental models. GitHub shows "You need to be a collaborator to view this repository" — clear, accurate, with an implicit next step (become a collaborator).

The rule: always tell the user why the space is empty, not just that it is empty. The reason determines the recovery path — creation, upgrade, or permission request.

## Process

1. Classify the empty state as first-use, user-cleared, no-results, or error-empty — confirm the classification matches the actual user situation.
2. Write a headline of 3-8 words that names the type of content that belongs here and its value.
3. Add one optional sentence of context if the headline alone is insufficient.
4. Write a single specific CTA (verb-noun) as a button or link.
5. For no-results states, add at least one recovery path: spelling suggestion, filter relaxation, or scope expansion.

### Empty State Copy Audit Checklist

Before shipping an empty state, verify each item:

| Check                                               | Pass Criteria                                              |
| --------------------------------------------------- | ---------------------------------------------------------- |
| Type classified                                     | First-use, user-cleared, no-results, or error-empty        |
| Copy works without illustration                     | Message is comprehensible with image removed               |
| Exactly one primary CTA                             | Single specific verb-noun action, not two or more          |
| Under 3 sentences total                             | Headline + optional body + CTA                             |
| No results state has a recovery path                | Filter clear, scope expand, or spelling suggestion present |
| Error-empty distinguishes recoverable vs escalation | "Try again" vs "Contact admin" based on error type         |
| Value shown, not just instructions                  | Answers "why bother?" not just "how to"                    |
| First-use vs returning-user context respected       | Motivational for new, brief for returning                  |

A blank or generic empty state is a missed opportunity in every product. Empty states occur most often when users are new (high value moment) or when search fails (high frustration moment) — both moments where copy quality has outsized impact on whether users continue or abandon.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Every empty state is classified as one of the four types and uses the appropriate tone and CTA pattern.
- Empty state copy is 3 sentences or fewer, including a single specific CTA.
- No-results states include at least one recovery path (spelling correction, filter relaxation, or browse alternative).
- First-use empty states lead with the value of the content, not just instructions for how to create it.
- Empty state copy is independently comprehensible without relying on an illustration.
- Error-empty states distinguish between recoverable failures (retry) and unrecoverable failures (contact admin / support).
