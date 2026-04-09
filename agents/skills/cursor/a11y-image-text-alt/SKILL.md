# Image and Text Alternatives

> Write effective alt text for images and provide text alternatives for all non-text content

## When to Use

- Adding images to any web page or component
- Using icons as buttons or links
- Embedding charts, diagrams, or infographics
- Building image galleries or product image displays
- Using SVGs for icons or illustrations

## Instructions

1. **Every `<img>` must have an `alt` attribute.** There are no exceptions — even decorative images need `alt=""` (empty string) to tell screen readers to skip them.

```tsx
// Informative image — describe what is shown
<img src="chart-q3.png" alt="Q3 revenue grew 23% to $4.2M, exceeding the $3.8M target" />

// Decorative image — empty alt to skip
<img src="decorative-wave.svg" alt="" />

// Functional image (linked/button) — describe the action
<a href="/home"><img src="logo.svg" alt="Acme Corp — go to homepage" /></a>
```

2. **Write alt text that conveys the image's purpose, not its appearance.** Ask: "If I replaced this image with text, what would I write?"

```tsx
// Bad — describes appearance
<img alt="A person sitting at a desk with a laptop" />

// Good — describes purpose in context
<img alt="Customer using the dashboard to track orders" />

// Bad — redundant with surrounding text
<h2>Meet Our Team</h2>
<img alt="Photo of our team" />  // The heading already says this

// Good — adds information
<h2>Meet Our Team</h2>
<img alt="The 12-person engineering team at the 2026 offsite in Portland" />
```

3. **Use `<figure>` and `<figcaption>` for images with visible captions.** The caption complements the alt text — they should not be identical.

```html
<figure>
  <img
    src="architecture.png"
    alt="System architecture showing three microservices connected via message queue"
  />
  <figcaption>Figure 1: High-level architecture of the order processing system</figcaption>
</figure>
```

4. **Make SVG icons accessible based on their role:**

```tsx
// Decorative icon (next to text label) — hide from screen readers
<button>
  <SearchIcon aria-hidden="true" />
  <span>Search</span>
</button>

// Standalone icon button — provide accessible name
<button aria-label="Search">
  <SearchIcon aria-hidden="true" />
</button>

// Informative SVG — use role="img" and title
<svg role="img" aria-labelledby="chart-title">
  <title id="chart-title">Monthly sales trend showing 15% growth</title>
  {/* chart paths */}
</svg>
```

5. **Provide text alternatives for complex images.** Charts, diagrams, and infographics need extended descriptions. Use one of these approaches:

```tsx
// Approach 1: Adjacent text description
<img src="org-chart.png" alt="Organization chart" aria-describedby="org-desc" />
<div id="org-desc">
  <p>The CEO reports to the board. Three VPs report to the CEO: VP Engineering, VP Sales, VP Operations...</p>
</div>

// Approach 2: Link to full description
<figure>
  <img src="data-flow.png" alt="Data flow diagram for the ETL pipeline" />
  <figcaption>
    Data flow diagram. <a href="/docs/etl-diagram-description">Full text description</a>
  </figcaption>
</figure>
```

6. **Handle image loading states.** When images fail to load, the alt text becomes the visible content. Write alt text that makes sense visually too.

7. **Use `role="presentation"` or `alt=""` for purely decorative images.** Background images in CSS do not need alt text (they are invisible to screen readers). Inline decorative images need `alt=""`.

8. **For image-based buttons and links, the alt text describes the action, not the image.**

```tsx
// Social media link — describe the destination, not the icon
<a href="https://twitter.com/company">
  <img src="twitter-icon.svg" alt="Follow us on Twitter" />
</a>

// Image link in a product card
<a href="/products/widget">
  <img src="widget.jpg" alt="Blue Widget Pro — view product details" />
</a>
```

## Details

**Decision tree for alt text:**

1. Is the image purely decorative? → `alt=""`
2. Is the image a functional element (link, button)? → Alt describes the function/destination
3. Is the image informative? → Alt conveys the same information as the image
4. Is the image complex (chart, diagram)? → Short alt + long description elsewhere
5. Is the image redundant with adjacent text? → `alt=""` (avoid repetition)

**Alt text guidelines:**

- Keep it concise — typically under 125 characters (screen readers may truncate longer text)
- Do not start with "Image of" or "Photo of" — screen readers already announce the `img` role
- Include text that appears in the image (logos with text, screenshots with UI labels)
- Consider context — the same image may need different alt text on different pages

**CMS and user-generated content:** Require alt text in image upload forms. Provide guidance to content editors. Use AI-generated alt text as a starting point, but always have a human review it.

**Common mistakes:**

- Missing `alt` attribute entirely (screen readers read the filename: "IMG_20260407_12345.jpg")
- Alt text that says "image" or "photo" (redundant with the element role)
- Same alt text for multiple images ("product image" on every product photo)
- Decorative images with descriptive alt text (adds noise for screen reader users)

## Source

https://www.w3.org/WAI/tutorials/images/

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
