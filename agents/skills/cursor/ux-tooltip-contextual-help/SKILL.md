# Tooltip and Contextual Help

> Tooltip and contextual help writing — when to use tooltips, what to put in them, and progressive disclosure patterns that educate without interrupting

## When to Use

- Writing tooltip copy for icon buttons, truncated labels, and supplemental information
- Deciding between tooltips, popovers, inline help, and contextual documentation links
- Adding keyboard shortcut hints to toolbar and menu items
- Writing coach mark copy for feature discovery during onboarding
- Adding "Learn more" links and progressive disclosure to complex settings
- NOT for: form field helper text (see ux-form-labels)
- NOT for: error messages and validation feedback (see ux-error-messages)
- NOT for: onboarding wizard step descriptions (see ux-onboarding-copy)

## Instructions

1. **Tooltips add information — they never repeat labels.** If the tooltip copies what the button or label already says, delete the tooltip. A "Send" button with a tooltip that says "Send" provides zero new information and adds a hover interaction for no gain. A "Send" button with a tooltip that says "Send to all project members (⌘↵)" provides new information: the scope and the keyboard shortcut. The test: does removing the tooltip cause the user to lose any information they could not get from the label? If not, remove the tooltip. Tooltips that restate labels add noise to the interface and teach users to ignore tooltips.

2. **Write tooltips in one sentence — 80 characters maximum.** "Merge the current branch into the base branch and close this pull request." is 72 characters — at the limit and clear. Tooltips appear on hover and disappear when the user moves away; there is no time for the user to read a paragraph. If the explanation requires more than one sentence, use a popover with a "Learn more" link instead of a tooltip. Figma's toolbar tooltips are the reference: each one is a single phrase or short sentence — never a paragraph. When writing a tooltip, cut it until it cannot be cut further without losing meaning.

3. **Answer the question the user is about to ask.** The user hovers over an unfamiliar element because they have a question: "What does this do?" or "What is this for?" The tooltip's job is to answer that specific question in the fewest possible words. For icon-only buttons, the question is usually "What action does this trigger?" For truncated text, the question is "What is the full text?" For a beta feature label, the question is "What does this affect?" Write the tooltip as if you know the exact question and are answering it precisely — not providing a general description of the element.

4. **Use tooltips for supplemental information, inline help for required context.** If the user cannot use the feature correctly without knowing the tooltip's content, the information belongs inline — not in a tooltip. Tooltips are for supplemental, nice-to-have information that does not block task completion. Keyboard shortcut hints are perfect tooltip content — helpful but not required. A character limit constraint ("Descriptions are limited to 500 characters") is required context — it belongs below the field as helper text, where it is always visible, not in a tooltip that requires hovering. The distinction is: supplemental = tooltip, required = inline.

5. **Never put critical information only in a tooltip.** Tooltips are invisible to touch and mobile users, inaccessible to users who navigate by keyboard without triggering hover, and often missed by users who work quickly. If the information would cause a mistake when missed (a pricing note, a data limitation, a permission requirement), it must appear in the persistent UI — not only in a tooltip. GitHub's "Private" label on repositories appears as persistent text in the UI; the tooltip adds a definition ("Only you and collaborators can see this") but does not carry the only indication that the repository is private.

6. **Keyboard shortcut tooltips follow "Action (Shortcut)" format.** "Save (⌘S)" not "Press Command+S to save." "Bold (⌘B)" not "Keyboard shortcut: Command+B." The action name comes first — it is what the user needs to know. The shortcut is supplemental context, shown in parentheses because it is helpful but not the primary information. Figma and Linear use this pattern consistently across all keyboard-shortcut tooltips. The shortcut symbol should use the standard OS symbols: ⌘ (Command), ⌥ (Option), ⇧ (Shift), ⌃ (Control) for Mac; Ctrl, Alt, Shift for Windows.

7. **"Learn more" links belong in popovers, not tooltips.** A tooltip with a "Learn more" link requires the user to hover, read, and click without moving away — which is physically difficult because moving toward the link often dismisses the tooltip. Popovers (click-triggered, persistent until dismissed) are the correct container for "Learn more" links, detailed explanations, and supplemental documentation. Stripe uses hover tooltips for simple definitions and click-triggered popovers for billing term explanations that link to documentation. The popover stays open while the user reads and clicks.

8. **Disable tooltips on interactive elements when the element's state conveys the information.** A disabled button with a tooltip explaining why it is disabled ("You need admin permissions to do this") is appropriate — the tooltip provides information the button's state cannot. A fully enabled, clearly labeled button with a tooltip restating the label is not appropriate. GitHub shows "You need push access to this repository" tooltips on disabled merge buttons — the tooltip explains the disabled state, not the button's normal behavior. The tooltip answers the question the user would ask when they encounter the unexpected disabled state.

## Details

### Tooltip vs Popover vs Inline Help Decision

Choose the help surface based on the information's complexity and the user's interaction:

| Surface     | Trigger    | Persistence | Length        | Best For                                      |
| ----------- | ---------- | ----------- | ------------- | --------------------------------------------- |
| Tooltip     | Hover      | On hover    | 1-80 chars    | Simple definitions, keyboard shortcuts        |
| Popover     | Click      | Until close | 1-3 sentences | Multi-sentence explanations + links           |
| Inline help | Persistent | Always      | 1-2 sentences | Required context (constraints, format)        |
| Coach mark  | First use  | One-time    | 1 sentence    | Feature discovery during onboarding           |
| Help link   | Click      | New page    | Full docs     | Complex features requiring full documentation |

### Tooltip Copy by Element Type

Different element types have different tooltip needs:

| Element Type         | Tooltip Content                      | Example                                          |
| -------------------- | ------------------------------------ | ------------------------------------------------ |
| Icon button          | Action name + shortcut if available  | "Archive issue (E)"                              |
| Disabled button      | Reason for disabled state            | "Requires admin permissions"                     |
| Truncated text       | Full untruncated text                | "Acme Dashboard — Q4 Performance Review Final"   |
| Status label         | Definition of the status             | "In review: waiting for at least one approval"   |
| Beta/new label       | What the feature does + limitations  | "Beta: may change before general release"        |
| Metric or data point | Definition + calculation method      | "Weekly active users: unique sessions in 7 days" |
| Avatar / profile     | Full name + role or relevant context | "Jordan Lee, Engineering Lead"                   |

### Progressive Disclosure Hierarchy

Use progressive disclosure to layer information by user need:

1. **Label** — The primary identifier. Always visible. Maximum clarity.
2. **Tooltip** — Supplemental context. Visible on hover. Under 80 characters.
3. **Popover** — Extended explanation. Visible on click. 1-3 sentences + optional link.
4. **Documentation link** — Full reference. Visible in popover or help center. Unlimited length.

Not every element needs all four layers. Simple, self-explanatory labels need no tooltip. Complex features may need all four. The hierarchy ensures users who need more information can find it without overwhelming users who do not.

### Accessibility Requirements for Tooltips

Tooltips have specific accessibility requirements that affect both implementation and copy:

- Tooltips must be accessible via keyboard focus, not only hover — the same content must appear when the element receives keyboard focus.
- Tooltip content must be read by screen readers — implement via `aria-label` (for icon buttons), `aria-describedby` (for additional context), or `title` attribute (deprecated for interactive elements, acceptable for static).
- Never put interactive elements (links, buttons) inside tooltips — use popovers for interactive content.
- Critical information placed only in tooltips fails WCAG 1.1.1 (non-text content) for icon buttons and WCAG 1.3.1 (info and relationships) when the tooltip is the only label.

### Tooltips vs Popovers vs Inline Help: Decision Guide

When writing contextual help, select the surface before writing the copy:

| Question                                            | If Yes → Use    |
| --------------------------------------------------- | --------------- |
| Is the information under 80 characters?             | Tooltip         |
| Does the user need to click a link within the help? | Popover         |
| Is the information required to complete the task?   | Inline help     |
| Does the information persist across the session?    | Inline help     |
| Is it a keyboard shortcut hint?                     | Tooltip         |
| Does the information explain a non-obvious concept? | Popover or link |
| Is this a one-time onboarding explanation?          | Coach mark      |

The decision surface determines the copy format. Tooltip copy must fit on one line — if the first draft doesn't, use a popover. Inline help copy must be persistently useful — if the user would only want it once, use a coach mark. Coach mark copy must reference a specific visible element — if it doesn't, it belongs in documentation.

### Anti-Patterns

1. **The Redundant Tooltip.** The tooltip says exactly what the label says. A "Settings" button with a tooltip that says "Settings." A "Download" link with a tooltip that says "Download." The hover adds nothing — it's like having someone repeat your name back to you. Delete redundant tooltips entirely. They teach users to ignore tooltips, which means important supplemental tooltips are also ignored. Every tooltip should pass the test: does it add information the label does not contain?

2. **The Essay Tooltip.** A tooltip containing three sentences, a bulleted list, or a paragraph. The user hovers to get a quick answer and instead reads a manual excerpt. Long tooltips also cause layout problems — they extend beyond the viewport, obscure nearby content, or are cut off. The fix: use a popover (click-triggered, persistent, scrollable) for any content that requires more than 80 characters. Tooltips are for one-sentence answers; popovers are for explanations.

3. **The Critical-Only-In-Tooltip.** A fee disclosure, a data privacy warning, a billing consequence, or a permission requirement that appears only in a tooltip. When the information is critical — meaning missing it causes a mistake — it must appear in the persistent UI. Tooltips disappear; important information must persist. A common offender: "This action will be billed at $0.05 per query" placed only in a tooltip on an "Execute" button. Users who click without hovering incur charges they did not see. The billing consequence belongs as inline helper text, not a tooltip.

4. **The Jargon Explainer.** Using a tooltip to define internal jargon instead of replacing the jargon with plain language. "WIP" with a tooltip that says "Work in Progress." "MRR" with a tooltip that says "Monthly Recurring Revenue." The better fix is to use plain language in the label itself ("Monthly revenue" instead of "MRR") so no tooltip is needed. Tooltips that define jargon are a sign that the primary label has failed. Use the tooltip copy as the label, and delete the tooltip.

### Real-World Examples

**Figma's Toolbar Tooltips.** Figma's toolbar is icon-only, which makes tooltips essential. Every tool has a tooltip following "Tool name (Shortcut)" format: "Frame (F)," "Rectangle (R)," "Pen (P)," "Text (T)." These tooltips do three things simultaneously: name the tool, confirm its purpose, and teach keyboard shortcuts. The shortcuts are discoverable only through tooltips — Figma uses this as a deliberate progressive disclosure strategy. Users who hover learn the shortcuts; users who never hover can still use the toolbar by clicking icons.

**GitHub's Action Tooltips.** GitHub's PR interface uses tooltips to explain status labels and disabled states. A greyed-out "Merge pull request" button shows "This branch has conflicts that must be resolved" on hover — explaining why the button is disabled without cluttering the visible UI. Status check tooltips show the specific check name and its outcome. GitHub's tooltips are consistently one sentence and answer the question "Why is this in this state?" rather than "What is this element?"

**Stripe Dashboard Hover Cards.** Stripe's Dashboard uses hover cards (a popover variant) rather than pure tooltips for complex metric definitions. Hovering over "MRR" shows a card: "Monthly Recurring Revenue: The normalized, annualized value of all active subscriptions, calculated monthly. Learn how we calculate MRR →." The hover card persists on hover (unlike a tooltip that dismisses when moving toward it), allowing the user to click the "Learn more" link. Stripe uses simple tooltips (one sentence) for simple elements and hover cards for financial metrics that require precise definitions.

**Linear's Keyboard Shortcut Hints.** Linear is a keyboard-first product — nearly every action has a keyboard shortcut. Linear surfaces shortcuts through tooltips that follow "Action (Key)" format: "Create issue (C)," "Archive (E)," "Set priority (P)." The shortcuts are not listed in documentation or a separate shortcut guide — they are discovered entirely through tooltips. This progressive disclosure approach means new users are not overwhelmed by a shortcut reference, while power users naturally discover shortcuts through use. Linear's shortcut coverage in tooltips is comprehensive — the tooltip is the shortcut documentation.

## Source

- NNGroup — "Tooltip Guidelines" (2019), https://www.nngroup.com/articles/tooltip-guidelines/
- Apple Human Interface Guidelines — Tooltips, https://developer.apple.com/design/human-interface-guidelines/tooltips
- Google Material Design — Tooltips, https://m3.material.io/components/tooltips/guidelines
- W3C WCAG 2.1 — Success Criterion 1.1.1: Non-text Content, https://www.w3.org/WAI/WCAG21/Understanding/non-text-content
- Yifrah, K. — _Microcopy: The Complete Guide_ (2017), contextual help and tooltip patterns

## Process

1. Identify whether the element is an icon button, disabled state, truncated text, or supplemental information — select the appropriate tooltip content pattern.
2. Write the tooltip in one sentence, under 80 characters, answering the question the user would ask on hover.
3. Confirm the tooltip adds information not present in the label — delete redundant tooltips.
4. If content requires more than 80 characters or includes a link, use a popover instead.
5. Verify that critical information does not appear only in the tooltip — move required context to inline helper text.

### Tooltip Copy Review Checklist

Before shipping tooltip or contextual help copy, verify each item:

| Check                                         | Pass Criteria                                           |
| --------------------------------------------- | ------------------------------------------------------- |
| Tooltip adds information not in the label     | Removing tooltip causes information loss                |
| Under 80 characters                           | One sentence, fits on one line in the tooltip component |
| Answers the hover question                    | Addresses what a user would ask on hover                |
| No interactive elements inside tooltip        | Links and buttons belong in popovers                    |
| Critical information not tooltip-only         | Required info also appears in persistent UI             |
| Keyboard shortcut format: "Action (Shortcut)" | "Bold (⌘B)" not "Press Command+B to bold"               |
| Accessible via keyboard focus                 | Visible on :focus, not only on :hover                   |
| Popovers used for multi-sentence content      | No tooltip over 80 chars — converted to popover         |

The most impactful tooltip audit action: search for tooltips that duplicate labels and delete them. Redundant tooltips are the most common tooltip failure and the most damaging because they teach users to ignore all tooltips.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Every tooltip adds information not present in the visible label — no redundant restatements.
- Tooltip copy is one sentence, under 80 characters.
- Keyboard shortcut tooltips follow "Action (Shortcut)" format using OS-standard symbols.
- Critical information (billing, permissions, data consequences) appears in persistent UI, not tooltips only.
- Popovers are used instead of tooltips for content requiring more than one sentence or a "Learn more" link.
- Tooltips are accessible via keyboard focus, not only hover (meets WCAG accessibility requirements).
