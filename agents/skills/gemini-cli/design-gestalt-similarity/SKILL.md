# Gestalt Similarity

> Visual kinship — elements sharing color, size, shape, or texture are perceived as related, creating categories without explicit labels

## When to Use

- Designing systems where elements must be categorized visually (status indicators, tag systems, role badges)
- Building navigation where items of the same type should read as a group
- Creating data tables or lists where rows or columns share visual treatment to signal same-type data
- Establishing consistent component libraries where buttons, inputs, and cards signal their type through shared attributes
- Evaluating why users confuse two unrelated elements or fail to see that related elements belong together

## Instructions

1. **Understand the law.** The Gestalt principle of similarity states that elements sharing visual attributes — color, size, shape, texture, orientation, or typography — are perceived as belonging to the same category. Unlike proximity (which groups by distance), similarity groups by visual attribute regardless of position. A red dot in the top-left and a red dot in the bottom-right are perceived as "the same kind of thing" even though they are far apart.

2. **Rank the similarity channels by perceptual strength.** Not all visual attributes create equally strong similarity signals. Research from pre-attentive processing studies establishes a hierarchy:

   | Channel         | Strength | Example                                                       |
   | --------------- | -------- | ------------------------------------------------------------- |
   | **Color**       | Highest  | Red badges across a page instantly read as "alerts"           |
   | **Size**        | High     | 24px icons vs. 16px icons create two clear size-classes       |
   | **Shape**       | Medium   | Circular avatars vs. square thumbnails signal different types |
   | **Texture**     | Medium   | Filled vs. outlined icons distinguish active from available   |
   | **Orientation** | Lower    | Rotated elements stand out but rarely used for categorization |

   **Decision procedure:** Use the strongest available channel that does not conflict with other design requirements. Color is the default choice for category signaling. Use shape when color is reserved for status. Use size when both color and shape are constrained.

3. **Use color similarity to create implicit categories.** Color is the fastest pre-attentive channel — the brain detects color differences in under 200ms, before conscious processing begins.

   **Worked example — GitHub status indicators:**
   - Green dots = open/passing/success (issues, PRs, CI checks)
   - Red dots = closed/failing/error
   - Yellow dots = pending/warning/draft
   - A user scanning a PR list perceives three categories instantly through color alone, without reading any text
   - The colors are consistent across every surface: issue lists, PR lists, Actions, Deployments — same green means same thing everywhere

   **Worked example — Vercel's monochrome design:**
   - Vercel deliberately suppresses color similarity — nearly everything is black, white, or gray
   - This forces the eye to use other channels (size, weight, position) for grouping
   - When color does appear (blue links, green success badges), it carries extreme signal weight because of its rarity
   - Decision: if your design system is monochrome, every use of color must be intentional and consistent

4. **Use shape similarity to signal element type.** Shape creates medium-strength grouping that persists across the page.

   **Worked example — Airbnb filter pills:**
   - All filter options use identical pill shapes: rounded rectangle, same border-radius (24px full-round), same height (36px), same border style (1px solid gray)
   - This shape consistency makes every pill read as "filter control" regardless of its label content
   - Active filters shift to filled background (black) — the shape stays the same but the fill changes, using a secondary channel (texture/fill) to indicate state within the category

   **Worked example — Dashboard card grids:**
   - Metric cards: same border-radius (8px), same shadow depth, same internal padding
   - A user sees a grid of 6 metric cards and instantly reads them as "a set of the same kind of thing" — without reading any content, the shape alone signals category membership

5. **Use size similarity to establish hierarchy classes.** Elements of the same size are perceived as being at the same level of importance.

   **Worked example — Material Design type scale:**
   - Headline (24px), Title (20px), Body (16px), Caption (12px)
   - All headlines across the app are 24px — this size consistency creates a "headline" category
   - If one headline is 24px and another is 28px, they read as different things, breaking the hierarchy
   - Size similarity is binary: same size = same level, different size = different level

   **Decision procedure:** Define 3-5 distinct size classes (not more). Assign each element to exactly one class. Never create a size that falls between two classes — a 22px element when you have 20px and 24px classes creates perceptual ambiguity.

6. **Combine channels for redundant coding.** The strongest category signals use two or more channels simultaneously:

   **Worked example — Slack message types:**
   - Regular messages: standard text size (15px), default color (#1d1c1d), no background
   - System messages: smaller text (13px), muted color (#616061), no background
   - Highlighted messages: standard text size, default color, yellow background (#FFF9E6)
   - Each type differs on at least two channels (size+color, color+background), making categories unambiguous even for color-blind users

   **Decision procedure:** For critical categorizations (errors vs. warnings, active vs. inactive, user content vs. system content), always use at least two similarity channels. Never rely on color alone for semantic meaning — this is both a Gestalt principle and an accessibility requirement (WCAG 1.4.1).

## Details

### Similarity in Component Libraries

Design systems rely on similarity to teach users the vocabulary of the interface. Every component type must have a consistent visual signature:

**Buttons** — Shopify Polaris defines three button variants:

- Primary: filled green background, white text, 36px height
- Default: white background, dark border, dark text, 36px height
- Plain: no background, no border, blue text, auto height

All three share a consistent border-radius (4px) and font-size (14px), which signals "this is a button." The variations in fill, border, and color signal the button's importance tier. Users learn: "rounded rectangle with text = clickable action, green = primary, white = secondary, no border = tertiary."

**Form inputs** — Every text input across the application must share: height (40px), border style (1px solid #d1d5db), border-radius (6px), padding (8px 12px), font-size (14px). When one form input is 40px tall and another is 36px, users subconsciously perceive them as different kinds of elements — even if both are text inputs. This inconsistency erodes trust in the interface.

### Breaking Similarity for Emphasis

Intentionally breaking similarity makes an element stand out. This is the principle behind primary CTAs, error states, and badges:

- **Stripe's "Start now" button:** Every other button on the page is white with a border. The CTA is filled with Stripe's brand gradient. The similarity break is on one channel (fill) while all other attributes (size, shape, typography) stay consistent — making the CTA clearly "a button" but "a special button."
- **Error states in forms:** An input with an error gets a red border and red helper text. The shape, size, and position remain identical to valid inputs — only color changes. This minimal similarity break signals "same element, different state" rather than "different element."

**Decision procedure for emphasis:** Break exactly one similarity channel, keep all others consistent. Breaking two channels risks making the element look like a different component entirely rather than a highlighted version of the same component.

### Similarity Across Contexts

Similarity must be global, not local. If green means "success" in one part of the application and "active" in another, users must reconcile two meanings for the same visual signal. This creates cognitive overhead that accumulates across every screen.

**GitHub's consistency model:**

- Green = positive/open/passing: open issues, merged PRs, passing checks, online status
- Red = negative/closed/failing: closed issues, failed checks, deleted branches
- Yellow = pending/warning: draft PRs, queued checks, review requested
- This mapping holds across every single surface in the product — no exceptions

**Decision procedure:** Before assigning a color (or shape, or size) to a new element category, audit every existing use of that attribute. If green already means "success" in your system, do not use green for "active navigation item." Find another channel.

### Anti-Patterns

1. **Color overload.** Using more than 5-7 distinct colors for categorization. Human pre-attentive processing can distinguish roughly 6-8 colors reliably. Beyond that, categories blur — is that "coral" or "salmon"? Is that "teal" or "cyan"? Jira's label system suffers from this: with 10+ label colors, users cannot remember which color means what. Fix: limit to 5 functional colors (success, error, warning, info, neutral) plus brand colors.

2. **Inconsistent visual signatures across contexts.** Using rounded buttons on one page and square buttons on another. Using 14px body text in the app but 16px in the settings. Using filled icons in the sidebar but outlined icons in the toolbar. Each inconsistency forces the user to re-learn the interface vocabulary. Fix: audit component attributes across all surfaces and unify. Storybook or a design token system makes this mechanical.

3. **Similarity without semantic meaning.** Making elements look the same for aesthetic reasons when they are functionally different. If a "Delete" button and an "Export" button share identical visual treatment (same size, color, shape), their similarity signals "these do the same kind of thing" — which is dangerously wrong. Fix: destructive actions must visually differ from constructive actions on at least one channel (typically color: red for destructive).

4. **Relying on a single weak channel.** Using only orientation or only texture to categorize elements. These channels are too weak for reliable pre-attentive categorization. A user will not instantly perceive that "tilted icons are warnings" or that "dotted borders mean optional." Fix: use color or size as the primary channel, with weaker channels as reinforcement.

### Real-World Examples

**Vercel's Monochrome Similarity:**

- Nearly all elements share the same color treatment: black text, white backgrounds, gray borders
- This radical similarity creates a unified, calm aesthetic where nothing competes
- Functional color is reserved exclusively for status: green (deployed), red (error), yellow (building)
- The rarity of color makes each status indicator extremely salient — it is the only non-monochrome element in view

**Material Design's Shape System:**

- Small components (chips, buttons): 8px border-radius
- Medium components (cards, dialogs): 12px border-radius
- Large components (sheets, navigation drawers): 16px or 28px border-radius
- Shape similarity signals component scale: if it has 8px radius, it is an interactive control; if it has 16px radius, it is a container
- This shape vocabulary is consistent across all Material apps, so users carry their learning from one app to another

**Spotify's Card Consistency:**

- Album cards: square, 1:1 aspect ratio, image fills the card, title + artist below
- Playlist cards: identical treatment — same size, same shape, same typography
- Podcast cards: identical treatment at the card level; differentiated only by content
- A user browsing the home page reads all cards as "playable content" — the similarity signals a shared interaction model (tap to play)
- Episode list items break the card shape (they are rows, not cards), signaling "this is a different kind of interaction" (play a specific episode vs. play a collection)

**Apple's SF Symbols Consistency:**

- Over 5,000 symbols share 9 weight variants, 3 scale variants, and consistent optical sizing
- A user never has to ask "is this an icon?" — the consistent stroke width, optical balance, and size grid create a universal "SF Symbol" visual signature
- When third-party icons deviate (different stroke width, different optical weight), they look foreign even if the subject matter matches

## Source

- Max Wertheimer, "Laws of Organization in Perceptual Forms" (1923) — original Gestalt similarity principle
- Anne Treisman, "Preattentive processing in vision" (1985) — channel strength hierarchy for pre-attentive detection
- Colin Ware, "Information Visualization: Perception for Design" — quantitative channel effectiveness rankings
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
