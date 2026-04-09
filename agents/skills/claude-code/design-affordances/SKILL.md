# Affordances

> Perceived actionability — signifiers, constraints, mappings (Don Norman), flat design's affordance problem, touch targets, hover states as affordance

## When to Use

- Designing interactive elements (buttons, links, form controls, draggable items) that must communicate their actionability
- Auditing an interface where users are confused about what is clickable and what is static
- Evaluating a flat or minimal design for sufficient interactive cues
- Building touch interfaces where target sizes directly affect usability
- Designing drag-and-drop, resize, or gesture-based interactions that need discoverability
- Reviewing a design system's interactive component library for consistent affordance language
- Diagnosing user testing results where participants could not find interactive elements
- Adapting a desktop interface for touch or vice versa

## Instructions

1. **Distinguish affordances from signifiers.** Don Norman clarified this in the 2013 revision of _The Design of Everyday Things_: an affordance is a relationship between an object and an agent — a button affords pressing whether or not you can see it. A signifier is a perceivable indicator of the affordance — the raised shape, the color, the label that tells you "this is pressable." In digital design, you cannot manipulate true affordances (pixels do not physically press), so you are always designing signifiers that communicate perceived affordances. Every interactive element needs at least one signifier.

2. **Apply the Signifier Stack for interactive elements.** Each interactive element should carry multiple layered signifiers for redundancy. The stack, in order of strength:

   | Signifier Type  | Example                                          | Strength |
   | --------------- | ------------------------------------------------ | -------- |
   | Shape           | Rounded rectangle suggests tappability           | High     |
   | Color contrast  | Blue text among black text signals linkhood      | High     |
   | Depth/elevation | Shadow beneath a card suggests liftability       | Medium   |
   | Cursor change   | `pointer` cursor on hover signals clickable      | Medium   |
   | Label/icon      | "Submit" text, pencil icon for edit              | High     |
   | State change    | Background shift on hover confirms interactivity | Medium   |
   | Motion          | Subtle pulse drawing attention to CTA            | Low      |

   A well-designed button uses at least 3: shape (pill/rounded rect), color (distinct from body text), and label (action verb). Stripe's primary buttons use 5: shape (rounded rectangle), color (brand purple fill), label ("Pay $49.00"), depth (subtle shadow), and cursor (pointer on hover).

3. **Respect Norman's four principles: affordance, signifier, constraint, mapping.**
   - **Affordance:** What actions are possible? A text input affords typing. A slider affords dragging.
   - **Signifier:** How does the user discover the affordance? The blinking cursor in an input. The handle on a slider.
   - **Constraint:** What prevents incorrect actions? A date picker that grays out invalid dates. A slider that stops at min/max bounds. A dropdown that limits selection to valid options.
   - **Mapping:** How does the control relate spatially to its effect? A vertical slider that controls volume should move up for louder (natural mapping). A set of light switches should match the spatial layout of the lights they control. In digital UI, the most common mapping failure is placing a control far from the content it affects.

4. **Size touch targets to minimum 44x44 CSS pixels (48x48dp on Android).** Apple's Human Interface Guidelines specify 44pt minimum. Material Design specifies 48dp minimum with the touch target extending beyond the visual element if needed. These are not suggestions — they are ergonomic requirements based on the average adult fingertip contact area of 8-10mm. Common violations: icon-only buttons at 24x24px (too small by half), inline text links in mobile views (target height equals line-height of 16-20px, far below minimum), close/dismiss buttons in the corner of modals (often 20x20px).

5. **Design hover states as progressive disclosure of affordance.** Desktop hover is a privileged moment: the user has expressed interest but not commitment. Use it to reveal additional information about the affordance. GitHub's repository file list uses hover to reveal the "last commit message" tooltip and a subtle background highlight — the hover state teaches "this row is interactive and will take you somewhere." Stripe's pricing cards use hover to elevate the card (shadow increases) and reveal a "Select Plan" button — the hover progressively discloses the primary action.

6. **Solve flat design's affordance crisis with reliable signifier patterns.** The shift from skeuomorphic to flat design (2012-2015) stripped most depth-based signifiers. The result: users cannot distinguish interactive from decorative elements. Research by Nielsen Norman Group (2015) found that users spent 22% more time on flat designs trying to determine what was clickable. The solutions that work:
   - **Consistent color coding:** Reserve one color exclusively for interactive elements. All links, buttons, and tappable items use that color. Nothing non-interactive uses it. Material Design reserves primary brand color for interactive elements only.
   - **Underline links in body text.** Without underlines, links in paragraphs are indistinguishable from bold or colored text. GitHub underlines all links in markdown-rendered content. Medium does not underline links and user testing consistently shows link discovery failures.
   - **Container signifiers for buttons.** Text-only buttons (no fill, no border) are the weakest button signifier. Outlined buttons add a border. Filled buttons add background color. Use the hierarchy: filled for primary, outlined for secondary, text-only for tertiary — but never use text-only buttons as the sole action in a view.

7. **Map controls to their effects through spatial proximity and visual connection.** A toggle that controls a feature should be adjacent to that feature's description — not in a separate settings panel three screens away. When spatial proximity is impossible (control panel affecting a canvas, remote settings), use visual connection: highlight the affected area when the control is hovered or focused. Figma draws a blue highlight on the canvas element when you hover its corresponding layer in the sidebar — the mapping is made explicit through visual connection.

8. **Use constraints to prevent errors, not just signal them.** A constraint that grays out an invalid option is better than an error message after selection. A date picker that only shows valid dates is better than a text input that rejects invalid dates after typing. Airbnb's date picker disables check-in dates before today and check-out dates before the selected check-in — the constraint is visible in the UI, preventing the error entirely. The strongest affordance design makes the wrong action impossible rather than merely discouraged.

## Details

### The Affordance Spectrum

Affordances exist on a spectrum from obvious to hidden:

**Explicit affordances** are immediately apparent. A button labeled "Submit" with a filled background, rounded corners, and a pointer cursor is explicitly interactive. No discovery required. These are appropriate for primary actions, critical controls, and first-time user experiences.

**Pattern-based affordances** rely on learned conventions. A hamburger menu icon (three horizontal lines) affords opening a navigation menu — but only because users have learned this convention. A user encountering it for the first time would have no idea. Pattern-based affordances are efficient for experienced users but must be paired with explicit alternatives for novices. GitHub's repository page uses pattern-based affordances extensively: the code icon tab, the issues counter badge, the fork button — all rely on learned GitHub conventions.

**Hidden affordances** are not discoverable without exploration. Right-click context menus, long-press actions, keyboard shortcuts, and gesture-based interactions are hidden. They are powerful for expert users but must never be the only path to a function. Every hidden affordance must have an explicit or pattern-based equivalent. Linear's keyboard shortcuts (C to create, X to select) are hidden affordances — but every action is also available through visible menu items and buttons.

**Negative affordances (anti-affordances)** communicate "you cannot do this." Disabled buttons, grayed-out options, and `not-allowed` cursors are negative affordances. They are essential for preventing errors and must be visually distinct from both active affordances and static content. The visual hierarchy: active (full color, pointer cursor) > static (body color, default cursor) > disabled (muted color, not-allowed cursor).

### Touch Target Geometry

Touch targets involve two separate measurements: the **visual target** (what the user sees) and the **hit area** (the actual tappable region). The hit area must meet minimum size requirements even when the visual target is smaller. A 24x24px icon button must have a 44x44px (or 48x48dp) hit area — achieved with padding, an invisible expanded tap zone, or CSS `min-height`/`min-width` on the interactive wrapper.

**Spacing between touch targets** matters as much as size. Two 48dp buttons placed 2dp apart will cause constant mis-taps. Minimum spacing between touch targets: 8dp (Material Design). Adjacent targets should ideally have 12-16dp separation. Fitts's Law governs this: the time to acquire a target is proportional to the distance divided by the target width. Larger, more spaced targets are faster to hit.

**Edge and corner targets** are special cases. Targets at screen edges benefit from the "infinite edge" effect — the user can throw their cursor/finger toward the edge without precision, because the edge stops the movement. macOS exploits this with the menu bar at the top edge and the Dock at the bottom edge. Targets in corners benefit even more — two infinite edges converge. This is why Windows places the Start button at the bottom-left corner and Close button at the top-right corner. In mobile design, bottom-edge targets are easiest to reach with the thumb (Hoober's thumb zone research, 2017).

### Cursor States as Signifier System

On desktop, the cursor is one of the strongest affordance signifiers because it changes dynamically based on context:

| Cursor      | CSS Value             | Communicates                                |
| ----------- | --------------------- | ------------------------------------------- |
| Pointer     | `cursor: pointer`     | This element is clickable                   |
| Text        | `cursor: text`        | You can select or edit text here            |
| Grab        | `cursor: grab`        | This element can be dragged                 |
| Grabbing    | `cursor: grabbing`    | You are currently dragging this element     |
| Col-resize  | `cursor: col-resize`  | This boundary can be dragged horizontally   |
| Not-allowed | `cursor: not-allowed` | This action is not available                |
| Progress    | `cursor: progress`    | The system is working, but you can interact |
| Wait        | `cursor: wait`        | The system is working, please wait          |

A common violation: using `cursor: pointer` on non-interactive elements (decorative cards, static text, non-linked images). This teaches users that the pointer cursor is unreliable, undermining the entire signifier system. Reserve `pointer` exclusively for elements that do something on click.

### Mappings in Digital Interfaces

**Natural mapping** aligns the spatial arrangement of controls with the spatial arrangement of their effects. A volume slider that moves right to increase follows the Western reading direction metaphor for "more." A brightness slider that moves up to brighten follows the natural light metaphor (sun is up). These feel intuitive because they match pre-existing mental models.

**Arbitrary mapping** has no spatial or metaphorical relationship between control and effect. A dropdown menu at position X that changes content at position Y with no visual connection is arbitrary. The user must learn and remember the mapping. Minimize arbitrary mappings — every arbitrary mapping adds cognitive load.

**The proximity principle for mapping:** The control should be as close as possible to the thing it controls. Inline editing (click text to edit in place) has perfect mapping — the control IS the content. A separate edit button has one degree of separation. An "Edit" page reached via navigation has multiple degrees. Each degree of separation weakens the mapping and increases the chance the user loses context. This is why inline editing has become the dominant pattern in modern interfaces — GitHub's inline file editing, Notion's click-to-type blocks, Linear's inline issue title editing.

### Anti-Patterns

1. **The Flat Design Guessing Game.** A page where text, icons, images, and interactive elements all share the same visual weight, color, and treatment. Users hover randomly trying to discover what is clickable. Diagnosis: observe users on a heat map tool — random, scattered click patterns indicate affordance failure. Fix: establish a strict interactive color (used only for clickable elements), add hover state changes to all interactive elements, and underline body text links.

2. **Ghost Buttons on Critical Paths.** Using outlined/ghost buttons (transparent background, thin border) as the primary CTA. Ghost buttons have the weakest affordance signal of any button style — they are nearly invisible against busy backgrounds and are easily confused with decorative borders. Fix: filled buttons with strong color contrast for any primary action. Reserve ghost buttons for secondary or tertiary actions only. Apple's landing pages infamously use ghost buttons — they rely on brand recognition and massive CTAs to compensate, a luxury most products do not have.

3. **Touch Target Roulette.** Interactive elements sized below 44x44px on touch devices: 16px icon-only buttons, thin rule-line separators that are secretly tappable, close buttons rendered as 12px "X" characters. Users tap repeatedly in the general area, missing each time. Fix: audit every interactive element against the 44x44px minimum. Use padding to expand hit areas without changing visual size. Test on actual touch devices — emulators mask this problem because mouse cursors are pixel-precise.

4. **Mystery Meat Navigation.** Icon-only navigation with no labels, tooltips, or contextual help. The user must click each icon to discover what it does — the interaction relies entirely on trial and error. Common in minimalist sidebars. Fix: always pair icons with labels. If space is constrained, add persistent labels on hover/focus and use `aria-label` for screen readers. Linear's sidebar uses icon + label for all navigation items; collapse mode shows icons only but with tooltips on hover.

5. **Inconsistent Cursor Signals.** Using `cursor: pointer` on cards that navigate, static cards that do nothing, images that open lightboxes, and decorative icons — the pointer cursor becomes meaningless. Fix: audit `cursor: pointer` usage and restrict it to elements with click handlers that perform a meaningful action. Static, decorative, and informational elements use `cursor: default`.

### Real-World Examples

**Material Design Elevation System.** Material Design uses elevation (shadow depth) as a systematic affordance signifier. Elements at `elevation-0` (no shadow) are the background surface — non-interactive. Elements at `elevation-1` (1dp shadow) are cards — potentially interactive. Elements at `elevation-2` (3dp shadow) are raised buttons and app bars — definitely interactive. FABs sit at `elevation-3` (6dp). Modals at `elevation-5` (24dp). The elevation hierarchy creates a consistent, learnable affordance language: higher = more interactive. On press, interactive elements increase by one elevation level, confirming the affordance through state change.

**Stripe Checkout Form.** Stripe's payment form demonstrates layered affordance design. The card number input has: a text cursor signifier, a placeholder format hint ("1234 1234 1234 1234"), a card brand icon that updates as you type (Visa, Mastercard — confirming the input is being processed), an inline error state with red border (constraint signifier), and a focus ring with brand blue (active state signifier). Five signifiers for a single input field, each serving a different discovery moment.

**Apple iOS Swipe Affordances.** iOS uses a subtle "peek" pattern to signal swipe affordances. In Mail, the very first time you encounter a message, a brief auto-swipe animation reveals the colored action buttons underneath, then snaps back. This one-time affordance disclosure teaches the gesture without requiring a tutorial. After that, the affordance is pattern-based — users remember the swipe convention. The auto-reveal animation is 300ms total (150ms open, 150ms close) and plays only once per user.

**GitHub Code Review Affordances.** In pull request diffs, GitHub uses multiple signifiers to indicate line-level commenting: (1) hovering over the gutter reveals a blue "+" icon (progressive disclosure), (2) the gutter background highlights on hover (state change), (3) clicking opens a comment form inline (natural mapping — the comment appears exactly where you clicked). The affordance is hidden until the user demonstrates interest (hover), then becomes explicit (icon + highlight), then confirms through interaction (inline form).

### Affordance Audit Checklist

When auditing an interface for affordance quality, check each interactive element against these criteria:

1. **Can a first-time user identify this as interactive without clicking?** Show a screenshot to someone unfamiliar with the product. Can they point to all clickable elements within 5 seconds? If they miss an interactive element, its signifiers are insufficient.
2. **Does the element have at least 2 signifier types?** Single-signifier elements (color only, shape only) fail when that one signifier is ambiguous. Two or more signifiers create redundancy that survives ambiguity.
3. **Does the element meet touch target minimums?** Measure the actual hit area (not just the visual size) against 44x44px (iOS) or 48x48dp (Android). Use browser DevTools to verify padding and click areas.
4. **Does the cursor change on hover (desktop)?** Every clickable element must show `cursor: pointer`. Every draggable element must show `cursor: grab` (and `cursor: grabbing` while dragging). Every non-interactive element must use `cursor: default`.
5. **Is there a visible state change on hover/focus?** The element must visually respond to hover (desktop) and focus (keyboard). If hovering over an element produces no visual change, users will not recognize it as interactive.
6. **Are disabled states visually distinct from both active and static elements?** Disabled (muted, `not-allowed` cursor) must look different from active (full color, `pointer` cursor) AND from static text (body color, `default` cursor). If disabled and static look the same, users will not know a control exists.
7. **Does the affordance work without color?** Test in grayscale. If the only signifier is color (blue text for links against black text), colorblind users will miss it. Pair color with another signifier (underline, icon, shape).

## Source

- Norman, D. — _The Design of Everyday Things_ (revised 2013), affordances, signifiers, constraints, and mappings
- Norman, D. — "Affordances and Design" (jnd.org, 2008), clarification of affordance vs signifier
- Nielsen Norman Group — "Flat Design: Its Origins, Its Problems, and Why Flat 2.0 Is Better for Users" (2015)
- Apple Human Interface Guidelines — Touch targets and hit testing, https://developer.apple.com/design/human-interface-guidelines
- Material Design — Interaction states, https://m3.material.io/foundations/interaction/states
- Fitts, P.M. — "The Information Capacity of the Human Motor System" (1954), target acquisition law

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
