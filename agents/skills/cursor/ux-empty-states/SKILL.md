# Empty States

> Empty states — first-use, user-cleared, and no-results patterns that motivate action, set expectations, and turn blank screens into onramps

## When to Use

- Designing first-use screens when a user has no data yet (fresh accounts, new workspaces)
- Writing zero-results messages for search or filter operations
- Creating user-cleared states after all items are completed, deleted, or removed
- Writing error-state empty screens (failed to load content, permission denied)
- NOT for: loading states before data arrives (see ux-loading-states)
- NOT for: onboarding flows and welcome sequences spanning multiple screens (see ux-onboarding-copy)

## Instructions

1. **Classify the empty state type before writing any copy.** First-use, user-cleared, no-results, and error-empty each need different copy, tone, and CTA. First-use motivates: the user is new and needs to understand the value of filling the space. User-cleared celebrates: the user accomplished something (inbox zero, completed all tasks). No-results guides: the user searched and found nothing, and needs help adjusting. Error-empty explains: something failed to load and the user needs a recovery path. Writing the wrong type of copy -- motivational text for a no-results screen -- creates confusion and erodes trust.

2. **Always include exactly one clear CTA.** Notion's empty page: "Press '/' for commands." GitHub's empty repository: "Create a new file or upload an existing file." The CTA must be a specific action, not a generic invitation. Multiple CTAs on an empty state create decision paralysis. If there are multiple paths forward (create, import, invite), choose the single most common one as the primary CTA and surface others as secondary text or links.

3. **Show the value of filling the empty state, not just how to fill it.** "Track your team's progress in real time" is motivating. "Click 'New Project' to create a project" is mechanical. The motivational framing answers the implicit user question: "Why would I bother?" Linear's empty issues state: "No issues. Ship fast." -- the absence of issues is reframed as an achievement, and the CTA is implied by the feature's purpose. Value-first copy converts passive first-time users into active ones.

4. **For no-results states, suggest specific recovery actions.** "No results for 'reciepe'" should be followed by a spelling suggestion ("Did you mean 'recipe'?"), a filter relaxation option ("Try removing the 'closed' filter"), or a browse alternative ("Browse all issues"). Never show just "No results found" without at least one recovery path. Linear's no-results state suggests broadening search terms and provides a one-click option to clear all filters. GitHub's code search suggests checking the search syntax or expanding to all branches.

5. **Keep empty state copy under 3 sentences total.** The screen is already visually sparse -- a paragraph of text makes it feel heavier, not more helpful. A headline (one phrase or question), a brief explanation (one sentence, optional), and a CTA (one button or link) is the maximum. Slack's empty channel state: "This is the very beginning of the #general channel." -- one sentence, historically resonant, leaves room for the first message. The brevity of the copy matches the openness of the space.

6. **Use illustrations judiciously -- copy must carry the message independently.** An illustration without actionable text is decoration. The empty state must work without the illustration in case it fails to load, is below the fold, or the user is using a screen reader. Write the copy as if there is no illustration. If the illustration adds meaning, reference it implicitly. Notion's empty page illustration of a hand holding a pencil works because the text explains the action -- the illustration reinforces rather than replaces the message.

## Details

### Empty State Type Matrix

| Type         | User Goal           | Tone        | CTA Pattern              | Example                              |
| ------------ | ------------------- | ----------- | ------------------------ | ------------------------------------ |
| First-use    | Understand value    | Inviting    | Verb-noun primary action | "Create your first project"          |
| User-cleared | Confirm completion  | Celebratory | Optional next challenge  | "Inbox zero. Enjoy the peace."       |
| No-results   | Find alternatives   | Helpful     | Specific recovery action | "No results. Try removing filters."  |
| Error-empty  | Recover or escalate | Empathetic  | Retry or support link    | "Couldn't load projects. Try again." |

Selecting the wrong type creates the wrong emotional register. A celebratory tone on an error-empty screen is jarring. A motivational tone on a no-results screen is irrelevant. Always classify before writing.

### First-Use vs Returning-User Empty States

First-use and returning-user empty states need different messaging for the same screen:

**First-use empty state:** The user has never created content. Emphasize starting value and low risk. "Your first project is the hardest. It gets easier." Stripe's empty transactions table for new merchants: "No transactions yet. Create a payment link to start accepting payments." The assumption is the user is unfamiliar with the workflow.

**Returning-user empty state:** The user deleted all content or cleared a queue. They are familiar with the product. Skip the explanation and go straight to the action. "All caught up. Create a new issue." or "No open invoices." For returning users, brevity signals respect for their expertise. Notion's empty trash: "Trash is empty." No motivational framing needed.

When possible, detect first-use vs returning-user status to serve the appropriate version. If not detectable, default to returning-user brevity.

### No-Results Recovery Patterns

No-results states should offer at minimum one of these recovery paths:

- **Spelling suggestion:** "Did you mean 'authentication'?" with a clickable link to that search.
- **Filter relaxation:** "Showing results in 'Engineering' only. Search all workspaces." with a one-click option.
- **Scope expansion:** "No results in this project. Search across all projects."
- **Browse alternative:** "No results for 'API documentation'. Browse all docs."
- **Clear all:** A single button to reset all filters and return to the full list.

Linear combines filter relaxation with browse alternatives. GitHub's search provides detailed syntax help when no results are found. Algolia's InstantSearch automatically suggests related terms. The goal is to never leave the user stranded with only "No results" and a back button.

### Anti-Patterns

1. **The Barren Wasteland.** A completely blank screen with no guidance, no illustration, no text, and no CTA. The user stares at white space with no understanding of what the space is for or what to do next. This most commonly occurs in developer-first products where the empty state was never designed. The fix: every empty state requires at minimum a headline, a CTA, and ideally a one-sentence explanation of what the user can create or do in this space.

2. **The Instruction Manual.** A paragraph or more of explanation about how to use the feature in the empty state, overwhelming the user at the moment they need the most encouragement. "Welcome to Projects! Projects help you organize your work into containers. You can add tasks, set deadlines, invite team members, and track progress. To get started, click the 'New Project' button in the top right corner..." This is documentation, not an empty state. Condense to one phrase, one optional sentence, one CTA.

3. **The Sad Illustration.** A decorative illustration (an empty box, a sad robot, a blank page with question marks) with no actionable text, no CTA, and no explanation. The illustration communicates "nothing is here" visually but gives the user nowhere to go. Empty state illustrations should always be accompanied by text that explains what should be here and how to add it. An illustration without text is visual wallpaper.

### Real-World Examples

**Notion's Blank Page Experience.** Notion's empty page state uses a single instructional line: "Press '/' for commands" with a secondary line "Start writing, or drag files here." The minimalism matches the product's philosophy that a blank page is potential, not a problem. The hint teaches the primary interaction model (the slash command) in context. Notion removes the hint after the user has used it a few times, transitioning to true blank-slate for experienced users.

**GitHub's Empty Repository Setup.** GitHub's empty repository page is the gold standard for first-use empty states in developer tools. It provides the exact git commands to initialize and push a new repository, copy buttons for each command block, and multiple paths (new file, README, .gitignore, upload files). The technical nature of the content means more text is appropriate here than in most empty states. GitHub trusts its users enough to show them commands rather than hiding complexity behind a "Get started" button.

**Slack's Empty Channel State.** When a channel is first created, Slack shows: "This is the very beginning of the #[channel-name] channel." This simple message sets context (this is the start), establishes ownership (this is _your_ channel), and creates a sense of occasion. No CTA is needed -- the user knows what to do (send a message). The message disappears once the first message is sent.

**Linear's No-Results Search.** Linear's search returns "No results for '[term]'" with two recovery paths: clear the search and see all results, or search across all teams. The zero-results state also surfaces keyboard shortcuts to refine the search. Linear avoids suggestions and spelling corrections because its search is structured (searching issues, projects, members) rather than full-text -- the recovery paths it offers match its actual capabilities.

## Source

- NNGroup — "The Power of Empty States" (2017), https://www.nngroup.com/articles/empty-state-mobile-app-nice-to-have/
- Google Material Design — Empty states guidance, https://m3.material.io/foundations/layout/understanding-layout/parts-of-a-layout
- Invision — "How to Design Empty States," https://www.invisionapp.com/inside-design/empty-state-design/
- Yifrah, K. — _Microcopy: The Complete Guide_ (2017), empty state and zero-data patterns

## Process

1. Classify the empty state as first-use, user-cleared, no-results, or error-empty.
2. Write a headline of 3-8 words that names the type of content that belongs here and its value.
3. Add one optional sentence of context if the headline alone is insufficient.
4. Write a single specific CTA (verb-noun) as a button or link.
5. For no-results states, add at least one recovery path: spelling suggestion, filter relaxation, or scope expansion.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- Every empty state is classified as one of the four types and uses the appropriate tone and CTA pattern.
- Empty state copy is 3 sentences or fewer, including a single specific CTA.
- No-results states include at least one recovery path (spelling correction, filter relaxation, or browse alternative).
- First-use empty states lead with the value of the content, not just instructions for how to create it.
- Empty state copy is independently comprehensible without relying on an illustration.
