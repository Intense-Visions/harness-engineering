# Internationalization Design

> Designing for internationalization — text expansion, RTL layout, icon cultural sensitivity, date/number/currency formatting, pseudolocalization testing

## When to Use

- Building a new product or feature that will launch in multiple languages or markets
- Retrofitting an English-first product for international audiences
- Reviewing a design for text expansion issues before localization begins
- Designing a layout that must support both LTR (English, French) and RTL (Arabic, Hebrew) scripts
- Choosing icons, imagery, or color that will appear in culturally diverse markets
- Implementing date, time, number, or currency formatting that varies by locale
- Setting up pseudolocalization to catch i18n bugs before real translations arrive
- Evaluating whether a design system's components are i18n-ready
- Designing forms that accept international names, addresses, and phone numbers

## Instructions

1. **Design for text expansion from the start.** English is one of the most compact major languages. When translated, text expands significantly:
   - German averages 30% longer
   - Finnish 30-40% longer
   - French 15-20% longer
   - Some languages double the length
   - A button labeled "Submit" (6 characters) becomes "Absenden" in German (8 characters) or "Envoyer la demande" in French (18 characters).
   - Design every text-containing element with expansion in mind: buttons should size to content rather than fixed widths, navigation items should accommodate 40% growth, and headlines should tolerate 30% expansion without breaking layout.
   - **IBM globalization expansion table:**

     | Source length (characters) | Expected expansion |
     | -------------------------- | ------------------ |
     | 1-10                       | Up to 200%         |
     | 11-20                      | Up to 80%          |
     | 21-30                      | Up to 60%          |
     | 31-50                      | Up to 40%          |
     | 51-70                      | Up to 31%          |
     | 70+                        | Up to 30%          |

   Short strings expand the most — disproportionately affecting buttons, labels, tab names, and navigation items.

2. **Build layouts with logical properties, not physical directions.** Replace all directional CSS with logical equivalents:
   - `margin-left` becomes `margin-inline-start`
   - `padding-right` becomes `padding-inline-end`
   - `text-align: left` becomes `text-align: start`
   - `float: left` becomes `float: inline-start`
   - This single change makes your layout automatically adapt to RTL scripts without a separate stylesheet. In CSS Grid and Flexbox, use `start` and `end` instead of `left` and `right`.
   - The `dir="rtl"` attribute on the `<html>` element then flips the entire layout correctly. Test by toggling `dir` in dev tools — if elements jump or overlap, you have physical properties that need migration.

3. **Mirror the entire interface for RTL, not just the text.** RTL is not `text-align: right`. It is a complete interface mirror:
   - Navigation flows right to left
   - Progress bars fill right to left
   - Breadcrumbs read right to left
   - Back arrows point right (toward the previous page)
   - Carousels swipe in the opposite direction
   - Sidebars move to the right side
   - **Exceptions to mirroring** (do NOT flip these):
     - Phone numbers and mathematical formulas (always LTR)
     - Media playback controls (represent temporal direction, not reading direction)
     - Analog clock faces
     - Brand logos (remain as designed)
   - Google's Material Design i18n guidelines document 23 specific mirroring rules — review them before implementing RTL.

4. **Audit every icon and image for cultural sensitivity.** Icons that seem universal often carry culture-specific meanings:
   - Thumbs-up gesture is offensive in parts of the Middle East, West Africa, and South America
   - A US-style roadside mailbox icon is unrecognizable outside North America
   - An owl symbolizes wisdom in Western cultures but is associated with death in some Indian and Middle Eastern cultures
   - Red means luck/prosperity in China, danger in the West, mourning in South Africa
   - Audit every icon: (a) does it rely on a culture-specific physical object? (b) does the gesture or symbol have negative connotations in any target market? (c) can it be replaced with a more universal alternative?
   - Use abstract geometric icons over representational ones when possible.

5. **Never concatenate strings or embed text in images.** String concatenation breaks in every language with different word order:
   - `"You have " + count + " items in your cart"` fails in Japanese, where the count goes before "items" and both before "cart" with particles between them.
   - Use ICU MessageFormat or equivalent: `{count, plural, one {You have # item in your cart} other {You have # items in your cart}}`
   - Pluralization rules vary dramatically: English has 2 forms (singular/plural), French has 3, Arabic has 6, some Slavic languages have 4.
   - For images: never bake text into images. Use text overlays that can be localized, or provide locale-specific image variants.

6. **Format dates, numbers, and currencies using locale-aware APIs.** Never hardcode formats:
   - **Dates:** "01/02/2025" is January 2 in the US, February 1 in Europe, ambiguous everywhere. Use `Intl.DateTimeFormat` or equivalent.
   - **Numbers:** Decimal separator is a period in the US (1,234.56), a comma in Germany (1.234,56), a space-comma in France (1 234,56).
   - **Currencies:** Always display the currency code — "$" means USD in the US, CAD in Canada, AUD in Australia. Use `Intl.NumberFormat` with `style: 'currency'` and the correct ISO 4217 code.
   - **Phone numbers:** Vary in length (US: 10 digits, UK: 11, some countries: 7-13) and formatting — use libphonenumber for validation and display.

7. **Design forms that accept international input.** Common assumptions that break internationally:
   - **Names:** Many cultures use a single name, not first/last. Some use family name first. Some have patronymics. Replace "First Name / Last Name" with "Full Name" or use "Given Name / Family Name" which is culturally neutral.
   - **Addresses:** Formats vary wildly — Japan puts postal code first and street last, the UK has no state/province, India has PIN codes. Use locale-specific forms or a flexible multi-line input.
   - **Character limits:** CJK characters carry more meaning per character — a 20-character Japanese string conveys what takes 50+ English characters. Account for this when setting limits.

8. **Implement pseudolocalization as a development practice.** Pseudolocalization transforms English strings into accented variants that test i18n readiness without real translations. Three levels:
   - **Accented** — replaces ASCII with accented Unicode equivalents (a becomes aa, e becomes ee), simulating expansion and verifying Unicode support.
   - **Mirrored** — reverses string direction to simulate RTL, exposing hardcoded directional assumptions.
   - **Elongated** — pads strings with extra characters to reach the expected expansion ratio for the longest target language.
   - Run pseudolocalization in your staging environment. Any truncated text, broken layouts, or overlapping elements are i18n bugs that would surface only after expensive real translation without this step.

## Details

### Vertical Text and CJK Considerations

Chinese, Japanese, and Korean (CJK) text introduces unique design challenges:

- Characters are set in a square em-box, meaning CJK text at the same font size is visually larger and denser than Latin text
- Line height for CJK typically needs 1.7-2.0 (versus 1.4-1.6 for Latin) to maintain readability
- CJK text can be set vertically (`writing-mode: vertical-rl`) in traditional contexts — common in Japanese print, rare in web interfaces
- Word wrapping does not use spaces — line breaks can occur between any two characters except before certain punctuation
- CSS `word-break: break-all` is needed for CJK to prevent overflow, but must not be applied to Latin text where it breaks words mid-syllable

### RTL Implementation Checklist

When implementing RTL support, verify each item:

- **CSS logical properties.** All `left`/`right` replaced with `inline-start`/`inline-end`. All `top`/`bottom` replaced with `block-start`/`block-end` where applicable.
- **Flexbox/Grid direction.** Container direction inherits from `dir` attribute. `flex-direction: row` respects `dir` correctly. But `flex-direction: row-reverse` does not flip and must be audited.
- **Transforms and animations.** `translateX(100px)` does not automatically mirror. Use `translateX(100%)` with logical properties or JavaScript-based direction detection.
- **Border radius.** `border-top-left-radius` is physical. Use `border-start-start-radius` (logical) or apply all four radii symmetrically.
- **Shadows and gradients.** `box-shadow: 5px 0 10px` casts a shadow on the physical right. In RTL, it should appear on the left. Use CSS custom properties that flip based on `dir`.
- **Scroll direction.** Horizontal scrolling in RTL starts from the right edge. Test carousels, horizontal lists, and overflow containers.
- **Bidirectional text (BiDi).** When RTL text contains embedded LTR segments (brand names, URLs, code), use the Unicode BiDi algorithm. Wrap LTR segments in `<bdi>` or `<span dir="ltr">` to prevent reordering errors.

### Number and Measurement Localization

Beyond basic number formatting, consider:

- **Measurement units.** The US uses imperial (inches, feet, pounds, Fahrenheit). Nearly every other country uses metric. Localize the unit and convert the value: "5.2 kg" in Germany, "11.5 lbs" in the US.
- **Week start day.** Calendars start on Sunday in the US, Monday in most of Europe, Saturday in many Middle Eastern countries. A date picker assuming Sunday-start is incorrect for 70% of the world.
- **Paper sizes.** US uses Letter (8.5x11 in) while the rest of the world uses A4 (210x297mm). A4 is narrower and taller — layouts designed for Letter have different line breaks on A4.
- **Number grouping.** India groups numbers differently: 1,00,000 (one lakh) instead of 100,000. `Intl.NumberFormat('en-IN')` handles this correctly.

### Anti-Patterns

1. **The "We'll Localize Later" Assumption.** Building an entire product in English with hardcoded strings, fixed-width layouts, and concatenated text, then expecting localization to be a translation pass. By the time localization begins, hundreds of layout assumptions make expansion impossible without a rewrite. The fix: internationalize from day one. Use logical CSS properties, externalize all strings into resource files, and run pseudolocalization in CI from the first sprint.

2. **The Google Translate Test.** Using machine translation to validate i18n readiness. Machine translation produces text that fits in the same space as English (word-for-word translation), missing real expansion. It also masks concatenation issues because it follows English word order. The fix: use pseudolocalization for layout testing and professional translators for final localization. Machine translation is not a substitute for either.

3. **The Flag-for-Language Dropdown.** Using country flags to represent language choices. Flags represent countries, not languages. The Spanish flag does not represent 400 million Latin American Spanish speakers. Some countries have multiple official languages (Switzerland has 4, India has 22). The fix: use language names written in their own script — "Deutsch" not "German," "Espanol" not "Spanish" — in a text-based selector.

4. **The Right-to-Left Afterthought.** Adding RTL support by applying `direction: rtl` and `text-align: right` and calling it done. This misses icon mirroring, shadow direction, animation direction, progress bars, form alignment, navigation hierarchy, and dozens of other spatial elements. The fix: implement RTL using logical properties from the start, test with real Arabic/Hebrew content, and use a native RTL speaker for QA.

5. **Hardcoded Pluralization.** Using `count === 1 ? "item" : "items"`. This breaks in Arabic (6 plural forms), Polish (3 forms with complex rules), and even French (zero is singular). The fix: use ICU MessageFormat or `Intl.PluralRules`, which implements CLDR plural rules for all locales.

### Real-World Examples

**Airbnb's i18n Design System.** Airbnb operates in 220+ countries and 62 languages. Their design system enforces i18n at the component level:

- Every text-containing component has a `maxLines` prop with ellipsis behavior
- Every layout uses CSS logical properties
- Every icon was audited for cultural sensitivity (they replaced a house icon resembling a Western detached home with a more universal "shelter" glyph)
- Pseudolocalization runs on every PR — any string that truncates or overflows at 150% expansion blocks merge
- Launching a new language requires zero layout changes to existing components.

**Slack's RTL Support.** When Slack added Arabic and Hebrew, they discovered mirroring broke threaded messages: the reply indicator line used hardcoded `border-left` and `margin-left`. In RTL, the line appeared on the wrong side, disconnecting replies from parents. They migrated 2,400+ CSS declarations from physical to logical properties over 6 months. The hardest part was custom canvas-rendered elements (emoji picker positioning, rich text cursor behavior) where CSS logical properties do not apply and direction-aware JavaScript was needed.

**Mozilla's Pontoon Localization Platform.** Mozilla localizes Firefox into 90+ languages. Pontoon enforces i18n best practices at the string level:

- Rejects strings containing concatenation (flags them with "this string appears to be concatenated — use a single localizable string with placeholders")
- Warns when a string exceeds 40 characters without a line-break allowance
- Provides real-time preview showing how the translated string renders in the actual UI
- Localizers can see that their German translation will overflow a toolbar button before submitting it.

**WhatsApp's Bidirectional Text Handling.** WhatsApp supports mixed-direction text in messages (Arabic user sending a message with an English URL). They use the Unicode Bidirectional Algorithm with explicit directional marks: when the app detects a message starting with an RTL character, it wraps the message in a Right-to-Left Mark (U+200F). Embedded LTR segments (URLs, numbers, brand names) are isolated using First Strong Isolate (U+2068). Without these marks, a message containing "Visit www.example.com" in Arabic reorders URL segments, breaking the link.

## Source

- W3C — "Internationalization Best Practices for Spec Developers" (2023)
- Google Material Design — "Bidirectionality" guidelines (2024), RTL mirroring rules
- IBM Globalization Guidelines — text expansion ratios and design considerations
- CLDR (Unicode Common Locale Data Repository) — plural rules, date/number formats by locale
- Apple Human Interface Guidelines — "Internationalization and Localization" (2024)
- Esselink, B. — _A Practical Guide to Localization_ (2000), foundational localization methodology

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
