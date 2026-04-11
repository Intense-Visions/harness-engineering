# Confirmation Dialog Copy

> Confirmation dialogs — destructive action writing, consequence clarity, and specific button labels that make irreversibility unmistakable

## When to Use

- Writing delete, remove, cancel, or disconnect confirmation dialogs
- Creating copy for permanent data loss scenarios (account deletion, data purges)
- Writing billing change and subscription cancellation confirmations
- Confirming permission escalations, role changes, or access removals
- Writing copy for any action where the primary button triggers an irreversible state
- NOT for: informational modals that require no decision (see ux-notification-copy)
- NOT for: non-destructive save confirmations where no data is at risk
- NOT for: feature announcements or onboarding prompts (see ux-onboarding-copy)

## Instructions

1. **Title the dialog with the specific action and object — never "Are you sure?"** "Delete Project?" names the action (delete) and the object (project). "Are you sure?" forces the user to remember what they were doing. "Are you sure you want to continue?" is even worse — it names neither the action nor the object. Stripe: "Cancel subscription?" GitHub: "Delete this repository?" Linear: "Archive this issue?" Every confirmation dialog title should be answerable by reading only the title, without reading the body text. The title is a statement of intent; "Are you sure?" is a statement of uncertainty.

2. **Write the body in one sentence that names the object and states reversibility.** "This will permanently delete 'Acme Dashboard' and all its contents. This action cannot be undone." Two sentences, one purpose: consequence and reversibility. Name the specific object (not "the project" but "'Acme Dashboard'"). State whether the action is reversible immediately and unambiguously. Never pad with pleasantries ("We're sorry to see you go"), unnecessary legal language, or hedged consequences ("may result in some data being removed"). The body has one job: make the consequence unmistakable so the user can make an informed decision.

3. **Primary button uses the destructive verb — never "OK" or "Yes."** "Delete project" on the destructive button makes the consequence explicit. "OK" on the same button means the user must remember what they were confirming. "Yes" is even worse — it answers a question ("Are you sure?") when the question itself is the problem. GitHub: "Delete this repository" in red. Stripe: "Cancel subscription" in red. Notion: "Delete page" in red. Linear: "Archive issue" in red. The primary button's label should be derivable from the dialog title: if the title is "Delete project?", the button is "Delete project." The exact match between title and button reinforces the action.

4. **Secondary button offers the safe path with a meaningful label.** "Keep project" (not "Cancel") communicates that the user is choosing to preserve the object, not just dismissing a dialog. "Cancel" is ambiguous — cancel the dialog? Cancel the action? Cancel the subscription? Use the object in the secondary button when possible: "Keep project," "Keep subscription," "Keep my account." When the object is obvious and "Cancel" is unambiguous in context, "Cancel" is acceptable for lower-stakes dialogs. But for data loss scenarios, name the preservation action explicitly: the user should feel that clicking the secondary button is a positive choice, not an escape.

5. **Never use Yes/No — both buttons must describe the outcome.** "Are you sure? [Yes] [No]" requires the user to hold the question in working memory while scanning for the correct button. "Delete project? [Delete project] [Keep project]" is self-contained. Both buttons describe what will happen if clicked, not whether the user consents to the question. GitHub, Stripe, and Notion all use this pattern consistently across every destructive dialog. The test: cover the dialog title with your hand. Can you tell from the button labels alone what clicking each button will do? If not, the labels need rewriting.

6. **Add friction proportional to consequence.** Low-consequence reversible actions: a single confirmation click is sufficient. High-consequence irreversible actions: require the user to type the object name before enabling the destructive button. GitHub's repository deletion requires typing the exact repository name. Heroku's app deletion requires typing the app name. This "type to confirm" pattern serves two purposes: it ensures the user has read the dialog and thought about what they are doing, and it provides a technical safeguard against accidental clicks. The friction level is the product's judgment about how serious a mistake this action would be.

7. **Avoid false urgency — the title's severity should not be amplified by unnecessary warnings.** If the title says "Delete project?" and the body says "This will permanently delete 'Acme Dashboard'," adding a header that says "WARNING" or "DANGER" adds visual noise without new information. The title and body already communicate severity. GitHub does not use warning headers in its repository deletion dialog — the specificity of the content ("All forks, pull requests, issues, and wikis will be deleted") conveys the severity without visual amplification. False urgency habituates users to ignoring severity signals.

8. **For reversible destructive actions, lead with the recovery path.** If a deleted item goes to trash and can be restored for 30 days, say so in the body: "Moved to Trash. You can restore it within 30 days." This transforms a destructive confirmation into a safety net disclosure. Notion's page deletion: "This page and all subpages will be moved to Trash. You can restore them from Trash within 30 days." The reversibility note changes the emotional register from urgent-irrevocable to careful-recoverable. For truly irreversible actions, the body should never suggest reversibility — even hedged language like "this is difficult to undo" understates the reality.

## Details

### Dialog Anatomy

A well-written confirmation dialog has four elements in order:

| Element          | Length        | Pattern                                | Example                                                                              |
| ---------------- | ------------- | -------------------------------------- | ------------------------------------------------------------------------------------ |
| Title            | 3-8 words     | Verb + object + ?                      | "Delete 'Acme Dashboard'?"                                                           |
| Body             | 1-2 sentences | Consequence + reversibility            | "This will permanently delete the project and all 47 issues. This cannot be undone." |
| Primary button   | 2-3 words     | Destructive verb + object, red styling | "Delete project"                                                                     |
| Secondary button | 1-3 words     | Safe preservation verb or "Cancel"     | "Keep project"                                                                       |

Optional elements:

- **Type-to-confirm field:** For irreversible, high-consequence actions. Appears between body and buttons.
- **Checkbox confirmation:** "I understand this cannot be undone." For billing and account changes.
- **Item count:** "Delete 47 issues?" when the scope extends beyond the named object.

### Friction Calibration Matrix

Match the friction level to the severity of the consequence:

| Consequence Level | Data Risk     | Reversible? | Friction Pattern                        | Example                                |
| ----------------- | ------------- | ----------- | --------------------------------------- | -------------------------------------- |
| Low               | None          | Yes         | Single button click                     | "Archive issue" confirmation           |
| Medium            | Some          | Partially   | Confirmation dialog with specific body  | "Remove team member" with body text    |
| High              | Significant   | No          | Dialog + checkbox or typed confirmation | "Delete organization" with checkbox    |
| Critical          | All user data | No          | Dialog + type-to-confirm                | "Delete account" requiring email typed |

Never apply critical-tier friction to low-consequence actions — it trains users to dismiss high-friction patterns. GitHub uses type-to-confirm only for repository, organization, and account deletion — not for closing issues or removing labels.

### Type-to-Confirm Implementation

The type-to-confirm pattern requires the user to type a specific string before the destructive button activates:

- **What to require:** The object's name (repository name, project name, account email).
- **Case sensitivity:** Match exactly — "MyProject" not "myproject" — to ensure intentionality.
- **Instruction copy:** "To confirm deletion, type the project name below:" — clear, imperative, no ambiguity.
- **Placeholder:** Show the exact string required: "Acme Dashboard" as placeholder text.
- **Button state:** Destructive button disabled until the field matches exactly, then enables.

GitHub's implementation is the reference: "To confirm, type the name of your repository:" followed by an input field. The button activates only when the exact repository name is typed. This pattern makes accidental deletion essentially impossible.

### Anti-Patterns

1. **The Generic OK.** "Delete project? [OK] [Cancel]" — the primary button says "OK" instead of "Delete project." The user must remember what they are confirming. On mobile, where buttons are large and muscle memory drives tapping, "OK" is particularly dangerous. Stripe found that replacing "OK" with the specific action verb in destructive dialogs reduced accidental confirmations by a measurable margin. Every confirmation dialog in production should be audited for "OK" as the primary action button.

2. **The Yes/No Dialog.** "Are you sure you want to delete this project? [Yes] [No]" — requires working memory to parse. Cover the question. Which button deletes? Which button saves? Neither label is independently comprehensible. The yes/no pattern forces the user to re-read the question to understand each button, doubling the cognitive load of every destructive action. The fix is always: replace the question with a specific title, replace Yes/No with specific action verbs.

3. **The Wall of Warnings.** A dialog title that says "Are you sure?" followed by three paragraphs of legal language, a bulleted list of consequences, a privacy policy excerpt, and then the buttons. The user abandons reading after the second sentence. Key information — especially irreversibility — gets buried. Confirmation dialogs should be scannable in under 3 seconds. The body must contain exactly one sentence of consequence and one sentence of reversibility (or absence of reversibility). Everything else is noise that reduces the signal of the truly important information.

4. **The Ambiguous Title.** "Remove member?" when the question is whether to remove from a project or from the entire organization. "Delete?" with no object. "Confirm action?" with maximum ambiguity. The title must name both the action and the affected object so the user can answer the dialog title as a yes/no question with full information. "Remove Jordan from Acme Dashboard?" is unambiguous. "Remove member?" requires the user to figure out the scope.

### Real-World Examples

**GitHub's Repository Deletion Dialog.** The gold standard for destructive confirmation copy. Title: "Are you absolutely sure?" — a rare acceptable departure from the recommended pattern because GitHub immediately follows with a specific body that names every consequence. Body: "Unexpected bad things will happen if you don't read this!" — then lists: loss of all forks, issues, wikis, stars, and watching users. Type-to-confirm: "To confirm, type the name of your repository:" followed by an input. The primary button "I understand the consequences, delete this repository" is unusually long but is justified by the severity. GitHub's approach for repositories is deliberately maximalist — it should be uncomfortable to delete a repository.

**Stripe's Subscription Cancellation Dialog.** Stripe: "Cancel subscription?" with body "Your [Plan] plan will be canceled at the end of the current billing period on [date]. You'll lose access to [features]." The specific date and the specific lost features make the consequence tangible. Primary button: "Cancel subscription" in red. Secondary: "Keep my subscription." Stripe's decision to say "Keep my subscription" rather than just "Cancel" on the secondary button is deliberate — it frames the safe choice as a positive action, not a dismissal. The billing date anchors the consequence in time.

**Linear's Issue Archive Confirmation.** Linear uses a minimal confirmation for archiving: "Archive 'Issue #123: Improve dashboard performance'?" with body "Archived issues can be restored from the archive." Primary: "Archive issue." Secondary: "Cancel." The reversibility note ("can be restored") changes the emotional register — this is not a destructive action in the true sense, so the friction level is appropriately low. Linear does not require type-to-confirm for archiving because the consequence is recoverable. The friction calibration is proportional to the actual risk.

**Notion's Page Deletion.** Notion shows: "Delete page?" with body "This page and all of its subpages will be moved to Trash. You can restore them within 30 days." Primary button: "Delete page." Secondary: "Keep it." The "Keep it" secondary button is informal and conversational — appropriate for Notion's warm voice. The 30-day restoration window is stated in the body, not in a tooltip or footnote, because it is the most important piece of information for the user's decision. Notion's deletion is recoverable, so the body leads with the recovery path rather than the loss.

## Source

- NNGroup — "Confirmation Dialog Design" (2022), https://www.nngroup.com/articles/confirmation-dialog/
- Apple Human Interface Guidelines — Alerts, https://developer.apple.com/design/human-interface-guidelines/alerts
- Google Material Design — Dialogs, https://m3.material.io/components/dialogs/guidelines
- Yifrah, K. — _Microcopy: The Complete Guide_ (2017), confirmation and destructive action patterns
- Podmajersky, T. — _Strategic Writing for UX_ (2019), destructive action writing
- GitHub Design — Repository deletion pattern, https://github.com/

### Confirmation Dialogs for Bulk Actions

Bulk actions (delete 47 issues, archive all projects, remove all team members) require confirmation copy that communicates scope, not just action:

- **Title:** Include the count. "Delete 47 issues?" not "Delete issues?" — the scope changes the decision.
- **Body:** List what will be affected. "This will permanently delete 47 open issues and their associated comments."
- **Primary button:** Include the count in the action when possible. "Delete 47 issues" not just "Delete all."
- **Irreversibility:** State it explicitly if any part of the bulk action cannot be undone.

When a bulk action contains both reversible and irreversible items, call out the irreversible portion specifically: "3 of the 47 issues are already linked to external trackers and cannot be recovered after deletion."

## Process

1. Identify the consequence level (low/medium/high/critical) using the friction calibration matrix.
2. Write the title as "Verb + specific object + ?" — confirm it names both the action and what it acts on.
3. Write the body: consequence in one sentence, reversibility (or its absence) in one sentence.
4. Write the primary button label by copying the verb-object from the title.
5. Write the secondary button label as the preservation action ("Keep [object]") or "Cancel" for lower-stakes dialogs.
6. If consequence level is high or critical, add type-to-confirm or checkbox confirmation before the buttons.

### Confirmation Dialog Copy Review Checklist

Before shipping a destructive confirmation dialog, verify each item:

| Check                                   | Pass Criteria                                                 |
| --------------------------------------- | ------------------------------------------------------------- |
| Title names action and object           | Not "Are you sure?" — includes specific verb and object name  |
| Body states consequence in one sentence | Names what will be lost or changed, and is reversible or not  |
| Primary button uses destructive verb    | Not "OK," "Yes," or "Confirm" — mirrors the title's verb-noun |
| Primary button styled destructively     | Red or error color — visually distinct from secondary         |
| Secondary button names the safe path    | "Keep [object]" or "Cancel" — not "No"                        |
| Friction level matches consequence      | Type-to-confirm for critical/irreversible actions             |
| No false urgency headers                | No "WARNING" header when title already conveys severity       |
| Reversible actions say so               | "Moved to Trash. Restore within 30 days." in body text        |

Confirmation dialogs are the last line of defense before irreversible actions. A dialog with "Are you sure? [OK] [Cancel]" provides almost no protection — users dismiss it on reflex. A dialog with "Delete 'Acme Dashboard'? [Delete project] [Keep project]" requires genuine engagement because both buttons are meaningful.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Dialog titles name the specific action and object — no "Are you sure?" without an object.
- Body text states the consequence in one sentence and reversibility in one sentence.
- Primary button uses the destructive verb from the title — no "OK," "Yes," or "Confirm."
- Secondary button names the safe path — "Keep project" or "Cancel," not "No."
- Friction level matches consequence level: type-to-confirm for irreversible, high-consequence actions.
- No false urgency headers ("WARNING," "DANGER") when the title and body already convey severity.
