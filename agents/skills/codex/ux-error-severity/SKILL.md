# Error Severity Communication

> Error severity communication — calibrating error tone to severity, from field validation to system failure to data loss

## When to Use

- Deciding between warning, error, and critical severity for a message
- Writing data loss or irreversible action warnings that require urgent communication
- Calibrating tone for field validation errors versus system outage messages
- Designing error hierarchies for forms or dashboards with multiple issue types
- NOT for: error message content and structure (see ux-error-messages)
- NOT for: destructive action confirmation dialogs (see ux-destructive-action-copy)

## Instructions

1. **Map severity to visual and textual weight.** Field validation is calm and instructional. System errors are direct and factual. Data loss warnings are urgent and specific. The text must reinforce what the visual design communicates -- using alarming language with a blue informational icon, or casual language with a red critical indicator, creates cognitive dissonance that undermines user trust. Severity levels must be consistent: the same category of error should always read the same way, everywhere in the product.

2. **Use a four-tier severity model: info, warning, error, critical.** Each tier has distinct copy patterns that pair with visual treatment. Info (blue): supplemental context the user should know. Warning (amber): something that needs attention but does not block progress. Error (red): something that failed and blocks a specific action. Critical (red + icon + blocking): data loss, security issues, or irreversible states requiring immediate action. AWS Console uses all four tiers with consistent styling and copy conventions across hundreds of services.

3. **Match punctuation and sentence structure to severity.** Informational messages use lowercase, periods, and suggest rather than demand. "Your draft is saved automatically." Warnings use direct statements. "This action will affect 47 team members." Critical messages use imperative sentences and explicit consequence statements. "This will permanently delete all data. This cannot be undone." The register escalates with severity -- critical messages should feel heavier in both visual weight and grammatical authority.

4. **Never escalate minor issues to high severity.** "Password too short" is not a critical error. "File successfully uploaded" is not a warning. Overuse of red styling, all-caps text, warning icons, or alarming language on routine events trains users to ignore real warnings. This is the severity version of the crying wolf effect -- when everything looks urgent, nothing is urgent. Linear uses green checkmarks for success, amber for warnings about usage limits, and red only for genuine errors like failed syncs.

5. **For data-loss scenarios, name the specific data at risk.** "Your unsaved changes will be lost" is better than "Are you sure?" but "Your 3 unsaved comments and 1 uploaded image will be permanently deleted" is best. Specificity creates genuine understanding of consequence. Vague warnings like "data may be affected" are routinely dismissed because users cannot assess the actual impact. Figma's autosave conflict dialog names the specific edits from each editor that would be overwritten.

6. **System errors should communicate timeline when possible.** Users need to know whether to retry now, retry later, or wait for a fix. "We're looking into this" (investigating), "Try again in a few minutes" (transient, short), "Service unavailable until 3:00 PM EST" (known window), "Follow @status for updates" (unknown, monitoring). VS Code's extension marketplace shows degraded-service banners with specific context about what is affected and what the team is doing about it.

## Details

### Severity Tier Matrix

| Tier     | Visual     | Persistence    | Copy Pattern                                 | Example                                       |
| -------- | ---------- | -------------- | -------------------------------------------- | --------------------------------------------- |
| Info     | Blue icon  | Dismissable    | Supplemental statement, lowercase            | "Your account is set to send weekly digests." |
| Warning  | Amber icon | Persistent     | Direct statement of risk, period             | "Enabling this removes 2FA protection."       |
| Error    | Red icon   | Until resolved | Named failure + recovery action              | "Payment failed. Try a different card."       |
| Critical | Red block  | Blocking       | Named consequence + irreversibility + action | "This deletes all 47 projects permanently."   |

The tier determines both the visual component (snackbar, banner, modal, inline) and the copy register. Info messages can appear in snackbars. Critical messages require blocking modals with explicit confirmation.

### Escalation Patterns

Severity should escalate when frequency or cumulative impact increases:

- **First occurrence:** Info or warning level. "Your trial ends in 14 days."
- **Second occurrence / midpoint:** Warning level with more urgency. "Trial ends in 7 days. Upgrade to keep your data."
- **Final occurrence / threshold:** Error or critical level. "Trial ends tomorrow. Add billing now to prevent data loss."

This pattern is used by Stripe, GitHub, and Figma for trial expiration, usage limits, and quota warnings. Each message escalates in severity, visual treatment, and copy directness. The user's decision not to act is the trigger for escalation -- not the passage of time alone.

### Recovery Urgency Mapping

Recovery instructions must match the urgency of the error:

- **Info:** Optional follow-up. "Learn more" or "Manage preferences."
- **Warning:** Clear action with low friction. "Upgrade plan" or "Enable backup."
- **Error:** Specific recovery step. "Try again" or "Use a different method."
- **Critical:** Immediate, high-friction action required. "Confirm deletion by typing the project name below."

Recovery actions at the critical tier should require active confirmation -- a checkbox, a typed confirmation, or an explicit button press. Auto-recovery (the system fixes it silently) is acceptable for info and warning tiers. For error and critical tiers, the user must take the recovery action explicitly.

### Anti-Patterns

1. **The Boy Who Cried Wolf.** Every error styled as critical -- red icons, bold text, alarming language -- even for routine validation like "password too short" or "email already in use." When the severity design is overused, users stop reading error messages. They click the prominent button to dismiss and move on. Reserve red and blocking patterns for genuine errors. Slack uses this well: routine validation is subtle (red border, small inline text), while account-level issues use prominent banners.

2. **The Calm Catastrophe.** Data loss warnings that use the same casual tone as field validation messages. "You might lose some changes" uses hedged language ("might," "some") for what could be a significant data loss event. GitHub's repository deletion confirmation does the opposite: it names exactly what will be lost, states "This action CANNOT be undone," and requires typing the repository name before proceeding. When data is genuinely at risk, the copy must reflect the stakes unambiguously.

3. **The Severity Mismatch.** Red error styling on informational messages like "Email already subscribed (you'll continue to receive emails)" or warnings styled as errors when no action is blocked. The mismatch between visual severity (red) and actual consequence (information, not a failure) confuses users and erodes their ability to calibrate the importance of future messages. Visual severity and copy severity must always be consistent.

### Real-World Examples

**Figma's Autosave Conflict Resolution.** When two editors modify the same frame simultaneously, Figma shows a warning-tier message: "Someone else made changes to this file. We've created a duplicate to preserve your work." The tone is calm because data is not lost -- both versions are preserved. If instead Figma had lost one version, the message would escalate to critical: "Your changes from the last 10 minutes could not be saved due to a conflict." The distinction is consequential: the first requires a choice, the second requires recovery.

**AWS Console's Tiered Alert System.** AWS uses four distinct alert components across its console: blue informational banners for best-practice suggestions, amber warnings for configuration issues that could cause problems, red error banners for failures requiring attention, and blocking red modals for destructive operations like terminating production instances. Each tier uses consistent language patterns across all AWS services. An error banner always names the failed resource, states the error type, and links to documentation. This consistency means experienced AWS users can triage alerts by visual tier before reading the content.

**VS Code's Problem Panel Severity Levels.** VS Code's Problems panel sorts issues by severity (errors > warnings > info) and uses distinct iconography for each. Error messages in the panel name the specific file and line, describe the issue precisely ("Property 'id' does not exist on type 'User'"), and link to the offending code. Warning messages use softer language ("Consider using const instead of let") because they do not block compilation. The panel's sorting by severity means users address blockers first, then non-blocking issues -- a natural triage workflow enforced by the severity system.

## Source

- NNGroup — "Indicators, Validations, and Notifications: Pick the Correct Communication Option" (2015), https://www.nngroup.com/articles/indicators-validations-notifications/
- Apple Human Interface Guidelines — Alerts and notifications, https://developer.apple.com/design/human-interface-guidelines/alerts
- Google Material Design — Snackbar, banner, and dialog severity guidelines, https://m3.material.io/components/snackbar/guidelines
- Yifrah, K. — _Microcopy: The Complete Guide_ (2017), severity calibration in error copy

## Process

1. Classify the error into one of the four severity tiers (info, warning, error, critical) based on whether it blocks action and whether it risks data loss.
2. Select the appropriate visual component for the tier -- inline text, snackbar, banner, or blocking modal.
3. Write copy that matches the tier's register: supplemental for info, direct for warning, recovery-focused for error, urgent-specific for critical.
4. Verify the visual styling and copy severity are consistent -- no alarming language with calm visual treatment, or vice versa.
5. Check whether the error is part of an escalation sequence and calibrate the copy to the current stage of that sequence.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- Each error or warning uses one of the four severity tiers with appropriate visual and copy treatment.
- Critical severity messages name the specific data at risk, state irreversibility, and require explicit user action.
- No routine validation error (password too short, field required) uses critical or error styling.
- System errors include timeline information when available (retry timing, status link, incident status).
- Escalation sequences increase severity language at each stage, not only visual treatment.
