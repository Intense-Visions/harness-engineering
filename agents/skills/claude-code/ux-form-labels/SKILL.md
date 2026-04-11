# Form Labels and Helper Text

> Form labels and helper text — label clarity, placeholder anti-patterns, required-field indication, and writing forms that users complete without confusion

## When to Use

- Writing form field labels and their associated descriptions
- Adding helper text, hints, or format examples below input fields
- Deciding what to put in placeholder text versus labels versus helper text
- Indicating required versus optional fields across a form
- Writing fieldset legends and form section headers
- NOT for: form validation error messages (see ux-error-messages)
- NOT for: form layout, field ordering, and visual design decisions (see design-form-ux)

## Instructions

1. **Labels must be visible at all times -- never rely on placeholder text as the only label.** Placeholders disappear on focus, leaving users without context about what a field requires -- especially during editing or review. This is both a UX failure and an accessibility failure. Screen readers may not reliably read placeholder text as field labels. WCAG 1.3.1 requires that label information be programmatically determinable, which placeholder-as-label violates. Stripe, GitHub, and Shopify all use visible above-field labels alongside placeholder text.

2. **Use the shortest unambiguous label.** "Email" not "Email address" if context is clear. "Full name" not "Please enter your first and last name in this field." "Company" not "Company or organization name." The label is a scannable identifier, not an explanation. Stripe's payment form: "Card number" -- two words. Every additional word is a tax on the user's attention. If the short form is ambiguous (would "Name" mean first name or full name?), use the minimum additional words needed to disambiguate ("Full name," not "Please enter your complete legal name as it appears on your ID").

3. **Place helper text below the field, not above.** Helper text above competes visually with the label and disrupts the reading flow from label to input. Below the field, helper text acts as post-input support -- visible when the user is filling in the field, out of the way during scanning. GitHub places "This will be the name of your repository" directly below the repository name input. Stripe places card format hints below the card number input. The exception: pre-conditions that prevent even attempting to fill a field ("You can only do this once a month") should appear above or as a warning before the field.

4. **Use placeholders only for format examples, never for instructions.** The correct use of placeholder text is demonstrating the expected format. Good placeholders: "jane@example.com" (email format), "MM / YY" (card expiry format), "+1 (555) 123-4567" (phone format), "ACME-2024" (reference format). Bad placeholders: "Enter your email address" (instruction that disappears), "Your company website" (label restatement), "e.g., Marketing Manager" (example that belongs in helper text). The placeholder should show the user what their actual data should look like.

5. **Mark the minority, not the majority.** If most fields in a form are required, mark only the optional ones with "(optional)" in the label. If most fields are optional, mark only the required ones with an asterisk (_) and explain the convention once ("_ Required"). Never mark both required and optional -- pick the convention that produces fewer marks. Marking everything creates noise; marking only exceptions creates signal. Stripe's payment form marks nothing -- all fields are required and self-evidently so. GitHub's profile form marks optional fields only, since most are optional.

6. **Group related fields with clear section headers.** A form with more than 6-8 fields should be organized into named sections. "Billing information," "Shipping address," "Payment method" are sections in a checkout form -- not a flat list of 15 fields. Section headers function as fieldset legends: they provide context for the group of fields that follows. Shopify's checkout separates contact, shipping, and payment into clearly headed sections, each with its own visual container. Section headers also enable the user to jump to a specific section without reading every field.

7. **Show constraints before the user encounters them.** Helper text that reveals constraints after an error is too late. "Must be at least 8 characters, include one number and one uppercase letter" should appear below the password field before the user has typed anything. This preemptive disclosure prevents errors before they happen -- the most efficient form of error prevention. Stripe shows card number format hints before the user enters any digits. GitHub shows username constraints (alphanumeric, hyphens allowed, 1-39 characters) in helper text before submission.

## Details

### Label vs Placeholder vs Helper Text

Three distinct text elements serve three distinct purposes in forms:

| Element     | Purpose                         | Persistent? | Example                                      |
| ----------- | ------------------------------- | ----------- | -------------------------------------------- |
| Label       | Names the field                 | Always      | "Email address"                              |
| Placeholder | Shows expected format           | Until typed | "jane@example.com"                           |
| Helper text | Adds context, constraints, tips | Always      | "Use the email associated with your account" |

Labels must always be visible (above or beside the field). Placeholders are acceptable for format demonstration but are optional and must not carry essential information. Helper text is optional but powerful for preventing errors and reducing confusion. The three elements are additive -- a field may have all three, each serving a distinct function.

A common mistake is using all three to say the same thing:

- Label: "Name"
- Placeholder: "Enter your name"
- Helper text: "Type your name here"

Each should add distinct value:

- Label: "Full name" (disambiguates -- full, not first)
- Placeholder: "Jane Smith" (shows the expected format)
- Helper text: "As it appears on your government ID" (adds context not available from the label)

### Required and Optional Field Indication Patterns

**When most fields are required:** Mark only optional fields with "(optional)" in the label, immediately following the label text. "Middle name (optional)." Do not use asterisks for required fields when only 1-2 fields are optional -- the mark on the exception is clearer than marks on the rule.

**When most fields are optional:** Mark only required fields with an asterisk (_) and include a legend once at the top of the form: "_ Required." Do not mark optional fields at all -- their unmarked state is the convention.

**Mixed forms with no clear majority:** Use "(optional)" on optional fields and asterisks on required fields with a legend. This is the most explicit approach and works when the balance is roughly 50/50.

**Never:** Use both asterisks and "(optional)" in the same form -- users must infer the convention from the pattern, and using both creates ambiguity.

### Accessibility Requirements for Form Labels

Labels must be programmatically associated with their inputs:

- Use `<label for="input-id">` or wrap the input in `<label>` -- do not use visual proximity alone.
- Placeholder text must NOT be the only label. It fails WCAG 1.3.1 because it disappears and may not be read by all assistive technologies.
- Helper text should be associated via `aria-describedby` so screen readers read both the label and the helper text.
- Error messages must be associated via `aria-describedby` or `aria-errormessage` and marked with `role="alert"`.
- Required fields should use both the `required` attribute and a visible indicator -- do not rely on HTML required alone without a visible signal.

### Anti-Patterns

1. **The Placeholder-as-Label.** Using placeholder text as the only label for a form field -- no visible label above or beside the input. The placeholder disappears when the user clicks into the field, leaving them without context about what they were typing. Users who need to reference the field context while entering data (common for addresses, card numbers, and multi-field names) must clear their input to see the label again. This is a critical accessibility failure and consistently tested as one of the highest-friction patterns in form usability research.

2. **The Redundant Stack.** Three text elements saying the same thing: label "Name," placeholder "Enter your name," helper text "Type your name here." Each element adds visual weight and reading time with no added value. The fix: use each element for a distinct purpose. Label names the field ("Full name"), placeholder demonstrates format ("Jane Smith"), helper text adds non-obvious context ("As shown on your ID").

3. **The Hidden Constraint.** Not revealing field requirements until after the user submits and receives a validation error. A password field with no helper text that, on error, reveals "Must be 8+ characters, include a number and uppercase letter." The user just had to fail to learn the rules. Move all constraints to helper text, visible before the user types. The only legitimate time to show constraints after the fact is when the constraint depends on the input value itself (e.g., "This username is already taken" cannot be preemptively shown).

### Real-World Examples

**Stripe's Payment Form.** Stripe's payment form is a reference implementation of minimal, functional form labels. "Card number" is the label -- not "16-digit credit or debit card number." The placeholder shows the format: "1234 1234 1234 1234." No helper text is needed because the label and placeholder together provide complete context. The expiry field placeholder "MM / YY" is the format instruction. The CVV placeholder "CVC" is the conventional abbreviation users recognize. Every text element earns its place; nothing is redundant.

**GitHub's Repository Creation Form.** GitHub's repository creation form demonstrates proper helper text placement. Below the repository name field: "Great repository names are short and memorable. Need inspiration? How about super-potato?" The helper text serves three purposes: sets the standard (short, memorable), offers inspiration (how about X?), and adds a touch of personality consistent with GitHub's voice. Below the visibility options: "Public repositories are visible to anyone. Private repositories are only visible to you." The helper text is additive -- not a restatement of the radio button labels but an explanation of the consequence of each choice.

**Shopify's Address Form Patterns.** Shopify's address forms demonstrate best-in-class required/optional field handling. All required fields are marked with asterisks (\*) and a legend explains the convention once at the form start. The "Address line 2" field is explicitly marked "(optional)" -- because it is the exception in an otherwise-required form. Shopify also dynamically adjusts form fields based on selected country (postal code format, state/province terminology), with label text that adapts: "ZIP code" for US addresses, "Postcode" for UK addresses, "Postal code" for Canada.

## Source

- NNGroup — "Placeholders in Form Fields Are Harmful" (2014), https://www.nngroup.com/articles/form-design-placeholders/
- Google Material Design — Text field guidelines, https://m3.material.io/components/text-fields/guidelines
- Apple Human Interface Guidelines — Text fields, https://developer.apple.com/design/human-interface-guidelines/text-fields
- W3C WCAG 2.1 — Success Criterion 1.3.1: Info and Relationships, https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships

## Process

1. Inventory all form fields and classify each text element: label, placeholder, helper text.
2. Verify every field has a persistent visible label -- replace any placeholder-as-label with a real label.
3. Assign each text element its specific role: label names, placeholder formats, helper text adds context or constraints.
4. Audit required/optional indication -- apply the minority-marking convention consistently.
5. Check programmatic label association (for="" or aria-describedby) for accessibility compliance.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- Every field has a persistent visible label that is not reliant on placeholder text.
- Placeholder text shows format examples only -- no instructions or label restatements.
- Helper text appears below each field and adds context not available from the label alone.
- Required/optional indication uses the minority-marking convention consistently across the form.
- All labels are programmatically associated with their inputs via for/id or aria-describedby.
