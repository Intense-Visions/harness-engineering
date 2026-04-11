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

1. **Describe the effect of the setting, not the setting itself.** The label names the control; the description should explain what enabling or disabling it changes in the user's experience. "Email notifications" as a label is fine -- but the description should say "Get an email when someone comments on your work or assigns you a task" not "Manage your email notification preferences." Slack's notification settings say "Notify me about: Direct messages, mentions, and keywords" -- the effect is described, not the category. Figma's comment notifications say "Notify me when someone comments on a file I can edit" -- the trigger condition is explicit, not implied. A user reading only the description, without the label, should be able to understand exactly what will change in their experience if they toggle the setting.

2. **Toggle labels use noun phrases describing what is enabled -- not the current state.** A toggle labeled "Notifications: ON" is problematic because the meaning inverts when the toggle is off. The label must work in both states. Use "Email notifications" not "Enable email notifications" (the toggle conveys enabled/disabled -- the label should not duplicate it). Use "Show avatars in sidebar" not "Avatars: Visible." Apple's System Settings toggles follow this pattern universally: "Allow apps to request to track" describes the permission, not the state. The label remains accurate whether the toggle is on or off, and screen readers announce it correctly in both states without the label needing to change.

3. **Write consequence previews for settings with significant or irreversible side effects.** Users should know what will happen before they flip the toggle, not after. Settings that log out all other sessions, delete data, change visibility, or affect other users require inline consequence text placed directly beneath the toggle, visible before the user interacts. Atlassian Jira shows under the "Disable account" toggle: "This will remove this user's access to all projects and revoke their API tokens. Their assignments and comments will remain." GitHub's branch protection rule changes show: "Changes to this setting will take effect immediately and will apply to all new pull requests." The consequence preview belongs directly under the control -- not in a tooltip, help article, or post-action confirmation where the user encounters it too late to influence their decision.

4. **Group settings by user goal, not technical category.** A "Notifications" page that groups items by technical delivery channel (Email, Push, SMS, In-app) forces users to hunt for the event they care about across four sections. A goal-based grouping asks: "When do I want to be notified?" and groups by event type (Mentions, Comments, Assignments, Deadlines). GitHub reorganized its notification settings from channel-first to event-first in 2020 and reported significant reduction in user confusion about notification routing. The test: can the user find the setting for "mentions from teammates" without reading every section heading? If finding a setting requires reading and understanding the entire page structure, the grouping is technical rather than goal-oriented.

5. **Write dangerous settings with visual and copy separation.** Settings that are destructive, irreversible, or have wide scope (delete account, revoke all API keys, make repository public) should be physically separated from routine settings with a visually distinct section. GitHub's "Danger Zone" section is the canonical example -- red border, distinct section heading, and each setting in its own card with a specific warning. The copy inside a danger zone setting should state the scope explicitly: "This will permanently delete your account and all associated data, including repositories, packages, and gists. This action cannot be undone." Every dangerous setting gets its own action button, never a toggle -- toggles imply reversibility, which is incompatible with the user's mental model of destructive actions.

6. **Help text answers "why would I change this?" -- not "what does this do?"** The label tells the user what the setting controls. The help text should answer the question the user is most likely to have: when would I want this on or off? Stripe's API key settings show help text: "Use restricted keys to give third-party services only the permissions they need." This tells the user the use case, not the definition of a restricted key. Apple's location services help text says "Apps that have requested to use your location are listed here. You can change or remove access at any time" -- not a definition of location services but guidance on the action the user might want to take. Write the help text by imagining the question a user would type into your support chat before finding the setting on their own.

7. **Settings labels must work without reading surrounding context.** A settings page is often reached from search, deep links, or system notifications -- the user may not have scrolled past the page heading. Each label and toggle must be independently comprehensible. "Enable this" as a label is useless without the surrounding context. "Marketing emails" as a label is ambiguous -- is this emails I send or emails I receive? "Receive marketing emails from Acme" removes the ambiguity and works whether the user reaches this toggle from the page's top or from a search result highlighting this specific control. Slack's notification settings work at any zoom level or search result because every label includes the actor and event: "Notify me when I'm mentioned in a channel."

## Details

### Toggle Label Patterns

Toggles have two states and one label. The label must be accurate and meaningful in both states. Use this decision tree:

- **The action being enabled:** Use a gerund or noun phrase. "Email digests," "Two-factor authentication," "Automatic updates."
- **A permission or visibility setting:** Describe what is allowed. "Allow teammates to see your active status," "Show profile in search results."
- **A behavioral setting:** Describe the behavior that results. "Play a sound when a message arrives," "Mark messages as read when viewed."

The label should NOT include words like "Enable," "Toggle," or "Turn on" -- the toggle UI element handles that semantics. The label should NOT include the current state: "Status: Active" as a toggle label is broken because it reads "Status: Active: OFF" when disabled. Document the chosen pattern convention in the design system so all future toggle labels default to the correct form.

### Notification Preference Architecture

Notification preference panels are among the most complex settings UIs in consumer software. The best implementations use a two-axis model:

|             | Email    | Push     | In-App   |
| ----------- | -------- | -------- | -------- |
| Mentions    | [toggle] | [toggle] | [toggle] |
| Comments    | [toggle] | [toggle] | [toggle] |
| Assignments | [toggle] | [toggle] | [toggle] |
| Due dates   | [toggle] | [toggle] | [toggle] |

Each cell is independently controllable. Column headers name the delivery channel; row headers name the event. This lets a user who wants push-only mentions and email-only due dates express exactly that preference without hunting through multiple sections. The pattern scales to any combination of events and channels. GitHub's notification preferences, Slack's notification granularity, and Figma's comment notifications all approximate this model. Label the row headers with event names from the user's perspective ("Someone mentions me") rather than system event names ("mention_created").

### Review Checklist

Use this checklist before shipping or reviewing any settings page implementation:

| Check                          | Criteria                                        | Pass Condition                                                      |
| ------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------- |
| Toggle label form              | Labels are noun phrases, not state descriptions | No labels with "Enable," "Status: ON/OFF," or current state in text |
| Effect description             | Description explains user-facing effect         | Description does not restate the label; explains trigger or outcome |
| Consequence previews           | Significant side-effects have inline preview    | Preview text appears beneath the control before interaction         |
| Goal-based grouping            | Settings grouped by user goal                   | Section headings name user goals, not technical subsystems          |
| Dangerous separation           | Irreversible settings are visually separated    | Danger zone has distinct border, heading, and button (not toggle)   |
| Help text answers "why"        | Help text explains when to change the setting   | No help text that is just a restatement or definition of the label  |
| Context-independence           | Labels work without surrounding section heading | Label is self-contained; "enable this" or "the above" never appears |
| Dangerous settings use buttons | No dangerous action is a toggle                 | Toggle is never used for delete, terminate, or irreversible actions |

### Anti-Patterns

1. **The Technical Label.** Settings labeled with backend terminology that means nothing to the user. "Enable WebSocket fallback," "Use legacy authentication flow," "Disable CORS preflight caching." Before: "Enable compression artifacts reduction." After: "Reduce blurriness when viewing large images on slower connections." The test: would a user who did not write this feature understand the label without reading documentation? Technical labels are a symptom of settings being written by engineers for engineers -- they describe implementation details rather than user outcomes. Every technical label in a settings panel is a support ticket waiting to happen.

2. **The Context-Dependent Toggle.** A toggle whose label changes meaning based on its position in the page hierarchy. A toggle that says "Enabled" inside a section titled "Push Notifications" reads correctly inline, but if the user reaches it via search or deep link, "Enabled" conveys nothing. Before: toggle labeled "Enabled" inside the "Marketing Emails" section. After: standalone toggle labeled "Marketing emails from Acme Corp." The rule: any toggle that would be meaningless if its containing section heading were removed is context-dependent and needs to be rewritten. This pattern is especially common in settings pages built incrementally, where new toggles are added to existing sections by developers who rely on the section heading for context.

3. **The Consequence Surprise.** Significant settings with no consequence preview, where the user discovers the effect only after taking the action. Turning off two-factor authentication with no warning, then discovering the next login requires a backup code that was never saved. Before: toggle "Two-factor authentication" with no description. After: "Two-factor authentication -- Disable this only if you have a backup authentication method. Disabling will not affect active sessions but will remove 2FA requirements on your next login." The consequence preview reduces regret-driven support tickets and builds user trust by treating users as partners in understanding the product's behavior rather than recipients of unexplained system actions.

4. **The Ungrouped Dump.** A settings page with 30-50 items in a single list, organized alphabetically or in the order they were added to the codebase. Before: a flat list of 40 toggles with no section dividers. After: grouped into "Notifications," "Appearance," "Privacy," "Advanced," with each group answering a distinct user goal and dangerous settings separated into their own section with visual treatment. The ungrouped dump is the most common settings page failure in products that have grown incrementally -- new settings are added at the bottom of the list because that is the easiest code change, not because it is the best placement for the user. A quarterly settings audit that re-evaluates grouping and ordering prevents the dump from accumulating.

### Real-World Examples

**Slack notification preferences.** Slack's notification preferences are a benchmark for the industry. The top-level structure separates "My preferences" (global defaults) from per-workspace and per-channel overrides -- a hierarchy that reflects how users actually think about notification scope. Inside each section, the controls use event-based labels: "Direct messages, mentions, and keywords," "All new messages," "Nothing." The keyword notification field shows an inline example: "Add words or phrases, separated by commas. Example: design review, Q4 launch." The consequence of each setting is visible: changing to "Nothing" in a channel shows "You'll stop being notified for this channel" immediately beneath the radio button. This real-time consequence preview is the product's acknowledgment that notification settings are consequential and users should understand the effect before they commit.

**GitHub notification settings.** GitHub's 2020 notification redesign moved from a channel-centric model to an event-centric one. The current settings page groups notifications by where they come from (Participating, Watching, Ignoring) and lets users set delivery channel independently per category. Each category includes a one-sentence explanation of what "participating" or "watching" means in practice: "Participating means you were mentioned, committed to the repository, or commented in a thread." This explanation is essential -- GitHub-specific vocabulary like "watching" has a precise meaning that differs from casual use. The settings page teaches the vocabulary at the point of decision, which is more effective than a glossary users must navigate to separately when they encounter an unfamiliar term.

**Figma editor preferences.** Figma's editor preferences are embedded in the product experience rather than a separate settings page -- accessible via the menu during active work. Preferences like "Show ruler," "Snap to objects," and "Clip content" use verb phrases that describe the visual or behavioral effect rather than technical feature names. The "Clip content" toggle, which controls whether content outside a frame is visible or hidden, includes a small diagram showing the before/after visual result -- copy alone cannot convey a spatial concept. This hybrid of label plus diagram is a pattern to adopt for any setting with a visual effect that words struggle to describe accurately. Figma's decision to embed preferences in the editor rather than a separate settings page reduces the distance between discovering a preference and changing it.

**Apple System Settings organization.** Apple's System Settings (formerly System Preferences) uses a goal-based top-level organization: "Wi-Fi," "Bluetooth," "Notifications," "Focus," "Screen Time," "General." Each top-level item answers "what am I managing?" not "what subsystem does this configure?" Inside "Notifications," the structure is alphabetical by app name -- which is correct because the user arrives with a specific app in mind, not a general notification concept. Apple places consequence text inline for dangerous settings: "Erasing all content and settings will remove all media, data, and settings from this Mac. This action cannot be undone." The placement is immediately before the action button, not in a separate help section the user might skip. Apple's pattern of making consequence text non-collapsible and always visible demonstrates the company's position that users should be fully informed before acting on settings with significant effects.

### Copy Formulas Quick Reference

These are fill-in-the-blank templates for the most common settings and preferences copy patterns:

- **Toggle label (action enabled):** `[Noun phrase]` -- e.g., "Email digests," "Two-factor authentication"
- **Toggle label (permission):** `Allow [actor] to [action]` -- e.g., "Allow teammates to see your active status"
- **Toggle label (behavior):** `[Behavior that results]` -- e.g., "Play a sound when a message arrives"
- **Toggle description (trigger):** `Get [notification / alert] when [event].`
- **Toggle description (effect):** `[Outcome] when this is enabled. [Outcome] when disabled.`
- **Consequence preview:** `[Action] will [effect] immediately. [Downstream effect].`
- **Dangerous setting title:** `[Specific action]` -- e.g., "Delete account," "Revoke all API keys"
- **Dangerous setting description:** `This will permanently [effect]. [Downstream effects]. This action cannot be undone.`
- **Help text (use case):** `Use this when [scenario]. Change this if [condition].`
- **Notification event label:** `[Actor] [event]` -- e.g., "Someone mentions me," "A task is assigned to me"
- **Section heading (goal-based):** `[What the user is managing]` -- e.g., "Notifications," "Privacy," "Security"
- **Admin-enforced label:** `[Setting name] · Required by your organization`

## Source

- NNGroup -- "Settings vs. Preferences: Making the Right Choice," https://www.nngroup.com/articles/settings-preferences/
- Apple Human Interface Guidelines -- Settings and preferences, https://developer.apple.com/design/human-interface-guidelines/settings
- Google Material Design -- Settings pattern, https://m3.material.io/foundations/interaction/states/overview
- Hoober, S. -- "How Do Users Really Hold Mobile Devices?" (2013), touch target and preference panel design
- Podmajersky, T. -- _Strategic Writing for UX_ (2019), Chapter 6: Preferences and Configuration Copy
- NNGroup -- "Cognitive Load and UX," https://www.nngroup.com/articles/minimize-cognitive-load/

## Process

1. **Inventory every setting in scope.** For each setting, answer three questions: what happens when this is on? What happens when this is off? What is the consequence if changed accidentally? This inventory drives all subsequent copy decisions. Settings with significant or irreversible consequences on change are flagged for consequence preview copy. Settings with technical or ambiguous labels are flagged for rewriting before any description is written.

2. **Write the label as a noun phrase describing what is controlled.** Write the description as a sentence explaining the effect from the user's perspective, starting with the trigger or the outcome: "Get an email when..." or "Hides your profile from..." Test each label-plus-description pair by asking: could a user understand this toggle without reading the rest of the page? If not, the label is context-dependent and needs revision.

3. **Identify settings with significant side effects.** For each flagged setting, write consequence preview copy and place it directly beneath the control -- not in a tooltip, not in a help link, not in a post-action confirmation. Review the consequence preview with engineering to confirm technical accuracy. The consequence preview for a setting that logs out all other sessions must confirm with engineering whether the current session is affected.

4. **Group settings by user goal.** List all settings and sort them into goal-oriented groups. Name each group with a heading that answers "what is the user trying to manage?" not "what technical subsystem is this?" Test the groupings by describing them to a user unfamiliar with the settings page and asking them which group each setting belongs to -- if their answers match the groupings, the structure is goal-oriented. If they consistently place settings in different groups, revise the headings.

5. **Identify and separate dangerous or irreversible settings.** Move them to a visually distinct section with explicit scope copy and a button (not toggle) that leads to a confirmation dialog. Review the complete settings page with a fresh-eyes pass to confirm that no destructive setting is within accidental-click distance of a routine setting -- proximity accidents are a real risk in settings UIs with dense, small toggle controls.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- Every toggle label is a noun phrase that remains accurate and meaningful regardless of the toggle's on/off state -- no labels include "Enable," "Status: ON," or the current state in the text.
- Every setting description explains the effect from the user's perspective (trigger, outcome, or affected audience), not the technical implementation or a restatement of the label.
- Settings with significant side effects (session logout, data deletion, visibility changes, access revocation) show consequence preview copy directly beneath the control, visible before the user interacts.
- Settings are organized by user goal, with section headings that name what the user is managing rather than technical subsystems -- and dangerous settings are visually and spatially separated from routine controls.
- All help text answers "when would I want to change this?" providing use-case context, rather than restating the label or defining the feature.
- Dangerous or irreversible settings use a button leading to a confirmation dialog, never a toggle -- toggles are reserved for reversible preferences only.
- Every toggle label works without its surrounding section heading, so users who reach a setting via search, deep link, or scroll can understand it without reading the full page structure.

## Settings Search and Deep-Link Considerations

Many operating systems and enterprise products offer a settings search that filters the settings page to matching controls. When a user types "notification" in macOS System Settings, matching controls are highlighted in-place. This behavior requires that every toggle label and description contain the vocabulary users would naturally type when searching for that setting. If the label is "Alerts" but users search for "notifications," the setting is invisible to search. Audit settings labels against the most common support queries about settings to identify vocabulary mismatches and adjust labels to match user language.

Deep-linked settings (links shared in onboarding emails, help articles, or admin notifications that take users directly to a specific setting) place users in the middle of the settings page without the surrounding context that guides the reading experience. Every setting that is deep-linked should have a short descriptive paragraph or call-out box explaining why the user was sent there: "Your admin has asked you to enable two-factor authentication. Turn on the toggle below to secure your account." This contextual frame bridges the gap between the message that sent the user here and the control they need to interact with.

Settings that have changed since the user last visited should surface a change indicator: a "New" badge, a banner, or a highlighted border. When a setting change was forced by an admin or a product update, the copy must acknowledge this: "Your organization requires two-factor authentication. This setting was enabled by your admin and cannot be changed." Surfacing admin-enforced settings with honest copy prevents users from filing support tickets about why they cannot toggle a control that appears interactive.
