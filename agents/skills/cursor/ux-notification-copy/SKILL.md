# Notification Copy

> Notification and alert copy — urgency calibration, actionability, toast vs banner vs modal selection, and writing messages that inform without overwhelming

## When to Use

- Writing toast and snackbar messages for completed or failed actions
- Composing persistent banners for warnings, system status, and billing alerts
- Writing push notifications and in-app notification feed copy
- Creating alert copy for blocking system states (maintenance, outage, permission required)
- Writing notification center entries and email notification subject lines
- NOT for: error messages attached to form fields (see ux-error-messages)
- NOT for: confirmation dialogs for destructive actions (see ux-confirmation-dialogs)
- NOT for: success feedback that follows a specific user action (see ux-success-feedback)

## Instructions

1. **Match notification type to urgency level — the component choice is a copy decision.** Toast for completed actions and low-urgency info (auto-dismisses in 3-5 seconds). Banner for persistent warnings and system status (stays until dismissed or resolved). Modal for blocking system states that require immediate action. Using a toast for a billing failure that requires action — and having it auto-dismiss — means the user misses critical information. Using a modal for a routine "changes saved" message interrupts the user unnecessarily. The component type is the first line of urgency communication; the copy reinforces it.

2. **Front-load the subject — actor, then action.** "Jordan commented on your PR" not "You have a new notification from Jordan." "Deployment failed" not "There was a failure in your deployment." "Payment of $49.99 succeeded" not "Your recent payment transaction has been successfully processed." The first word of a notification is the most important word — it determines whether the user reads the rest. In a notification list, ten notifications all starting with "You have" are indistinguishable at a glance. Ten notifications starting with different actors or objects are scannable.

3. **Include one action maximum — never two.** "Reply" or "View" — not both. When a notification offers two actions of equal weight, the user is paralyzed: which one do they need? Two actions also increase the risk of accidental taps on mobile. If two actions are necessary, make the primary action a button and the secondary action a plain text link — the visual hierarchy communicates the priority. Slack's notifications offer "Reply" as the only action. Linear's notifications offer "Open issue" as the only action. The constraint forces the writer to decide: what is the single most important thing the user might want to do?

4. **Calibrate length to dismissal behavior.** Toasts auto-dismiss in 3-5 seconds — the user reads approximately 7-10 words in that window. Keep toast copy to 40-80 characters. Banners are persistent — the user can read more. Keep banner copy to 80-120 characters for the primary message, with a "Learn more" link for detail. Push notifications have a subject line (40-50 chars) and a body (100-120 chars) — front-load the most critical information in the subject. The character limit is a function of the time the user has to read the notification, not an arbitrary constraint.

5. **Never say "notification" in a notification — it is redundant.** "You have a new notification" is a notification telling the user they have a notification. "Jordan commented on your pull request" is a notification. "New message from Jordan: 'Can you review the PR?'" is a notification. The word "notification" adds nothing to the message and wastes space in a character-constrained format. The same principle applies to "alert," "message," and "update" — lead with the actual content, not the content category.

6. **Name the actor in social and activity notifications.** "Jordan" not "Someone." "The Acme team" not "A team." "You" only when there is no other actor (system-generated, user-initiated). Social notifications that anonymize the actor are less actionable and less engaging. GitHub names the specific user who commented, reviewed, or merged. Slack names the specific person who messaged or reacted. Linear names the assignee or commenter. The name creates context for the notification's relevance — "Jordan commented" is more actionable than "Someone commented" because the user knows if Jordan's opinion matters to them right now.

7. **Use past tense for completed events, present for ongoing, future for upcoming.** "Deployment completed" (past, done). "Deployment in progress — 2 of 4 steps complete" (present, active). "Deployment scheduled for 3:00 PM EST" (future, upcoming). The tense communicates the state without additional words. "Your deployment is complete" wastes "is" when "Deployment complete" communicates the same state. "There has been a completion of the deployment process" is the robot-voice version of "Deployment complete." Match tense to state.

8. **For actionable notifications, make the action obvious without requiring the user to open the source.** "Jordan requested a review on PR #247: Fix authentication timeout" gives enough context that the user can decide whether to act without opening GitHub. "Jordan requested review" requires opening GitHub to understand what to review. "New request" requires two clicks to understand. The notification should answer: who, what, and enough context to decide whether to act now. The action button provides the "act now" path; the copy provides the "should I act now?" context.

## Details

### Notification Type Decision Matrix

Select the notification type based on urgency and whether the user can safely continue:

| Type           | Urgency    | Dismissal      | Max Length | Action Required? | Example                               |
| -------------- | ---------- | -------------- | ---------- | ---------------- | ------------------------------------- |
| Toast          | Low        | Auto (3-5s)    | 80 chars   | Optional         | "Changes saved"                       |
| Snackbar       | Low-medium | Auto + dismiss | 120 chars  | One optional     | "Message sent. Undo"                  |
| Banner         | Medium     | Manual         | 160 chars  | One recommended  | "Your trial ends in 3 days. Upgrade." |
| Alert banner   | High       | Manual         | 200 chars  | One required     | "Payment failed. Update billing."     |
| Blocking modal | Critical   | Action only    | Full modal | Required         | "Your account has been suspended."    |

### Notification Copy Patterns by Category

**Completed action (success toast):** Past tense, object named. "Issue #247 closed." "Report exported." "Team member invited." Never: "Done!" or "Success!" — these are too vague to be meaningful.

**Social activity:** Actor + action + object. "Jordan commented on your PR." "The Acme team assigned you to Issue #42." "Sarah approved your expense report." Name the actor first.

**System alert:** System + consequence + action. "Deployment failed. View logs →." "Sync paused. Check your connection." "Storage 90% full. Manage files →."

**Scheduled event:** Time + event. "Team standup in 15 minutes." "Invoice due in 3 days." "Subscription renews on April 30."

**Billing:** Specific amount + action. "Payment of $149 failed. Update card →." "Your plan renews for $49 on May 1." Always include the dollar amount — "payment failed" without an amount is less actionable than "payment of $149 failed."

### Push Notification Subject Lines

Push notifications are read in a notification tray without opening the app — the subject line must be independently comprehensible:

| Category | Pattern                 | Example                                 |
| -------- | ----------------------- | --------------------------------------- |
| Social   | Actor + action + object | "Jordan commented on your pull request" |
| Reminder | Event + time            | "Team standup starts in 10 minutes"     |
| Alert    | System + consequence    | "Deployment failed on acme-api"         |
| Billing  | Amount + action needed  | "$149 payment failed — action required" |
| Progress | Operation + status      | "Your export is ready to download"      |

### Anti-Patterns

1. **The Notification Notification.** "You have a new notification from Jordan about your project." Every word except "Jordan" and "project" is structural overhead. The notification says it is a notification — obvious — that it's new — obvious — from a person — obvious. The content is "Jordan did something to your project." What did Jordan do? What project? These are the words that belong in the notification. The fix: delete every word that describes the notification format rather than the notification content.

2. **The Action Overload.** A notification with three or four action buttons: "Reply," "Mark as read," "Snooze," "View in app." On mobile, four action buttons on a notification makes tapping the correct one difficult. In a notification feed, four buttons per notification creates visual noise that makes scanning impossible. The fix: one primary action button. Surface secondary actions in the full notification view, not in the notification itself.

3. **The Urgency Inflation.** Marking routine events as urgent using all-caps, exclamation points, or "URGENT:" prefixes. "URGENT: Jordan commented on your issue" — Jordan's comment is not an emergency. Urgency inflation trains users to ignore urgency signals, which means real urgent notifications (payment failure, security alert) are ignored alongside the inflated ones. Reserve urgency markers for genuinely time-sensitive events: "ACTION REQUIRED: Payment failed — account suspended in 24 hours."

4. **The Vague Alert.** "Something happened to your project." "There's a problem with your account." "An error occurred." The user cannot act on a vague alert. They must open the app, navigate to the relevant section, and investigate what happened — and by then, the notification has already failed at its primary job (giving the user enough context to decide whether to act). Every notification must name the specific subject, action, and consequence. "Payment failed" is a vague alert. "Payment of $149.00 declined — update your billing info to keep your subscription" is actionable.

### Real-World Examples

**GitHub's PR Notification System.** GitHub's notifications follow a strict format: actor + action + context. "Jordan Doe reviewed your pull request: Fix authentication timeout in auth.ts." The reviewer's full name, the action (reviewed), the PR title (which adds context), and the file context. In the notification feed, each notification is independently scannable — users can triage 20 PR notifications in seconds because each one names a different actor and action. GitHub's mobile push notifications truncate the PR title but always lead with the actor's name: "Jordan Doe reviewed your PR."

**Slack's Message Notifications.** Slack's in-app notifications are minimal and conversational: "Jordan: Can you review this before the meeting?" — sender name, message content. No preamble, no "You have a new message from," no "In #engineering." The channel context is provided visually (the notification appears under the channel or DM), so the copy does not need to repeat it. Slack's push notifications add the channel for non-DM messages: "Jordan in #engineering: Can you review this before the meeting?" — adding exactly the context needed for a push notification where visual context is absent.

**Linear's Issue Assignment Notifications.** Linear's notifications follow: "Jordan assigned you to: #247 Fix authentication timeout." Assignee, action, issue number, issue title. The issue number allows users who track by number to identify the issue without opening it. The issue title provides enough context to prioritize. Linear's notification feed is sorted by recency and can be filtered by type (assigned, mentioned, commented) — the copy format is consistent across types, making the feed scannable by the leading action word.

**Stripe's Payment Alert System.** Stripe's payment failure notifications balance technical precision with human language: "A payment of $149.00 from Acme Corp failed. The card was declined. Update your payment method to keep Acme Corp's subscription active." Three sentences: amount and payer (context), reason (cause), consequence and action (next step). Stripe names the specific customer, the specific amount, and the specific consequence — which is critical for merchants who process multiple customers' payments simultaneously. Vague "payment failed" notifications are useless for a merchant with 1,000 active subscriptions.

## Source

- NNGroup — "Mobile Notifications: 8 Design Guidelines" (2019), https://www.nngroup.com/articles/mobile-notifications/
- NNGroup — "When to Use Which User-Experience Research Methods" (2014), selecting feedback surfaces by urgency
- Wroblewski, L. — _Mobile First_ (2011), notification and alert patterns in constrained-screen contexts
- Apple Human Interface Guidelines — Notifications, https://developer.apple.com/design/human-interface-guidelines/notifications
- Google Material Design — Snackbars and banners, https://m3.material.io/components/snackbar/guidelines
- Yifrah, K. — _Microcopy: The Complete Guide_ (2017), notification and alert copy patterns
- Podmajersky, T. — _Strategic Writing for UX_ (2019), notification taxonomy and copy frameworks

### Notification Copy for Email Subjects

Email notifications extend the in-app notification's reach. Subject lines must function without opening the email:

- **Actor first:** "Jordan Lee requested your review on PR #247" not "New pull request review request"
- **Specificity over brevity when specificity is actionable:** "Payment of $149 failed — update billing" is better than "Payment issue" for email subjects
- **Preheader text:** The preview text after the subject line should add context, not repeat: Subject "Jordan requested review", preheader "Fix authentication timeout — PR ready for your input"
- **Avoid:** "You have a notification," "Action required" (without specifying the action), "Important update" (without specificity)

Email notification subjects follow the same actor-first, specificity-over-brevity rules as in-app notifications, with the additional constraint that subjects compete with dozens of other emails in an inbox — they must be distinguishable at a glance.

## Process

1. Select the notification type (toast, banner, modal, push) based on urgency and whether the user can safely continue.
2. Write the copy with actor-first structure: who did what to which object.
3. Trim to the character limit for the selected notification type (toast: 80 chars, banner: 160 chars).
4. Include one action maximum — identify the single most important thing the user might want to do.
5. Verify tense matches state: past for completed, present for ongoing, future for upcoming.

### Notification Copy Review Checklist

Before shipping notification copy, verify each item:

| Check                                 | Pass Criteria                                                |
| ------------------------------------- | ------------------------------------------------------------ |
| Component type matches urgency        | Toast = low, banner = medium, modal = blocking               |
| Actor-first structure                 | Subject/actor is the first word, not structural preamble     |
| Length within limit                   | Toast ≤80 chars, banner ≤160 chars, push subject ≤50 chars   |
| One action maximum                    | Single primary action button or link                         |
| No redundant category word            | "Notification," "alert," "message" not as first word         |
| Correct tense                         | Past for completed, present for ongoing, future for upcoming |
| Social notifications name the actor   | Person's name used, not "Someone" or "A user"                |
| Billing notifications name the amount | "$149" not "a payment" — specific amounts always             |

Notification copy failure has a compounding effect: poor notifications train users to dismiss all notifications without reading, which means critical notifications (payment failures, security alerts) are also dismissed. Investment in notification copy quality pays back in user trust and actionability of the entire notification system.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Notification component type matches urgency level — toasts for low urgency, banners for medium, modals for blocking.
- Copy leads with the actor or subject, not a structural preamble ("You have a new...").
- No notification exceeds the character limit for its component type.
- Notifications include at most one action — the single most important next step.
- "Notification," "alert," "message," and "update" do not appear as the first word of notification copy.
- Tense matches the state: past tense for completed events, present for ongoing, future for upcoming.
