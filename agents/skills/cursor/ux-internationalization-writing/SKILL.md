# Writing for Internationalization

> Writing for internationalization — source strings that survive translation, concatenation traps, pluralization, date and number references

## When to Use

- Writing source strings for any product that will be translated or localized
- Designing UI text that includes dynamic values -- numbers, dates, currencies, usernames
- Building features with pluralized counts ("1 item" vs "2 items" vs "5 items")
- Reviewing existing UI text for translation-readiness before a localization effort
- Writing strings for apps that must support right-to-left (RTL) languages like Arabic or Hebrew
- Creating templates for dynamic content that will be interpolated with variables
- Auditing a codebase for hardcoded strings that should be externalized
- NOT for: string extraction tooling and i18n library configuration (covered by engineering skills)
- NOT for: locale-specific content creation (marketing copy for specific markets)
- NOT for: right-to-left layout design (that is a design skill, not a writing skill)

## Instructions

1. **Never concatenate strings to build sentences.** This is the most common and most damaging i18n mistake. In English, "Welcome, " + name + "!" works. In German, the greeting might need the name in a different position. In Japanese, the sentence structure is completely different. Every concatenation is a translation blocker. Use template variables with complete sentences: `"Welcome, {name}!"` where the entire string including the variable position can be rearranged by translators. Airbnb's style guide mandates complete-sentence templates: `"{host_name} is a Superhost"` not `name + " is a " + badge_type`.

2. **Use ICU MessageFormat for pluralization.** English has two plural forms (singular and plural): "1 item" and "2 items." But Arabic has six plural forms. Polish has four. Russian has three. The naive approach -- `count === 1 ? "item" : "items"` -- breaks in every language except English. ICU MessageFormat handles all plural forms:

   ```
   {count, plural,
     =0 {No items}
     one {{count} item}
     other {{count} items}
   }
   ```

   Translators can add the plural forms their language requires (zero, one, two, few, many, other) without changing code. The Unicode CLDR defines which counts map to which plural category for every language. Never implement pluralization logic in application code -- delegate it to the i18n library.

3. **Do not embed UI text in code.** Every user-visible string must be in a resource file, even strings that seem too simple to externalize: "OK," "Cancel," "Error," "Loading..." These simple strings still need translation. A codebase where most strings are externalized but "OK" is hardcoded forces translators to miss it, resulting in a partially translated interface. Android's resource system enforces this: every string goes in `strings.xml`. React-intl and next-intl follow the same pattern. The rule: if a user can see it, it must be in the resource file.

4. **Keep sentences complete and self-contained.** Translators work with individual strings, not with the full UI context. A string that says "and 3 more" is untranslatable without knowing what comes before it. The translator does not know if "3 more" refers to people, files, messages, or errors. Make every string a complete thought: "and 3 more files" or, better, "{count} more files." Provide translator comments that explain the context: "Shown below a list of files when more files exist than are displayed."

5. **Avoid positional humor, puns, and wordplay.** Humor rarely survives translation because it depends on language-specific features: double meanings, homophones, cultural references, and rhythm. Google's "I'm Feeling Lucky" button required creative adaptation in every locale -- some translations abandoned the pun entirely and used a culturally equivalent phrase. Slack's playful loading messages ("Herding cats...") are untranslatable in most languages because the idiom does not exist. The rule: if the humor depends on English-language wordplay, it will not translate. Use direct language instead, or mark humor strings as "do not translate literally -- adapt for local culture."

6. **Design for text expansion.** Translated text is almost always longer than English source text. German is approximately 30% longer. Finnish can be 40% longer. Arabic and Hebrew may be 25% longer. UI elements must accommodate this expansion without breaking layouts:

   | Source Language | Target Language | Average Expansion |
   | --------------- | --------------- | ----------------- |
   | English         | German          | +30%              |
   | English         | French          | +20%              |
   | English         | Spanish         | +25%              |
   | English         | Finnish         | +30-40%           |
   | English         | Japanese        | -10% (characters) |
   | English         | Chinese         | -30% (characters) |
   | English         | Arabic          | +25%              |
   | English         | Russian         | +20%              |

   Button labels should have 30% extra space. Tooltips should not be width-constrained. Table columns should use flexible widths. If a button says "Save" (4 characters) in English, the German translation "Speichern" (10 characters) must fit. Design with the longest expected translation, not the English source.

7. **Reference dates, times, and currencies with format tokens.** Never hardcode date formats, time formats, or currency symbols in strings. `"March 15"` is American English. The same date is `"15 March"` in British English, `"15. März"` in German, and `"3月15日"` in Japanese. Use format tokens: `"{date}"` or `"{date, date, medium}"` in ICU MessageFormat. The i18n library and the user's locale determine the display format. The same applies to currencies: `"{price}"` not `"$49.99"` -- because the same amount is `"49,99 €"` in Germany (note: comma for decimal, symbol after number).

8. **Write translator-friendly comments for every string with a variable.** When a translator sees `"You have {count} new {type}"`, they need to know: What is {count}? A number. What is {type}? "messages," "notifications," or "alerts." Where does this string appear? In a notification badge. Without this context, the translator is guessing, and guesses produce bad translations. The comment format should include: variable descriptions, possible values, screen location, and character limits if applicable.

   ```json
   {
     "notification_badge": {
       "value": "You have {count} new {type}",
       "comment": "Notification badge in header. {count}: integer, always >= 1. {type}: 'messages', 'notifications', or 'alerts'. Max 40 chars."
     }
   }
   ```

## Details

### Concatenation Trap Examples

These patterns look correct in English but break in translation:

| Pattern (broken)                  | Why it breaks                                                        | Fix                                                                    |
| --------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `"Welcome, " + name`              | Name position varies by language (Japanese: name + "さん、ようこそ") | `"Welcome, {name}!"`                                                   |
| `verb + " " + count + " " + noun` | Word order changes (German: noun may come before count)              | `"{verb} {count} {noun}"` as one complete string                       |
| `"Delete " + itemType + "?"`      | Some languages need the noun before "delete"                         | `"Delete {itemType}?"` with context comment                            |
| `"in " + count + " days"`         | Preposition position varies; pluralization rules differ              | ICU: `"{count, plural, one {in {count} day} other {in {count} days}}"` |
| `status + " since " + date`       | "Since" position varies; date format varies                          | `"{status} since {date}"` with format token                            |
| `adjective + " " + noun`          | Adjective/noun order reverses in Romance and Asian languages         | `"{adjective} {noun}"` as one translatable unit                        |

The underlying principle: every sentence must be a single translatable unit. Fragments assembled at runtime are untranslatable because the assembly logic is English grammar.

### ICU MessageFormat Reference

ICU MessageFormat is the industry standard for translatable strings with dynamic content. Key patterns:

**Pluralization:**

```
{count, plural,
  =0 {No messages}
  one {{count} message}
  other {{count} messages}
}
```

**Gender selection:**

```
{gender, select,
  female {{name} updated her profile}
  male {{name} updated his profile}
  other {{name} updated their profile}
}
```

**Nested patterns:**

```
{count, plural,
  =0 {No files shared}
  one {{author} shared {count} file}
  other {{author} shared {count} files}
}
```

Translators add the plural categories their language needs. Arabic translators would add `zero`, `one`, `two`, `few`, `many`, and `other` categories. The CLDR defines which numbers map to which category per language.

### Text Expansion Design Guidelines

When designing UI to accommodate text expansion:

- **Buttons:** Use min-width, not fixed width. Set min-width to 120% of the English text width.
- **Navigation labels:** Allow wrapping to two lines or use abbreviation rules per locale.
- **Table headers:** Use flexible column widths. Never set fixed pixel widths for columns containing translated text.
- **Tooltips and popovers:** Use max-width constraints but allow height to grow.
- **Dialog titles:** Allow wrapping. A dialog title that is one line in English may be two lines in German.
- **Notification badges:** Use numeric counts instead of translated words when space is critical.

Test with pseudo-localization: generate fake translations that are 30-40% longer than the source and use accented characters (e.g., "[Ẃéĺçöḿé ţö ŷöûŕ ďáşĥƀöáŕď!!!]"). This reveals layout breaks before real translation begins.

### Translator Comment Conventions

Effective translator comments include four elements:

1. **Context:** Where does this string appear? "Shown in the page header when the user has unread notifications."
2. **Variables:** What do the placeholders contain? "{count}: integer >= 0. {name}: user's display name, max 50 chars."
3. **Constraints:** Are there length limits? "Max 30 characters including variables."
4. **Tone:** What tone should the translation use? "Informal, friendly. This is a success message."

Without these comments, translators work from guesswork. Mozilla's Pontoon translation platform requires comments for every string with a variable, reducing translation errors by an estimated 40%.

### Anti-Patterns

1. **The Concatenation Trap.** Building sentences by concatenating string fragments with variables: `"Showing " + count + " of " + total + " results"`. This produces correct English but fails in languages where word order differs, where prepositions change form based on the noun, or where the number affects the grammar of surrounding words. In Hungarian, the entire sentence structure may invert. In Arabic, the noun form changes based on the number. The fix: use a single template string with all variables: `"Showing {count} of {total} results"` -- and include a translator comment explaining what the variables contain and where the string appears.

2. **The Hardcoded Format.** Embedding date, time, currency, or number formats directly in strings. `"Prices start at $9.99/month"` hardcodes the dollar sign, the decimal format (period vs comma), and the currency position (before vs after the number). In Germany, this should be `"Ab 9,99 $/Monat"` (comma for decimal). In Japan, `"月額 $9.99 から"` (different word order). The fix: use format tokens for all dynamic values. `"Prices start at {price}/month"` where {price} is formatted by the i18n library according to the user's locale.

3. **The Orphaned Fragment.** A string that only makes sense when combined with other strings on the screen. "and 3 more" -- 3 more what? "in" -- in what? "total" -- total of what? These fragments are untranslatable because the translator has no context. In some languages, "and" changes form based on the following word, "in" requires a different preposition based on the noun, and "total" may need a different grammatical case. The fix: make every string a complete sentence or clause. "and 3 more files" or "{count} more files" with a translator comment.

4. **The English-Only Pluralization.** Using `count === 1 ? singular : plural` for pluralization. This works in English but fails in languages with multiple plural forms. Welsh has five plural forms. Arabic has six. Even French handles zero differently from English (French uses singular for zero: "0 message" not "0 messages"). The fix: use ICU MessageFormat or your framework's pluralization system, which maps to the Unicode CLDR plural rules for each language.

### Real-World Examples

**Mozilla's Pontoon Translation Platform.** Mozilla's Pontoon enforces i18n writing best practices by design. Every string requires context (a translator comment). Variables are displayed with their possible values. Plural forms are presented with all CLDR categories for the target language. Translators can see the string in its UI context via screenshots. The result: Mozilla products are translated into over 100 languages with consistently high quality. Pontoon's design encodes the principle that translation quality depends on source string quality -- well-written, well-commented source strings produce accurate translations.

**Airbnb's i18n String Patterns.** Airbnb localizes its product into 62 languages. Their i18n style guide mandates: complete sentences (no fragments), ICU MessageFormat for all pluralization, translator comments for every string with a variable, and pseudo-localization testing before every release. A typical Airbnb string: `"{host_name} is a Superhost in {city}. They have {review_count, plural, one {{review_count} review} other {{review_count} reviews}}."` The string is complete, self-contained, properly pluralized, and has a translator comment explaining each variable. This pattern scales to 62 languages because the source string carries all the context translators need.

**Android Resource String Best Practices.** Android's resource system (`strings.xml`) enforces externalization of all user-visible strings. Google's Android developer documentation provides explicit guidance: use `plurals` resources for pluralization, `string-array` for lists, and translator comments via `translatable` and `description` attributes. Android Studio flags hardcoded strings with lint warnings. The system also supports ICU MessageFormat natively through the `MessageFormat` class. Android's approach demonstrates that i18n writing quality improves when the framework enforces best practices rather than relying on developer discipline.

**Apple's Localization Guide.** Apple's internationalization documentation provides concrete examples of writing for translation. Their Xcode tooling generates a string catalog that surfaces every user-visible string, its context, and the translator comment. Apple mandates complete sentences in all localizable strings and provides a stringsdict format for pluralization that maps directly to CLDR plural categories. Their pseudo-localization testing tool simulates text expansion and right-to-left layout in every build, catching i18n writing failures before they reach translators.

## Source

- W3C Internationalization Best Practices -- https://www.w3.org/International/techniques/authoring-html
- Unicode CLDR Plural Rules -- https://cldr.unicode.org/index/cldr-spec/plural-rules
- ICU MessageFormat Documentation -- https://unicode-org.github.io/icu/userguide/format_parse/messages/
- Google i18n Guide -- Internationalization best practices for developers
- Mozilla Pontoon -- https://pontoon.mozilla.org, translation platform design principles
- Apple Internationalization and Localization Guide -- String management and translator guidance
- Android Developer Documentation -- Localization best practices and resource string guidelines

## Process

1. Read the instructions and examples in this document.
2. Audit existing strings for concatenation, hardcoded formats, and orphaned fragments.
3. Externalize all user-visible strings into resource files with translator comments.
4. Replace naive pluralization with ICU MessageFormat or equivalent.
5. Test with pseudo-localization to verify layout handles text expansion.
6. Verify your implementation against the anti-patterns listed above.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- No user-visible strings are hardcoded in application code -- all are externalized in resource files.
- No string concatenation is used to build sentences -- all strings are complete translatable units.
- All pluralization uses ICU MessageFormat or framework-equivalent, not conditional logic.
- Every string with a variable has a translator comment explaining the variable's content and context.
- Dates, times, currencies, and numbers use format tokens, not hardcoded formats.
- UI layouts accommodate 30-40% text expansion without breaking.
