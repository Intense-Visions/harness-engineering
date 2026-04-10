# Active Voice in UI Writing

> Active voice in UI writing — active vs passive voice, when passive is acceptable, verb-first patterns for buttons and actions

## When to Use

- Writing button labels, menu items, and action links
- Composing error messages that name the actor and the problem
- Writing instructions, step-by-step guides, and onboarding flows
- Drafting confirmation dialog text and destructive action warnings
- Writing notification text, toast messages, and status updates
- Labeling form fields, toggles, and navigation elements with actionable text
- Creating help text and tooltips that explain what the user can do
- Reviewing existing UI text to convert passive constructions to active ones
- Auditing automated notification templates for active voice compliance
- Converting legacy enterprise UI text from passive to active constructions
- NOT for: legal disclaimers, privacy policies, and terms of service where passive voice is sometimes legally required
- NOT for: system status messages where the actor is genuinely irrelevant ("Updated 5 minutes ago")

## Instructions

1. **Default to active voice -- the user or the system should be the subject.** Active voice puts the actor first: "We saved your changes." Passive voice hides the actor: "Your changes have been saved." Active voice is clearer, shorter, and more direct. It tells the user who did what. In UI text, the actor is either the user ("You created 3 projects"), the system ("We couldn't connect to the server"), or a third party ("Jordan commented on your pull request"). Name the actor. Stripe consistently names the actor: "We sent a receipt to your email" not "A receipt has been sent."

2. **Use imperative mood for all actionable elements.** Buttons, links, and menu items should start with a verb in imperative mood: "Save draft," "Delete project," "Export data," "Upload file," "Create issue." The imperative mood eliminates the subject entirely -- the implicit "you" makes every instruction direct and concise. GitHub uses imperative mood across its entire interface: "Create repository," "Open pull request," "Merge pull request," "Close issue," "Fork repository." This pattern is so consistent that a new GitHub user can predict the label on any button by combining the action verb with the object noun.

3. **Name the actor in error messages.** When something goes wrong, the user needs to know who or what is responsible. "We couldn't connect to the server" names the system as the actor. "Your card was declined by your bank" names the bank. "Connection could not be established" names nobody -- the user is left wondering who failed and what they should do about it. Apple's iOS error messages consistently name the actor: "This app cannot connect to the App Store" (the app is the actor), "Cellular data is turned off for this app" (the system is the actor). Naming the actor enables the user to determine their next action.

4. **Know when passive voice is correct.** Passive voice is not always wrong. It is the right choice when the actor is irrelevant or when the object is more important than the actor. "Your account was created on March 15" -- who created it does not matter; the creation date is the point. "This page was last updated 2 hours ago" -- the updater is irrelevant; the freshness is the point. "Your payment is being processed" -- the processing system is not interesting; the status of the payment is. The test: if naming the actor would add words without adding meaning, passive is correct.

5. **Use the verb-noun pattern for buttons.** Every button label should follow the structure: action verb + specific object. "Add member," "Create project," "Upload file," "Export CSV," "Remove filter," "Copy link." The verb tells the user what will happen. The noun tells the user what will be affected. Together they eliminate ambiguity. Compare "Add member" (clear: you are adding a person to the team) with "Add" (ambiguous: add what?) or "Member" (ambiguous: what about the member?). Linear follows this pattern rigorously: "Create issue," "Add label," "Set priority," "Assign to," "Move to."

6. **Avoid hidden verbs -- nominalizations that bury the action.** A hidden verb is an action disguised as a noun: "perform configuration" instead of "configure," "begin the export process" instead of "export," "carry out an installation" instead of "install." Hidden verbs add words, reduce clarity, and make UI text feel bureaucratic. The fix is mechanical: find the noun that contains a verb, extract the verb, and rebuild the sentence. "We will perform a synchronization of your data" becomes "We'll sync your data." "Please carry out a verification of your email" becomes "Verify your email."

7. **Test with the "by zombies" rule.** If you can insert "by zombies" after the verb and the sentence still makes grammatical sense, it is passive voice. "Your changes have been saved [by zombies]" -- passive. "We saved your changes [by zombies]" -- does not work, so it is active. "The file was uploaded [by zombies]" -- passive. "You uploaded the file [by zombies]" -- does not work, so it is active. This test is fast, memorable, and catches passive constructions that the writer has become blind to through familiarity.

## Details

### Active vs Passive Comparison Table

Side-by-side examples showing how active voice improves common UI text patterns:

| Passive (avoid)                      | Active (prefer)                 | Why active is better              |
| ------------------------------------ | ------------------------------- | --------------------------------- |
| Your changes have been saved         | We saved your changes           | Names the actor (the system)      |
| The file was uploaded successfully   | You uploaded the file           | Credits the user                  |
| An error was encountered             | We hit an error                 | Names the system as responsible   |
| The invitation has been sent         | We sent the invitation          | Confirms who sent it              |
| Your password was reset              | You reset your password         | Confirms the user's action        |
| The project will be deleted          | This will delete the project    | Makes the consequence explicit    |
| Access has been denied               | You don't have access           | Addresses the user directly       |
| The connection was lost              | We lost the connection          | Takes responsibility              |
| Your subscription has been cancelled | You cancelled your subscription | Confirms the user's choice        |
| The payment was declined             | Your bank declined the payment  | Names the actual actor (the bank) |

### Verb-First Patterns by Component Type

Different UI components follow slightly different verb patterns:

**Buttons and primary actions.** Imperative verb + specific object. "Save draft," "Create project," "Send message." Never just a noun ("Draft") and never a generic verb ("Submit," "OK," "Confirm"). The button label should be a complete instruction that makes sense without reading anything else on the screen.

**Menu items.** Imperative verb + object, optionally with modifier. "Export as CSV," "Sort by date," "Filter by status," "Group by assignee." Menu items can be slightly longer than buttons because menus are lists designed for scanning.

**Toggle labels.** Describe what the toggle enables, not the toggle state. "Show line numbers," "Enable dark mode," "Allow notifications." The toggle's on/off position communicates the current state visually -- the label describes what the setting does.

**Link text.** Verb phrase that describes the destination or action. "View all comments," "Learn more about pricing," "See documentation." Never "Click here" -- the link text must be descriptive enough to make sense out of context (screen readers announce link text in isolation).

**Notification actions.** Imperative verb that names the response. "Reply," "Dismiss," "View thread," "Mark as read." Notification actions should be single-word or two-word verbs because they appear in constrained spaces (push notifications, toast messages).

### The Voice Conversion Process

When converting existing UI text from passive to active voice, follow this mechanical process:

1. **Identify the hidden actor.** In "The file was deleted," the hidden actor is either the user or the system. Determine who performed the action.
2. **Move the actor to the subject position.** "The file was deleted" becomes "You deleted the file" or "We deleted the file."
3. **Simplify the verb.** Passive constructions use "was/were/has been" + past participle. Active uses simple past or present. "Has been uploaded" becomes "uploaded." "Was being processed" becomes "is processing."
4. **Verify the meaning is preserved.** "Your account was suspended due to unusual activity" becomes "We suspended your account due to unusual activity." The meaning is identical, but the active version is clearer about who took the action.
5. **Check the result against the "by zombies" test.** If you can no longer add "by zombies" after the verb, the conversion is complete.

Common conversion patterns:

| Passive pattern               | Active pattern              |
| ----------------------------- | --------------------------- |
| [thing] was [verbed]          | You/We [verbed] [thing]     |
| [thing] has been [verbed]     | You/We [verbed] [thing]     |
| [thing] is being [verbed]     | We are [verbing] [thing]    |
| [thing] will be [verbed]      | We will [verb] [thing]      |
| [thing] could not be [verbed] | We could not [verb] [thing] |

### When Passive Voice Is Preferred

There are four specific UI contexts where passive voice is the better choice:

1. **Timestamps and metadata.** "Created on March 15," "Last updated 2 hours ago," "Modified by Jordan." The date or recency is the information, not the actor.

2. **Status indicators.** "Payment is being processed," "Deployment in progress," "File is being uploaded." The user cares about the status, not about which microservice is handling it.

3. **Attribution where the user is not the actor.** "Assigned to Jordan," "Reviewed by the security team," "Approved by admin." Passive voice naturally emphasizes the person responsible.

4. **Policy statements.** "Passwords are encrypted at rest," "Data is stored in the EU." The policy applies universally -- there is no meaningful actor to name.

### Anti-Patterns

1. **The Passive Blame Dodge.** Using passive voice in error messages to avoid assigning responsibility. "An error was encountered" instead of "We hit a problem." "The operation could not be completed" instead of "We couldn't complete the operation." Passive voice in errors creates ambiguity: the user cannot tell if they caused the problem, the system caused it, or an external service caused it. This ambiguity generates support tickets. The fix: name the actor. If the system failed, say "we." If the user's input was invalid, say "you." If an external service failed, name it: "Your bank declined the payment."

2. **The Nominalization Cascade.** Chains of hidden verbs that turn simple actions into bureaucratic processes. "The system will perform an initialization of the configuration parameters for the deployment environment" instead of "We'll set up your deployment." Each nominalization adds a layer of abstraction between the user and the action. The cascade effect compounds: one hidden verb is tolerable, two is confusing, three is unreadable. The fix: extract every verb from its noun wrapper. "Initialization" becomes "initialize." "Configuration" becomes "configure." "Deployment" becomes "deploy." Then rebuild: "We'll configure your deployment."

3. **The Actionless Button.** A button labeled with a noun or adjective instead of a verb. "Settings" as a button (where does it go?), "Next" (what happens next?), "Ready" (ready for what?). Navigation buttons that use nouns are sometimes acceptable ("Settings," "Profile," "Dashboard") because they describe the destination. But action buttons must use verbs: "Save settings" not "Settings," "Continue to payment" not "Next," "Start deployment" not "Ready." The actionless button forces the user to infer the action from context, which increases cognitive load and error rates.

4. **The Verb-Object Mismatch.** Using verbs that do not accurately describe the action. "Submit" for a save action (nothing is being submitted). "Process" for a search action (the user wants results, not processing). "Execute" for a send action (the user is sending a message, not executing a command). The mismatch creates a gap between what the user expects and what happens. The fix: use the most specific, accurate verb available. "Save" for saving, "Search" for searching, "Send" for sending, "Delete" for deleting.

### Real-World Examples

**GitHub's Imperative Commit Message Convention.** GitHub popularized the imperative mood for commit messages: "Add feature," "Fix bug," "Remove deprecated method" -- not "Added feature" or "Fixes bug." This convention extends throughout GitHub's UI. Pull request actions are imperative: "Merge pull request," "Squash and merge," "Rebase and merge." Issue actions: "Close issue," "Reopen issue," "Pin issue." The consistency creates a predictable grammar that users internalize: every action in GitHub starts with a verb in imperative mood. This is not accidental -- GitHub's content design guidelines mandate imperative mood for all action labels.

**Apple's Button Label Patterns.** Apple's Human Interface Guidelines prescribe verb-first button labels across iOS and macOS. The destructive action button in a deletion dialog says "Delete" (not "OK" or "Yes"). The save button says "Save" (not "Done" or "Continue"). The cancel button says "Cancel" (not "Go Back" or "Never Mind"). Alert actions follow the same pattern: "Allow" or "Don't Allow" for permission dialogs. "Try Again" or "Cancel" for error recovery. Apple's guidelines explicitly state: "Use a verb that describes the action the button performs." This principle makes Apple's interfaces predictable -- every button tells you exactly what it will do.

**Stripe's Active-Voice Error Messages.** Stripe's error messages consistently use active voice to name the actor and the problem. "Your card was declined" names the card as the subject. "Your card number is incomplete" names the specific field. "Your card's expiration year is in the past" names the specific problem with the specific field. Compare with passive alternatives: "An error occurred with the payment" (what error?), "The transaction could not be completed" (why?), "Invalid card details" (which details?). Stripe's active voice errors enable the user to fix the problem without help. Each error names the thing that is wrong and implies the fix: incomplete number means add digits, past expiration means update the date.

**Slack's Mixed Voice Strategy.** Slack uses active voice for user actions and notifications ("Jordan sent you a message," "You joined #engineering," "You have 3 unread messages") and passive voice strategically for status indicators ("Last active 2 hours ago," "Typing...," "Message delivered"). This mixed strategy is correct: the notifications name actors because the actor matters (who sent the message?), while the status indicators use passive because the actor is the system and the status is what matters. Slack's approach demonstrates that the goal is not to eliminate passive voice entirely, but to use active voice wherever the actor carries information.

## Source

- Apple Human Interface Guidelines -- Writing section, imperative mood and active voice guidance
- Google Material Design -- Writing principles, active voice best practices
- Strunk, W. and White, E.B. -- _The Elements of Style_ (2000), "Use the active voice" (Rule 14)
- NNGroup -- "Passive vs. Active Voice in UX Writing" (2020), evidence for active voice in error recovery
- Podmajersky, T. -- _Strategic Writing for UX_ (2019), verb-first patterns for components

## Process

1. Read the instructions and examples in this document.
2. Audit existing UI text for passive constructions using the "by zombies" test.
3. Convert passive constructions to active voice, naming the actor explicitly.
4. Apply verb-noun patterns to all button labels, menu items, and action links.
5. Verify your implementation against the anti-patterns listed above.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- All button labels use verb-noun imperative patterns -- no generic "OK," "Submit," or "Confirm."
- Error messages name the actor (user, system, or third party) explicitly.
- Passive voice appears only in the four accepted contexts: timestamps, status, attribution, and policy.
- No hidden verbs (nominalizations) exist in user-facing text.
- The "by zombies" test passes -- no accidental passive voice in action-oriented text.
- Link text describes the destination or action without using "click here" or "learn more" as standalone text.
- Notification text names the actor who triggered the notification.
