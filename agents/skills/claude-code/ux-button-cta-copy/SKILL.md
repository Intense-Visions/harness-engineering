# Button and CTA Copy

> Button and CTA copy — verb-noun pattern, specificity over vagueness, context-sensitive labels, and writing buttons that tell users exactly what will happen

## When to Use

- Writing primary and secondary action button labels in forms, modals, and pages
- Naming CTA buttons in dialogs, cards, and marketing components
- Writing link text that acts as an action trigger (not navigation)
- Choosing between generic and specific button labels when reviewing existing copy
- NOT for: navigation links and menu items that describe destinations (see ux-navigation-labels)
- NOT for: confirmation dialog button patterns for destructive actions (see ux-confirmation-dialogs)

## Instructions

1. **Use the verb-noun pattern: action + object.** The verb names what happens; the noun names what it happens to. "Save draft" (action: save, object: draft). "Delete project" (action: delete, object: project). "Send invitation" (action: send, object: invitation). Stripe: "Add payment method." GitHub: "Create pull request." Linear: "Create issue." The pattern scales to every context -- when you know what action the button performs and what it operates on, the label writes itself. When you cannot name both the verb and the noun, the button's purpose is unclear.

2. **Never use generic verbs alone.** "OK," "Submit," "Confirm," "Done," "Yes," "No," "Continue," "Next," and "Proceed" are ambiguous without reading the surrounding context. In a destructive confirmation dialog, "OK" is dangerous -- users may click without reading. "Delete project" on the same button is unambiguous. On a checkout form, "Submit" could mean submit a support request, submit a form, or submit a payment. "Pay $49.99" eliminates any ambiguity. The generic verb forces the user to remember context; the specific verb provides it on the button itself.

3. **Match the button label to what the form or action actually does.** A form that creates an account should have "Create account" not "Submit." A form that sends a message should have "Send message" not "Done." A form that places an order should have "Place order" not "Confirm." The label describes the outcome of clicking, not the act of clicking. Shopify's checkout: "Complete order." GitHub's sign-up: "Create account." Stripe's invoice payment: "Pay invoice." Each label names the specific real-world event that clicking triggers.

4. **Put the destructive button on the left or styled distinctly -- never mirror the safe button's visual weight.** When a dialog has a destructive action (delete) and a safe action (cancel), the destructive button should use destructive styling (red) and the safe button should use secondary styling (outlined or ghost). Never put both buttons in identical primary styling -- users click primary-styled buttons on muscle memory. GitHub: red "Delete this repository" button + outlined "Cancel" link. Notion: red "Delete page" + "Keep it" as plain text. The visual hierarchy must reinforce the copy hierarchy.

5. **Keep button text to 1-4 words.** If you need more than four words, the action is too complex for a single button or the label is over-explaining. "Export selected transactions as CSV" should be "Export CSV" (let the context provide "selected transactions"). "Add a new team member to this project" should be "Add member." The constraint forces prioritization -- what is the one most important word in this label? It should probably be first. Button labels are not descriptions.

6. **Front-load the verb -- never end with the verb.** "Export CSV" not "CSV Export." "Create team" not "New team creation." "Send report" not "Report sending." The verb should be the first word so users scanning buttons see the action immediately. In a list of action buttons, every item should start with a different verb if possible: "Create," "Import," "Archive," "Delete" -- each is distinguishable by its first word alone.

7. **For stateful buttons, reflect the current system state.** A "Save" button that is saving should say "Saving..." with an in-progress indicator. After completing, it should say "Saved" with a checkmark, then return to "Save" after a few seconds. A "Follow" button that has been clicked should say "Following" or "Unfollow" (the next available action). Figma's toolbar save indicator cycles through these states. GitHub's repository star button toggles between "Star" and "Unstar." Users who click without visual feedback will click again, causing double submissions.

## Details

### Button Label Length Guidelines

| Button Type        | Target Word Count | Maximum | Example                       |
| ------------------ | ----------------- | ------- | ----------------------------- |
| Primary action     | 2 words           | 3 words | "Create project"              |
| Destructive action | 2 words           | 3 words | "Delete project"              |
| Secondary action   | 1-2 words         | 3 words | "Cancel"                      |
| Link-as-action     | 2-3 words         | 4 words | "Learn more" / "View details" |
| Marketing CTA      | 2-4 words         | 5 words | "Start free trial"            |
| Checkout CTA       | 2-3 words         | 4 words | "Pay $49.99"                  |

When a button label exceeds the maximum, examine whether the label is trying to do two things (describe the button AND explain the context) or whether the action itself needs redesigning. "Export all transactions from the last 30 days as CSV" should be "Export CSV" with a date range selector above the button.

### Primary vs Secondary vs Tertiary Label Conventions

**Primary buttons** (filled, high contrast) take specific verb-noun labels describing the main action: "Create project," "Save changes," "Submit form." Primary buttons represent the intended completion path.

**Secondary buttons** (outlined or ghost) take safe, often reversible action labels: "Cancel," "Back," "Skip," or a competing but safe action like "Save as draft." The secondary button should always be the lower-stakes option.

**Tertiary buttons** (text-only links or icon buttons) take minimal labels or tooltips: "Delete," "Edit," "More options (...)" -- these are low-discovery controls where brevity is appropriate because the action is secondary to the primary workflow.

Never use identical visual styling for buttons with drastically different consequences. A primary-styled "Delete" next to a primary-styled "Save" will cause accidental deletions.

### Stateful Button Copy

Buttons that represent an ongoing state or a toggle need copy for all states:

| Action Type  | Idle State  | In-Progress State | Success State | Error State          |
| ------------ | ----------- | ----------------- | ------------- | -------------------- |
| Save         | "Save"      | "Saving..."       | "Saved"       | "Save failed. Retry" |
| Submit/Send  | "Send"      | "Sending..."      | "Sent"        | "Failed. Retry"      |
| Toggle (off) | "Enable"    | "Enabling..."     | "Enabled"     | "Failed to enable"   |
| Toggle (on)  | "Disable"   | "Disabling..."    | "Disabled"    | "Failed to disable"  |
| Follow       | "Follow"    | —                 | "Following"   | —                    |
| Subscribe    | "Subscribe" | "Subscribing..."  | "Subscribed"  | "Failed"             |

The in-progress state prevents double-submission and provides reassurance. The success state provides confirmation without a separate notification. The error state suggests a recovery action inline on the button itself.

### Anti-Patterns

1. **The Generic Submit.** Using "Submit" on every form regardless of what the form does. The form's title may say "Contact Us" and the fields may be "Name," "Email," "Message," but the button says "Submit" -- not "Send message." The fix is to derive the button label from the form's action: what does clicking this button cause to happen in the real world? Name that event. "Submit" tells the user only that they are submitting a form -- it says nothing about what the form does.

2. **The Ambiguous Pair.** Dialog buttons labeled "Yes" and "No" that require re-reading the dialog question to understand which does what. "Are you sure you want to delete this project? [Yes] [No]" -- the user must hold the question in memory while clicking. The fix: replace "Yes" with the action ("Delete project") and "No" with the safe option ("Keep project"). The buttons must be independently comprehensible without the question. GitHub, Stripe, and Notion all use specific verb-noun labels on confirmation dialogs for this reason.

3. **The Noun Button.** Buttons that are just nouns without verbs, leaving the action unclear. "Settings," "Report," "Export," "Archive" -- are these navigation items? Action buttons? Trigger an immediate operation? "Settings" as a button could mean "Go to settings" (navigate) or "Save settings" (save). Adding the verb eliminates the ambiguity: "Open settings," "Generate report," "Export CSV," "Archive project." The noun alone creates uncertainty about whether the action is immediate or navigational.

### Real-World Examples

**Stripe's Checkout CTA.** Stripe's checkout button says "Pay $49.99" -- three words that name the action (pay) and the consequence (the exact amount). The label is dynamically generated from the cart total, making it impossible to use a generic label. This specificity reduces the cognitive load of confirming the payment amount and the action simultaneously. Stripe's conversion data supports specific CTAs: "Pay $49.99" outperforms "Complete Purchase" in A/B tests because it tells users exactly what clicking will charge.

**GitHub's PR Merge Button States.** GitHub's merge button cycles through multiple states as the PR is reviewed: "Merge pull request" (default), "Squash and merge" / "Create a merge commit" / "Rebase and merge" (via dropdown), "Merging..." (in progress), and then the state resolves to the PR being marked merged. Each state uses a specific verb-noun pattern. The dropdown options are particularly well-labeled: each names both the action (merge, squash, rebase) and the consequence (a new commit, squashed commits, rebased commits). Users who do not understand the difference can infer it from the label.

**Linear's Issue Creation Flow.** Linear's "Create issue" button is a primary action that opens a modal. Inside the modal, the submit button says "Create issue" -- the same label used to trigger the modal, reinforcing the action throughout. When Linear introduced keyboard shortcut creation (pressing "C" anywhere), the tooltip on the button says "Create issue (C)" -- the label is consistent across three invocation methods (click, keyboard, command palette). This consistency means users always know what they are doing, regardless of how they trigger it.

**Notion's Page Action Buttons.** Notion's page action menu uses specific verb-noun labels for every item: "Turn into" (convert page type), "Move to" (relocate page), "Copy link" (copy), "Add to favorites" (bookmark), "Delete" (permanent deletion -- the one exception to the verb-noun rule, as "Delete" is specific enough without a noun when operating on the currently visible page). The menu is an excellent example of front-loaded verbs: every item starts with its distinguishing verb.

## Source

- NNGroup — "Writing Clear Button Labels" (2018), https://www.nngroup.com/articles/button-label-text/
- Google Material Design — Button guidelines, https://m3.material.io/components/buttons/guidelines
- Apple Human Interface Guidelines — Buttons, https://developer.apple.com/design/human-interface-guidelines/buttons
- Yifrah, K. — _Microcopy: The Complete Guide_ (2017), button copy chapter

## Process

1. Identify the real-world event that clicking the button causes -- name that event as verb + object.
2. Verify the label is 1-4 words with the verb first.
3. Check that no two buttons on the same screen start with the same verb unless they are intentionally parallel actions.
4. If the button has stateful behavior, define labels for all states (idle, in-progress, success, error).
5. Confirm primary and secondary buttons have distinct visual styling that reflects the relative risk of each action.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- Every button uses a specific verb-noun pattern -- no generic "OK," "Submit," "Confirm," or "Done."
- Button labels are 1-4 words with the verb as the first word.
- Stateful buttons display labels for all states: idle, in-progress, success, and error.
- Destructive buttons use destructive styling and are never visually identical to safe secondary buttons.
- No two buttons in the same context start with the same verb unless they are intentionally parallel.
