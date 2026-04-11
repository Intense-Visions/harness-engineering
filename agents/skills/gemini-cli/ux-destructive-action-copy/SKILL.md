# Destructive Action Copy

> Destructive action copy — irreversibility warnings, undo availability, double-confirmation patterns, cooldown messaging

## When to Use

- Writing delete flows for records, files, repositories, accounts, or workspaces
- Designing confirmation dialogs for irreversible state changes
- Building account termination and data deletion flows
- Creating bulk destructive operation warnings
- Designing undo and grace period messaging for soft-deletions
- Writing type-to-confirm patterns for highest-consequence actions
- NOT for: routine confirmations where the action is easily reversible (use ux-confirmation-dialogs)
- NOT for: error recovery flows where no deliberate destructive action was taken
- NOT for: archive or hide actions that preserve data in a recoverable state

## Instructions

1. **State irreversibility explicitly if the action cannot be undone.** Users calibrate their caution based on whether they can recover from a mistake. "This cannot be undone" is not boilerplate -- it is a factual statement about the system's behavior that directly informs the user's decision. When an action is recoverable (soft delete with a 30-day window), say so explicitly: "You can restore this within 30 days." When an action is partially recoverable ("Your repositories will be transferred, but your account data will be deleted immediately"), name the boundary precisely. Never assume the user understands from context whether a destructive action is permanent -- state it plainly at the decision point, not in help documentation they will never read. GitHub's repository deletion dialog says "This action is permanent and cannot be undone." Stripe's subscription cancellation says "Your subscription will end at the end of your billing period -- no further charges."

2. **Name exactly what will be destroyed -- including counts and downstream effects.** Vague destruction warnings undercount the consequences and leave users surprised after the fact. "Delete this workspace" is insufficient. "Delete 'Acme Corp' workspace and its 14 members, 230 projects, and 4,200 tasks -- all data will be permanently deleted" is complete. Linear's team deletion shows: "Deleting this team will permanently delete all issues (47), cycles (8), projects (3), and associated data. Members will lose access immediately." The count is dynamically generated from live data -- what will actually be destroyed is shown, not estimated. Downstream effects (members losing access, integrations disconnecting, billing stopping) are named explicitly so the user can evaluate the full scope of their decision before confirming.

3. **Offer undo where the system technically supports it -- undo transforms dangerous into recoverable.** The single biggest UX improvement for destructive actions is adding a soft-delete grace period and advertising it prominently. "Moved to trash. Undo" in a toast message converts a catastrophic mistake into a three-second fix. The undo affordance must appear immediately, in the user's current view, with a clear action -- not buried in a settings menu or trash view that requires navigation. Google Drive's "Moved to trash" toast with "Undo" has set user expectations across the industry; users now expect undo to exist and are disproportionately frustrated when it does not. If undo is technically possible, implement it and lead the confirmation dialog with that information: "You can undo this from your trash within 30 days." This framing shifts the emotional experience from irreversible loss to managed risk.

4. **Type-to-confirm patterns for highest-consequence actions -- require the exact resource name, not a generic word.** When the consequence of a mistake is catastrophic and irreversible (delete a production database, terminate an organization account, destroy all billing history), a click-to-confirm dialog is insufficient friction. Require the user to type the name of the specific resource being destroyed. This serves two purposes: it ensures the user is present and deliberate (not clicking through a dialog), and it names the specific object one more time, making it impossible to accidentally delete the wrong resource in a list. GitHub requires typing the full repository name: "To confirm, type the name of the repository: [repo-name]." Never require typing a generic word like "DELETE" or "CONFIRM" -- the generic word adds friction without adding specificity, and users memorize the required string ("just type DELETE") rather than engaging with the consequence.

5. **Cooldown copy for async or scheduled deletions -- make the window and cancellation path explicit.** When deletion is not immediate (account deletion with a 30-day recovery period, scheduled data purge, export-then-delete workflow), the copy must communicate three things: when the deletion takes effect, what is accessible during the window, and how to cancel. Google's account deletion page shows: "Your account will be deleted in 30 days. During this time you can sign in to recover your account. After 30 days, your data will be permanently deleted and cannot be recovered." Each sentence answers a different question the user will have. The cancellation path ("sign in to recover") is named as a concrete action, not a vague possibility -- users who discover the grace period after the fact need to know exactly what to do without searching for documentation.

6. **Warn before -- the warning must appear before the point of no return, not after.** A post-deletion "Your account has been deleted" confirmation screen is not a warning -- it is a receipt. The warning belongs at the decision point: the confirmation dialog, the settings page with the delete button, or the preview step in a multi-step deletion flow. For multi-step destructive workflows, warnings should escalate: a mild warning at the initiation step ("This will permanently delete your account"), a stronger warning at the confirmation step (with type-to-confirm and a list of what will be lost), and a final summary before the irreversible action executes. Stripe's subscription cancellation flow shows the plan end date, the data retention period, and a summary of what will be lost at each step -- building a complete picture before any irreversible state change occurs.

7. **The destructive button text is the specific verb -- not a euphemism or a generic positive.** "Remove," "End," "Clear," "Close," "Deactivate" are euphemisms for "Delete," "Terminate," "Purge," "Cancel," "Disable." Euphemisms reduce cognitive engagement with the consequences of the action. When a user reads "Delete" on a red button in a deletion confirmation dialog, the word's meaning activates the appropriate level of caution; "Remove" activates a softer mental model -- something like removing a sticker, not destroying data. Use "Delete" for permanent deletion, "Cancel" for subscription termination (not "End plan"), "Terminate" for forced account closure, "Purge" for bulk data deletion with no recovery. The button text must match the severity of the action, because the button text is the last thing the user reads before the point of no return.

## Details

### Destructive Action Severity Scale

Not all destructive actions warrant the same level of friction. Apply friction proportional to consequence:

| Severity | Action Type                         | Confirmation Pattern              | Example                             |
| -------- | ----------------------------------- | --------------------------------- | ----------------------------------- |
| Low      | Reversible delete                   | Toast with Undo (5-30 seconds)    | Move to trash, archive              |
| Medium   | Single-record delete                | Click-to-confirm dialog           | Delete a comment, remove a member   |
| High     | Multi-record or team-visible delete | Confirm dialog + consequence list | Delete a project, remove a team     |
| Critical | Irreversible, organization-wide     | Type-to-confirm + 30-day grace    | Delete workspace, terminate account |

The scale should be established as a design system convention so that the same action type receives the same friction pattern throughout the product. A "delete comment" confirmation should not require typing the comment text; a "delete organization" confirmation should never be a single-click. Establish the scale in the design system token documentation and link to it from every destructive action pattern.

### Type-to-Confirm Copy Pattern

The type-to-confirm pattern has three required copy elements:

1. **Instruction line:** "To confirm, type the name of the [resource type] below:" -- names what the user must type and why.
2. **Placeholder in the input field:** The exact string the user must match, shown as placeholder text: "acme-corp-workspace"
3. **Button state:** The destructive button should be disabled until the typed string matches exactly, then enable. Do not show an error for mismatch -- just keep the button disabled. GitHub's pattern is precise: the input has the repo name as placeholder, the "Delete this repository" button enables only on exact match, and the match is case-sensitive.

A fourth optional element: "This cannot be undone" as a final reminder beneath the input field, immediately before the button.

### Review Checklist

Use this checklist before shipping or reviewing any destructive action flow:

| Check                   | Criteria                                               | Pass Condition                                                                    |
| ----------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Reversibility statement | Action is labeled recoverable or permanent             | "This cannot be undone" or "Restore within 30 days" appears at the decision point |
| Consequence specificity | Dialog names the object and downstream effects         | Includes object name and count of affected records/members                        |
| Severity classification | Action is classified on the severity scale             | Correct confirmation pattern applied (toast / click / type-to-confirm)            |
| Type-to-confirm         | Critical actions use exact resource name               | Generic "DELETE" strings are not accepted; specific resource name required        |
| Undo availability       | Soft-delete systems show inline undo                   | Toast with "Undo" appears immediately; undo is not buried in trash settings       |
| Button text             | Destructive button uses specific strong verb           | No euphemisms ("Remove," "End," "Clear") for permanent actions                    |
| Cooldown copy           | Scheduled deletions state window and cancellation path | Exact number of days and specific action to cancel are named                      |
| Warning placement       | Warnings appear before point of no return              | No post-deletion "warnings" that are actually receipts                            |

### Anti-Patterns

1. **The Euphemism.** Destructive buttons labeled with soft verbs that understate the action's severity. Before: "Remove account," "End subscription," "Clear data." After: "Delete account," "Cancel subscription," "Permanently delete all data." The test: would a user who glances at the button for one second understand that this action destroys something permanently? If the verb could describe an easily reversible action (removing a sticker, ending a call, clearing a search field), it is a euphemism. Euphemisms are especially harmful on mobile where confirmation dialogs are smaller and users are more likely to tap through quickly without reading carefully.

2. **The Generic Warning.** Confirmation dialogs that use boilerplate copy not specific to the action being confirmed. Before: "Are you sure you want to delete this? This action cannot be undone." After: "Delete 'Q4 Marketing Campaign' and its 12 linked assets? This will remove the campaign from all reports and revoke access for 3 collaborators. This cannot be undone." The generic warning is written once and reused everywhere; the specific warning is generated from live data about the specific object being destroyed. Generic warnings normalize the confirmation pattern -- users who see the same dialog for deleting a comment as for deleting a workspace stop reading it and click through on reflex.

3. **The Hidden Undo.** Soft-delete systems where the undo affordance is buried in a settings menu or requires navigating to a trash view, rather than appearing as an inline action immediately after the deletion. Before: Item is deleted, no toast, undo is available via Settings > Trash > Restore. After: Item is deleted, toast appears: "'Q4 Campaign' deleted. Undo -- or view Trash." The undo link must appear immediately in the user's current context, not require a navigation. A 5-second undo toast is infinitely more usable than a trash bin that requires three clicks. When users discover the hidden undo only after it has expired, the experience is worse than if undo never existed -- because the user now knows they were one navigation away from recovery.

4. **The Surprise Deletion.** A destructive action with no warning at the point of initiation -- the user clicks "Delete" expecting a confirmation dialog and instead the item is immediately gone. Before: "Delete" button in a row action menu that deletes the record immediately. After: "Delete" triggers a confirmation dialog. The rule: any action that cannot be undone within 5 seconds must require confirmation. Any action that affects more than the single item the user interacted with must name the scope of destruction in the confirmation. Surprise deletions are the primary cause of "I accidentally deleted my entire project" support tickets and permanent user churn from SaaS products.

### Real-World Examples

**GitHub repository deletion.** GitHub's repository deletion is the canonical example of a type-to-confirm pattern. The flow: navigate to Settings > Danger Zone > Delete this repository > dialog appears with full consequence list ("This will permanently delete the [repo-name] repository, wiki, issues, comments, packages, secrets, workflow runs, and all other associated repository data") + type-to-confirm ("To confirm, type the name of the repository: [repo-name]") + red "Delete this repository" button. The 30-day repository restore window was added in 2019 and is advertised in GitHub Docs, but not in the deletion dialog itself -- a notable gap that creates a missed opportunity to reduce deletion anxiety for users who might restore rather than delete. The type-to-confirm requires the exact repo name including organization prefix for organization repositories: "acme-corp/harness-engineering."

**Stripe subscription cancellation with data retention notice.** Stripe's subscription cancellation flow is designed to reduce regret, not to prevent cancellation. The flow is straightforward but information-dense: it shows the plan end date (end of current billing period), confirms that all data is retained after cancellation (the account does not close, only the subscription ends), and offers a plan downgrade as an alternative. The key copy: "Your [Plan Name] subscription will end on [Date]. After this date, you'll be moved to the free plan. Your data will be preserved." This phrasing specifically addresses the fear that cancellation equals data deletion, which is the primary source of cancellation anxiety in SaaS products -- Stripe's copy engineering decision is to defuse that fear explicitly rather than hoping users infer it.

**Google account deletion 30-day grace period.** Google's account deletion flow is one of the most consequential destructive flows in consumer software. The multi-step flow includes: a list of all Google services and data that will be deleted, a checkbox acknowledging each major data category, a warning about the 20-day window after which data becomes unrecoverable, and confirmation that some data (purchased content, shared documents) may be retained differently. The grace period copy is explicit: "After deleting your account, you have a 20-day window to sign back in and cancel the deletion." Google pre-downloads all user data via Takeout before the deletion flow reaches the confirmation step -- the copy guides users through this prerequisite, treating data preservation as a first-class concern rather than an afterthought.

**Notion workspace deletion flow.** Notion's workspace deletion requires navigating to Settings > [Workspace name] > Delete workspace. The confirmation dialog names the workspace and shows a count of all pages, databases, and members. The type-to-confirm requires the exact workspace name. What makes Notion's flow distinctive is the pre-deletion export prompt: before the type-to-confirm step, Notion surfaces "Export workspace content" as a recommended action with a direct link. This is copy that reduces regret -- giving the user one more opportunity to preserve their data before the irreversible action. The export prompt does not block deletion, but its placement immediately before the type-to-confirm step is deliberate, serving as a final "are you really sure?" moment without requiring an additional confirmation click.

### Copy Formulas Quick Reference

These are fill-in-the-blank templates for the most common destructive action copy patterns:

- **Irreversibility statement:** `This action is permanent and cannot be undone.`
- **Soft-delete statement:** `You can restore this within [N] days from [Trash / Settings > Deleted items].`
- **Consequence list item:** `[N] [records / members / projects] will be permanently deleted.`
- **Downstream effect:** `[Connected service] will lose access immediately.`
- **Type-to-confirm instruction:** `To confirm, type the name of the [resource type] below:`
- **Type-to-confirm placeholder:** `[exact-resource-name]`
- **Post-deletion toast:** `'[Name]' deleted. Undo`
- **Grace period copy:** `Your [resource] will be deleted in [N] days. Sign in before [Date] to cancel.`
- **Cooldown cancellation:** `To cancel deletion, [specific action] before [Date / timeframe].`
- **Destructive button -- delete:** `Delete [resource name]`
- **Destructive button -- terminate:** `Terminate account`
- **Destructive button -- purge:** `Permanently delete all data`

## Source

- NNGroup -- "Confirmation Dialog Boxes," https://www.nngroup.com/articles/confirmation-dialog/
- NNGroup -- "Preventing User Errors: Avoiding Unconscious Slips," https://www.nngroup.com/articles/slips/
- Apple Human Interface Guidelines -- Alerts, https://developer.apple.com/design/human-interface-guidelines/alerts
- Laubheimer, P. -- "Checkboxes vs. Toggles in Mobile Design," NNGroup (2015)
- GitHub -- Deletion and data recovery documentation, https://docs.github.com/en/repositories/creating-and-managing-repositories/deleting-a-repository
- Yifrah, K. -- _Microcopy: The Complete Guide_ (2017), Chapter 9: Errors, Warnings, and Destructive Actions

## Process

1. **Classify the destructive action on the severity scale** (low / medium / high / critical). The severity determines the confirmation pattern -- do not apply the same friction to all destructive actions. Write the severity classification into the component spec so that future developers do not have to re-derive it for similar actions. Review the severity classification with a product manager who can confirm the actual recoverability of the data before the copy is written.

2. **For medium and high severity actions:** Write the confirmation dialog with a specific title (naming the object), a consequence list (what exactly will be deleted, with live counts from the API), reversibility statement (permanent or soft-delete with window length), and a destructive verb button. Ensure the object name and counts are dynamically generated -- hardcoded counts become wrong the moment the data changes.

3. **For critical severity actions:** Add the type-to-confirm pattern with exact instruction copy ("To confirm, type the name of the [resource type]:"), placeholder showing the required string, and button-disabled-until-match behavior. Confirm with engineering that the match is case-sensitive and that the exact required string is displayed in the dialog. Test the disabled/enabled button transition manually before shipping.

4. **If the system supports soft-delete or a grace period:** Write the post-deletion toast with an inline undo action ("'[Name]' deleted. Undo"), and the grace period copy naming the exact window length and the specific action to cancel the deletion. Confirm with engineering what the exact window length is in days and whether the window is from deletion time or end of day -- this specificity matters when users are near the boundary.

5. **Audit all destructive button labels across the product for euphemisms.** Build a list of every destructive action button in the product and classify each verb. Replace "Remove," "End," "Clear," "Close," or "Deactivate" with the appropriate strong verb ("Delete," "Cancel," "Purge," "Terminate," "Disable") that matches the severity and permanent nature of the action. Document the verb vocabulary in the design system so that new destructive actions default to the correct verb.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- Irreversible actions explicitly state "This cannot be undone" or equivalent at the decision point -- no destructive action is presented as reversible when it is not.
- Confirmation dialogs name the specific object being destroyed and include a dynamically generated count of affected downstream data (members, records, assets).
- Type-to-confirm is used for all critical-severity actions (account deletion, workspace deletion, production data purge) and requires the exact resource name, not a generic confirmation string.
- Soft-delete and grace period copy names the exact window length in days and the specific action the user must take to cancel within the window.
- All destructive buttons use strong, specific verbs ("Delete," "Cancel," "Terminate," "Purge") -- no euphemisms like "Remove," "End," or "Clear" for permanent actions.
- Post-deletion undo toasts appear immediately in the user's current view and provide an inline undo action -- undo is not reachable only via a separate trash or settings menu.
- Warning copy appears at the decision point before the irreversible action, not on a confirmation screen after the action has already occurred.

## Mobile and Edge-Case Considerations

On mobile, confirmation dialogs for destructive actions must be designed with the additional constraint that tap targets are small and users frequently dismiss dialogs by tapping outside them. A destructive confirmation dialog on iOS or Android should use the platform's native alert pattern (system modal) rather than a custom bottom sheet that can be swiped away. The type-to-confirm pattern is high-friction on mobile keyboards -- on mobile, reserve it only for the most critical actions and consider an alternative like a 5-second countdown button ("Hold to delete") for high-severity but not critical actions.

Bulk destructive actions over large datasets require additional copy: when deleting hundreds or thousands of items, show a progress indicator with copy like "Deleting 1,847 records... Do not close this window." If the deletion is async and continues in the background, say so: "Deletion in progress. You'll receive an email when complete." Users who initiate large bulk deletions and then see no feedback will refresh the page, navigate away, and potentially trigger the operation twice.

For actions that require a grace period email confirmation (some GDPR-compliant deletion flows send an email with a confirmation link before deletion begins), the in-product copy must set the expectation: "Check your email at user@example.com for a confirmation link. Deletion begins after you confirm." Name the email address so the user knows which inbox to check, and set the expectation that the confirmation link expires: "The link expires in 24 hours."
