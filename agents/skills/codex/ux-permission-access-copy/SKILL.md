# Permission and Access Copy

> Permission and access copy — role-based messaging, upgrade prompts, gating copy, "you don't have access" patterns

## When to Use

- Writing "permission denied" states for role-based access control (admin, editor, viewer)
- Designing upgrade prompts and freemium feature gates
- Building "request access" flows and access-pending states
- Creating tooltips and inline copy for disabled UI elements
- Composing contact-your-admin messaging for managed workspaces
- Designing paywall interstitials and plan comparison nudges
- NOT for: authentication errors like "Invalid password" or "Session expired" (use ux-error-messages)
- NOT for: security warnings about suspicious activity or account lockouts
- NOT for: general error states unrelated to access or entitlement

## Instructions

1. **Explain what the user cannot do AND who can do it.** A permission denied message that only says "You don't have permission" leaves the user with no path forward. Always name the role or person who can perform the action: "Only workspace admins can manage billing. Contact your admin to update the payment method." Linear names the specific permission level: "Only members with the Editor role can create cycles. Ask your workspace owner to update your role." GitHub's organization permission message names exactly which setting is restricted and links to the org settings page. The pattern is: what is blocked + who can unblock it + how to reach them.

2. **Distinguish permission denied from feature unavailable -- the cause changes the copy.** A viewer who clicks "Edit" on a Figma file needs different copy than a free-tier user who clicks a Pro-only feature. Permission denied means the user has the product but lacks the role: "You have view-only access. Ask the file owner to give you edit access." Feature unavailable means the feature is behind a plan gate: "Version history is available on Professional and Organization plans." Conflating these causes the user to contact their admin when they actually need to upgrade -- or to upgrade when they just need a different role.

3. **Upgrade prompts show value before asking for money.** The moment a user hits a feature gate is high intent -- they already want the feature. Use that moment to show what they get, not what they must pay. Slack's upgrade prompt for message history says "Access all your message history -- messages before your current limit are already saved." The feature exists; the gate is temporary. Lead with the benefit: "Analyze trends across all time with Pro Analytics" rather than "Upgrade to Pro ($12/mo) to use this feature." Price comes after value is established.

4. **Never blame or shame the user for lacking access.** Copy like "You don't have access to this feature" places the problem with the user. The product is placing a restriction; the product should own that framing. Prefer "This feature is available to Pro users" over "You can't use this feature." Figma's viewer restrictions say "You're viewing this file -- ask the owner for editor access" not "You don't have permission to edit." The difference is subtle but the user experience of being told you cannot do something versus being shown a path to unlock it is measurable.

5. **Provide a clear resolution path with a single primary action.** Every permission or access state must answer "what do I do now?" with a specific, tappable next step -- not a paragraph of explanation. The options are: (a) "Request access" button that triggers a real workflow, (b) contact info for the admin ("Email team@company.com"), (c) direct link to the upgrade page, or (d) a clear instruction to ask someone specific. GitHub's private repository 404 shows a "Request access" button that sends a notification to the repository admin. Notion shows "Ask for access" with a single click that notifies the workspace owner.

6. **For freemium gates, show what the user is missing -- not a wall.** A lock icon with no explanation is the worst pattern. The user should be able to see enough of the gated feature to understand its value. Stripe shows anonymized chart data behind a blur on free-plan analytics: "Upgrade to see the full breakdown." Linear shows a grayed-out Cycles section with the label "Available on Plus and Pro plans -- explore Cycles." The goal is to create desire for the feature, not frustration at a closed door. Show the feature's shape; hide only the data.

7. **Disabled UI elements need a tooltip explaining why, not just a visual state.** A grayed-out button with no tooltip creates confusion: is it disabled because of a permission, a plan limit, the current state, or a bug? Slack disables the "Create channel" button for non-admin workspaces and shows on hover: "Only workspace admins can create channels." GitHub disables branch deletion on protected branches and shows: "This branch is protected. Unprotect it to delete." The tooltip must name the specific reason -- not "Not available" but "Protected by branch rules" or "Requires admin role."

## Details

### Role-Based Messaging Patterns

Permission copy must account for the full matrix of roles a product supports. The most common failure is writing only the admin-facing copy and leaving viewer and editor states generic. Map each role to its specific constraint and write targeted copy for each:

| Role      | Blocked Action         | Copy Pattern                                               |
| --------- | ---------------------- | ---------------------------------------------------------- |
| Viewer    | Edit content           | "You're viewing this [page]. Ask [owner] for edit access." |
| Editor    | Manage billing         | "Only admins can manage billing. Contact your admin."      |
| Member    | Invite users           | "Workspace owners can invite new members."                 |
| Free user | Access Pro feature     | "Available on Pro -- [benefit statement]."                 |
| Guest     | Access private content | "This content is restricted to workspace members."         |

Consistency across these states requires a decision about voice. Linear uses a consistent "Only [role] can [action]" pattern. Figma uses "You're [current state] -- ask [actor] for [target state]." Choose one pattern and apply it everywhere in the product.

### Freemium Gate Anatomy

A well-designed freemium gate has five components, each doing specific work:

1. **Gate label** -- The minimum viable signal that this is a paid feature. "Pro" or a lock icon. Keep it small; do not make the gate the dominant visual element.
2. **Feature preview** -- Enough of the feature to communicate value. Blurred data, anonymized examples, or a screenshot. Never a completely blank state.
3. **Value headline** -- One sentence naming the user's benefit, not the product's feature. "See how your team's time is spent" not "Access the Time Tracking report."
4. **Plan context** -- Which plan includes this feature. "Available on Pro and Business plans." Link to the plans page.
5. **Primary CTA** -- A single action. "Upgrade to Pro" or "Start free trial." Not "Learn more" as the primary action -- that is an escape hatch, not a conversion path.

### Anti-Patterns

1. **The Mysterious Denial.** "You don't have permission to view this page." No explanation of what permission is needed, who grants it, or how to get it. The user is stranded. Before: "Access denied." After: "This project is visible to Acme Corp members only. Request access or sign in with your Acme Corp account."

2. **The Guilt Trip Upgrade.** Upgrade prompts that frame the gate as punishment for being on the wrong plan. "Upgrade to unlock this feature" with no value statement. Before: "This feature is locked. Upgrade now." After: "Track time across all projects automatically -- available on Pro. See what's included."

3. **The Dead End.** Permission denied states with no next step. The user reads the message, understands they are blocked, and has nowhere to go. Before: "You don't have access to team billing." After: "Only admins can view billing. Contact your workspace admin at admin@yourcompany.com or ask them to update your role in Settings > Members."

4. **The Silent Disable.** A UI element that appears grayed out with no explanation. The user does not know if the button is disabled because of their role, the current state, or a bug in the product. Before: [grayed-out "Export" button with no tooltip]. After: [on hover] "Export is available to workspace admins. Ask your admin to run this export."

### Real-World Examples

**Linear team permission states.** Linear surfaces role-based restrictions inline and contextually. When a viewer tries to drag an issue to a different status, a tooltip appears immediately: "You have view-only access to this team. Contact your workspace owner to update your role." The key design choices: the message appears at the exact point of friction (not a separate error page), it names the role required, and it names the person to contact with a link to workspace settings. Linear also shows a persistent "View only" badge in the workspace header so users always know their access level without discovering it through failed actions.

**Slack Enterprise upgrade prompts.** Slack's Business+ upgrade prompts appear in context -- inside the feature the user wants, not in a separate billing page. The message history limit prompt shows: "You're viewing the last 90 days. With Business+, your entire message history is searchable -- your messages before this date are saved and waiting." The copy does three things: names what the user is missing (older messages), removes the fear that data is lost (they are saved), and frames the upgrade as unlocking something that exists rather than buying something new. This framing reduces upgrade anxiety and increases conversion.

**GitHub organization permissions.** GitHub's org permission pages are among the most information-dense permission UIs in the industry. When a non-admin tries to access an org setting, the page shows: "You must be an organization owner to access organization settings. Contact an owner to request access." The page then lists current org owners with their avatars and usernames -- so the user can immediately identify who to contact without leaving GitHub. The "request access" model eliminates the ambiguity of "who is my admin?" by surfacing the answer in the permission denial state itself.

**Figma editor/viewer gating.** Figma's distinction between editor and viewer is foundational to its business model, and the copy reflects that clarity. A viewer sees: "You're viewing this file. To make edits, ask [Owner name] to give you editor access." The owner's name is surfaced directly in the copy -- personalized, not generic. The "Request edit access" button sends a notification with the viewer's comment. Figma also shows a persistent "Viewing" indicator in the top bar so the access state is never ambiguous. For free-plan viewers on Organization files, Figma shows a separate nudge: "Upgrade to edit files in this organization" -- correctly distinguishing plan-gating from role-gating.

## Source

- Babich, N. -- "UX Design for Empty States and Permission Screens," Adobe XD Blog (2019)
- NNGroup -- "Visibility of System Status," https://www.nngroup.com/articles/visibility-system-status/
- Figma -- Design System and permission UX documentation, https://help.figma.com/hc/en-us/articles/360039970673
- Linear -- Changelog and permission model, https://linear.app/docs/roles-and-permissions
- Spotify Design -- "Designing Access States," Spotify Design Blog (2021)
- Podmajersky, T. -- _Strategic Writing for UX_ (2019), Chapter 7: Permissions and Paywall Copy

## Process

1. Map the full permission matrix for the feature: list every role, what they can do, and what they cannot. Write copy for each blocked state explicitly -- do not reuse generic copy across roles.
2. For each blocked state, define the resolution path: is the fix a role change (route to admin), a plan upgrade (route to billing), or a workflow step (route to prerequisite action)?
3. Write the permission message using the pattern: [what is blocked] + [who can unblock it] + [how to reach them or take action].
4. Write the freemium gate using the pattern: [feature preview] + [value headline] + [plan context] + [single CTA].
5. Audit all disabled UI elements for tooltip coverage -- every non-interactive element needs a reason visible on hover or tap.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- Every permission denied state names the role required and provides a specific resolution path, not just a denial message.
- Upgrade prompts lead with a user benefit statement before mentioning plan name or price.
- No disabled UI element is left without a tooltip explaining the reason for the disabled state.
- Permission denied and feature unavailable states use distinct copy patterns that correctly identify the cause.
- Users can identify the next action to take (contact admin, request access, upgrade) without leaving the screen where the restriction appears.
