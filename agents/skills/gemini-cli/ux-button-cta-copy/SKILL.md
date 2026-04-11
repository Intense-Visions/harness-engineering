# Button and CTA Copy

> Button and CTA copy — verb-noun pattern, specificity over vagueness, context-sensitive labels, and writing buttons that tell users exactly what will happen

## When to Use

- Writing primary and secondary action button labels in forms, modals, and pages
- Naming CTA buttons in dialogs, cards, and marketing components
- Writing link text that acts as an action trigger (not navigation)
- Choosing between generic and specific button labels when reviewing existing copy
- Writing stateful button labels for in-progress, success, and error states
- NOT for: navigation links and menu items that describe destinations (see ux-navigation-labels)
- NOT for: confirmation dialog button patterns for destructive actions (see ux-confirmation-dialogs)
- NOT for: form submit buttons on simple single-field forms where the form name is the label

## Instructions

1. **Use the verb-noun pattern: action + object.** The verb names what happens; the noun names what it happens to. "Save draft" (action: save, object: draft). "Delete project" (action: delete, object: project). "Send invitation" (action: send, object: invitation). Stripe: "Add payment method." GitHub: "Create pull request." Linear: "Create issue." The pattern scales to every context — when you know what action the button performs and what it operates on, the label writes itself. When you cannot name both the verb and the noun, the button's purpose is unclear and likely needs redesign. The verb-noun pattern is also the most direct defense against generic labels — "OK" has no verb or noun, while "Delete project" has both.

2. **Never use generic verbs alone.** "OK," "Submit," "Confirm," "Done," "Yes," "No," "Continue," "Next," and "Proceed" are ambiguous without reading the surrounding context. In a destructive confirmation dialog, "OK" is dangerous — users may click without reading. "Delete project" on the same button is unambiguous. On a checkout form, "Submit" could mean submit a support request, submit a form, or submit a payment. "Pay $49.99" eliminates any ambiguity. The generic verb forces the user to remember context; the specific verb provides it on the button itself. The test: cover the rest of the screen — can you identify what this button does from its label alone?

3. **Match the button label to what the form or action actually does.** A form that creates an account should have "Create account" not "Submit." A form that sends a message should have "Send message" not "Done." A form that places an order should have "Place order" not "Confirm." The label describes the outcome of clicking, not the act of clicking. Shopify's checkout: "Complete order." GitHub's sign-up: "Create account." Stripe's invoice payment: "Pay invoice." Each label names the specific real-world event that clicking triggers. When onboarding a new team member, the button should say "Invite Jordan" not "Send invite" if the person's name is available in context.

4. **Put the destructive button in a visually distinct style — never mirror the safe button's weight.** When a dialog has a destructive action (delete) and a safe action (cancel), the destructive button should use destructive styling (red) and the safe button should use secondary styling (outlined or ghost). Never put both buttons in identical primary styling — users click primary-styled buttons on muscle memory without reading. GitHub: red "Delete this repository" button + outlined "Cancel" link. Notion: red "Delete page" + "Keep it" as plain text. The visual hierarchy must reinforce the copy hierarchy — the button that risks data loss should never be the same visual weight as the safe button.

5. **Keep button text to 1-4 words.** If you need more than four words, the action is too complex for a single button or the label is over-explaining. "Export selected transactions as CSV" should be "Export CSV" (let the context provide "selected transactions"). "Add a new team member to this project" should be "Add member." The constraint forces prioritization — what is the one most important word in this label? It should probably be first. Button labels are not descriptions. If the label requires more than four words to be unambiguous, examine whether the button's context (its page, section, or dialog title) can carry some of that meaning so the label itself can be shorter.

6. **Front-load the verb — never end with the verb.** "Export CSV" not "CSV Export." "Create team" not "New team creation." "Send report" not "Report sending." The verb should be the first word so users scanning buttons see the action immediately. In a list of action buttons, every item should start with a different verb if possible: "Create," "Import," "Archive," "Delete" — each is distinguishable by its first word alone. When two buttons must start with the same verb (e.g., "Save draft" and "Save and publish"), differentiate by the noun immediately: "Save draft" and "Publish" (where "publish" implies saving).

7. **For stateful buttons, reflect the current system state across all states.** A "Save" button that is saving should say "Saving..." with an in-progress indicator. After completing, it should say "Saved" with a checkmark, then return to "Save" after a few seconds. A "Follow" button that has been clicked should say "Following" or "Unfollow" (the next available action). Figma's toolbar save indicator cycles through these states. GitHub's repository star button toggles between "Star" and "Unstar." Users who click without visual feedback will click again, causing double submissions. Every stateful button needs labels for idle, in-progress, success, and error states — not just the idle state.

8. **Write link-as-action text with verb phrases, not "click here" or "learn more" alone.** "Click here to view the report" should be "View the report." "Learn more" should be "Learn how billing works" or "See pricing." Generic link text like "click here" is an accessibility failure — screen readers read link text out of context, so "click here" in a list of links provides no navigational information. Verb phrases provide both the action and the destination: "Download the style guide," "View all 47 issues," "Compare plans." The link text should be meaningful when read in isolation, without the surrounding sentence.

## Details

### Button Label Length Guidelines

When a button label exceeds the maximum, examine whether the label is trying to do two things (describe the button AND explain the context) or whether the action itself needs redesigning.

| Button Type        | Target Word Count | Maximum | Example                       |
| ------------------ | ----------------- | ------- | ----------------------------- |
| Primary action     | 2 words           | 3 words | "Create project"              |
| Destructive action | 2 words           | 3 words | "Delete project"              |
| Secondary action   | 1-2 words         | 3 words | "Cancel"                      |
| Link-as-action     | 2-3 words         | 4 words | "Learn more" / "View details" |
| Marketing CTA      | 2-4 words         | 5 words | "Start free trial"            |
| Checkout CTA       | 2-3 words         | 4 words | "Pay $49.99"                  |

### Primary vs Secondary vs Tertiary Label Conventions

**Primary buttons** (filled, high contrast) take specific verb-noun labels describing the main action: "Create project," "Save changes," "Submit form." Primary buttons represent the intended completion path.

**Secondary buttons** (outlined or ghost) take safe, often reversible action labels: "Cancel," "Back," "Skip," or a competing but safe action like "Save as draft." The secondary button should always be the lower-stakes option.

**Tertiary buttons** (text-only links or icon buttons) take minimal labels or tooltips: "Delete," "Edit," "More options (...)" — these are low-discovery controls where brevity is appropriate because the action is secondary to the primary workflow.

Never use identical visual styling for buttons with drastically different consequences. A primary-styled "Delete" next to a primary-styled "Save" will cause accidental deletions.

### Stateful Button Copy

Buttons that represent an ongoing state or a toggle need copy for all states. Missing states lead to double-submission, user confusion, and silent failures.

| Action Type  | Idle State  | In-Progress State | Success State | Error State          |
| ------------ | ----------- | ----------------- | ------------- | -------------------- |
| Save         | "Save"      | "Saving..."       | "Saved"       | "Save failed. Retry" |
| Submit/Send  | "Send"      | "Sending..."      | "Sent"        | "Failed. Retry"      |
| Toggle (off) | "Enable"    | "Enabling..."     | "Enabled"     | "Failed to enable"   |
| Toggle (on)  | "Disable"   | "Disabling..."    | "Disabled"    | "Failed to disable"  |
| Follow       | "Follow"    | —                 | "Following"   | —                    |
| Subscribe    | "Subscribe" | "Subscribing..."  | "Subscribed"  | "Failed"             |

### Context-Sensitive Label Adaptation

The same action button may need different labels in different contexts to remain specific:

- **Generic:** "Save" → **In a document editor:** "Save document" → **In a draft flow:** "Save draft" → **In a multi-user shared doc:** "Save and sync"
- **Generic:** "Submit" → **On a support form:** "Send message" → **On a payment form:** "Pay $49.99" → **On a job application:** "Submit application"
- **Generic:** "Add" → **In a team context:** "Add member" → **In a billing context:** "Add payment method" → **In a project context:** "Add task"

The principle: if the context changes what happens when you click, the label should change too. Labels that are generic across all contexts miss the opportunity to confirm, for the user, exactly what clicking will do.

### Marketing CTA vs Product CTA

Marketing CTAs (on landing pages, emails, and ads) follow different rules than product CTAs (in app):

**Marketing CTAs** may use aspirational language because the user is evaluating, not acting: "Start your free trial," "See pricing," "Get early access." The user has not committed — the CTA persuades and invites.

**Product CTAs** must name the specific action because the user is executing, not evaluating: "Create project," "Export CSV," "Send invitation." The user has committed — the CTA confirms the action and its object.

A common error is importing marketing CTA patterns into product UIs. "Get started" is a fine landing page CTA; in a product modal, it is the button that says nothing about what "getting started" entails. "Learn more" is a fine email CTA; in a product panel, it is the button that replaces the more specific "View documentation" or "See pricing breakdown."

When reviewing CTAs, identify whether the context is evaluative (marketing) or executive (product) — and apply the appropriate pattern. Do not apply marketing aspirational language to product actions, and do not apply product specificity to marketing contexts where specificity may narrow the appeal.

### Anti-Patterns

1. **The Generic Submit.** Using "Submit" on every form regardless of what the form does. The form's title may say "Contact Us" and the fields may be "Name," "Email," "Message," but the button says "Submit" — not "Send message." The fix is to derive the button label from the form's action: what does clicking this button cause to happen in the real world? Name that event. "Submit" tells the user only that they are submitting a form — it says nothing about what the form does. This is the most common button anti-pattern in enterprise software because engineers often wire the button and choose a label as an afterthought.

2. **The Ambiguous Pair.** Dialog buttons labeled "Yes" and "No" that require re-reading the dialog question to understand which does what. "Are you sure you want to delete this project? [Yes] [No]" — the user must hold the question in memory while clicking. The fix: replace "Yes" with the action ("Delete project") and "No" with the safe option ("Keep project"). The buttons must be independently comprehensible without the question. GitHub, Stripe, and Notion all use specific verb-noun labels on confirmation dialogs for this reason.

3. **The Noun Button.** Buttons that are just nouns without verbs, leaving the action unclear. "Settings," "Report," "Export," "Archive" — are these navigation items? Action buttons? Do they trigger an immediate operation? "Settings" as a button could mean "Go to settings" (navigate) or "Save settings" (save). Adding the verb eliminates the ambiguity: "Open settings," "Generate report," "Export CSV," "Archive project." The noun alone creates uncertainty about whether the action is immediate or navigational.

4. **The Identical Pair.** Two buttons with the same visual weight performing actions with vastly different consequences. A red-and-blue "Delete" next to a red-and-blue "Save" — same size, same visual prominence. Users operating on muscle memory will click the wrong button. Visual hierarchy must reinforce consequence hierarchy: destructive buttons must be visually distinct from constructive buttons, not just labeled differently.

### Real-World Examples

**Stripe's Checkout CTA.** Stripe's checkout button says "Pay $49.99" — three words that name the action (pay) and the consequence (the exact amount). The label is dynamically generated from the cart total, making it impossible to use a generic label. This specificity reduces the cognitive load of confirming the payment amount and the action simultaneously. Stripe's conversion data supports specific CTAs: "Pay $49.99" outperforms "Complete Purchase" in A/B tests because it tells users exactly what clicking will charge. The dynamic label also prevents the common error of clicking a payment button without knowing the amount.

**GitHub's PR Merge Button States.** GitHub's merge button cycles through multiple states as the PR is reviewed: "Merge pull request" (default), "Squash and merge" / "Create a merge commit" / "Rebase and merge" (via dropdown), "Merging..." (in progress), and then the state resolves to the PR being marked merged. Each state uses a specific verb-noun pattern. The dropdown options are particularly well-labeled: each names both the action (merge, squash, rebase) and the consequence (a new commit, squashed commits, rebased commits). Users who do not understand the difference can infer it from the label alone.

**Linear's Issue Creation Flow.** Linear's "Create issue" button is a primary action that opens a modal. Inside the modal, the submit button says "Create issue" — the same label used to trigger the modal, reinforcing the action throughout. When Linear introduced keyboard shortcut creation (pressing "C" anywhere), the tooltip on the button says "Create issue (C)" — the label is consistent across three invocation methods (click, keyboard, command palette). This consistency means users always know what they are doing, regardless of how they trigger it.

**Notion's Page Action Buttons.** Notion's page action menu uses specific verb-noun labels for every item: "Turn into" (convert page type), "Move to" (relocate page), "Copy link" (copy), "Add to favorites" (bookmark), "Delete" (permanent deletion — the one exception to the verb-noun rule, as "Delete" is specific enough without a noun when operating on the currently visible page). The menu is an excellent example of front-loaded verbs: every item starts with its distinguishing verb, making the menu scannable by action rather than by object.

## Source

- NNGroup — "Writing Clear Button Labels" (2018), https://www.nngroup.com/articles/button-label-text/
- Google Material Design — Button guidelines, https://m3.material.io/components/buttons/guidelines
- Apple Human Interface Guidelines — Buttons, https://developer.apple.com/design/human-interface-guidelines/buttons
- Yifrah, K. — _Microcopy: The Complete Guide_ (2017), button copy chapter
- W3C WCAG 2.1 — Success Criterion 2.4.6: Headings and Labels, https://www.w3.org/WAI/WCAG21/Understanding/headings-and-labels

## Process

1. Identify the real-world event that clicking the button causes — name that event as verb + object.
2. Verify the label is 1-4 words with the verb first.
3. Check that no two buttons on the same screen start with the same verb unless they are intentionally parallel actions.
4. If the button has stateful behavior, define labels for all states (idle, in-progress, success, error).
5. Confirm primary and secondary buttons have distinct visual styling that reflects the relative risk of each action.

### Button CTA Copy Review Checklist

Before shipping any button or CTA, verify each item:

| Check                                               | Pass Criteria                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| Specific verb-noun pattern                          | No "OK," "Submit," "Confirm," "Done," or "Yes/No"                 |
| Verb is the first word                              | "Export CSV" not "CSV Export"                                     |
| Length 1-4 words                                    | No label over four words                                          |
| Matches what the form or action does                | "Create account" not "Submit" on a sign-up form                   |
| Stateful labels defined                             | Idle, in-progress, success, error states all written              |
| Destructive buttons visually distinct               | Red/error color, never same weight as safe button                 |
| Link-as-action text uses verb phrases               | "View report" not "Click here" or bare "Learn more"               |
| No two buttons start with same verb in same context | Unless intentionally parallel (e.g., "Save" / "Save and publish") |

Button labels are the most frequently written and most frequently neglected microcopy in any product. An audit of a mature product typically finds dozens of "Submit" buttons, "OK" dialogs, and stateless buttons with missing in-progress states. Running a button audit using this checklist typically surfaces improvements that directly affect conversion and error rates.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Every button uses a specific verb-noun pattern — no generic "OK," "Submit," "Confirm," or "Done."
- Button labels are 1-4 words with the verb as the first word.
- Stateful buttons display labels for all states: idle, in-progress, success, and error.
- Destructive buttons use destructive styling and are never visually identical to safe secondary buttons.
- No two buttons in the same context start with the same verb unless they are intentionally parallel.
- Link-as-action text uses verb phrases and is meaningful when read out of context (screen reader compliant).
