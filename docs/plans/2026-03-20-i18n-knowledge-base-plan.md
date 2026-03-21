# Plan: i18n Knowledge Base Foundation

**Date:** 2026-03-20
**Spec:** docs/changes/i18n-localization-skills/proposal.md
**Estimated tasks:** 13
**Estimated time:** 65 minutes

## Goal

A comprehensive i18n knowledge base exists at `agents/skills/shared/i18n-knowledge/` containing locale profiles, industry guidance, framework detection profiles, anti-patterns, testing patterns, accessibility intersection rules, and MCP interop profiles -- all following the YAML conventions established by `agents/skills/shared/design-knowledge/`.

## Observable Truths (Acceptance Criteria)

1. `agents/skills/shared/i18n-knowledge/locales/` contains 20 YAML files (en, es, fr, de, pt, it, ja, zh-Hans, zh-Hant, ko, ar, he, hi, th, ru, pl, tr, nl, sv, fi), each with: plural rules (CLDR categories), text direction, expansion factor, script characteristics, number/date formatting, and common pitfalls.
2. `agents/skills/shared/i18n-knowledge/industries/` contains 5 YAML files (fintech, healthcare, ecommerce, legal, gaming), each with: name, description, i18n-specific requirements, anti-patterns, and examples -- following the same top-level key structure as `design-knowledge/industries/*.yaml`.
3. `agents/skills/shared/i18n-knowledge/frameworks/` contains 7 YAML files (react-intl, i18next, vue-i18n, flutter-intl, apple-strings, android-resources, backend-patterns), each with: detection patterns, key conventions, recommended tooling, and common anti-patterns.
4. `agents/skills/shared/i18n-knowledge/anti-patterns/` contains 5 YAML files (string-handling, formatting, pluralization, layout, encoding), each with patterns containing: name, severity, description, bad example, good example, and strictness levels -- following the same structure as `design-knowledge/anti-patterns/*.yaml`.
5. `agents/skills/shared/i18n-knowledge/testing/` contains 2 YAML files (pseudo-localization, locale-testing), each with: technique description, implementation guidance, and what it catches.
6. `agents/skills/shared/i18n-knowledge/accessibility/intersection.yaml` exists with rules for lang tags, bidi accessibility, and script sizing.
7. `agents/skills/shared/i18n-knowledge/mcp-interop/` contains 4 YAML files (tolgee, lingo-dev, lokalise, i18next-mcp), each with: server name, capabilities, when to use, and integration patterns.
8. All YAML files parse without error (valid YAML syntax).
9. `harness validate` passes after all files are created.

## File Map

```
CREATE agents/skills/shared/i18n-knowledge/locales/en.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/es.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/fr.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/de.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/pt.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/it.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/ja.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/zh-Hans.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/zh-Hant.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/ko.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/ar.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/he.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/hi.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/th.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/ru.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/pl.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/tr.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/nl.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/sv.yaml
CREATE agents/skills/shared/i18n-knowledge/locales/fi.yaml
CREATE agents/skills/shared/i18n-knowledge/industries/fintech.yaml
CREATE agents/skills/shared/i18n-knowledge/industries/healthcare.yaml
CREATE agents/skills/shared/i18n-knowledge/industries/ecommerce.yaml
CREATE agents/skills/shared/i18n-knowledge/industries/legal.yaml
CREATE agents/skills/shared/i18n-knowledge/industries/gaming.yaml
CREATE agents/skills/shared/i18n-knowledge/frameworks/react-intl.yaml
CREATE agents/skills/shared/i18n-knowledge/frameworks/i18next.yaml
CREATE agents/skills/shared/i18n-knowledge/frameworks/vue-i18n.yaml
CREATE agents/skills/shared/i18n-knowledge/frameworks/flutter-intl.yaml
CREATE agents/skills/shared/i18n-knowledge/frameworks/apple-strings.yaml
CREATE agents/skills/shared/i18n-knowledge/frameworks/android-resources.yaml
CREATE agents/skills/shared/i18n-knowledge/frameworks/backend-patterns.yaml
CREATE agents/skills/shared/i18n-knowledge/anti-patterns/string-handling.yaml
CREATE agents/skills/shared/i18n-knowledge/anti-patterns/formatting.yaml
CREATE agents/skills/shared/i18n-knowledge/anti-patterns/pluralization.yaml
CREATE agents/skills/shared/i18n-knowledge/anti-patterns/layout.yaml
CREATE agents/skills/shared/i18n-knowledge/anti-patterns/encoding.yaml
CREATE agents/skills/shared/i18n-knowledge/testing/pseudo-localization.yaml
CREATE agents/skills/shared/i18n-knowledge/testing/locale-testing.yaml
CREATE agents/skills/shared/i18n-knowledge/accessibility/intersection.yaml
CREATE agents/skills/shared/i18n-knowledge/mcp-interop/tolgee.yaml
CREATE agents/skills/shared/i18n-knowledge/mcp-interop/lingo-dev.yaml
CREATE agents/skills/shared/i18n-knowledge/mcp-interop/lokalise.yaml
CREATE agents/skills/shared/i18n-knowledge/mcp-interop/i18next-mcp.yaml
```

## Tasks

### Task 1: Create directory structure and locale profiles — Western European (en, es, fr, de, pt, it, nl, sv, fi)

**Depends on:** none
**Files:** `agents/skills/shared/i18n-knowledge/locales/{en,es,fr,de,pt,it,nl,sv,fi}.yaml`

Create the full `i18n-knowledge/` directory tree and write 9 Western European locale profiles. Each locale file follows this schema:

```yaml
locale: 'xx' # BCP 47 code
name: 'Language Name'
native_name: 'Native Name'
script: 'Latin'
direction: ltr
cldr_plural_categories: [one, other] # From CLDR, varies per locale
expansion_factor: 1.0 # Relative to English source
script_characteristics:
  avg_char_width: 'narrow' # narrow | standard | wide
  requires_complex_shaping: false
  line_break_rules: 'standard' # standard | dictionary (Thai) | no-spaces (CJK)
number_format:
  decimal_separator: '.'
  grouping_separator: ','
  grouping_size: 3
date_format:
  short: 'MM/DD/YYYY'
  long: 'Month DD, YYYY'
  first_day_of_week: 'sunday' # or "monday"
common_pitfalls:
  - pitfall: 'Description'
    example: '...'
    fix: '...'
```

Locale data sourced from CLDR:

| Locale | Plural categories | Expansion | Direction | Decimal | Grouping                    | Notable                    |
| ------ | ----------------- | --------- | --------- | ------- | --------------------------- | -------------------------- |
| en     | one, other        | 1.0       | LTR       | `.`     | `,`                         | Baseline                   |
| es     | one, many, other  | +20-25%   | LTR       | `,`     | `.`                         | Inverted punctuation       |
| fr     | one, many, other  | +15-20%   | LTR       | `,`     | ` ` (narrow no-break space) | Punctuation spacing        |
| de     | one, other        | +30-35%   | LTR       | `,`     | `.`                         | Long compound words        |
| pt     | one, many, other  | +20-25%   | LTR       | `,`     | `.`                         | pt-BR vs pt-PT differences |
| it     | one, many, other  | +15-20%   | LTR       | `,`     | `.`                         | Article-noun agreement     |
| nl     | one, other        | +20%      | LTR       | `,`     | `.`                         | Similar to de              |
| sv     | one, other        | +10%      | LTR       | `,`     | ` `                         | Definite suffixes          |
| fi     | one, other        | +30-40%   | LTR       | `,`     | ` `                         | 15 grammatical cases       |

Each file should have 3-5 common pitfalls relevant to that locale (e.g., for German: compound word breaks, formal/informal "you", gendered nouns; for French: punctuation spacing rules before `;:!?`, gendered agreement).

1. Create all directories:
   ```
   mkdir -p agents/skills/shared/i18n-knowledge/{locales,industries,frameworks,anti-patterns,testing,accessibility,mcp-interop}
   ```
2. Create each of the 9 locale YAML files with complete data per the schema above.
3. Run: `harness validate`
4. Commit: `feat(i18n-knowledge): add Western European locale profiles (en, es, fr, de, pt, it, nl, sv, fi)`

---

### Task 2: Locale profiles — East Asian (ja, zh-Hans, zh-Hant, ko)

**Depends on:** Task 1 (directory must exist)
**Files:** `agents/skills/shared/i18n-knowledge/locales/{ja,zh-Hans,zh-Hant,ko}.yaml`

East Asian locales require special attention for CJK-specific characteristics.

| Locale  | Plural categories             | Expansion                  | Direction | Decimal | Grouping | Notable                                    |
| ------- | ----------------------------- | -------------------------- | --------- | ------- | -------- | ------------------------------------------ |
| ja      | other (no plural distinction) | -10 to -30% (shorter)      | LTR       | `.`     | `,`      | 3 scripts, no word spaces, vertical text   |
| zh-Hans | other                         | -30 to -50% (much shorter) | LTR       | `.`     | `,`      | Simplified, no word spaces, CJK width      |
| zh-Hant | other                         | -30 to -50%                | LTR       | `.`     | `,`      | Traditional, used in TW/HK/MO              |
| ko      | other                         | -10% to +10%               | LTR       | `.`     | `,`      | Honorific levels, spacing differs from CJK |

Additional schema fields for CJK:

```yaml
script_characteristics:
  avg_char_width: 'wide'
  requires_complex_shaping: false # true for ja vertical
  line_break_rules: 'no-spaces'
  cjk_width_handling: true
  vertical_text_support: true # ja only
  multiple_scripts: true # ja: kanji + hiragana + katakana
```

Pitfalls should cover: CJK full-width vs half-width characters, no word boundaries for line breaking, character count vs string length, font fallback chains for CJK, text overflow with fixed-width containers.

1. Create each of the 4 locale YAML files.
2. Run: `harness validate`
3. Commit: `feat(i18n-knowledge): add East Asian locale profiles (ja, zh-Hans, zh-Hant, ko)`

---

### Task 3: Locale profiles — RTL languages (ar, he)

**Depends on:** Task 1 (directory must exist)
**Files:** `agents/skills/shared/i18n-knowledge/locales/{ar,he}.yaml`

RTL locales need extensive bidirectional text handling guidance.

| Locale | Plural categories                           | Expansion | Direction | Decimal             | Grouping            | Notable                                               |
| ------ | ------------------------------------------- | --------- | --------- | ------------------- | ------------------- | ----------------------------------------------------- |
| ar     | zero, one, two, few, many, other (6 forms!) | +25%      | RTL       | `٫` (Arabic) or `.` | `٬` (Arabic) or `,` | 6 plural forms, letter reshaping, Arabic-Indic digits |
| he     | one, two, many, other                       | +20%      | RTL       | `.`                 | `,`                 | Dual number, RTL, no reshaping                        |

Additional schema fields for RTL:

```yaml
direction: rtl
bidi_considerations:
  mirror_icons: true
  mirror_layout: true
  mixed_direction_text: true # Numbers/URLs in RTL context
  calendar_system: 'gregorian' # ar may use hijri
  digit_system: 'western' # or "arabic-indic" for ar
```

Pitfalls should cover: layout mirroring (margin/padding swap), icon mirroring (some icons should NOT mirror -- checkmarks, media controls), mixed LTR/RTL content in the same paragraph (bidi algorithm), CSS logical properties (start/end vs left/right), number direction in RTL context.

1. Create each of the 2 locale YAML files with comprehensive bidi guidance.
2. Run: `harness validate`
3. Commit: `feat(i18n-knowledge): add RTL locale profiles (ar, he)`

---

### Task 4: Locale profiles — South/Southeast Asian and Cyrillic (hi, th, ru, pl, tr)

**Depends on:** Task 1 (directory must exist)
**Files:** `agents/skills/shared/i18n-knowledge/locales/{hi,th,ru,pl,tr}.yaml`

These locales have distinct script/shaping requirements.

| Locale | Plural categories     | Expansion | Direction | Decimal | Grouping                | Notable                                                           |
| ------ | --------------------- | --------- | --------- | ------- | ----------------------- | ----------------------------------------------------------------- |
| hi     | one, other            | +25-30%   | LTR       | `.`     | `,` (Indian: 12,34,567) | Devanagari ligatures, Indian number grouping                      |
| th     | other                 | +15%      | LTR       | `.`     | `,`                     | No word spaces, dictionary-based line breaking, complex shaping   |
| ru     | one, few, many, other | +20-25%   | LTR       | `,`     | ` `                     | 4 plural forms, Cyrillic, 6 grammatical cases                     |
| pl     | one, few, many, other | +20-30%   | LTR       | `,`     | ` `                     | 4 plural forms, complex pluralization rules                       |
| tr     | one, other            | +15-20%   | LTR       | `,`     | `.`                     | Dotted vs dotless i (I/i vs I/i), Turkish locale-sensitive casing |

Special considerations:

- hi: Indian number grouping (last group of 3, then groups of 2: 1,23,45,678)
- th: requires ICU/dictionary-based line breaking (no spaces between words)
- tr: `"istanbul".toUpperCase()` produces wrong result without Turkish locale (`ISTANBUL` vs `ISTANBUL` -- dotted I issue)

1. Create each of the 5 locale YAML files.
2. Run: `harness validate`
3. Commit: `feat(i18n-knowledge): add South/Southeast Asian and Cyrillic locale profiles (hi, th, ru, pl, tr)`

---

### Task 5: Industry profiles (fintech, healthcare, ecommerce, legal, gaming)

**Depends on:** Task 1 (directory must exist)
**Files:** `agents/skills/shared/i18n-knowledge/industries/{fintech,healthcare,ecommerce,legal,gaming}.yaml`

Follow the same top-level key structure as `design-knowledge/industries/*.yaml` (name, description, then domain-specific sections), but with i18n-focused content instead of design content.

Schema for i18n industry profiles:

```yaml
name: 'Industry Name'
description: 'One-line description of i18n challenges in this industry'

requirements:
  - area: 'Category (e.g., Currency, Dates, Legal)'
    description: 'What must be handled'
    severity: error # error | warning | info
    locales_affected: 'all' # or specific locales
    examples:
      - bad: 'code example'
        good: 'code example'

anti_patterns:
  - pattern: 'Description of what goes wrong'
    reason: 'Why it matters in this industry'
    instead: 'What to do instead'

regulations:
  - name: 'Regulation name'
    locales: ['xx', 'yy']
    impact: 'What it requires for i18n'

reference_products: ['example.com', 'another.com']
```

Industry-specific content:

- **fintech:** Currency precision per locale (JPY=0 decimals, BHD=3), number formatting, regulatory date formats, financial amount display, PCI compliance for localized forms
- **healthcare:** FDA date format requirements (no ambiguous MM/DD vs DD/MM), medical terminology translation risks, IFU (Instructions for Use) localization, patient consent forms, HIPAA-compliant translation workflows
- **ecommerce:** Address format per country, measurement unit conversion (metric/imperial), sizing chart localization, phone number formatting (E.164), tax display (VAT inclusive vs exclusive), shipping/payment method localization
- **legal:** Contract date format (avoid ambiguous dates), jurisdiction-specific legal terminology, right-to-left legal document layout, notarization/certification of translations, GDPR consent language per locale
- **gaming:** Character limits in UI (fixed-width HUDs), cultural adaptation vs translation (color symbolism, gestures), ESRB/PEGI rating differences, in-game text rendering (bitmap fonts, dynamic text), voiceover synchronization

1. Create each of the 5 industry YAML files.
2. Run: `harness validate`
3. Commit: `feat(i18n-knowledge): add i18n industry profiles (fintech, healthcare, ecommerce, legal, gaming)`

---

### Task 6: Framework profiles — Web (react-intl, i18next, vue-i18n)

**Depends on:** Task 1 (directory must exist)
**Files:** `agents/skills/shared/i18n-knowledge/frameworks/{react-intl,i18next,vue-i18n}.yaml`

Schema for framework profiles:

```yaml
name: 'Framework Name'
description: 'One-line description'
platforms: ['web'] # web, mobile, backend
message_format: 'icu' # icu | i18next | custom

detection:
  package_json_keys:
    dependencies: ['package-name']
    devDependencies: ['dev-package']
  file_patterns: ['glob/pattern']
  config_files: ['config-file-name']

conventions:
  key_format: 'dot-notation' # dot-notation | nested | flat
  file_format: 'json' # json | yaml | po | xliff | arb | strings | xml
  file_structure: 'locales/{locale}/{namespace}.json'
  plural_syntax: 'ICU {count, plural, one {# item} other {# items}}'
  interpolation_syntax: '{variable}'

recommended_tooling:
  extraction: ['tool-name']
  linting: ['eslint-plugin-name']
  pseudo_locale: ['tool-name']

anti_patterns:
  - pattern: 'Description'
    severity: warning
    instead: 'What to do'

migration_notes:
  from:
    - framework: 'other-framework'
      guidance: 'How to migrate'
```

Content per framework:

- **react-intl (FormatJS):** Detects `react-intl` or `@formatjs/*` in package.json. ICU MessageFormat syntax. `<FormattedMessage>` components and `intl.formatMessage()` API. `eslint-plugin-formatjs` for linting. AST-based message extraction via `@formatjs/cli`. Common anti-pattern: string concatenation inside `FormattedMessage`.
- **i18next:** Detects `i18next`, `react-i18next`, `next-i18next` in package.json. Custom interpolation `{{variable}}` by default, configurable. Namespace-based file splitting. `i18next-parser` for extraction. Common anti-pattern: not using `count` option for pluralization.
- **vue-i18n:** Detects `vue-i18n` in package.json. `$t()` and `<i18n-t>` component. SFC `<i18n>` blocks for component-local messages. `@intlify/vue-i18n-extensions` for SSR. Common anti-pattern: using `v-html` with translated strings (XSS risk).

1. Create each of the 3 framework YAML files.
2. Run: `harness validate`
3. Commit: `feat(i18n-knowledge): add web framework profiles (react-intl, i18next, vue-i18n)`

---

### Task 7: Framework profiles — Mobile and backend (flutter-intl, apple-strings, android-resources, backend-patterns)

**Depends on:** Task 1 (directory must exist)
**Files:** `agents/skills/shared/i18n-knowledge/frameworks/{flutter-intl,apple-strings,android-resources,backend-patterns}.yaml`

Same schema as Task 6 but for mobile and backend:

- **flutter-intl:** Detects `flutter_localizations`, `intl` in pubspec.yaml. ARB file format. `Intl.message()` and code-gen approach (`flutter gen-l10n`). Common anti-pattern: hardcoded strings in `Text()` widgets.
- **apple-strings:** Detects `.strings`, `.stringsdict`, `.xcstrings` (String Catalogs) files. `NSLocalizedString()` macro (ObjC) and `String(localized:)` (Swift). `genstrings` for extraction. Common anti-pattern: missing `.stringsdict` for plurals.
- **android-resources:** Detects `res/values/strings.xml`. `getString(R.string.key)` API. `<plurals>` element for pluralization. Common anti-pattern: string concatenation in Java/Kotlin instead of using `getString()` with format args.
- **backend-patterns:** No single framework -- detects patterns across Node (i18next-node), Python (gettext, babel), Go (go-i18n), Java (ResourceBundle). Error catalog pattern, email template localization, notification content. Common anti-pattern: hardcoded strings in API error responses.

1. Create each of the 4 framework YAML files.
2. Run: `harness validate`
3. Commit: `feat(i18n-knowledge): add mobile and backend framework profiles (flutter-intl, apple-strings, android-resources, backend-patterns)`

---

### Task 8: Anti-pattern definitions — string-handling and formatting

**Depends on:** Task 1 (directory must exist)
**Files:** `agents/skills/shared/i18n-knowledge/anti-patterns/{string-handling,formatting}.yaml`

Follow the exact structure of `design-knowledge/anti-patterns/*.yaml`: top-level `description` key, then `patterns` array where each pattern has `name`, `severity`, `scope`, `detect`, `reason`, `instead`, and `strictness` keys.

**string-handling.yaml** patterns (6-8 patterns):

- String concatenation for sentences (`"Hello, " + name + "!"` -- word order varies by locale)
- Hardcoded user-facing strings (strings in JSX/templates not wrapped in t())
- Substring/split on translated strings (word boundaries differ by locale)
- Hardcoded plural logic (`count === 1 ? "item" : "items"` -- Arabic has 6 forms)
- String templates with positional assumptions (`${greeting} ${name}` -- order varies)
- UI text in code comments used as display strings
- String length validation on translated input (translated strings expand)
- Case transformation without locale (`toUpperCase()` breaks Turkish dotted-i)

**formatting.yaml** patterns (6-8 patterns):

- Date formatting without locale (`new Date().toLocaleDateString()` without locale arg)
- Number formatting with hardcoded separators (`value.toFixed(2).replace('.', ',')`)
- Currency display with hardcoded symbol (`"$" + amount` -- symbol position varies)
- Phone number formatting without libphonenumber
- Address formatting with hardcoded field order (country-specific)
- Percentage formatting assumptions (some locales put space before %)
- Hardcoded decimal precision (JPY has 0 decimals, BHD has 3)
- Time zone display without IANA identifier

1. Create both YAML files with all patterns.
2. Run: `harness validate`
3. Commit: `feat(i18n-knowledge): add string-handling and formatting anti-patterns`

---

### Task 9: Anti-pattern definitions — pluralization, layout, encoding

**Depends on:** Task 1 (directory must exist)
**Files:** `agents/skills/shared/i18n-knowledge/anti-patterns/{pluralization,layout,encoding}.yaml`

Same structure as Task 8.

**pluralization.yaml** patterns (5-6 patterns):

- Binary plural logic (only handling singular/plural -- ignoring zero, two, few, many)
- Hardcoded English plural rules applied to all locales
- Missing CLDR plural categories for target locales
- Ordinal pluralization not handled (1st, 2nd, 3rd vary by locale)
- Plural forms embedded in UI code instead of message format
- Count-based display without using plural-aware formatter

**layout.yaml** patterns (5-6 patterns):

- Fixed-width containers for text (translated text overflows)
- Hardcoded CSS `left`/`right` instead of logical `start`/`end` properties
- Icon placement assumptions (icons on left for LTR, need mirroring for RTL)
- Text truncation with `...` without `dir` attribute (bidi truncation issues)
- Fixed height on text containers (multi-line expansion in some locales)
- Image/graphic containing embedded text (untranslatable)

**encoding.yaml** patterns (4-5 patterns):

- Assuming 1 character = 1 byte (UTF-8 is multi-byte)
- String length !== visual width (CJK characters are double-width)
- Missing UTF-8 BOM handling (some Windows tools add BOM)
- Emoji skin tone/ZWJ sequence handling (grapheme cluster splitting)
- Filename/URL encoding not handling non-ASCII characters

1. Create all 3 YAML files.
2. Run: `harness validate`
3. Commit: `feat(i18n-knowledge): add pluralization, layout, and encoding anti-patterns`

---

### Task 10: Testing patterns (pseudo-localization, locale-testing)

**Depends on:** Task 1 (directory must exist)
**Files:** `agents/skills/shared/i18n-knowledge/testing/{pseudo-localization,locale-testing}.yaml`

Schema for testing profiles:

```yaml
description: 'What this testing technique is'

techniques:
  - name: 'Technique name'
    description: 'What it does'
    catches:
      - 'What problems it reveals'
    implementation:
      approach: 'How to implement'
      tools: ['tool-name']
      example: |
        // code example
    when_to_use: 'At what stage of development'
    automation: 'How to integrate into CI'
```

**pseudo-localization.yaml:**

- Accent character replacement (a -> a, e -> e, etc.) -- reveals hardcoded strings missed by extraction
- Text expansion (+35% padding with repeated characters) -- reveals layout overflow
- Bracket wrapping ([translated text]) -- reveals concatenated strings (brackets break across concatenation boundaries)
- Mirror/bidi simulation -- reveals RTL layout issues without needing a real RTL locale
- Placeholder preservation -- ensures `{variable}` and `{{variable}}` survive pseudo-localization
- Tools: `pseudo-localization` npm package, `@formatjs/cli --pseudo-locale`, custom generator patterns
- CI integration: generate pseudo-locale as build step, run visual regression tests against it

**locale-testing.yaml:**

- Functional testing per locale (form submission, date picker, number input with locale formatting)
- Visual regression testing across locales (screenshot comparison for text overflow, RTL layout)
- Boundary locale testing (test with longest translations, most plural forms -- typically German/Finnish for length, Arabic for complexity)
- Input method testing (CJK IME, Arabic keyboard, Devanagari input)
- Locale switching testing (runtime locale change without page reload)
- Tools: Playwright locale emulation, BrowserStack locale testing, Flutter integration test locales

1. Create both YAML files.
2. Run: `harness validate`
3. Commit: `feat(i18n-knowledge): add testing patterns (pseudo-localization, locale-testing)`

---

### Task 11: Accessibility x i18n intersection rules

**Depends on:** Task 1 (directory must exist)
**Files:** `agents/skills/shared/i18n-knowledge/accessibility/intersection.yaml`

Schema:

```yaml
description: 'Rules at the intersection of i18n and accessibility'

rules:
  - name: 'Rule name'
    category: 'lang-tags | bidi-a11y | script-sizing | screen-readers'
    wcag_criteria: ['x.x.x']
    description: 'What the rule requires'
    detect:
      method: 'How to detect violations'
    reason: 'Why it matters'
    fix: 'How to fix it'
    severity: error
    strictness:
      permissive: info
      standard: warn
      strict: error
```

Rules to include:

- `lang` attribute on `<html>` element (WCAG 3.1.1) -- screen readers use this for pronunciation
- `lang` attribute on inline language switches (WCAG 3.1.2) -- `<span lang="fr">bonjour</span>`
- `dir` attribute for RTL content -- screen readers need this for reading order
- `dir="auto"` on user-generated content containers -- unknown text direction
- Font size scaling for complex scripts (Devanagari, Thai, Arabic need larger minimum sizes)
- Screen reader pronunciation of numbers/dates (must use semantic markup, not visual formatting)
- ARIA labels must be translated (not just visible text)
- `hreflang` attribute on alternate-language links
- Translated alt text for images (not just UI text)
- Keyboard navigation in RTL layouts (Tab order must follow visual order)

1. Create the intersection YAML file.
2. Run: `harness validate`
3. Commit: `feat(i18n-knowledge): add accessibility x i18n intersection rules`

---

### Task 12: MCP interop profiles (tolgee, lingo-dev, lokalise, i18next-mcp)

**Depends on:** Task 1 (directory must exist)
**Files:** `agents/skills/shared/i18n-knowledge/mcp-interop/{tolgee,lingo-dev,lokalise,i18next-mcp}.yaml`

Schema for MCP interop profiles:

```yaml
name: 'Server Name'
description: 'What this MCP server does'
mcp_server_id: 'server-identifier'
source: 'https://github.com/...'

capabilities:
  - name: 'Capability name'
    description: 'What it does'
    tools: ['tool_name'] # MCP tool names

when_to_use:
  - scenario: 'When to recommend this server'
    reason: 'Why it fits'

when_not_to_use:
  - scenario: 'When this is not the right choice'
    reason: 'Why it does not fit'

integration_patterns:
  - pattern: 'How to integrate with harness workflow'
    description: 'Step by step'
    config_example: |
      // Example harness.config.json mcp block

limitations:
  - 'Known limitation'
```

Content per server:

- **tolgee:** TMS with in-context editing. Capabilities: project management, key management, translation retrieval/update, screenshot management. Best for: teams wanting a self-hosted TMS with developer-friendly workflow. 59 MCP tools exposed.
- **lingo-dev:** AI translation with brand voice. Capabilities: multi-engine machine translation, glossary management, brand voice consistency, batch translation. Best for: teams needing high-quality MT with terminology consistency.
- **lokalise:** Enterprise TMS. Capabilities: key management, file upload/download, task management, team collaboration, branching. Best for: larger teams with complex translation workflows and QA processes.
- **i18next-mcp:** i18next-specific tooling. Capabilities: project analysis, translation coverage reporting, key usage analysis, namespace management. Best for: projects already using i18next that want deeper project insights.

1. Create all 4 MCP interop YAML files.
2. Run: `harness validate`
3. Commit: `feat(i18n-knowledge): add MCP interop profiles (tolgee, lingo-dev, lokalise, i18next-mcp)`

---

### Task 13: Validation sweep and final commit

[checkpoint:human-verify]

**Depends on:** Tasks 1-12
**Files:** all files in `agents/skills/shared/i18n-knowledge/`

Final validation pass across all 44 YAML files:

1. Verify YAML syntax for every file:
   ```bash
   for f in $(find agents/skills/shared/i18n-knowledge -name '*.yaml'); do
     node -e "const YAML = require('yaml'); const fs = require('fs'); YAML.parse(fs.readFileSync('$f', 'utf8'));" && echo "OK: $f" || echo "FAIL: $f"
   done
   ```
2. Verify file count: `find agents/skills/shared/i18n-knowledge -name '*.yaml' | wc -l` should output `44`
3. Verify directory structure matches spec:
   ```bash
   ls agents/skills/shared/i18n-knowledge/locales/ | wc -l    # 20
   ls agents/skills/shared/i18n-knowledge/industries/ | wc -l  # 5
   ls agents/skills/shared/i18n-knowledge/frameworks/ | wc -l  # 7
   ls agents/skills/shared/i18n-knowledge/anti-patterns/ | wc -l # 5
   ls agents/skills/shared/i18n-knowledge/testing/ | wc -l     # 2
   ls agents/skills/shared/i18n-knowledge/accessibility/ | wc -l # 1
   ls agents/skills/shared/i18n-knowledge/mcp-interop/ | wc -l # 4
   ```
4. Run: `harness validate`
5. If any issues found, fix and commit: `fix(i18n-knowledge): correct YAML validation issues`
6. If all clean, no additional commit needed.

Present results to human for review before proceeding to Phase 2.
