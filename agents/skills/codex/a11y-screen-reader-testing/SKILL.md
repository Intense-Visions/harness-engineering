# Screen Reader Testing

> Test web applications with screen readers to verify accessible navigation, announcements, and interaction patterns

## When to Use

- Verifying that ARIA attributes produce the expected screen reader output
- Testing custom widgets (tabs, comboboxes, dialogs) for assistive technology support
- Validating focus management in dynamic content (SPA route changes, modals)
- QA testing before release for accessibility compliance
- Learning how screen reader users experience your application

## Instructions

1. **Choose the right screen reader for your target platform.** Test with the browser/screen reader combination your users actually use.

| Screen Reader | Platform  | Browser         | Market Share |
| ------------- | --------- | --------------- | ------------ |
| NVDA          | Windows   | Firefox, Chrome | ~40%         |
| JAWS          | Windows   | Chrome, Edge    | ~30%         |
| VoiceOver     | macOS/iOS | Safari          | ~25%         |
| TalkBack      | Android   | Chrome          | ~5%          |
| Narrator      | Windows   | Edge            | ~3%          |

At minimum, test with NVDA + Firefox and VoiceOver + Safari to cover the majority of screen reader users.

2. **Learn essential VoiceOver commands (macOS).**

```
Enable/Disable:     Cmd + F5
VoiceOver key (VO): Ctrl + Option

Navigate next:      VO + Right Arrow
Navigate previous:  VO + Left Arrow
Activate element:   VO + Space
Read all:           VO + A
Open rotor:         VO + U (navigate landmarks, headings, links, forms)
Next heading:       VO + Cmd + H
Next landmark:      VO + Cmd + (no direct shortcut — use rotor)
```

3. **Learn essential NVDA commands (Windows).**

```
Enable:             Ctrl + Alt + N
NVDA key:           Insert (or Caps Lock if configured)

Navigate next:      Down Arrow (in browse mode)
Navigate previous:  Up Arrow
Activate element:   Enter
Read all:           NVDA + Down Arrow
Elements list:      NVDA + F7 (headings, links, landmarks, form fields)
Next heading:       H
Next landmark:      D
Next form field:    F
Toggle browse/focus: NVDA + Space
```

4. **Follow a testing checklist for each page:**

**Landmarks and structure:**

- [ ] Page has a descriptive `<title>`
- [ ] Landmarks are announced (navigation, main, banner, contentinfo)
- [ ] Heading hierarchy is logical (h1 > h2 > h3, no skipped levels)
- [ ] Headings accurately describe their sections

**Navigation:**

- [ ] Skip link works and moves focus to main content
- [ ] Tab order matches visual order
- [ ] All interactive elements are reachable by keyboard
- [ ] Focus indicator is visible on every focusable element

**Forms:**

- [ ] Every input has an announced label
- [ ] Required fields are announced as required
- [ ] Error messages are announced when they appear
- [ ] Form groups are announced with their legend

**Dynamic content:**

- [ ] Modal dialogs announce their title on open
- [ ] Focus is trapped inside modals
- [ ] Focus returns to trigger on modal close
- [ ] Live region updates are announced (toasts, status changes)
- [ ] SPA route changes announce the new page title or heading

**Images and media:**

- [ ] Informative images have descriptive alt text
- [ ] Decorative images are skipped
- [ ] Videos have captions and audio description

5. **Test common user flows, not just individual elements.** Complete a full task: sign up, make a purchase, change settings. Screen reader issues often emerge in transitions between pages and states.

6. **Listen, do not just read the accessibility tree.** Actually listen to the screen reader output. The accessibility tree shows what is exposed, but the spoken output reveals timing, ordering, and verbosity issues that the tree does not show.

7. **Test with the screen reader's virtual/browse mode and forms/focus mode.** NVDA and JAWS have two modes — browse mode (arrow keys navigate the page) and focus mode (arrow keys interact with form controls). Custom widgets must work in both modes or correctly trigger mode switching.

8. **Document screen reader bugs with reproduction steps.** Include: screen reader + version, browser + version, OS, exact steps, expected announcement, actual announcement.

## Details

**VoiceOver Rotor:** Press VO + U to open the rotor — a navigation menu that lists all headings, links, landmarks, and form controls on the page. This is how screen reader users get an overview of page structure. If your headings and landmarks are poor, the rotor is useless.

**Browse mode vs. focus mode:** In browse mode, the screen reader intercepts keystrokes (H jumps to next heading, F jumps to next form field). In focus mode, keystrokes go to the web page (arrow keys navigate within a dropdown). Interactive widgets (comboboxes, grids) need `role` attributes that trigger automatic mode switching.

**Common issues found during testing:**

- Buttons announced as "clickable" instead of "button" (missing semantic element)
- Images announced by filename (missing `alt`)
- Form inputs announced without labels (missing `htmlFor` association)
- Modal content announced mixed with background content (missing `aria-modal` or `inert`)
- Live region changes not announced (region was added to DOM after content, not before)

**Automated testing complements but does not replace manual testing.** Automated tools catch ~30-40% of accessibility issues (missing alt text, missing labels, contrast violations). Manual screen reader testing catches the remaining 60-70% (poor announcements, confusing navigation, broken focus management).

## Source

https://www.w3.org/WAI/test-evaluate/

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
