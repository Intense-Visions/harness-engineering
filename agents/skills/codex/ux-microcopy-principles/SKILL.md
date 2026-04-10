# Microcopy Principles

> Microcopy principles — clarity, brevity, human voice, active voice, and the core rules all UI text follows

## When to Use

- Writing button labels, menu items, and navigation links
- Composing error messages, validation text, and inline warnings
- Creating tooltips, placeholder text, and helper descriptions
- Writing empty state text, onboarding prompts, and first-run experiences
- Drafting notification text, toast messages, and confirmation dialogs
- Labeling form fields, toggles, and settings descriptions
- Writing confirmation dialog titles, body text, and action button labels
- Reviewing existing UI text for clarity, consistency, and brevity
- NOT for: marketing copy, landing page headlines, or brand campaign text
- NOT for: long-form documentation, blog posts, or technical writing

## Instructions

1. **Lead with the user's goal, not the system's action.** Microcopy should reflect what the user is trying to accomplish, not what the software is doing behind the scenes. Stripe's checkout button says "Pay $49.99" -- the user's goal -- not "Submit payment request" -- the system's action. GitHub says "Create repository" not "Initialize new remote Git repository." Apple says "Set Up Face ID" not "Enroll biometric authentication." The test: read the label out loud and ask whether the user or the system is the subject.

2. **Use first and second person for human voice.** UI text should feel like a conversation between the product and the person using it. Use "you" and "your" to address the user directly. Use "we" when the product takes responsibility. Slack says "You have 3 unread messages" not "There are 3 unread messages in the channel." Notion says "Your workspace is ready" not "Workspace initialization complete." The shift from third person to second person transforms robotic status reports into human communication. Reserve third person for referring to other users: "Jordan commented on your pull request."

3. **Keep UI text under two lines -- if longer, restructure or use progressive disclosure.** Screen real estate is finite and attention is scarcer. If a tooltip requires a paragraph, the feature is either poorly designed or the text needs a "Learn more" link to documentation. Slack's message action tooltips are one sentence maximum. GitHub's hover cards show the essential information with a link to the full profile. If you cannot say it in two lines, consider whether a modal, popover, or help page would serve the user better.

4. **Front-load the keyword in every label.** Users scan the first two words of any text element. The distinguishing word must come first. GitHub uses "Pull requests" not "List of pull requests." Apple's Settings uses "Notifications" not "Manage your notifications." In a sidebar with ten items, the first word of each item is the only word most users will read. Compare a settings menu: "Notification preferences / Account settings / Privacy controls" is scannable. "Manage your notification preferences / Change your account settings / Update your privacy controls" buries the keywords.

5. **Use specific verbs over generic ones.** Generic verbs -- "OK," "Submit," "Confirm," "Done" -- force the user to recall what the button does. Specific verbs name the action: "Save draft," "Delete project," "Send invitation," "Export CSV." Stripe uses "Add payment method" not "Continue." Linear uses "Create issue" not "OK." The most dangerous generic verb is "OK" in a destructive dialog -- the user may click without reading. GitHub's dialog says "Delete this repository" on the destructive button, making the consequence unmistakable.

6. **Match the user's vocabulary -- test with the five-second rule.** Show a piece of UI text to someone unfamiliar with the product for five seconds. If they cannot explain what it does, the vocabulary is wrong. Notion calls pages "pages" because that is what users call them -- not "document instances" or "content nodes." Figma calls design files "files" not "design artifacts." The corollary: use the term people would type into a search box to find this feature. If users search for "dark mode," do not label the setting "Appearance theme."

7. **Write for the moment -- microcopy must make sense without reading the rest of the page.** Every piece of microcopy exists in a context, but the user may not have read that context. A tooltip that says "Enable this" is useless without reading the label above it. Apple's Face ID setup says "Face ID is now set up" -- this is clear even if the user skipped every previous screen. A toast that says "Done!" communicates nothing. A toast that says "Project saved" communicates everything. Each text element should be independently comprehensible.

8. **Eliminate filler words -- every word must earn its place.** Count the words in your UI text. Now remove every word that does not change the meaning. "You have successfully saved your changes to the document" becomes "Changes saved." "Please enter your email address in the field below" becomes "Email." "Click the button below to continue to the next step" becomes "Continue." Stripe's payment confirmation is "Payment successful" -- two words that convey the full message. The rule: if removing a word does not change the meaning, remove it.

## Details

### Character Limits by Component Type

Different UI components have different spatial constraints. These limits are guidelines, not absolutes, but exceeding them is a strong signal that the text needs editing:

| Component          | Target Length | Maximum Length | Example                             |
| ------------------ | ------------- | -------------- | ----------------------------------- |
| Button label       | 1-3 words     | 4 words        | "Save draft"                        |
| Tab label          | 1-2 words     | 3 words        | "Activity"                          |
| Menu item          | 2-4 words     | 5 words        | "Export as PDF"                     |
| Tooltip            | 1 sentence    | 80 characters  | "Copy link to clipboard"            |
| Toast / snackbar   | 1-2 sentences | 120 characters | "Changes saved. Undo"               |
| Placeholder text   | 2-5 words     | 40 characters  | "Search issues..."                  |
| Form field label   | 1-3 words     | 4 words        | "Email address"                     |
| Helper text        | 1 sentence    | 100 characters | "Must be at least 8 characters"     |
| Error message      | 1-2 sentences | 150 characters | "Password too short. Use 8+ chars." |
| Empty state        | 2-3 sentences | 200 characters | "No projects yet. Create one to..." |
| Confirmation title | 3-6 words     | 8 words        | "Delete this project?"              |
| Confirmation body  | 1-2 sentences | 150 characters | "This will permanently remove..."   |

### The Five-Second Test

The five-second test is the simplest usability test for microcopy. The process:

1. Show a single screen or component to a participant for exactly five seconds.
2. Hide the screen.
3. Ask: "What could you do on that screen?" or "What was that message about?"
4. If the participant cannot answer accurately, the microcopy has failed.

This test catches jargon, buried keywords, ambiguous labels, and text that requires context to understand. Run it on every new feature's key screens before launch. Stripe runs five-second tests on payment forms to verify that users understand what will happen when they click the primary button. The test costs almost nothing and catches the most severe microcopy failures.

### Microcopy Audit Checklist

When reviewing existing UI text, check each item against these criteria:

- Does the label front-load the keyword?
- Could a new user understand this text without training?
- Is the verb specific enough to distinguish this action from other actions on the page?
- Does the text use "you/your" or "we/our" instead of third person?
- Is every word necessary -- can any word be removed without changing meaning?
- Does the text length fit the component's spatial constraint?
- Is the text consistent with how the same concept is labeled elsewhere in the product?

### Confirmation Dialog Patterns

Confirmation dialogs are where microcopy matters most because the consequences are highest. The anatomy of a well-written confirmation dialog:

**Title:** State the action as a question. "Delete this project?" not "Are you sure?" The title must name the specific action and the specific object so the user does not need to read the body text.

**Body:** State the consequence in one sentence. "This will permanently delete 'Acme Dashboard' and all its contents. This action cannot be undone." Name the object being affected. State whether the action is reversible. Do not pad with pleasantries or unnecessary warnings.

**Primary action button:** Use the destructive verb, not "OK" or "Yes." "Delete project" makes the consequence explicit. Color the button red for destructive actions. GitHub uses this pattern consistently: the delete confirmation button says "Delete this repository" in red, and requires typing the repository name as additional friction.

**Secondary action button:** "Cancel" or "Keep project" -- the safe option. Never label both buttons with ambiguous text like "Yes" and "No" -- force the user to read the question to understand which is which.

### Microcopy for State Changes

When the UI reflects a state change, the microcopy must communicate what happened and what the current state is:

- **Completed actions:** Use past tense. "Message sent," "File uploaded," "Changes saved." Not "Sending message..." after the action is done.
- **In-progress actions:** Use present participle with ellipsis. "Uploading file..." "Saving changes..." The ellipsis signals ongoing activity.
- **Failed actions:** State what failed and why. "Upload failed -- file exceeds 10 MB limit." Not "Error."
- **Toggled states:** Label the action, not the current state. A button that enables dark mode should say "Turn on dark mode" when dark mode is off, not "Dark mode: off." After toggling, it should say "Turn off dark mode." Slack's notification muting follows this pattern: "Mute channel" and "Unmute channel."

### Anti-Patterns

1. **The Robot Voice.** UI text written in third-person passive that sounds like it was generated by a system, not written by a human. "The operation has been completed successfully. The user's preferences have been updated accordingly." No user talks like this. No human would say this to another human. The fix: rewrite in second person active voice. "Your preferences are updated." Better: "Preferences saved." The robot voice appears most often in legacy enterprise software and in products where engineers write the UI text without a content review process.

2. **The Wall of Text.** A tooltip, dialog, or notification that contains an entire paragraph of explanation when one sentence would suffice. The user needed to know "Your trial ends in 3 days," but the dialog says: "Thank you for trying our product. Your free trial period, which began on January 15, 2024, is scheduled to expire in 3 days on January 28, 2024. To continue using all premium features without interruption, please upgrade your subscription by visiting the billing page in your account settings." The fix: lead with the essential information, link to details. "Trial ends in 3 days. Upgrade to keep premium features."

3. **The Vague Verb.** Buttons and actions that use generic verbs -- "Submit," "Process," "Confirm," "OK," "Done," "Go" -- that do not tell the user what will happen. A dialog with "OK" and "Cancel" forces the user to re-read the dialog to understand which button does what. The fix: name the specific action on every button. "Delete project" and "Keep project" instead of "OK" and "Cancel." "Send invitation" instead of "Submit." The most common offender: "Submit" on forms -- it should be "Create account," "Place order," "Send message," or whatever the form actually does.

4. **The Redundant Label.** Labels that repeat information already visible in context. A "Name" field inside a section titled "Your Name" with placeholder text "Enter your name" and helper text "Type your full name here." Each repetition adds visual noise without adding information. The fix: each text element should add new information. The section title provides context, the field label names the specific field, the placeholder shows format ("Jane Smith"), and helper text adds constraints ("As it appears on your ID").

### Real-World Examples

**Stripe's Checkout Flow.** Stripe's payment form is a masterclass in microcopy economy. The card number field label is simply "Card number" -- not "Enter your credit or debit card number." The expiration field says "MM / YY" as placeholder text -- the format is the instruction. The CTA button says "Pay $49.99" -- specific verb, specific amount, no ambiguity. Error messages are equally precise: "Your card number is incomplete" (not "Invalid input"), "Your card was declined. Try a different payment method." (not "Payment failed"). Every piece of text serves exactly one purpose and uses the minimum words to do so. Stripe's checkout has been tested with millions of transactions, and the microcopy is a major reason for its industry-leading conversion rates.

**GitHub's Pull Request Interface.** GitHub's PR interface demonstrates consistent verb-noun patterns across dozens of actions: "Create pull request," "Request review," "Merge pull request," "Close pull request," "Link issue," "Add assignees." Every action button follows the same structure -- imperative verb plus specific object. The review states are equally precise: "Approved," "Changes requested," "Commented." Status labels front-load the state: "Open," "Closed," "Merged" -- single words that communicate instantly. The file change summary "Showing 3 changed files with 47 additions and 12 deletions" packs five data points into one scannable sentence.

**Slack's Notification Patterns.** Slack calibrates microcopy density to urgency. A direct message notification: "Jordan: Can you review the PR?" -- sender and message, nothing else. A channel mention: "#engineering -- Jordan mentioned you." An app notification: "Reminder: Team standup in 15 minutes." Each notification type has a distinct pattern optimized for scanning. Slack's threading microcopy is particularly effective: "3 replies" as a link below a message tells the user exactly what they will find if they click. The "also sent to #channel" indicator uses minimal text to convey a complex routing concept.

**Notion's Progressive Disclosure.** Notion demonstrates how microcopy adapts to expertise. A blank page shows "Press '/' for commands" -- teaching the core interaction in five words. The slash command menu labels are pure front-loaded keywords: "To-do list," "Heading 1," "Toggle list," "Quote." Each label is the feature name, not a description of the feature. Hover tooltips add keyboard shortcuts for power users without cluttering the primary label. The empty database shows "Click '+' to add a row" -- always one specific next action, never a paragraph of explanation. As users gain expertise, the microcopy recedes: empty pages stop showing the hint after repeated use.

## Source

- Yifrah, K. -- _Microcopy: The Complete Guide_ (2017), comprehensive microcopy patterns and component-specific guidance
- NNGroup -- "Microcopy: Tiny Words That Make a Huge Difference" (2017), evidence for microcopy impact on task completion
- Google Material Design -- Writing guidelines, https://m3.material.io/foundations/content/overview
- Apple Human Interface Guidelines -- Writing section, https://developer.apple.com/design/human-interface-guidelines/writing
- Podmajersky, T. -- _Strategic Writing for UX_ (2019), component-based writing frameworks
- Krug, S. -- _Don't Make Me Think_ (2014), the five-second test and first-impression usability
- NNGroup -- "How Users Read on the Web" (1997, updated 2020), eye-tracking evidence for scanning behavior

## Process

1. Read the instructions and examples in this document.
2. Audit all button labels, error messages, and tooltips against the character limits table.
3. Run the five-second test on key screens to verify labels are immediately comprehensible.
4. Check every button for specific verb-noun patterns — replace any generic "OK," "Submit," or "Confirm."
5. Verify your implementation against the anti-patterns listed above.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- Every button label uses a specific verb-noun pattern, not a generic verb.
- UI text uses second person ("you/your") consistently, not third person or passive voice.
- No tooltip, toast, or helper text exceeds the character limits defined in this document.
- The five-second test passes for all key screens -- users can identify the available action within five seconds.
- Filler words are eliminated -- no text element contains words that can be removed without changing meaning.
- Confirmation dialogs use specific verb-noun button labels, not "OK" and "Cancel."
- State change messages use the correct tense: past for completed, present participle for in-progress, and specific cause for failures.
