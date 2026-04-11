# Settings and Preferences Copy

> Settings and preferences copy — toggle descriptions, preference explanations, consequence previews, settings organization

## When to Use

- Writing toggle labels and their supporting descriptions in settings panels
- Designing notification preference panels with per-channel or per-event controls
- Building account and security settings pages with irreversible options
- Creating preference descriptions that explain the effect of enabling or disabling a control
- Organizing settings pages into scannable, goal-oriented groups
- Writing consequence preview copy for settings with significant side effects
- NOT for: onboarding flows where users set initial preferences (use ux-onboarding-copy)
- NOT for: permission and role settings that control what users can access (use ux-permission-access-copy)
- NOT for: in-flow configuration steps embedded inside feature workflows

## Instructions

1. **Describe the effect of the setting, not the setting itself.** The label names the control; the description should explain what enabling or disabling it changes in the user's experience. "Email notifications" as a label is fine -- but the description should say "Get an email when someone comments on your work or assigns you a task" not "Manage your email notification preferences." Slack's notification settings say "Notify me about: Direct messages, mentions, and keywords" -- the effect is described, not the category. Figma's comment notifications say "Notify me when someone comments on a file I can edit" -- the trigger condition is explicit, not implied.

2. **Toggle labels use noun phrases describing what is enabled -- not the current state.** A toggle labeled "Notifications: ON" is problematic because the meaning inverts when the toggle is off. The label must work in both states. Use "Email notifications" not "Enable email notifications" (the toggle conveys enabled/disabled -- the label should not duplicate it). Use "Show avatars in sidebar" not "Avatars: Visible." Apple's System Settings toggles follow this pattern universally: "Allow apps to request to track" describes the permission, not the state. The label remains accurate whether the toggle is on or off.

3. **Write consequence previews for settings with significant or irreversible side effects.** Users should know what will happen before they flip the toggle, not after. Settings that log out all other sessions, delete data, change visibility, or affect other users require inline consequence text. Atlassian Jira shows under the "Disable account" toggle: "This will remove this user's access to all projects and revoke their API tokens. Their assignments and comments will remain." GitHub's branch protection rule changes show: "Changes to this setting will take effect immediately and will apply to all new pull requests." The consequence preview belongs directly under the control, visible before interaction.

4. **Group settings by user goal, not technical category.** A "Notifications" page that groups items by technical delivery channel (Email, Push, SMS, In-app) forces users to hunt for the event they care about across four sections. A goal-based grouping asks: "When do I want to be notified?" and groups by event type (Mentions, Comments, Assignments, Deadlines). GitHub reorganized its notification settings from channel-first to event-first in 2020 and reported significant reduction in user confusion about notification routing. The test: can the user find the setting for "mentions from teammates" without reading every section heading?

5. **Write dangerous settings with visual and copy separation.** Settings that are destructive, irreversible, or have wide scope (delete account, revoke all API keys, make repository public) should be physically separated from routine settings. GitHub's "Danger Zone" section is the canonical example -- red border, distinct section heading, and each setting in its own card with a specific warning. The copy inside a danger zone setting should state the scope explicitly: "This will permanently delete your account and all associated data, including repositories, packages, and gists. This action cannot be undone." Every dangerous setting gets its own action button, never a toggle.

6. **Help text answers "why would I change this?" -- not "what does this do?"** The label tells the user what the setting controls. The help text should answer the question the user is most likely to have: when would I want this on or off? Stripe's API key settings show help text: "Use restricted keys to give third-party services only the permissions they need." This tells the user the use case, not the definition of a restricted key. Apple's location services help text says "Apps that have requested to use your location are listed here. You can change or remove access at any time" -- not a definition of location services but guidance on the action.

7. **Settings labels must work without reading surrounding context.** A settings page is often reached from search, deep links, or system notifications -- the user may not have scrolled past the page heading. Each label and toggle must be independently comprehensible. "Enable this" as a label is useless without the surrounding context. "Marketing emails" as a label is ambiguous -- is this emails I send or emails I receive? "Receive marketing emails from Acme" removes the ambiguity. Slack's notification settings work at any zoom level or search result because every label includes the actor and event: "Notify me when I'm mentioned in a channel."

## Details

### Toggle Label Patterns

Toggles have two states and one label. The label must be accurate and meaningful in both states. Use this decision tree:

- **The action being enabled:** Use a gerund or noun phrase. "Email digests," "Two-factor authentication," "Automatic updates."
- **A permission or visibility setting:** Describe what is allowed. "Allow teammates to see your active status," "Show profile in search results."
- **A behavioral setting:** Describe the behavior that results. "Play a sound when a message arrives," "Mark messages as read when viewed."

The label should NOT include words like "Enable," "Toggle," or "Turn on" -- the toggle UI element handles that semantics. The label should NOT include the current state: "Status: Active" as a toggle label is broken because it reads "Status: Active: OFF" when disabled.

### Notification Preference Architecture

Notification preference panels are among the most complex settings UIs in consumer software. The best implementations use a two-axis model:

|             | Email    | Push     | In-App   |
| ----------- | -------- | -------- | -------- |
| Mentions    | [toggle] | [toggle] | [toggle] |
| Comments    | [toggle] | [toggle] | [toggle] |
| Assignments | [toggle] | [toggle] | [toggle] |
| Due dates   | [toggle] | [toggle] | [toggle] |

Each cell is independently controllable. Column headers name the delivery channel; row headers name the event. This lets a user who wants push-only mentions and email-only due dates express exactly that preference without hunting through multiple sections. The pattern scales to any combination of events and channels. GitHub's notification preferences, Slack's notification granularity, and Figma's comment notifications all approximate this model.

### Anti-Patterns

1. **The Technical Label.** Settings labeled with backend terminology that means nothing to the user. "Enable WebSocket fallback," "Use legacy authentication flow," "Disable CORS preflight caching." Before: "Enable compression artifacts reduction." After: "Reduce blurriness when viewing large images on slower connections." The test: would a user who did not write this feature understand the label?

2. **The Context-Dependent Toggle.** A toggle whose label changes meaning based on its position in the page hierarchy. A toggle that says "Enabled" inside a section titled "Push Notifications" reads correctly inline, but if the user reaches it via search or deep link, "Enabled" conveys nothing. Before: toggle labeled "Enabled" inside the "Marketing Emails" section. After: standalone toggle labeled "Marketing emails from Acme Corp."

3. **The Consequence Surprise.** Significant settings with no consequence preview, where the user discovers the effect only after the action. Turning off two-factor authentication with no warning, then discovering the next login requires a backup code that was never saved. Before: toggle "Two-factor authentication" with no description. After: "Two-factor authentication -- Disable this only if you have a backup authentication method. Disabling will not affect active sessions but will remove 2FA requirements on your next login."

4. **The Ungrouped Dump.** A settings page with 30-50 items in a single list, organized alphabetically or in the order they were added to the codebase. Before: a flat list of 40 toggles with no section dividers. After: grouped into "Notifications," "Appearance," "Privacy," "Advanced," with each group answering a distinct user goal and dangerous settings separated into their own section with visual treatment.

### Real-World Examples

**Slack notification preferences.** Slack's notification preferences are a benchmark for the industry. The top-level structure separates "My preferences" (global defaults) from per-workspace and per-channel overrides -- a hierarchy that reflects how users actually think about notification scope. Inside each section, the controls use event-based labels: "Direct messages, mentions, and keywords," "All new messages," "Nothing." The keyword notification field shows an inline example: "Add words or phrases, separated by commas. Example: design review, Q4 launch." The consequence of each setting is visible: changing to "Nothing" in a channel shows "You'll stop being notified for this channel" immediately beneath the radio button.

**GitHub notification settings.** GitHub's 2020 notification redesign moved from a channel-centric model to an event-centric one. The current settings page groups notifications by where they come from (Participating, Watching, Ignoring) and lets users set delivery channel independently per category. Each category includes a one-sentence explanation of what "participating" or "watching" means in practice: "Participating means you were mentioned, committed to the repository, or commented in a thread." This explanation is essential -- GitHub-specific vocabulary like "watching" has a precise meaning that differs from casual use. The settings page teaches the vocabulary at the point of decision.

**Figma editor preferences.** Figma's editor preferences are embedded in the product experience rather than a separate settings page -- accessible via the menu during active work. Preferences like "Show ruler," "Snap to objects," and "Clip content" use verb phrases that describe the visual or behavioral effect rather than technical feature names. The "Clip content" toggle, which controls whether content outside a frame is visible or hidden, includes a small diagram showing the before/after visual result -- copy alone cannot convey a spatial concept. This hybrid of label plus diagram is a pattern to adopt for any setting with a visual effect that text struggles to describe.

**Apple System Settings organization.** Apple's System Settings (formerly System Preferences) uses a goal-based top-level organization: "Wi-Fi," "Bluetooth," "Notifications," "Focus," "Screen Time," "General." Each top-level item answers "what am I managing?" not "what subsystem does this configure?" Inside "Notifications," the structure is alphabetical by app name -- which is correct because the user arrives with a specific app in mind, not a general notification concept. Apple places consequence text inline for dangerous settings: "Erasing all content and settings will remove all media, data, and settings from this Mac. This action cannot be undone." The placement is immediately before the action button, not in a separate help section the user might skip.

## Source

- NNGroup -- "Settings vs. Preferences: Making the Right Choice," https://www.nngroup.com/articles/settings-preferences/
- Apple Human Interface Guidelines -- Settings and preferences, https://developer.apple.com/design/human-interface-guidelines/settings
- Google Material Design -- Settings pattern, https://m3.material.io/foundations/interaction/states/overview
- Hoober, S. -- "How Do Users Really Hold Mobile Devices?" (2013), touch target and preference panel design
- Podmajersky, T. -- _Strategic Writing for UX_ (2019), Chapter 6: Preferences and Configuration Copy
- NNGroup -- "Cognitive Load and UX," https://www.nngroup.com/articles/minimize-cognitive-load/

## Process

1. List every setting in scope. For each setting, answer: what happens when this is on? What happens when this is off? What is the consequence if changed accidentally?
2. Write the label as a noun phrase describing what is controlled. Write the description as a sentence describing the effect from the user's perspective.
3. Identify which settings have significant side effects. Write consequence preview copy for each and place it directly beneath the control.
4. Group settings by user goal. Name each group with a goal-oriented heading (what the user is trying to manage, not the technical subsystem).
5. Identify any dangerous or irreversible settings. Separate them visually, add explicit scope copy, and require a separate action (button, not toggle) with a confirmation dialog.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- Every toggle label is a noun phrase that remains accurate and meaningful regardless of the toggle's on/off state.
- Every setting description explains the effect from the user's perspective, not the technical implementation.
- Settings with significant side effects (session logout, data deletion, visibility changes) show consequence preview copy before the user interacts.
- Settings are organized by user goal, with dangerous settings visually and spatially separated from routine controls.
- All help text answers "when would I want to change this?" rather than restating the label.
