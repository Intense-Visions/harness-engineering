# Success Feedback

> Success feedback copy — confirmation messages, celebration calibration, and next-step prompts that close the action loop and guide users forward

## When to Use

- Writing success toasts and confirmation messages after completed actions
- Crafting celebration copy for milestone completions (onboarding complete, first payment received)
- Adding next-step prompts after task completion
- Writing confirmation emails for purchases, signups, and major account actions
- Designing undo links and safety-net success messages for reversible actions
- NOT for: loading state copy during operations (see ux-loading-states)
- NOT for: notification center entries for events not triggered by the current user (see ux-notification-copy)
- NOT for: empty state copy after a list is cleared (see ux-empty-states)

## Instructions

1. **State what succeeded specifically — never "Done!" alone.** "Project created" not "Done!" "Invoice sent to jordan@acme.com" not "Success!" "Payment of $149 received" not "Thank you!" The specific confirmation closes the action loop: the user knows their action was received, processed, and succeeded. Generic success confirmations like "Done!" require the user to remember what they were doing. Specific confirmations like "Project created" confirm both the action (created) and its object (project). Stripe: "Payment received." GitHub: "Branch deleted." Linear: "Issue archived." Each is independently comprehensible without context.

2. **Calibrate celebration to consequence.** Completing your first-ever payment on Stripe warrants a more celebratory message than saving a notification preference. Finishing onboarding warrants more enthusiasm than updating a timezone setting. The calibration rule: match the emotional weight of the copy to the significance of the accomplishment. Stripe's first-payment confirmation to new merchants: "Your first payment has arrived! You're now ready to accept payments from customers worldwide." The same page for the 1,000th payment: "Payment of $149.00 received." One is a milestone; the other is routine. Treating routine actions with milestone enthusiasm habituates users to ignore success messages.

3. **Include a next step when one is obvious.** "Project created. Invite your team →." "Account setup complete. Create your first issue." "Payment received. View your dashboard." The next step closes the loop and immediately provides forward momentum. Not every success message needs a next step — "Settings saved" does not, because the user knows what to do next. But after onboarding completion, first payment receipt, or any action that represents a significant milestone, the next step turns a confirmation into a launch pad. Linear: "Issue created. Add assignee →." GitHub: "Repository created. Add a README →."

4. **Use past tense for completed actions.** "Project created" not "Project is being created" (that is a loading state). "Changes saved" not "Changes are saved" (the extra words add nothing). "Member removed" not "The member has been removed from your workspace" (the object does not need the full path). Past tense is the natural language form for completed events. It is also more compact — "Changes saved" (2 words) vs. "Your changes have been successfully saved" (6 words). Shorter success messages are better because they are read faster and dismissed faster, allowing the user to return to their task.

5. **Do not over-celebrate routine actions.** "Settings saved" not "Awesome! Your settings are saved! Great job! 🎉." The emoji, the exclamation points, and the "Awesome!" add emotional weight to a routine action that does not deserve it. Over-celebration has two failure modes: it dilutes genuine celebration (if every action gets "Awesome!", the actual milestones are indistinguishable), and it irritates users who find the performative enthusiasm condescending. Reserve enthusiasm for genuine milestones. GitHub's routine confirmation messages are dry and minimal. Stripe's first-payment milestone message is genuinely warm. The contrast makes both more effective.

6. **Undo links in success messages turn confirmations into safety nets.** "Message sent. Undo" is a toast that acknowledges success while offering a recovery path. "Issue archived. Undo" does the same. Undo in a success message works because it appears immediately after the action, when undoing is most relevant and most appreciated. Gmail's undo-send is the canonical example: the success toast contains both the confirmation ("Message sent") and the recovery action ("Undo"), making the confirmation the most useful UI element in the product. Undo links should appear within the success toast, not as a separate interaction.

7. **For async operations, confirm receipt — not completion.** When the user submits a process that will complete in the background (export, data migration, payment processing, deployment), confirm that the process was received and started — not that it completed. "We're processing your export. You'll receive an email when it's ready." not "Export complete!" when the export has only been queued. Premature success messages are a form of deception — the user believes the action succeeded when it has only been scheduled. If the async operation fails after the user has received a "success" confirmation, the failure is more confusing because the user thought it was done.

8. **First-time milestone messages should name what the user unlocked, not just what they completed.** "Your first project is created! You can now invite teammates, track issues, and publish reports." names the specific new capabilities the milestone unlocks. "Project created" for a first project misses the opportunity to explain what comes next. GitHub's repository creation confirmation for first-time users shows the README, issues, and code tabs — implicitly showing what the user can now do. Stripe's first-payment confirmation explains what the merchant can now do: accept payments, view transaction history, set up payouts. The milestone confirmation is also an onboarding moment.

## Details

### Success Message Patterns by Action Type

Match the success message pattern to the type of action:

| Action Type            | Pattern                                  | Example                                           |
| ---------------------- | ---------------------------------------- | ------------------------------------------------- |
| Routine save           | Object + past tense verb                 | "Changes saved"                                   |
| Destructive (undoable) | Object + verb + undo link                | "Issue archived. Undo"                            |
| Creation               | Specific object + created + next step    | "Project created. Invite your team →"             |
| Async submission       | Receipt confirmation + notification path | "Export started. We'll email you when it's done." |
| Milestone              | Celebration + unlocked capabilities      | "You're live! Customers can now pay you."         |
| Social action          | Recipient name + action                  | "Invitation sent to jordan@acme.com"              |
| Billing                | Specific amount + confirmation           | "Payment of $149 received"                        |
| Permission change      | Who + new state                          | "Jordan is now an admin"                          |

### Celebration Calibration Scale

Match enthusiasm level to action significance:

| Significance Level | Frequency      | Copy Register           | Example                                                                |
| ------------------ | -------------- | ----------------------- | ---------------------------------------------------------------------- |
| Routine            | Multiple/day   | Dry, minimal            | "Settings saved"                                                       |
| Moderate           | Weekly         | Direct, positive        | "Profile updated"                                                      |
| Notable            | Monthly        | Warm, forward-looking   | "Report published. View →"                                             |
| Milestone          | Once or rarely | Celebratory, expansive  | "You're live! First payment received."                                 |
| Major achievement  | Lifetime       | Full celebration moment | "Welcome aboard! Your account is fully set up and you're ready to go." |

Treat every action as if it is the nth occurrence, not the first. Design the routine confirmation first, then add celebration only for genuine milestones.

### Undo in Success Messages

The undo pattern is a specific success message design that:

1. Appears in a toast or snackbar immediately after the action
2. Confirms the action succeeded
3. Offers an undo link that reverses the action within a time window (usually 5-10 seconds)
4. The time window is shown ("Undo (5s)") or indicated by the toast's auto-dismiss behavior

Actions that support undo in success messages:

- Message and email sending (Gmail's undo send)
- Archiving and soft-deleting items
- Bulk operations (archive all, mark all as read)
- Moving items between states or locations

Actions that cannot support undo:

- Hard deletes (no undo possible — use a confirmation dialog instead)
- Payments (cannot be reversed in the same way)
- Published content (may be cached or seen by others immediately)

### Success Message Character Limits

| Component              | Target Length | Maximum Length |
| ---------------------- | ------------- | -------------- |
| Toast (routine)        | 2-5 words     | 80 characters  |
| Toast (with undo)      | 3-8 words     | 100 characters |
| Toast (with next step) | 5-10 words    | 120 characters |
| Modal success          | 1-3 sentences | 200 characters |
| Milestone message      | 2-4 sentences | 300 characters |

### Anti-Patterns

1. **The Generic Done.** "Done!" or "Success!" or "Complete!" with no specification of what was done, succeeded, or completed. These generic confirmations require the user to remember what they were doing — which is especially problematic for users who were distracted or operating under cognitive load. The fix is always the same: name the specific action and its object. "Issue #247 closed" is never worse than "Done!" and is usually significantly better. Generic success messages are often a sign that the success feedback was added as an afterthought.

2. **The Celebration Overload.** "Amazing! You just saved your settings! Woohoo! 🎉🎊✨ You're doing great!" for a settings save. The emotional register is wildly disproportionate to the action. Celebration overload is particularly common in consumer apps targeting younger users, but it backfires — users feel condescended to, and genuine celebration moments (first payment, onboarding complete) become meaningless because every action already received maximum enthusiasm. The fix: dry for routine, warm for notable, celebratory only for milestones.

3. **The Premature Success.** Showing "Export complete!" when the export has been queued but not yet processed. Showing "Payment successful" when the payment has been submitted but not confirmed. The async gap between submission and completion is a UX vulnerability — products that confirm receipt as completion set up users for confusion when the actual completion (or failure) occurs later. The fix: "Export started. We'll email you when it's ready." — confirms the receipt without claiming the completion.

4. **The Missing Next Step.** A milestone confirmation that ends with a blank screen or auto-redirects to an empty dashboard with no guidance. The user completed onboarding or made their first sale and now faces an empty interface with no pointer to what to do next. The completion moment is the highest-engagement moment in a user's product experience — it is the wrong moment to provide no direction. Every milestone confirmation should name the most important next action and provide a direct path to it.

### Real-World Examples

**Stripe's Payment Confirmation for New Merchants.** Stripe's first-payment confirmation to merchants who are new to the platform: "Your first payment has arrived. You're now set up to accept payments from customers worldwide." The confirmation includes the amount, the customer name, and the timestamp. Below it: "Set up payouts →" as the next step. Stripe's design team has A/B tested this confirmation extensively — the version that names the unlocked capability ("accept payments from customers worldwide") has higher merchant activation than the version that just states the amount. The milestone framing motivates the next action.

**GitHub's PR Merged State.** When a pull request is merged, GitHub shows a purple "Merged" badge and the text "Pull request successfully merged and closed." Below it: "You're all set — the branch has been merged, or you can delete the branch." The confirmation names what happened ("merged and closed"), explains the state ("all set"), and offers an optional cleanup action ("delete the branch"). GitHub's tone in this state is calm and complete — the work is done, the options are clear. There is no celebration for a routine merge, but the copy is satisfying because it is complete and specific.

**Notion's Page Published State.** When a Notion page is published to the web, the confirmation shows: "Your page is now public." with a copy-link button and a share options button. The confirmation names the new state ("public"), provides the immediate next action (copy the link to share), and leaves further options one click away. Notion does not celebrate page publishing — it is a routine action for Notion users — but it provides the most useful next step (the link) at the moment it is needed. The confirmation doubles as the share workflow trigger.

**Linear's Issue Closed Confirmation.** Linear shows "Issue closed" in a brief toast when an issue is marked done. The toast includes an "Undo" link for the first 5 seconds. The undo link is particularly valuable in Linear because issues are frequently closed accidentally when triaging. The success toast with undo replaces a "Are you sure you want to close this issue?" confirmation dialog — the undo approach is friendlier (no interruption) and equally safe (recovery is available immediately). Linear's success messages are uniformly minimal: the action name, the object, and an undo link where applicable.

## Source

- NNGroup — "Toast Notifications: 8 Design Guidelines" (2020), https://www.nngroup.com/articles/toast-notification/
- Apple Human Interface Guidelines — Alerts and confirmations, https://developer.apple.com/design/human-interface-guidelines/alerts
- Google Material Design — Snackbars, https://m3.material.io/components/snackbar/guidelines
- Yifrah, K. — _Microcopy: The Complete Guide_ (2017), success state and confirmation copy
- Podmajersky, T. — _Strategic Writing for UX_ (2019), feedback copy and celebration calibration

## Process

1. Identify the action type and significance level — select the appropriate success message pattern from the table.
2. Write the confirmation in past tense, naming the specific action and its object.
3. Calibrate the emotional register to the significance level — routine = dry, milestone = celebratory.
4. Add a next-step prompt for milestone completions and first-time actions.
5. For reversible destructive actions, add an undo link within the success toast.
6. For async operations, confirm receipt rather than completion and specify the completion notification path.

### Success Feedback Copy Review Checklist

Before shipping success feedback copy, verify each item:

| Check                                            | Pass Criteria                                              |
| ------------------------------------------------ | ---------------------------------------------------------- |
| Specific action and object named                 | "Issue archived" not "Done!" or "Success!"                 |
| Past tense used                                  | "Changes saved" not "Changes are saving"                   |
| Celebration calibrated to significance           | Routine = dry, milestone = warm, major = celebratory       |
| Next step present for milestones                 | "Project created. Invite your team →."                     |
| Undo link for reversible destructive actions     | Toast includes "Undo" for archive, delete (soft), bulk ops |
| Async operations confirm receipt, not completion | "Started" or "Queued" — not "Complete" before it is        |
| First-time milestone names unlocked capabilities | States what the user can now do, not just what they did    |
| No over-celebration for routine actions          | Settings saves and list items do not get "Amazing!" copy   |

Success feedback is the moment users feel competent and effective — or they do not. A generic "Done!" robs that moment of its specificity. A premature success message destroys it when the actual completion or failure arrives later. The investment in specific, calibrated success copy pays back in user confidence and engagement.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Success messages name the specific action and its object — no generic "Done!" or "Success!"
- Emotional register matches significance level — routine confirmations are minimal, milestones are celebratory.
- Milestone confirmations include a next-step prompt pointing to the most important immediate action.
- Reversible destructive actions include an undo link in the success toast.
- Async operations confirm receipt ("started," "queued"), not completion, with a notification path.
- Past tense is used for all completed actions — no present progressive or future tense.
