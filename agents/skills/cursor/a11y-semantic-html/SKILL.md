# Semantic HTML for Accessibility

> Use semantic HTML elements to convey document structure, meaning, and navigation landmarks to assistive technology

## When to Use

- Building any user-facing web page or component
- Replacing `<div>` and `<span>` soup with meaningful elements
- Structuring page landmarks for screen reader navigation
- Ensuring heading hierarchy is logical and complete
- Reviewing existing markup for accessibility improvements

## Instructions

1. **Use landmark elements to define page regions.** Screen readers expose landmarks as a navigation menu, letting users jump directly to the section they need.

```html
<header>Site branding and primary navigation</header>
<nav aria-label="Main">Primary navigation links</nav>
<main>Primary page content — exactly one per page</main>
<aside>Complementary content (sidebar, related links)</aside>
<footer>Site footer, legal links, copyright</footer>
```

- Use exactly one `<main>` per page.
- Use `aria-label` to distinguish multiple `<nav>` elements (e.g., "Main", "Footer", "Breadcrumb").
- Do not nest landmarks unnecessarily — `<nav>` inside `<header>` is fine, `<main>` inside `<main>` is not.

2. **Use headings (`<h1>`-`<h6>`) to create a logical outline.** Headings are the primary way screen reader users scan a page. Follow a strict hierarchy — do not skip levels.

```html
<h1>Product Catalog</h1>
<h2>Electronics</h2>
<h3>Laptops</h3>
<h3>Phones</h3>
<h2>Clothing</h2>
<h3>Men's</h3>
<h3>Women's</h3>
```

- One `<h1>` per page (the page title).
- Do not use headings for visual styling — use CSS classes instead.
- Do not skip from `<h2>` to `<h4>` — screen readers announce heading levels.

3. **Use `<button>` for actions and `<a>` for navigation.** Buttons trigger in-page actions (submit, toggle, open modal). Links navigate to a URL. Do not use `<div onclick>` for either.

```tsx
// Correct — button for action
<button onClick={handleSave}>Save Changes</button>

// Correct — link for navigation
<a href="/settings">Go to Settings</a>

// Wrong — div pretending to be interactive
<div onClick={handleSave} className="btn">Save Changes</div>
```

4. **Use `<ul>`, `<ol>`, and `<dl>` for lists.** Screen readers announce "list, 5 items" — giving users context about the content structure. Navigation menus should be `<ul>` inside `<nav>`.

5. **Use `<table>` for tabular data, never for layout.** Include `<thead>`, `<th scope="col">`, and `<th scope="row">` so screen readers can associate data cells with headers.

```html
<table>
  <caption>
    Quarterly Sales
  </caption>
  <thead>
    <tr>
      <th scope="col">Region</th>
      <th scope="col">Q1</th>
      <th scope="col">Q2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">North</th>
      <td>$1.2M</td>
      <td>$1.4M</td>
    </tr>
  </tbody>
</table>
```

6. **Use `<form>`, `<fieldset>`, and `<legend>` for form structure.** Group related inputs with `<fieldset>` and provide a group label with `<legend>`.

7. **Use `<article>` for self-contained content** that makes sense independently (blog posts, comments, product cards). Use `<section>` for thematic grouping within a page — always pair `<section>` with a heading.

8. **Use `<time>` for dates and durations** to provide machine-readable time data.

```html
<time datetime="2026-04-07">April 7, 2026</time>
```

9. **Use `<details>` and `<summary>` for expandable content** instead of custom JavaScript accordions. They are natively accessible with keyboard and screen reader support.

```html
<details>
  <summary>Order details</summary>
  <p>Order #12345 — shipped on April 5, 2026.</p>
</details>
```

10. **Validate your HTML structure.** Run the W3C validator and check the document outline. A well-structured document should make sense when read as a heading-only outline.

## Details

**Why semantic HTML matters:** Assistive technology (screen readers, switch controls, voice navigation) relies on the HTML element type to determine how to present and interact with content. A `<button>` is announced as "button" and activated with Enter/Space. A `<div>` with an `onClick` is announced as "group" — the user has no idea it is interactive.

**Implicit ARIA roles:** Semantic elements carry implicit ARIA roles — `<nav>` is `role="navigation"`, `<main>` is `role="main"`, `<button>` is `role="button"`. Using semantic HTML means you rarely need to add ARIA attributes manually.

**Common anti-patterns:**

- `<div class="header">` instead of `<header>`
- Using `<h3>` because it looks the right size (use CSS for sizing)
- `<a href="#" onclick={fn}>` — if it does not navigate, use `<button>`
- `<br>` for spacing instead of CSS margin/padding
- `<b>` and `<i>` for styling — use `<strong>` and `<em>` for semantic emphasis, CSS for visual styling

**Testing:** Use the browser's accessibility tree inspector (Chrome DevTools > Accessibility tab) to see how your markup is exposed to assistive technology. The rendered accessibility tree should mirror the visual hierarchy.

## Source

https://developer.mozilla.org/en-US/docs/Learn/Accessibility/HTML
