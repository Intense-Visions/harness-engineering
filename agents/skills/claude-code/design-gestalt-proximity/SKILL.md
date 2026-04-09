# Gestalt Proximity

> Spatial grouping — elements near each other are perceived as related, controlling group membership through distance, with common region as a proximity amplifier

## When to Use

- Laying out form fields and deciding which inputs belong in the same visual group
- Designing card layouts where internal elements must read as a unit
- Structuring navigation menus with grouped items (primary actions, settings, account)
- Deciding padding and gap values between related vs. unrelated content blocks
- Evaluating why a layout feels disorganized despite having correct content
- Building settings pages, dashboards, or data-entry interfaces with many discrete controls

## Instructions

1. **Understand the law.** The Gestalt principle of proximity states that elements placed close together are perceived as belonging to the same group, regardless of differences in shape, color, or size. Distance is the primary grouping mechanism in visual perception — it operates before color, before shape, before any other attribute. When a user looks at a layout, the first parse their visual system performs is spatial: what is near what?

2. **Apply the proximity ratio.** For any two elements that belong to the same group, the space between them must be noticeably less than the space between either element and the nearest element of a different group. The minimum effective ratio is 1:2 — intra-group spacing should be at most half the inter-group spacing. A 1:3 ratio is stronger and preferred when space allows.

   **Worked example — Stripe checkout form:**
   - Label to input field: 4px (tightly coupled — the label describes the input)
   - Input field to next label: 24px (separates one field from the next)
   - Last field in section to next section heading: 48px (separates logical groups)
   - Ratio chain: 4px : 24px : 48px = 1:6:12 relative to tightest coupling

   **Decision procedure:** List all element pairs. For each pair, decide: same group or different group? Assign intra-group spacing from your scale's lower values, inter-group spacing from higher values. Verify that no intra-group gap equals or exceeds any inter-group gap.

3. **Use common region to amplify proximity.** Common region — enclosing elements within a shared boundary (card, background color, border) — reinforces proximity. Elements inside the same container are perceived as more strongly grouped than elements that are merely close together without a boundary.

   **Worked example — Airbnb listing card:**
   - All listing data (photo, title, price, rating, host) sits inside a single card with a subtle border-radius of 12px and 1px border
   - Internal padding: 16px — elements are close AND enclosed
   - Cards are separated by 24px gap — proximity alone distinguishes "inside this listing" from "the next listing"
   - The card boundary makes the grouping unambiguous even if a user squints at the layout

   **When to add common region:** When proximity alone is insufficient — typically when intra-group and inter-group spacing cannot achieve a 1:2 ratio due to layout constraints, or when elements are so numerous that spatial grouping alone creates visual noise.

4. **Handle proximity conflicts.** Sometimes the layout requires elements from different groups to be physically close. This happens in dense dashboards, multi-column forms, and responsive layouts where columns collapse. Resolution strategies:
   - **Add a divider.** A 1px line or subtle border between groups explicitly overrides proximity. Material Design uses `border-bottom: 1px solid rgba(0,0,0,0.12)` between list sections — the divider breaks the false proximity signal.
   - **Use common region.** Wrap one group in a background color shift. Stripe's settings page uses `background: #f6f9fc` blocks alternating with white to separate groups that are vertically adjacent with only 16px between them.
   - **Shift alignment.** Offset one group horizontally or indent it. This breaks the proximity signal by disrupting the shared axis.

5. **Calibrate proximity for different densities.** The absolute pixel values change with context, but the ratio must be preserved:

   | Context             | Intra-group | Inter-group | Section gap | Ratio |
   | ------------------- | ----------- | ----------- | ----------- | ----- |
   | Dense dashboard     | 4-8px       | 16-24px     | 32-48px     | 1:3:6 |
   | Standard app UI     | 8-12px      | 24-32px     | 48-64px     | 1:3:6 |
   | Marketing / landing | 16-24px     | 48-64px     | 80-128px    | 1:3:5 |

   **Decision procedure:** Pick your context density. Choose a base intra-group value from the table. Multiply by 3 for inter-group. Multiply by 5-6 for section gaps. Verify all values exist on your spacing scale (4px or 8px base).

6. **Apply the isolation principle (inverse proximity).** An element placed far from all other elements attracts attention through its isolation. This is proximity in reverse — the absence of nearby elements signals "this is special, different, or primary."

   **Worked example — Material Design FAB (Floating Action Button):**
   - The FAB sits 16px from the bottom-right corner, separated from all other UI elements by at least 48px of empty space
   - No other element is within its spatial neighborhood, making it the only occupant of its region
   - This isolation signals "primary action" without any label, border, or color treatment (though it also uses color)

   **Worked example — Apple's "Buy" button on product pages:**
   - The purchase CTA sits beneath the product details with 40px of space above and below
   - Surrounding elements (specs, description) are 24px apart from each other
   - The CTA's extra breathing room creates isolation, drawing the eye to the conversion action

## Details

### Proximity in Form Design

Forms are the highest-stakes proximity challenge because users must understand which label belongs to which input, which inputs form a logical group, and where one section ends and another begins.

**The label-to-input distance must always be tighter than the input-to-next-label distance.** If both distances are equal, labels appear to float between two inputs and the association becomes ambiguous — the user must read the label text to figure out which input it describes, rather than seeing the relationship spatially.

**Worked example — address form:**

```
[Street Address]          <- label
[________________]        <- input     } 4px label-to-input
                                       } 24px input-to-next-label
[City]                    <- label
[________________]        <- input     } 4px label-to-input
                                       } 24px input-to-next-label
[State]     [Zip Code]   <- labels (inline group)
[______]    [______]      <- inputs    } 4px label-to-input
                                       } 48px to next section

[Payment Information]     <- section heading
```

The 4px : 24px : 48px cascade makes group membership unambiguous. A user scanning vertically sees three distinct clusters (street, city, state/zip) within a larger "address" section, all separated from "payment" by a 48px gap.

### Proximity in Navigation

Navigation menus use proximity to signal hierarchy:

- **Apple's macOS menu bar:** Menu items within a group (File > New, Open, Close) are separated by 0px — they share adjacent rows with only the row's internal 4px padding creating micro-space. A divider line (1px) appears between conceptual groups (Close vs. Save), explicitly breaking proximity where spatial distance alone cannot.
- **Sidebar navigation (Notion, Linear, Slack):** Primary sections (Inbox, My Issues, Teams) use 4-8px between items within a section. Between sections: 16-24px gap plus a section label in muted text. The combination of extra space + label makes the grouping redundant in the best way — even a first-time user understands the structure.

### Proximity on Responsive Breakpoints

When a multi-column layout collapses to single-column on mobile, previously side-by-side groups become vertically stacked. This can create false proximity — a group's last element becomes adjacent to the next group's first element with the same spacing that exists within groups.

**Fix:** Increase inter-group spacing by at least one step on your scale when collapsing to single column. If desktop uses 24px between groups, mobile should use 32px or 40px to compensate for the lost column separation.

### Anti-Patterns

1. **Equidistant spacing.** Applying the same gap (e.g., `gap: 16px`) to every element regardless of group membership. This is the most common proximity violation. The layout becomes a flat list where nothing is grouped — labels float ambiguously, form sections bleed into each other, and navigation items all appear equally related. Fix: differentiate intra-group and inter-group spacing by at least a 1:2 ratio.

2. **Label proximity inversion.** Placing a label equidistant between two inputs (or closer to the wrong input). In a vertical form with 16px between a label and the input below it, and 16px between that input and the next label, the labels are perceptually unanchored. Reduce label-to-own-input spacing to 4-8px while keeping input-to-next-label spacing at 16-24px.

3. **Over-boxing (common region abuse).** Wrapping every small group in a card or bordered container when proximity alone would suffice. This creates visual noise — borders compete with content for attention, the page looks like a spreadsheet, and the hierarchy flattens. Use common region only when proximity ratios cannot achieve clear grouping (dense layouts, overlapping groups, mobile collapses).

4. **Proximity without hierarchy.** Grouping elements correctly by distance but failing to establish which group is primary. All groups are equally spaced from the viewport edges, equally sized, equally prominent. Proximity creates groups but does not rank them — combine with visual hierarchy (size, color, position) to indicate importance.

### Real-World Examples

**Stripe's Payment Form:**

- Card number, expiry, CVC grouped inside a single bordered container (common region + proximity)
- Internal padding: 12px. Between fields inside the container: 0px — they share a border, creating a single compound input
- Container to "Pay" button: 24px. Button to terms text: 16px
- The compound input pattern uses zero-gap proximity + shared border to make three fields feel like one

**Apple iOS Notification Grouping:**

- Notifications from the same app stack with 2px between them — nearly touching
- Between app groups: 12px gap + separate card background
- This double signal (proximity + common region) makes it instantly clear that three stacked notifications are from Messages, not from three different apps

**Material Design List Sections:**

- List items: 0px gap (items share adjacent rows with `56px` row height and internal padding)
- Between sections: a `16px` gap plus a subheader label in `14px` muted text
- The section subheader occupies its own row, creating both spatial separation and a semantic label — redundant grouping that works at a glance

**Airbnb Search Filters:**

- Filter pills (Price, Type, Rooms) sit in a horizontal row with 8px gap between pills
- The filter row itself is separated from search results by 24px + a horizontal divider
- Within the filter row, all pills use identical spacing — proximity groups them as "the filter controls" while the divider separates them from "the results"

## Source

- Max Wertheimer, "Laws of Organization in Perceptual Forms" (1923) — original Gestalt proximity principle
- Stephen Palmer, "Vision Science: Photons to Phenomenology" — perceptual grouping research
- "Refactoring UI" by Adam Wathan and Steve Schoger — proximity spacing in web interfaces
- "Universal Principles of Design" by William Lidwell, Kritina Holden, and Jill Butler

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
