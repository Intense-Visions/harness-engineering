# Form UX

> Form design beyond labels — progressive disclosure, inline validation timing, smart defaults, forgiving formats, single-column superiority, error recovery

## When to Use

- Designing any form that collects user input: registration, checkout, settings, search filters, data entry
- Optimizing an existing form with high abandonment rates or frequent validation errors
- Choosing validation timing: on blur, on submit, on keystroke, or hybrid
- Implementing multi-step forms, wizards, or progressive disclosure patterns
- Setting smart defaults that reduce user effort and error rates
- Designing error recovery flows that help users fix problems rather than just flag them
- Building accessible forms that work with screen readers, keyboard navigation, and assistive technology
- Reviewing a form for compliance with WCAG 2.1 AA input assistance requirements (1.3.5, 3.3.1-3.3.4)

## Instructions

1. **Use single-column layout.** Research by the CXL Institute (Baymard Institute corroborated) demonstrates that single-column forms have 15.4 seconds faster completion times than multi-column forms of equivalent field count. The eye moves straight down without horizontal scanning. The only exception: short, logically paired fields that form a natural unit (City + State, First Name + Last Name on wide desktop views, credit card Expiry + CVC). Even in these cases, the pairs should stack to single-column on viewports below 768px. Stripe's checkout form is single-column at every viewport width — they tested multi-column and measured lower conversion.

2. **Validate on blur for most fields, with specific exceptions.** The optimal validation timing, validated by research from Luke Wroblewski (2009) and confirmed by Baymard Institute (2023):
   - **On blur (when the user leaves the field):** Default for most fields. The user has finished entering their value, so validation is timely and non-interruptive. Stripe validates card numbers on blur — the error appears only after the user moves to the next field.
   - **On keystroke (real-time):** Only for format-constrained fields where real-time feedback aids entry: password strength meters, character count limits, username availability. Never use keystroke validation for fields where the value is incomplete mid-typing (email, phone, credit card number) — showing "Invalid email" while the user is still typing "@" is hostile.
   - **On submit:** For fields that depend on cross-field validation (password confirmation must match password) or server-side validation (checking if a username is taken when local validation is insufficient). On submit, validate all fields simultaneously and scroll to the first error.
   - **Premature validation trap:** Never show an error before the user has had a chance to provide input. An empty required field should not show "Required" until the user has visited and left the field (blur) or attempted to submit. Showing errors on page load for empty required fields is an anti-pattern.

3. **Write error messages that diagnose AND prescribe.** Every error message must contain two parts: (a) what is wrong, and (b) how to fix it. "Invalid email" fails — it diagnoses but does not prescribe. "Enter an email address (e.g., name@example.com)" succeeds — it both diagnoses and prescribes. Stripe's error messages are the benchmark:
   - Card number: "Your card number is incomplete" (not "Invalid card")
   - Expiry: "Your card's expiration date is in the past" (not "Invalid date")
   - CVC: "Your card's security code is incomplete" (not "Invalid CVC")

   Each message tells the user exactly what is wrong in their terms, not in system terms.

4. **Implement smart defaults to reduce cognitive load.** Every field with a statistically dominant answer should be pre-filled with that answer. The user can change it if needed, but the common case requires no action. Decision procedure for defaults:
   - **Country:** Default to the user's detected locale (via Accept-Language header or IP geolocation). Airbnb defaults the country to the user's browsing location with 95%+ accuracy.
   - **Date fields:** Default to today's date for "start date" fields. Default to one week from today for "end date" fields. Airbnb defaults check-in to the next weekend and check-out to 2 nights later — matching the most common booking pattern.
   - **Currency:** Default to the user's locale currency.
   - **Toggles/checkboxes:** Default to the most common/recommended setting. If 85% of users enable a setting, default it to on.
   - **Quantity fields:** Default to 1, not 0 or empty. A quantity of 0 is almost never the intended starting value.

5. **Accept forgiving input formats and normalize silently.** Users should not be forced to match a specific input format. Phone numbers should accept `(555) 123-4567`, `555-123-4567`, `5551234567`, and `+1 555 123 4567` — all normalized to the same stored value. Credit card numbers should accept spaces, dashes, or no separators. Dates should accept `3/14`, `03/14`, `March 14`, and `2024-03-14`. The principle: parse generously, store canonically, display formatted. Stripe's card input accepts any spacing — `4242 4242 4242 4242` and `4242424242424242` are both valid entries, and the display auto-formats to groups of four.

6. **Use progressive disclosure for complex forms.** Do not show all 20 fields at once when 5 are sufficient to start. Reveal additional fields only when the user's previous answers require them. The patterns:
   - **Conditional fields:** Show field B only when field A's value triggers it. Selecting "Other" from a dropdown reveals a text input. Selecting "Business" account type reveals company name and tax ID fields. Airbnb's booking form reveals guest count, trip purpose, and special requests progressively — each section appears only after the previous is completed.
   - **Multi-step wizard:** Split a long form into 3-5 focused steps with a progress indicator. Each step should have 3-5 fields maximum. Stripe's onboarding wizard splits account setup into Business Info, Personal Details, Bank Account, and Review — each step is focused and completable in under 60 seconds.
   - **Expandable sections:** Group optional fields under collapsible sections labeled "Advanced Options" or "Additional Details." Default to collapsed. Users who need them expand; users who do not skip them entirely.

7. **Design error recovery as a first-class flow, not an afterthought.** When a form submission fails:
   - Preserve all user input — never clear the form on error. Losing entered data is the single most frustrating form experience.
   - Scroll to the first error field and focus it.
   - Show all errors simultaneously (not one at a time — the user should see the full scope of problems).
   - Use inline error placement: the error message appears directly below the offending field, in red (#D32F2F or equivalent semantic error color), with an error icon for colorblind users.
   - Provide a summary at the top of the form: "Please fix 3 errors below" with anchor links to each error field.
   - When the user corrects a field, remove the error immediately (on blur or on keystroke if the value becomes valid).

8. **Label every field with a visible, persistent label.** Placeholder text is not a label. Placeholders disappear when the user starts typing, removing the context for what they are entering. Research by NNGroup (2014) found that placeholder-only forms had 12% more errors than labeled forms. The pattern: visible label above the field (not inside it), optional placeholder as a format hint, and optional helper text below the field for additional context. Material Design's text fields always show a label — in the "filled" variant, the label floats above the input on focus, remaining visible throughout editing.

## Details

### Field Type Selection Guide

Choosing the wrong input type is a common form design failure. The decision matrix:

| Data Type           | Best Control              | Reason                                          | Example                           |
| ------------------- | ------------------------- | ----------------------------------------------- | --------------------------------- |
| Yes/No              | Toggle switch             | Binary choice, immediate effect                 | Enable notifications              |
| One of 2-5 options  | Radio buttons             | All options visible, easy comparison            | Shipping speed                    |
| One of 6-15 options | Dropdown / Select         | Conserves space, options still scannable        | Country (if common ones promoted) |
| One of 15+ options  | Searchable dropdown       | Too many to scan, search is faster              | Country (full list)               |
| Multiple of 2-7     | Checkboxes                | Multi-select, all visible                       | Notification preferences          |
| Multiple of 7+      | Multi-select with search  | Too many to display, search narrows             | Tag selection                     |
| Free text (short)   | Text input                | Unconstrained input, single line                | Name, email                       |
| Free text (long)    | Textarea                  | Multi-line, expandable                          | Description, comments             |
| Date                | Date picker               | Prevents format errors, shows calendar          | Appointment date                  |
| Date range          | Dual date picker          | Visual range selection, constraint display      | Check-in to check-out             |
| Number              | Number input with stepper | Constrained to valid range, increment/decrement | Quantity, age                     |
| File                | Drag-and-drop zone        | Supports drag and click, shows preview          | Profile photo, document upload    |

### Inline Validation Visual Specification

The visual treatment of validation states must be consistent and accessible:

- **Default state:** Border color `#E0E0E0` (neutral gray), label in body text color.
- **Focus state:** Border color changes to primary blue (`#1976D2` or brand primary), 2px border width (up from 1px), subtle shadow or glow. The focus state must be visible without relying on color alone — the border width change ensures accessibility.
- **Valid state (after blur):** Green checkmark icon at the right edge of the field. Border optionally turns green (`#388E3C`). Keep this subtle — over-celebrating valid fields creates visual noise.
- **Error state (after blur):** Red border (`#D32F2F`), red error icon (!) at the right edge, error message text in red below the field. Error message must be associated with the field via `aria-describedby` for screen readers. The error message should use `role="alert"` or `aria-live="assertive"` to announce when it appears.
- **Disabled state:** Background `#F5F5F5` (light gray fill), text at 60% opacity, `cursor: not-allowed`. Label remains at full opacity with "(disabled)" or explanation text.

### Multi-Step Form Architecture

Multi-step forms (wizards) require careful state management and navigation design:

**Progress indicator.** Show step labels (not just numbers) so the user knows what is ahead: "1. Business Info > 2. Personal Details > 3. Bank Account > 4. Review." Completed steps should be clickable, allowing the user to go back and edit. The current step is highlighted. Future steps are visible but not clickable (prevents skipping validation). Stripe's onboarding wizard uses this exact pattern.

**Step validation.** Validate the current step completely before allowing navigation to the next step. If validation fails, the user stays on the current step with errors displayed. Do not allow "Next" to proceed with errors — this creates a deferred error problem where the user discovers at the Review step that Step 1 had issues.

**Data persistence.** Save form state after each step completion. If the user closes the browser and returns, they should resume at the last completed step with their data intact. Use `localStorage`, session storage, or server-side draft persistence. Airbnb persists incomplete booking forms for 24 hours — returning users find their dates, guest count, and payment details intact.

**Back navigation.** The "Back" button must preserve all entered data from the current step. No data loss on backward navigation, ever. The back button should not require re-validation of the current (incomplete) step.

### Autofill and Autocomplete Optimization

Browser autofill is one of the most powerful form completion tools, but only if forms are coded correctly:

- Use standard `autocomplete` attribute values: `name`, `email`, `tel`, `address-line1`, `address-line2`, `address-level2` (city), `address-level1` (state), `postal-code`, `country`, `cc-number`, `cc-exp`, `cc-csc`, `cc-name`.
- Use `<input type="email">` for email fields (triggers email keyboard on mobile and validates format).
- Use `<input type="tel">` for phone fields (triggers numeric keyboard on mobile).
- Group address fields in a single `<fieldset>` or `<address>` element so autofill recognizes them as a unit.
- Do not use `autocomplete="off"` on fields where autofill is appropriate — this frustrates users and violates WCAG 1.3.5.
- Stripe's checkout form is optimized for autofill: a single click fills name, address, card number, and email from the browser's stored payment methods.

### Anti-Patterns

1. **Placeholder-as-Label.** Using placeholder text as the only indication of what a field expects, with no visible label. When the user starts typing, the placeholder disappears and they forget what field they are filling out. Multi-field forms become impossible to review because filled fields have no labels. Fix: always use a visible label above or beside the field. Placeholders are optional format hints ("e.g., john@example.com"), not labels.

2. **Premature Validation.** Showing validation errors before the user has finished entering their value. Typing "j" into an email field and immediately seeing "Invalid email address" in red is hostile — the user has typed one character. Fix: validate on blur (when the user leaves the field), not on keystroke. The exception: real-time feedback that helps (password strength, character count) — but never show errors mid-entry.

3. **Clear-on-Error.** Clearing the entire form when submission fails, forcing the user to re-enter all data. This is the single most frustrating form experience and causes immediate abandonment. Fix: preserve all user input on error, highlight only the problematic fields, and let the user correct just the errors.

4. **The Wall of Fields.** Showing 15+ fields on a single page with no grouping, progressive disclosure, or section breaks. The form feels overwhelming before the user begins. Cognitive load research (Hick's Law) shows that completion rates drop logarithmically with visible field count. Fix: group related fields under section headings, hide optional fields behind "Show more" toggles, and consider a multi-step wizard for forms exceeding 7 fields.

5. **Format Enforcement Without Guidance.** Requiring a specific input format (e.g., phone must be "XXX-XXX-XXXX") but not telling the user the required format until they fail validation. The user enters "5551234567," submits, sees "Invalid phone number format," and must guess the expected format. Fix: either accept any reasonable format and normalize (preferred) or show the expected format as placeholder text and helper text before the user types.

### Real-World Examples

**Stripe Checkout Form.** Stripe's payment form is the most studied checkout form in the industry. Single-column layout at all viewport widths. Card number field auto-detects card brand (Visa, Mastercard, Amex) and displays the brand icon as the user types — providing real-time feedback without validation errors. Expiry and CVC fields are sized proportionally to their expected content (expiry gets 60% width, CVC gets 40% on the same row — the one acceptable multi-column exception). Validation errors appear on blur with specific, diagnostic messages. The entire form supports autofill from browser-stored payment methods, completing all fields with a single interaction.

**Airbnb Multi-Step Booking.** Airbnb's booking flow uses progressive disclosure across multiple pages: (1) Select dates and guests (2 fields), (2) Review price breakdown and house rules, (3) Add payment and confirm. Each step is focused — never more than 4-5 fields visible. Smart defaults pre-fill: dates default to the next weekend, guest count defaults to 1 adult, country defaults to detected locale. The date picker disables past dates and dates beyond the host's availability — constraints prevent errors. Returning users find their payment method pre-filled from previous bookings.

**GitHub Issue Creation.** GitHub's issue form demonstrates progressive disclosure. The minimal form has two fields: title and description (markdown). Below, optional fields appear: labels, assignees, projects, milestones — each is a collapsed dropdown that expands only when clicked. The description field supports real-time markdown preview (toggle between Write and Preview tabs). The form auto-saves drafts to `localStorage` — closing the browser and returning finds the draft intact. Submit validation is minimal: only the title is required.

**Material Design Text Field Specification.** Material Design defines three text field variants with precise visual specifications: (1) Filled — a background fill with a bottom border line, label floats above on focus. (2) Outlined — a full border with the label breaking the top border on focus. (3) Standard — a bottom border only (deprecated in M3 for insufficient affordance). The filled variant is recommended for most forms because the background fill creates a clear container signifier. All variants support: leading/trailing icons, helper text, character counter, error text, and prefix/suffix text. The specifications include exact spacing values: 16dp horizontal padding, 20dp top padding (with floating label), 16dp bottom padding, 4dp between field and helper text.

## Source

- Wroblewski, L. — _Web Form Design: Filling in the Blanks_ (2008), foundational form design research
- Baymard Institute — "Checkout Usability" (2023), 18 years of checkout form research, 150+ usability guidelines
- Nielsen Norman Group — "Placeholders in Form Fields Are Harmful" (2014)
- CXL Institute — "Single Column vs Multi-Column Form Layouts" (2019), completion time research
- Material Design — Text fields specification, https://m3.material.io/components/text-fields
- Stripe — Checkout form design patterns and validation timing

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
