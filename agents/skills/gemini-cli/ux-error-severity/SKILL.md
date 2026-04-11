# Error Severity Communication

> Error severity communication — calibrating error tone to severity, from field validation to system failure to data loss

## When to Use

- Deciding between warning, error, and critical severity for a message
- Writing data loss or irreversible action warnings that require urgent communication
- Calibrating tone for field validation errors versus system outage messages
- Designing error hierarchies for forms or dashboards with multiple issue types
- Building escalation sequences for trial expiration, quota warnings, and usage alerts
- NOT for: error message content and structure (see ux-error-messages)
- NOT for: destructive action confirmation dialogs (see ux-destructive-action-copy)
- NOT for: notification component selection and urgency calibration (see ux-notification-copy)

## Instructions

1. **Map severity to visual and textual weight — they must always match.** Field validation is calm and instructional. System errors are direct and factual. Data loss warnings are urgent and specific. The text must reinforce what the visual design communicates — using alarming language with a blue informational icon, or casual language with a red critical indicator, creates cognitive dissonance that undermines user trust. A red error badge on a benign "email already subscribed" message trains users to distrust the severity system. Severity levels must be consistent: the same category of error should always read the same way, everywhere in the product.

2. **Use a four-tier severity model: info, warning, error, critical.** Each tier has distinct copy patterns that pair with visual treatment. Info (blue): supplemental context the user should know but that requires no action. Warning (amber): something that needs attention but does not block progress — the user can continue but should be aware. Error (red): something that failed and blocks a specific action — user must take action to proceed. Critical (red + icon + blocking): data loss, security issues, or irreversible states requiring immediate action — the user cannot proceed without addressing this. AWS Console uses all four tiers with consistent styling and copy conventions across hundreds of services.

3. **Match punctuation and sentence structure to severity.** Informational messages use lowercase, periods, and suggest rather than demand. "Your draft is saved automatically." Warnings use direct statements that name the consequence. "This action will affect 47 team members." Error messages use imperative recovery instructions. "Payment failed. Try a different card." Critical messages use imperative sentences and explicit consequence statements. "This will permanently delete all data. This cannot be undone." The register escalates with severity — critical messages should feel heavier in both visual weight and grammatical authority than info messages.

4. **Never escalate minor issues to high severity.** "Password too short" is not a critical error. "File successfully uploaded" is not a warning. Overuse of red styling, all-caps text, warning icons, or alarming language on routine events trains users to ignore real warnings. This is the severity version of the crying wolf effect — when everything looks urgent, nothing is urgent. Linear uses green checkmarks for success, amber for warnings about usage limits, and red only for genuine errors like failed syncs or authentication failures. Reserve the critical tier for events that genuinely warrant it.

5. **For data-loss scenarios, name the specific data at risk.** "Your unsaved changes will be lost" is better than "Are you sure?" but "Your 3 unsaved comments and 1 uploaded image will be permanently deleted" is best. Specificity creates genuine understanding of consequence. Vague warnings like "data may be affected" are routinely dismissed because users cannot assess the actual impact. Figma's autosave conflict dialog names the specific edits from each editor that would be overwritten. GitHub's repository deletion confirmation names the repository and lists what is included: "All forks, pull requests, issues, and wikis will also be deleted."

6. **System errors should communicate timeline when possible.** Users need to know whether to retry now, retry later, or wait for a fix. "We're looking into this" (investigating, indeterminate timeline), "Try again in a few minutes" (transient, short wait), "Service unavailable until 3:00 PM EST" (known resolution window), "Follow @status for updates" (unknown, ongoing monitoring). VS Code's extension marketplace shows degraded-service banners with specific context about what is affected and what the team is doing about it. A system error without a timeline leaves users unable to decide whether to wait, retry, or use an alternative.

7. **Escalate severity language as risk accumulates — not just visual treatment.** Trial expiration warnings should escalate in copy intensity, not just color or icon. "Your trial ends in 14 days" (info) → "Trial ends in 3 days. Upgrade to keep your data" (warning) → "Trial ends tomorrow. Add billing now or lose access" (error) → "Your trial has ended. Export your data before it's deleted in 24 hours" (critical). Stripe, GitHub, and Figma all use this escalation pattern for quota and billing warnings. Each stage increases specificity and urgency in both the visual and copy treatment simultaneously.

8. **Provide recovery actions proportional to severity tier.** Info tier recovery is optional: a "Learn more" link or a dismiss button. Warning tier recovery is a single clear action: "Enable backup" or "Upgrade plan." Error tier recovery is a specific instruction with a direct action button: "Try again" or "Switch card." Critical tier recovery requires explicit, high-friction confirmation: typing the project name, checking a checkbox, or clicking a prominently labeled destructive button. The friction of the recovery action should match the severity of the error — low friction for low severity, high friction for critical severity.

## Details

### Severity Tier Matrix

The tier determines both the visual component (snackbar, banner, modal, inline) and the copy register. Info messages can appear in snackbars. Critical messages require blocking modals with explicit confirmation.

| Tier     | Visual     | Persistence    | Copy Pattern                                 | Example                                       |
| -------- | ---------- | -------------- | -------------------------------------------- | --------------------------------------------- |
| Info     | Blue icon  | Dismissable    | Supplemental statement, lowercase            | "Your account is set to send weekly digests." |
| Warning  | Amber icon | Persistent     | Direct statement of risk, period             | "Enabling this removes 2FA protection."       |
| Error    | Red icon   | Until resolved | Named failure + recovery action              | "Payment failed. Try a different card."       |
| Critical | Red block  | Blocking       | Named consequence + irreversibility + action | "This deletes all 47 projects permanently."   |

### Escalation Patterns

Severity should escalate when frequency or cumulative impact increases — not by time alone. The user's decision not to act is the trigger for escalation:

- **First occurrence:** Info or warning level. "Your trial ends in 14 days."
- **Second occurrence / midpoint:** Warning level with more urgency. "Trial ends in 7 days. Upgrade to keep your data."
- **Final occurrence / threshold:** Error or critical level. "Trial ends tomorrow. Add billing now to prevent data loss."
- **Post-threshold:** Critical with immediate action. "Your access has ended. Export data before deletion in 24 hours."

This pattern is used by Stripe, GitHub, and Figma for trial expiration, usage limits, and quota warnings. Each message escalates in severity, visual treatment, and copy directness. Escalation copy must name the specific consequence at each stage — "data loss," "access lost," "files deleted" — so users understand why escalation is happening.

### Recovery Urgency Mapping

Recovery instructions must match the urgency of the error:

- **Info:** Optional follow-up. "Learn more" or "Manage preferences."
- **Warning:** Clear action with low friction. "Upgrade plan" or "Enable backup."
- **Error:** Specific recovery step. "Try again" or "Use a different method."
- **Critical:** Immediate, high-friction action required. "Confirm deletion by typing the project name below."

Recovery actions at the critical tier should require active confirmation — a checkbox, a typed confirmation, or an explicit button press. Auto-recovery (the system fixes it silently) is acceptable for info and warning tiers. For error and critical tiers, the user must take the recovery action explicitly so they understand what happened and are not surprised by the outcome.

### Severity Calibration Checklist

Before assigning a severity tier, answer these questions:

1. Does this block the user from continuing their primary task? (No → Info or Warning; Yes → Error or Critical)
2. Is there a risk of data loss or irreversible action? (No → Info or Warning; Yes → Critical)
3. Is user action required to resolve? (No → Info; Yes → Warning, Error, or Critical based on blocking status)
4. Will the system recover automatically? (Yes → Info or Warning; No → Error or Critical)
5. Has the user already ignored a lower-severity version of this message? (Yes → escalate one tier)

### Anti-Patterns

1. **The Boy Who Cried Wolf.** Every error styled as critical — red icons, bold text, alarming language — even for routine validation like "password too short" or "email already in use." When the severity design is overused, users stop reading error messages. They click the prominent button to dismiss and move on. Reserve red and blocking patterns for genuine errors. Slack uses this well: routine validation is subtle (red border, small inline text), while account-level issues use prominent banners. If every error looks like an emergency, real emergencies are ignored.

2. **The Calm Catastrophe.** Data loss warnings that use the same casual tone as field validation messages. "You might lose some changes" uses hedged language ("might," "some") for what could be a significant data loss event. GitHub's repository deletion confirmation does the opposite: it names exactly what will be lost, states "This action CANNOT be undone," and requires typing the repository name before proceeding. When data is genuinely at risk, the copy must reflect the stakes unambiguously. Hedging language on critical messages is more dangerous than no warning at all.

3. **The Severity Mismatch.** Red error styling on informational messages like "Email already subscribed (you'll continue to receive emails)" or warnings styled as errors when no action is blocked. The mismatch between visual severity (red) and actual consequence (information, not a failure) confuses users and erodes their ability to calibrate the importance of future messages. Visual severity and copy severity must always be consistent — if the visual says "critical," the copy must name a critical consequence. If the consequence is minor, use a minor-tier visual component.

4. **The Undifferentiated Escalation.** Using only visual treatment to escalate (changing from blue to amber to red) without escalating the copy. "Free plan" in blue, then "Free plan" in amber, then "Free plan" in red — same text, changing color — communicates nothing specific about why the urgency is increasing. Copy must escalate alongside visuals: "14 days remaining" → "3 days remaining. Upgrade to keep access" → "Access ends tomorrow." The user should understand from the copy alone, without the visual treatment, that the situation has become more urgent.

### Real-World Examples

**Figma's Autosave Conflict Resolution.** When two editors modify the same frame simultaneously, Figma shows a warning-tier message: "Someone else made changes to this file. We've created a duplicate to preserve your work." The tone is calm because data is not lost — both versions are preserved. If instead Figma had lost one version, the message would escalate to critical: "Your changes from the last 10 minutes could not be saved due to a conflict." The distinction is consequential: the first requires a choice, the second requires recovery. Figma's severity calibration turns on whether data is lost, not just whether a conflict occurred.

**AWS Console's Tiered Alert System.** AWS uses four distinct alert components across its console: blue informational banners for best-practice suggestions, amber warnings for configuration issues that could cause problems, red error banners for failures requiring attention, and blocking red modals for destructive operations like terminating production instances. Each tier uses consistent language patterns across all AWS services. An error banner always names the failed resource, states the error type, and links to documentation. This consistency means experienced AWS users can triage alerts by visual tier before reading the content — which is the goal of any severity system.

**VS Code's Problem Panel Severity Levels.** VS Code's Problems panel sorts issues by severity (errors > warnings > info) and uses distinct iconography for each. Error messages in the panel name the specific file and line, describe the issue precisely ("Property 'id' does not exist on type 'User'"), and link to the offending code. Warning messages use softer language ("Consider using const instead of let") because they do not block compilation. The panel's sorting by severity means users address blockers first, then non-blocking issues — a natural triage workflow enforced by the severity system itself.

**Stripe's Quota and Billing Escalation.** Stripe's usage-based billing warnings escalate from info (first approach to limit), to warning (near limit), to error (at limit, some features blocked), to critical (over limit, service may be interrupted). Each tier's message escalates in specificity: "Approaching your monthly limit" → "80% of your monthly limit used" → "Monthly limit reached. New charges are being blocked" → "Account suspended. Contact support to restore access." The copy names the specific consequence at each stage, giving merchants the information they need to act proportionally to the urgency.

## Source

- NNGroup — "Indicators, Validations, and Notifications: Pick the Correct Communication Option" (2015), https://www.nngroup.com/articles/indicators-validations-notifications/
- Apple Human Interface Guidelines — Alerts and notifications, https://developer.apple.com/design/human-interface-guidelines/alerts
- Google Material Design — Snackbar, banner, and dialog severity guidelines, https://m3.material.io/components/snackbar/guidelines
- Yifrah, K. — _Microcopy: The Complete Guide_ (2017), severity calibration in error copy
- Podmajersky, T. — _Strategic Writing for UX_ (2019), escalation patterns and severity tiers

### Writing Severity Copy for Different User Expertise Levels

Severity communication must account for the user's expertise with the domain, not just the technical severity of the event:

- **Expert users** in developer tools can tolerate more technical specificity in error copy. "Build failed: TypeScript compilation error in auth.ts:47" is appropriate for a VS Code user. The severity is communicated by the error tier, not by adding alarm language.
- **Non-expert users** in consumer products need consequence-focused language. "Your payment didn't go through" communicates severity through consequence, not technical codes.
- **Mixed audiences** (Stripe, which serves both technical integrators and non-technical business users) need severity tiers that work both ways: the visual tier communicates to non-readers, the copy details communicate to readers.

The severity tier must work visually before the user reads the copy. Experienced users triage by visual tier; new users read. Both pathways must lead to the same understanding of severity.

## Process

1. Classify the error into one of the four severity tiers (info, warning, error, critical) based on whether it blocks action and whether it risks data loss.
2. Select the appropriate visual component for the tier — inline text, snackbar, banner, or blocking modal.
3. Write copy that matches the tier's register: supplemental for info, direct for warning, recovery-focused for error, urgent-specific for critical.
4. Verify the visual styling and copy severity are consistent — no alarming language with calm visual treatment, or vice versa.
5. Check whether the error is part of an escalation sequence and calibrate the copy to the current stage of that sequence.

### Severity Audit: Common Misclassifications

Products commonly misclassify these events — use this table to calibrate:

| Event                           | Common Misclassification | Correct Tier   | Reason                                              |
| ------------------------------- | ------------------------ | -------------- | --------------------------------------------------- |
| Password too short (validation) | Error                    | Field inline   | Not blocking the session, only the submit action    |
| Email already registered        | Error                    | Field inline   | Recoverable — user can log in instead               |
| File exceeds size limit         | Error                    | Warning        | Blocks the specific upload but not other actions    |
| Subscription payment failed     | Warning                  | Error          | Blocks access — requires immediate recovery action  |
| Repository about to be deleted  | Warning                  | Critical       | Irreversible — requires maximum friction            |
| Trial ends in 14 days           | Critical                 | Info           | No immediate action required; 14 days is not urgent |
| Trial ends tomorrow             | Info                     | Error/Critical | Requires action; delay has real consequence         |
| Background sync delay           | Error                    | Info           | Not blocking user; user can continue working        |
| Deployment failed on production | Warning                  | Error          | Production failures require immediate attention     |

Reviewing this table against your product's existing error states will surface the most common misclassifications. The pattern: products over-use red for validation and under-use red for billing and data loss events.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Each error or warning uses one of the four severity tiers with appropriate visual and copy treatment.
- Critical severity messages name the specific data at risk, state irreversibility, and require explicit user action.
- No routine validation error (password too short, field required) uses critical or error styling.
- System errors include timeline information when available (retry timing, status link, incident status).
- Escalation sequences increase severity language at each stage, not only visual treatment.
- Visual severity and copy severity are always consistent — no mismatch between the component used and the language used.
