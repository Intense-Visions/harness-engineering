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

1. **Explain what the user cannot do AND who can do it.** A permission denied message that only says "You don't have permission" leaves the user with no path forward. Always name the role or person who can perform the action: "Only workspace admins can manage billing. Contact your admin to update the payment method." Linear names the specific permission level: "Only members with the Editor role can create cycles. Ask your workspace owner to update your role." GitHub's organization permission message names exactly which setting is restricted and links to the org settings page for administrators. The pattern is: what is blocked + who can unblock it + how to reach them. Omitting any of the three components forces the user to investigate on their own, which typically results in a support ticket rather than a self-served resolution.

2. **Distinguish permission denied from feature unavailable -- the cause changes the copy.** A viewer who clicks "Edit" on a Figma file needs different copy than a free-tier user who clicks a Pro-only feature. Permission denied means the user has the product but lacks the role: "You have view-only access. Ask the file owner to give you edit access." Feature unavailable means the feature is behind a plan gate: "Version history is available on Professional and Organization plans." Conflating these causes the user to contact their admin when they actually need to upgrade, or to attempt an upgrade when they simply need a different role assigned to their account. Write the two message types using visually and textually distinct patterns so users can distinguish them at a glance without reading the full message.

3. **Upgrade prompts show value before asking for money.** The moment a user hits a feature gate is high intent -- they already want the feature. Use that moment to show what they get, not what they must pay. Slack's upgrade prompt for message history says "Access all your message history -- messages before your current limit are already saved." The feature exists; the gate is temporary. Lead with the benefit: "Analyze trends across all time with Pro Analytics" rather than "Upgrade to Pro ($12/mo) to use this feature." Price comes after value is established -- leading with price anchors the user's thinking on cost rather than on the value that justifies the cost. Conversion rates on feature gates improve measurably when value is named before price.

4. **Never blame or shame the user for lacking access.** Copy like "You don't have access to this feature" places the problem with the user. The product is placing a restriction; the product should own that framing. Prefer "This feature is available to Pro users" over "You can't use this feature." Figma's viewer restrictions say "You're viewing this file -- ask the owner for editor access" not "You don't have permission to edit." The difference is subtle but the user experience of being told you cannot do something versus being shown a path to unlock it is measurable in support ticket volume and user satisfaction scores. Avoid second-person "you" constructions that read as accusatory: "You don't have," "You can't," "You are not."

5. **Provide a clear resolution path with a single primary action.** Every permission or access state must answer "what do I do now?" with a specific, tappable next step -- not a paragraph of explanation. The options are: (a) "Request access" button that triggers a real workflow, (b) contact info for the admin ("Email team@company.com"), (c) direct link to the upgrade page, or (d) a clear instruction to ask someone specific. GitHub's private repository 404 shows a "Request access" button that sends a notification to the repository admin. Notion shows "Ask for access" with a single click that notifies the workspace owner. Never present two equally weighted CTAs on the same permission denied state -- "Contact admin or upgrade" forces the user to diagnose their own situation instead of being routed to the correct resolution.

6. **For freemium gates, show what the user is missing -- not a wall.** A lock icon with no explanation is the worst pattern. The user should be able to see enough of the gated feature to understand its value. Stripe shows anonymized chart data behind a blur on free-plan analytics: "Upgrade to see the full breakdown." Linear shows a grayed-out Cycles section with the label "Available on Plus and Pro plans -- explore Cycles." The goal is to create desire for the feature, not frustration at a closed door. Show the feature's shape; hide only the data. Features shown behind a preview gate convert at higher rates than features shown as a blank lock screen because desire requires understanding, and understanding requires seeing at least the outline of what is possible.

7. **Disabled UI elements need a tooltip explaining why, not just a visual state.** A grayed-out button with no tooltip creates confusion: is it disabled because of a permission, a plan limit, the current state, or a bug? Slack disables the "Create channel" button for non-admin workspaces and shows on hover: "Only workspace admins can create channels." GitHub disables branch deletion on protected branches and shows: "This branch is protected. Unprotect it to delete." The tooltip must name the specific reason -- not "Not available" but "Protected by branch rules" or "Requires admin role." A disabled element without a tooltip is indistinguishable from a broken element, and users who cannot tell the difference file support tickets and lose trust in product quality.

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

Consistency across these states requires a decision about voice. Linear uses a consistent "Only [role] can [action]" pattern. Figma uses "You're [current state] -- ask [actor] for [target state]." Choose one pattern and apply it everywhere in the product. Document the chosen pattern in the design system's content guidelines so that future writers default to it.

### Freemium Gate Anatomy

A well-designed freemium gate has five components, each doing specific work:

1. **Gate label** -- The minimum viable signal that this is a paid feature. "Pro" or a lock icon. Keep it small; do not make the gate the dominant visual element.
2. **Feature preview** -- Enough of the feature to communicate value. Blurred data, anonymized examples, or a screenshot. Never a completely blank state.
3. **Value headline** -- One sentence naming the user's benefit, not the product's feature. "See how your team's time is spent" not "Access the Time Tracking report."
4. **Plan context** -- Which plan includes this feature. "Available on Pro and Business plans." Link to the plans page.
5. **Primary CTA** -- A single action. "Upgrade to Pro" or "Start free trial." Not "Learn more" as the primary action -- that is an escape hatch, not a conversion path.

### Review Checklist

Use this checklist before shipping or reviewing any permission or access state:

| Check             | Criteria                                          | Pass Condition                                                    |
| ----------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| Cause identified  | Message names whether the issue is role or plan   | "permission denied" and "feature gate" use distinct copy patterns |
| Resolution path   | Single primary action provided                    | One CTA, not "contact admin or upgrade"                           |
| Role named        | Blocked state names who can unblock               | "Only admins can..." or "Ask the file owner..."                   |
| No blame language | Copy does not use "you can't" or "you don't have" | Reframe to product-owned restriction ("Available on Pro...")      |
| Value-first       | Upgrade prompts state benefit before plan name    | Benefit sentence appears before price or plan name                |
| Disabled tooltips | All disabled elements have hover tooltip          | No grayed-out element is left unexplained                         |
| Feature preview   | Gated features show a visible preview             | No blank lock screens; at least a blurred or anonymized view      |
| Admin surfacing   | Permission denied states surface who the admin is | Name or email of relevant admin shown, not just "your admin"      |

### Anti-Patterns

1. **The Mysterious Denial.** "You don't have permission to view this page." No explanation of what permission is needed, who grants it, or how to get it. The user is stranded at a dead end with no self-service recovery path. Before: "Access denied." After: "This project is visible to Acme Corp members only. Request access or sign in with your Acme Corp account." The after version names the scope of restriction (Acme Corp members), offers two resolution paths (request access, different sign-in), and treats the user as capable of taking action rather than someone who has been turned away at a door.

2. **The Guilt Trip Upgrade.** Upgrade prompts that frame the gate as punishment for being on the wrong plan. "Upgrade to unlock this feature" with no value statement. Before: "This feature is locked. Upgrade now." After: "Track time across all projects automatically -- available on Pro. See what's included." The after version leads with the benefit ("track time"), names the plan ("Pro"), and offers a soft next step ("see what's included") rather than demanding immediate commitment. The "locked" metaphor is inherently adversarial; replace it with a preview-and-unlock framing that aligns the product's incentive (upgrading) with the user's goal (using the feature).

3. **The Dead End.** Permission denied states with no next step. The user reads the message, understands they are blocked, and has nowhere to go in the product. Before: "You don't have access to team billing." After: "Only admins can view billing. Contact your workspace admin at admin@yourcompany.com or ask them to update your role in Settings > Members." The after version names the admin contact directly, provides a navigation path for the admin to take action, and gives the user two concrete next steps. When the admin's email is not knowable, show the workspace admin's name with a "send message" button to initiate the contact within the product.

4. **The Silent Disable.** A UI element that appears grayed out with no explanation. The user does not know if the button is disabled because of their role, the current state, or a bug in the product -- so they cannot determine whether to contact support, contact their admin, or wait for a state change. Before: [grayed-out "Export" button with no tooltip]. After: [on hover] "Export is available to workspace admins. Ask your admin to run this export." Every disabled element needs a tooltip. Every tooltip needs a specific reason. "Not available" is not a specific reason -- it is a restatement of the visual state.

### Real-World Examples

**Linear team permission states.** Linear surfaces role-based restrictions inline and contextually. When a viewer tries to drag an issue to a different status, a tooltip appears immediately: "You have view-only access to this team. Contact your workspace owner to update your role." The key design choices: the message appears at the exact point of friction (not a separate error page), it names the role required, and it names the person to contact with a link to workspace settings. Linear also shows a persistent "View only" badge in the workspace header so users always know their access level without discovering it through failed actions -- this is the "visibility of system status" principle applied to permission states.

**Slack Enterprise upgrade prompts.** Slack's Business+ upgrade prompts appear in context -- inside the feature the user wants, not in a separate billing page. The message history limit prompt shows: "You're viewing the last 90 days. With Business+, your entire message history is searchable -- your messages before this date are saved and waiting." The copy does three things: names what the user is missing (older messages), removes the fear that data is lost (they are saved), and frames the upgrade as unlocking something that exists rather than buying something new. This framing reduces upgrade anxiety and increases conversion by addressing the specific objection a user is most likely to have at the point of encountering the gate.

**GitHub organization permissions.** GitHub's org permission pages are among the most information-dense permission UIs in the industry. When a non-admin tries to access an org setting, the page shows: "You must be an organization owner to access organization settings. Contact an owner to request access." The page then lists current org owners with their avatars and usernames -- so the user can immediately identify who to contact without leaving GitHub. The "request access" model eliminates the ambiguity of "who is my admin?" by surfacing the answer in the permission denial state itself. This pattern reduces support ticket volume by making the resolution path self-contained within the product.

**Figma editor/viewer gating.** Figma's distinction between editor and viewer is foundational to its business model, and the copy reflects that clarity. A viewer sees: "You're viewing this file. To make edits, ask [Owner name] to give you editor access." The owner's name is surfaced directly in the copy -- personalized, not generic. The "Request edit access" button sends a notification with the viewer's comment. Figma also shows a persistent "Viewing" indicator in the top bar so the access state is never ambiguous. For free-plan viewers on Organization files, Figma shows a separate nudge: "Upgrade to edit files in this organization" -- correctly distinguishing plan-gating from role-gating, so the user knows whether to contact an admin or upgrade their own account.

### Copy Formulas Quick Reference

These are fill-in-the-blank templates for the most common permission and access copy patterns:

- **Role-blocked action (Linear pattern):** `Only [role]s can [action]. Ask your [role] to [resolution].`
- **Role-blocked action (Figma pattern):** `You're [current role] -- ask [actor] for [target access].`
- **Feature gate headline:** `[User benefit statement] -- available on [Plan name].`
- **Feature gate CTA:** `Upgrade to [Plan]` or `Start [N]-day free trial`
- **Request access:** `Request access` (button that triggers admin notification)
- **Disabled element tooltip:** `[Action] requires [role] access. Ask your [admin / owner] to [resolution].`
- **Admin surfacing:** `Contact [Admin name] at [email] or ask them to update your role in [Settings > Members].`
- **Access pending:** `Access requested. [Admin name] will be notified.`
- **Plan context:** `Available on [Plan A] and [Plan B] plans. See what's included.`
- **Viewing indicator:** `You're viewing this [file / project / workspace].`

## Source

- Babich, N. -- "UX Design for Empty States and Permission Screens," Adobe XD Blog (2019)
- NNGroup -- "Visibility of System Status," https://www.nngroup.com/articles/visibility-system-status/
- Figma -- Design System and permission UX documentation, https://help.figma.com/hc/en-us/articles/360039970673
- Linear -- Changelog and permission model, https://linear.app/docs/roles-and-permissions
- Spotify Design -- "Designing Access States," Spotify Design Blog (2021)
- Podmajersky, T. -- _Strategic Writing for UX_ (2019), Chapter 7: Permissions and Paywall Copy

## Process

1. **Map the full permission matrix for the feature.** List every role the product supports, what each role can do, and what each role cannot do. Write copy for each blocked state explicitly -- do not reuse generic copy across roles. Confirm the permission matrix with the engineering team before writing copy, because permission logic is often more nuanced in implementation than in the product spec.

2. **For each blocked state, define the resolution path.** Determine whether the fix is a role change (route to admin contact or settings link), a plan upgrade (route to billing or upgrade page), or a prerequisite workflow step (route to the prerequisite action). A permission denied state with the wrong resolution path is worse than one with no path, because it sends the user in the wrong direction and erodes trust.

3. **Write the permission message using the pattern: [what is blocked] + [who can unblock it] + [how to reach them or take action].** Confirm that the "who can unblock it" element names a specific role or a specific person (surfaced from the product's data) rather than a generic "your admin." The more specific the resolution path, the higher the self-service resolution rate.

4. **Write the freemium gate using the pattern: [feature preview] + [value headline] + [plan context] + [single CTA].** Review the value headline with a product manager or marketing writer to confirm it names a user outcome, not a product feature name. A/B test the gate copy if the product has sufficient traffic -- small copy changes on feature gates produce measurable conversion differences.

5. **Audit all disabled UI elements for tooltip coverage.** Build a list of every disabled button, link, and interactive element in the product. For each, write a tooltip that names the specific reason for the disabled state (not "not available" but the specific role, state, or plan required). Implement tooltips on hover for desktop and on tap for mobile -- on mobile, a long-press tooltip is the standard pattern for explaining a disabled element.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- Every permission denied state names the role required and provides a specific resolution path (contact admin, request access, upgrade), not just a denial message.
- Upgrade prompts lead with a user benefit statement before mentioning plan name or price, and the benefit is stated in terms of user outcome, not feature name.
- No disabled UI element is left without a tooltip explaining the specific reason for the disabled state -- "not available" is not an acceptable tooltip.
- Permission denied and feature unavailable states use visually and textually distinct copy patterns that correctly identify the cause so users route to the right resolution.
- Users can identify and take the next action (contact admin, request access, upgrade) without leaving the screen where the restriction appears -- no resolution requires navigating to documentation.
- Role-based messages use a consistent voice pattern established in the design system's content guidelines and applied uniformly across all permission states in the product.

## Multi-Tenant and Enterprise Considerations

In enterprise and multi-tenant products, permission denied states must account for the possibility that the user does not know who their admin is. A message that says "Contact your admin" assumes the user has a named admin contact. In organizations where IT manages the workspace, the admin may be an internal IT helpdesk rather than a named colleague. Write permission messages that either surface the admin's name from product data (when available) or provide a fallback: "Contact your workspace administrator. If you don't know who that is, ask your IT department or check Settings > Members."

SSO-enforced workspaces create a specific permission pattern where users may be locked out not because of a role but because of an authentication requirement. "You must sign in with your company SSO to access this workspace" is a permission-adjacent state that requires a different copy pattern: name the identity provider if known ("Sign in with Okta"), explain what will happen after SSO authentication ("You'll rejoin the workspace with your existing role"), and provide a fallback if SSO is not working ("Having trouble? Contact your IT team at it@company.com").

Freemium gates in enterprise contexts often involve organizational plans where an individual contributor cannot upgrade without admin approval. In these cases, "Upgrade to Pro" is the wrong CTA for the IC -- the correct CTA is "Request upgrade" or "Ask your admin to upgrade the workspace plan." Detect the organizational plan context and show the correct path: individual self-serve upgrade when available, admin-request flow when required by the billing model.
