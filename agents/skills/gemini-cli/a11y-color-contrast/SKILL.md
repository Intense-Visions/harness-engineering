# Color Contrast and Color Independence

> Ensure sufficient color contrast ratios and never use color as the sole means of conveying information

## When to Use

- Choosing text and background color combinations
- Designing UI states (error, success, warning) that rely on color
- Building data visualizations, charts, or status indicators
- Reviewing designs for WCAG 2.1 AA or AAA compliance
- Supporting users with low vision or color vision deficiency

## Instructions

1. **Meet minimum contrast ratios.** WCAG 2.1 AA requires:
   - **Normal text** (under 18pt / 24px, or under 14pt / 18.5px bold): **4.5:1** contrast ratio
   - **Large text** (18pt+ or 14pt+ bold): **3:1** contrast ratio
   - **Non-text UI components** (icons, borders, form controls): **3:1** against adjacent colors

```css
/* Good — #1a1a1a on #ffffff = 17.4:1 */
.body-text {
  color: #1a1a1a;
  background: #ffffff;
}

/* Bad — #999999 on #ffffff = 2.8:1 (fails AA) */
.muted-text {
  color: #999999;
  background: #ffffff;
}

/* Acceptable for large text — #767676 on #ffffff = 4.5:1 */
.large-heading {
  color: #767676;
  font-size: 24px;
  font-weight: bold;
}
```

2. **Never use color alone to convey information.** Always pair color with a secondary indicator — text, icons, patterns, or underlines.

```tsx
// Bad — only color distinguishes error from success
<span style={{ color: 'red' }}>Failed</span>
<span style={{ color: 'green' }}>Passed</span>

// Good — color + icon + text label
<span style={{ color: '#d32f2f' }}>
  <ErrorIcon aria-hidden="true" /> Failed
</span>
<span style={{ color: '#2e7d32' }}>
  <CheckIcon aria-hidden="true" /> Passed
</span>
```

3. **Test link visibility without relying on color alone.** Links within body text should have an underline or other non-color visual distinction. If you remove underlines, ensure a 3:1 contrast ratio between link color and surrounding text color.

```css
/* Safe — underline present */
a {
  color: #005fcc;
  text-decoration: underline;
}

/* Also safe — 3:1 contrast between link color and body text color, plus underline on hover/focus */
a {
  color: #005fcc;
  text-decoration: none;
}
a:hover,
a:focus {
  text-decoration: underline;
}
```

4. **Design form validation with multiple cues.** Do not rely solely on a red border to indicate errors. Add an error message, an icon, or both.

```tsx
<div>
  <label htmlFor="email">Email</label>
  <input
    id="email"
    aria-invalid={!!error}
    aria-describedby={error ? 'email-error' : undefined}
    style={{ borderColor: error ? '#d32f2f' : '#ccc' }}
  />
  {error && (
    <p id="email-error" role="alert" style={{ color: '#d32f2f' }}>
      <ErrorIcon aria-hidden="true" /> {error}
    </p>
  )}
</div>
```

5. **Use patterns, shapes, or labels in data visualizations.** Charts with color-coded series are unreadable for color-blind users. Add patterns, direct labels, or shape markers.

6. **Check contrast for all interactive states.** Hover, focus, active, disabled, and selected states all need to meet contrast requirements against their backgrounds.

7. **Test with simulated color vision deficiency.** Chrome DevTools > Rendering > Emulate vision deficiencies. Test with protanopia, deuteranopia, tritanopia, and achromatopsia.

8. **Design high-contrast mode support.** Windows High Contrast Mode overrides your colors. Use `forced-colors` media query to ensure readability.

```css
@media (forced-colors: active) {
  .custom-checkbox {
    border: 2px solid ButtonText;
  }
}
```

## Details

**WCAG contrast levels:**

- **AA (minimum):** 4.5:1 for normal text, 3:1 for large text and UI components
- **AAA (enhanced):** 7:1 for normal text, 4.5:1 for large text
- Target AA for all projects; target AAA for government, healthcare, and financial applications

**Contrast ratio formula:** Based on relative luminance of the two colors. Use tools to calculate — do not eyeball it.

**Recommended tools:**

- Browser DevTools: Hover over elements to see contrast ratio in the color picker
- WebAIM Contrast Checker: https://webaim.org/resources/contrastchecker/
- axe DevTools: Flags contrast violations automatically
- Stark (Figma plugin): Check contrast during design

**Color-blind-safe palettes:** Approximately 8% of males and 0.5% of females have color vision deficiency. Red-green is the most common. Avoid red/green as the only distinction. Blue/orange is generally safe across all types.

**Common mistakes:**

- Placeholder text with insufficient contrast (often fails AA)
- Disabled states that are indistinguishable from enabled states
- Focus indicators that disappear against the background
- Charts using red, green, and yellow without patterns or labels

## Source

https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum
