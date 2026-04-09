# Readability

> Optimizing for reading — line length (measure), line height (leading), paragraph spacing, text alignment, hyphenation, and reading patterns (F-pattern, Z-pattern)

## When to Use

- Setting body text styles for any content-heavy page (documentation, blogs, articles)
- Configuring `max-width` on text containers to control line length
- Choosing `line-height` values for body text, headings, and captions
- Deciding between left, center, right, or justified text alignment
- Debugging layouts where users report text is "hard to read" or "tiring"
- Designing for screens where sustained reading is the primary activity

## Instructions

1. **Set line length (measure) to 45-75 characters per line.** This is the single most impactful readability setting. The research is unambiguous: lines shorter than 45 characters cause excessive line breaks and choppy reading; lines longer than 75 characters cause the eye to lose its place when returning to the left margin.

   **Concrete values for common body sizes:**
   | Font Size | Font | Ideal Max-Width | ~Characters |
   |-----------|------|----------------|-------------|
   | 16px | Inter | 640-680px | 65-70 |
   | 16px | Georgia | 600-640px | 62-67 |
   | 18px | system-ui | 700-740px | 63-68 |
   | 21px | Georgia | 780-820px | 60-65 |

   **Decision procedure**: Set `max-width` on your text container. Paste a paragraph of real content. Count characters in the longest line. Adjust until you hit 60-70 characters. The exact pixel value depends on font, size, and letter-spacing — there is no universal pixel number.

   **Two-column exception**: When text is set in narrow columns (sidebars, cards, multi-column layouts), 35-45 characters per line is acceptable because the vertical distance between lines is shorter, making the return sweep easier.

2. **Set line-height (leading) based on context.** Leading is the vertical distance between baselines. Too tight and lines collide visually; too loose and the text disintegrates into separate strips.

   | Context              | Line-Height | Rationale                                                              |
   | -------------------- | ----------- | ---------------------------------------------------------------------- |
   | Body text (16-18px)  | 1.5-1.65    | Optimal for sustained reading                                          |
   | Large body (20-24px) | 1.4-1.5     | Larger text needs proportionally less leading                          |
   | Headings (24-48px)   | 1.1-1.25    | Tight leading keeps multi-line headings cohesive                       |
   | Display text (48px+) | 1.0-1.1     | Very large text looks disconnected with normal leading                 |
   | Captions (12-14px)   | 1.4-1.5     | Small text needs generous leading for legibility                       |
   | Code blocks          | 1.5-1.7     | Programmers scan vertically; generous leading aids line identification |

   **The inverse relationship**: as font size increases, optimal line-height ratio decreases. Stripe demonstrates this: body at 16px uses line-height 1.40, but display headlines at 56px use line-height 1.03. The absolute leading increases (22.4px vs 57.7px) but the ratio tightens dramatically.

3. **Set paragraph spacing to 0.5-1.0em between paragraphs.** Use `margin-bottom` on paragraphs, not double line breaks. The spacing should be large enough to signal "new paragraph" but not so large that the text feels disconnected.
   - **Standard**: `margin-bottom: 1em` (one blank line's worth) — used by most systems
   - **Compact**: `margin-bottom: 0.5em` — for data-dense interfaces or when vertical space is premium
   - **Generous**: `margin-bottom: 1.5em` — for editorial/literary content with wide line spacing
   - **Rule**: paragraph spacing should be noticeably larger than line-height but smaller than section spacing

4. **Default to left-aligned text for body content in LTR languages.** Alignment choices:
   - **Left (start)**: Default for all body text. The ragged right edge is natural and provides unique line shapes that help the eye track position. Always use for body text.
   - **Center**: Only for short text blocks (1-3 lines) — headings, hero text, call-to-action buttons. Never for paragraphs. Centered body text destroys the left anchor the eye uses for line returns.
   - **Right (end)**: Reserved for specific UI contexts — numeric columns in tables (right-align numbers for decimal alignment), dates, prices. Never for body text.
   - **Justified**: Creates clean block edges but introduces variable word spacing ("rivers" of white space) unless the browser supports quality hyphenation. Use only when `hyphens: auto` is set AND the language has good hyphenation dictionaries (English, German, French — yes; Japanese, Chinese — not applicable). Even then, prefer left-aligned.

5. **Understand reading patterns to structure content.** Eye-tracking research (Nielsen Norman Group) identified two primary scanning patterns:

   **F-Pattern** (content-heavy pages):
   - Users read the first line or two fully (horizontal bar 1)
   - Eyes drop down and read a shorter horizontal segment (horizontal bar 2)
   - Users scan the left edge vertically, picking up first words of each line/section
   - **Implication**: put the most important information in the first two lines of each section and at the start of each paragraph. Front-load sentences with key terms.

   **Z-Pattern** (sparse layouts, landing pages):
   - Eyes move: top-left -> top-right -> diagonal to bottom-left -> bottom-right
   - **Implication**: place the logo/brand top-left, the CTA top-right, supporting info bottom-left, primary action bottom-right

6. **Optimize the relationship between font size, line-height, and measure.** These three properties are interdependent — changing one requires reconsidering the others:
   - **Increase font size** -> line-height ratio can decrease, but measure (px) should increase to maintain character count
   - **Increase line-height** -> measure can increase slightly (more leading makes longer lines easier to track)
   - **Decrease measure** -> line-height can decrease slightly (shorter lines need less leading because the return sweep is shorter)

## Details

### Readability Configurations from Leading Design Systems

**Stripe Documentation**

- Body: 16px, Inter, line-height 1.625 (26px), max-width ~680px (~70 characters)
- Why it works: the generous 1.625 line-height compensates for Inter's tall x-height, which can make lines feel cramped at standard 1.5 leading. The 680px max-width keeps lines at exactly 68-72 characters.

**Apple Developer Documentation**

- Body: 17px, SF Pro Text, line-height 1.47 (25px), max-width ~800px (~72 characters)
- Apple uses a slightly larger body size (17px vs the industry standard 16px) and a moderately generous line-height. The wider max-width is acceptable because the larger font size maintains character count within range.

**Medium / Reading-Optimized Platforms**

- Body: 21px, charter/Georgia fallback, line-height 1.58 (33px), max-width ~680px (~52 characters)
- Medium uses an unusually large body size with generous leading. The result is a "book-like" reading experience — fewer characters per line (52 vs the recommended 65) creates a faster-paced rhythm appropriate for the platform's short-to-medium article format.

**Material Design 3**

- Body Large: 16px, Roboto, line-height 1.5 (24px)
- Body Medium: 14px, Roboto, line-height 1.43 (20px)
- Body Small: 12px, Roboto, line-height 1.33 (16px)
- Material uses tighter line-heights as sizes decrease — the opposite of best practice for extended reading. This works because Material targets UI labels and short descriptions, not sustained reading.

### The Measure-Leading Interaction

Practical table for common configurations:

| Scenario         | Font Size | Line-Height | Max-Width | Chars/Line |
| ---------------- | --------- | ----------- | --------- | ---------- |
| Documentation    | 16px      | 1.6         | 680px     | 68         |
| Blog/editorial   | 18px      | 1.7         | 720px     | 62         |
| Literary reading | 21px      | 1.6         | 680px     | 52         |
| Dashboard text   | 14px      | 1.5         | 480px     | 55         |
| Card description | 14px      | 1.45        | 320px     | 38         |
| Code block       | 14px      | 1.6         | 880px     | 100        |

Code blocks are the exception to the 75-character rule — developers expect wide lines and horizontal scroll, and the monospace font provides character-level position tracking that proportional fonts cannot.

### Hyphenation and Justification

Justified text is the default in print because page layout engines (InDesign, TeX) have sophisticated paragraph-level justification algorithms. Web browsers do not — they justify line by line, producing inferior results.

If you must use justified text on the web:

```css
.justified-text {
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
  word-break: break-word; /* prevent overflow on long words */
  overflow-wrap: break-word;
  max-width: 680px; /* justified text requires controlled measure */
}
```

Even with these settings, justified web text will have visible rivers in narrow columns. If the container is narrower than 500px, never justify.

### Anti-Patterns

1. **Full-width body text.** Setting body text at `width: 100%` on a 1920px monitor produces lines of 160+ characters. The eye cannot track back to the correct next line after such a long horizontal sweep. This is the most common readability failure on the web. Fix: `max-width: 65ch` or a pixel equivalent based on your font.

2. **Cramped leading.** Line-height of 1.0-1.2 for body text (16px font, 16-19px line-height) causes ascenders and descenders of adjacent lines to collide visually. The text feels dense, claustrophobic, and tiring. Common cause: inheriting `line-height: 1.2` from a CSS reset that was designed for headings, not body text. Fix: set body line-height explicitly to 1.5-1.65.

3. **Justified text without hyphenation.** Justified text distributes extra space between words to fill the line. Without hyphenation, long words force enormous gaps. On narrow columns (300-400px), individual lines can have gaps wider than the words themselves, creating "rivers" of white space that flow vertically through the paragraph. Fix: either add `hyphens: auto` or switch to `text-align: left`.

4. **Centered body paragraphs.** Centering more than 3 lines of text destroys the fixed left edge that the eye uses to locate the start of each new line. Reading speed drops by 10-20% (per Nielsen Norman Group research). Fix: center only headings, short taglines, and CTAs. Left-align all body paragraphs.

5. **Uniform line-height across all sizes.** Setting `line-height: 1.5` globally means a 48px heading gets 72px of leading (excessive, text floats apart) while 12px captions get 18px (possibly too tight). Fix: define line-height per text role, with the ratio decreasing as font size increases.

### Real-World Examples

**Fixing a Documentation Site**
Before: 14px body, line-height 1.3, full-width (1200px container), justified alignment. Users reported "eye strain" and "losing my place."
After: 16px body, line-height 1.6, max-width 680px centered in the layout, left-aligned. Bounce rate decreased 15%, average time on page increased 25%. The changes were purely typographic — no content, layout, or color changes.

**Optimizing a Reading App**
A Kindle-style web reader tested 3 configurations with 500 users:

- **Config A**: 16px, line-height 1.5, 600px width (65 chars) — 4.2 min average reading time
- **Config B**: 18px, line-height 1.6, 660px width (60 chars) — 3.9 min average reading time
- **Config C**: 21px, line-height 1.7, 680px width (52 chars) — 4.0 min average reading time
  Config B won on reading speed. The 18px size with 1.6 leading hit the optimal balance — large enough for comfortable reading without reducing characters-per-line below 55.

## Source

- Bringhurst, Robert. _The Elements of Typographic Style_ — on measure and leading
- Butterick, Matthew. _Butterick's Practical Typography_ — line length, line spacing, text alignment
- Nielsen Norman Group — "F-Shaped Pattern for Reading Web Content" (2006, updated 2017)
- Dyson, M.C. & Haselgrove, M. (2001). "The influence of reading speed and line length on the effectiveness of reading from screen"
- WCAG 2.1 Success Criterion 1.4.8 — Visual Presentation (recommended line length, leading, alignment)

## Process

1. **Evaluate** — Measure the current line length (characters per line), line-height ratio, and paragraph spacing. Identify the reading pattern appropriate for the page type (F-pattern for content, Z-pattern for sparse layouts).
2. **Apply** — Set max-width to achieve 45-75 characters per line. Set line-height appropriate to font size (1.5-1.65 for body, 1.1-1.25 for headings). Left-align body text. Add paragraph spacing at 0.5-1.0em.
3. **Verify** — Count characters per line with real content. Check that the squint test shows clear paragraph separation. Confirm that line-height produces no visual collision between ascenders and descenders.

## Harness Integration

This is a knowledge skill. When activated, it provides readability optimization expertise for text layout decisions. Use these principles when setting `max-width`, `line-height`, `text-align`, `margin-bottom`, and `hyphens` properties. Cross-reference with `design-responsive-type` for viewport-adaptive adjustments and `design-content-density` for information-rich interfaces.

## Success Criteria

- Body text line length is 45-75 characters (measured with actual content, not estimated)
- Line-height for body text is between 1.5 and 1.65
- Line-height for headings is between 1.1 and 1.25
- Body text is left-aligned (not centered or justified without hyphenation)
- Paragraph spacing is between 0.5em and 1.0em
- No text container spans full viewport width without a max-width constraint
