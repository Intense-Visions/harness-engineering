# Harness i18n

> Internationalization compliance verification. Detect hardcoded strings, missing translations, locale-sensitive formatting, RTL issues, and concatenation anti-patterns across web, mobile, and backend codebases.

## When to Use

- Auditing new or existing codebases for i18n compliance
- Before PR merge to catch i18n regressions
- When `on_pr` or `on_commit` triggers fire and changes touch user-facing strings
- When translation files change (missing keys, untranslated values)
- After adding a new target locale to verify coverage
- When `on_review` triggers fire to validate i18n considerations
- NOT for setting up translation infrastructure (use harness-i18n-workflow)
- NOT for injecting i18n into brainstorming/planning (use harness-i18n-process)
- NOT for performing translations (use TMS tools or MCP integrations)
- NOT for non-user-facing code (internal logging, debug messages, developer tooling)

## Process

### Phase 1: DETECT -- Identify i18n Context

1. **Read harness configuration.** Check `harness.config.json` for `i18n` block:
   - `i18n.enabled` -- master toggle (if false or missing, run in discovery mode: detect but do not enforce)
   - `i18n.strictness` -- enforcement level (`strict`, `standard`, `permissive`)
   - `i18n.sourceLocale` -- BCP 47 code of source language (default: `en`)
   - `i18n.targetLocales` -- array of BCP 47 codes for target languages
   - `i18n.framework` -- `auto` or specific framework name
   - `i18n.platforms` -- which platforms to scan (`web`, `mobile`, `backend`)
   - `i18n.coverage` -- coverage thresholds and requirements

2. **Auto-detect project platform(s).** Scan project root for:
   - Web: `package.json` with React/Vue/Svelte/Next/Nuxt deps, `.tsx`/`.jsx`/`.vue`/`.svelte` files
   - Mobile iOS: `*.xcodeproj`, `Podfile`, `Package.swift`, `.swift` files
   - Mobile Android: `build.gradle`/`build.gradle.kts`, `AndroidManifest.xml`, `.kt`/`.java` files
   - Mobile Flutter: `pubspec.yaml` with `flutter` dependency, `.dart` files
   - Backend: `package.json` with Express/Fastify/NestJS, `requirements.txt`/`pyproject.toml`, `go.mod`, `pom.xml`/`build.gradle`

3. **Auto-detect i18n framework.** Read framework detection profiles from `agents/skills/shared/i18n-knowledge/frameworks/`. For each profile, check:
   - `detection.package_json_keys` -- dependencies and devDependencies in `package.json`
   - `detection.config_files` -- presence of framework config files
   - `detection.file_patterns` -- translation file patterns
   - Match the first profile that satisfies detection criteria. If none match, record "no i18n framework detected."

4. **Locate existing translation files.** Search for:
   - JSON files in `locales/`, `src/locales/`, `public/locales/`, `assets/translations/`
   - `.strings` and `.stringsdict` files (iOS)
   - `res/values*/strings.xml` (Android)
   - `.arb` files (Flutter)
   - PO/POT files (gettext)
   - If `i18n.translationPaths` is configured, use those paths instead.

5. **Load locale profiles.** For each locale in `i18n.targetLocales` (or detected from translation files), read the locale profile from `agents/skills/shared/i18n-knowledge/locales/{locale}.yaml`. This provides: plural rules, text direction, expansion factor, script characteristics, common pitfalls.

6. **Load industry profile.** If `i18n.industry` is configured, read `agents/skills/shared/i18n-knowledge/industries/{industry}.yaml` for industry-specific rules.

7. **Report detection results before proceeding:**

   ```
   i18n Detection Report
   =====================
   Config:             Found (i18n.enabled: true, strictness: standard)
   Platform(s):        web, backend
   Framework:          i18next (detected from package.json)
   Translation files:  public/locales/{en,es,fr}/*.json (3 locales, 4 namespaces)
   Source locale:      en
   Target locales:     es, fr
   Industry profile:   fintech (loaded)
   ```

### Phase 2: SCAN -- Detect i18n Violations

1. **Determine scan scope.** Based on detected platforms, select file patterns:
   - Web: `**/*.{tsx,jsx,vue,svelte,html}` and `**/*.{ts,js}` (for template literals in rendering code)
   - Mobile iOS: `**/*.swift`
   - Mobile Android: `**/*.{kt,java}`, `**/res/values*/*.xml`
   - Mobile Flutter: `**/*.dart`
   - Backend: `**/*.{ts,js,py,go,java}` (filtered to HTTP handlers, templates, email services)
   - Exclude: `node_modules`, `build`, `dist`, `.next`, `vendor`, `Pods`, test files (unless explicitly included)

2. **Scan for hardcoded user-facing strings.** For each platform, apply these detection rules:

   _Web (React/Vue/Svelte/vanilla):_
   - `I18N-001` String literals in JSX text content (text nodes between tags)
   - `I18N-002` String literals in i18n-sensitive props: `title`, `placeholder`, `alt`, `aria-label`, `aria-description`
   - `I18N-003` Template literals with user-facing text in JSX or template expressions
   - Exclude: CSS class names, data attributes, event names, `key` prop, `id`, `data-testid`, `className`, `style`, `type`, `role`, `htmlFor`, `ref`, numeric literals, boolean props, import/require paths

   _Mobile iOS (SwiftUI/UIKit):_
   - `I18N-011` String literals in `Text()`, `Label()`, `Alert()`, `.navigationTitle()`, `.toolbar` labels
   - `I18N-012` String literals in `UILabel.text`, `UIButton.setTitle`, `UIAlertController` messages
   - Exclude: SF Symbol names, asset names, notification names, UserDefaults keys

   _Mobile Android (Compose/Views):_
   - `I18N-021` String literals in `Text()`, `TextField()`, `Button()` content
   - `I18N-022` String literals in `setText()`, `setTitle()`, `Toast.makeText()`
   - Exclude: Log tags, intent actions, preference keys, layout identifiers

   _Mobile Flutter:_
   - `I18N-031` String literals in `Text()`, `TextSpan()`, `AppBar(title:)`, `SnackBar(content:)`
   - Exclude: route names, asset paths, key values

   _Backend:_
   - `I18N-041` String literals in HTTP response bodies (`res.json({ message: '...' })`, `res.send('...')`)
   - `I18N-042` String literals in email template content (detected via email service imports)
   - `I18N-043` String literals in notification payloads
   - Exclude: log messages (unless returned to users), internal error codes, header names, route paths

3. **Scan for locale-sensitive formatting.**
   - `I18N-101` `new Date().toLocaleDateString()` without explicit locale argument
   - `I18N-102` `Number.toFixed()`, `.toLocaleString()` without locale argument
   - `I18N-103` Hardcoded currency symbols (`$`, `EUR`, etc.) in string templates
   - `I18N-104` Hardcoded decimal separators (`.` for decimal, `,` for thousands)
   - `I18N-105` `new Intl.DateTimeFormat()` or `new Intl.NumberFormat()` without locale parameter (using implicit browser locale is often a bug)

4. **Scan for missing `lang`/`dir` attributes.**
   - `I18N-201` Missing `lang` attribute on `<html>` element
   - `I18N-202` Missing `dir` attribute on `<html>` element (required when any target locale is RTL)
   - `I18N-203` Missing `dir="auto"` on user-generated content containers (detected via heuristic: elements rendering user input, comments, messages)
   - `I18N-204` Hardcoded `left`/`right` in CSS or style props instead of logical properties (`start`/`end`, `inline-start`/`inline-end`) -- only flagged when RTL locales are in target list

5. **Scan for string concatenation.**
   - `I18N-301` String concatenation to build user-facing messages (`"Hello, " + name`, `` `Welcome ${name}` `` used as complete messages)
   - `I18N-302` Array `.join()` to build sentences or messages
   - `I18N-303` Conditional text assembly (`isPlural ? "items" : "item"` -- hardcoded plural logic)
   - Provide framework-specific alternative in the finding (e.g., for i18next: `t('greeting', { name })`)

6. **Scan translation files for completeness.**
   - `I18N-401` Missing keys: keys present in source locale file but absent in target locale file
   - `I18N-402` Untranslated values: values in target locale file identical to source locale (suggesting copy-paste, not translation)
   - `I18N-403` Missing plural forms: for each locale, check that all required CLDR plural categories are present. Load plural rules from locale profile (e.g., Arabic requires: zero, one, two, few, many, other).
   - `I18N-404` Empty translation values (key exists but value is empty string)
   - `I18N-405` Orphan keys: keys in translation files not referenced in source code (requires cross-referencing with source scan)

7. **Record all findings.** Each finding includes:
   - File path
   - Line number (approximate, from Grep output)
   - Violation code (e.g., `I18N-001`)
   - Category: `strings`, `formatting`, `attributes`, `concatenation`, `translations`
   - Element or pattern that triggered the finding
   - Raw evidence (the matching line of code)

### Phase 3: REPORT -- Generate i18n Report

1. **Assign severity based on `i18n.strictness`:**
   - `strict` mode: all violations are `error` severity
   - `standard` mode: hardcoded strings and missing translations are `error`; formatting and concatenation are `warn`; orphan keys and info patterns are `info`
   - `permissive` mode: missing translations and hardcoded strings are `warn`; everything else is `info`
   - Discovery mode (unconfigured): all findings are `info`

2. **Generate summary header:**

   ```
   i18n Report
   ===========
   Scanned:     87 source files, 12 translation files
   Findings:    24 total (8 error, 12 warn, 4 info)
   Strictness:  standard
   Framework:   i18next
   Platforms:   web, backend
   Locales:     en (source), es, fr (targets)
   ```

3. **List findings grouped by category.** Each finding follows this format:

   ```
   I18N-001 [error] Hardcoded string in JSX text content
     File:       src/components/Header.tsx
     Line:       12
     Element:    <h1>Welcome to our platform</h1>
     Category:   strings
     Fix:        Wrap in translation: <h1>{t('header.welcome')}</h1>
   ```

   ```
   I18N-401 [error] Missing translation key
     File:       public/locales/es/common.json
     Key:        checkout.summary.totalLabel
     Source:     "Total" (en)
     Category:   translations
     Fix:        Add key to es/common.json with Spanish translation
   ```

4. **Provide category summaries** with counts and severity breakdown:

   ```
   Category Breakdown
   ------------------
   Strings:        12 findings (6 error, 4 warn, 2 info)
   Translations:    6 findings (4 error, 2 warn)
   Formatting:      3 findings (0 error, 3 warn)
   Attributes:      2 findings (1 error, 1 warn)
   Concatenation:   1 finding  (0 error, 1 warn)
   ```

5. **Provide translation coverage summary** (if translation files exist):

   ```
   Translation Coverage
   --------------------
   Locale   Keys    Translated   Coverage   Missing Plurals
   en       142     142          100%       0
   es       142     128          90.1%      2
   fr       142     135          95.1%      0
   ```

6. **If graph is available** (`.harness/graph/` exists): map findings to components/routes for contextual coverage. Report per-component translation coverage.

7. **If graph is unavailable**: report per-file key-level coverage. Group findings by source file.

8. **List actionable next steps:**
   - Errors that can be auto-fixed (Phase 4)
   - Errors that require human judgment (choosing translation keys, writing translations)
   - Warnings to address in next iteration
   - Coverage gaps to escalate to translation workflow (harness-i18n-workflow)

### Phase 4: FIX -- Apply Automated Remediation (Optional)

This phase is optional. It applies fixes only for mechanical issues -- violations with a single, unambiguous correct fix. Translation content, key naming, and locale-specific formatting choices are never auto-fixed.

1. **Fixable violations:**
   - `I18N-001`/`I18N-002`: Wrap string literals in framework translation call. Detect framework from Phase 1:
     - i18next: `{t('generated.key')}` (generate key from string content, dot-notation)
     - react-intl: `<FormattedMessage id="generated.key" defaultMessage="original text" />`
     - vue-i18n: `{{ $t('generated.key') }}`
     - No framework: `{t('generated.key')}` (generic, user picks framework later)
   - `I18N-201`: Add `lang="{sourceLocale}"` to `<html>` element
   - `I18N-202`: Add `dir="ltr"` (or `dir="auto"` if RTL locales are targets) to `<html>` element
   - `I18N-203`: Add `dir="auto"` to user-content containers
   - `I18N-404`: Flag empty translation values for review (not auto-fillable)

2. **Apply each fix as a minimal, targeted edit.** Use the Edit tool. Do not refactor surrounding code. Do not change formatting. The fix should be the smallest possible change that resolves the violation.

3. **Show before/after diff for each fix.** Present the exact change to the user. This is a hard gate -- no fix is applied without showing the diff first.

4. **Interactive confirmation per fix category.** Group fixes by category (string wrapping, attribute addition) and ask for approval per category, not per individual fix:

   ```
   Fix Category: String Wrapping (12 fixes)
   -----------------------------------------
   Wrap 12 hardcoded strings in t() calls across 5 files.
   Generated keys follow dot-notation: component.element.description

   Apply these fixes? [y/n]
   ```

5. **Generate extraction output.** For each wrapped string, output the key-value pair that needs to be added to the source locale translation file:

   ```json
   {
     "header.welcome": "Welcome to our platform",
     "checkout.totalLabel": "Total",
     "auth.loginButton": "Sign in"
   }
   ```

6. **Re-scan after fixes.** Run the scan phase again on fixed files to confirm violations are resolved. Report:
   - Fixes applied: N
   - Violations resolved: N
   - Keys extracted: N (add to source locale file)
   - Remaining violations (require human judgment): M

7. **Do NOT fix:**
   - Translation content (requires human translators or TMS)
   - Key naming beyond generated defaults (requires project context)
   - Locale-sensitive formatting (requires knowing the correct Intl API usage for each case)
   - Plural form additions (requires CLDR knowledge + framework-specific syntax)
   - Any fix that would change the runtime behavior of the application

## Harness Integration

- **`harness validate`** -- i18n findings surface when `i18n.enabled` is true and `i18n.strictness` is `strict` or `standard`. Running validate after a scan reflects the current i18n state.
- **`harness-integrity`** -- The i18n scan is chained into integrity checks when `i18n.enabled: true`. Findings are included in the unified integrity report.
- **`harness-release-readiness`** -- Translation coverage is checked against `i18n.coverage.minimumPercent`. Per-locale coverage is reported.
- **`harness-accessibility`** -- When both i18n and accessibility skills are enabled, `lang`/`dir` attribute checks are handled by the i18n skill. The accessibility skill defers I18N-201/202/203 to avoid duplicate findings.
- **`harness-i18n-workflow`** -- After scanning, coverage gaps and extracted keys can be passed to the workflow skill for scaffolding and translation file updates.
- **Knowledge base** at `agents/skills/shared/i18n-knowledge/` -- Framework profiles, locale profiles, industry profiles, and anti-pattern catalogs are consumed during detect and scan phases.

## Success Criteria

- All scanned source files have findings categorized by violation code and severity
- Hardcoded user-facing strings detected with correct platform-specific rules (web, mobile, backend)
- Missing translation keys and untranslated values identified with file paths and key names
- Locale-sensitive formatting issues (dates, numbers, currencies) flagged with specific file and line references
- RTL and `lang`/`dir` attribute violations detected when target locales include RTL languages
- String concatenation and hardcoded plural logic identified as anti-patterns
- Report generated with violation codes, categories, severity, and actionable remediation
- Automated fixes applied only for mechanical issues (string wrapping, attribute addition) with interactive confirmation
- Translation coverage reported per-locale against configured thresholds
- `harness validate` reflects i18n findings at the configured strictness level

## Examples

### Example: Scanning a React + i18next Project

**Context:** A React web app using i18next with English source, targeting Spanish and French. The `harness.config.json` has:

```json
{
  "version": 1,
  "i18n": {
    "enabled": true,
    "strictness": "standard",
    "sourceLocale": "en",
    "targetLocales": ["es", "fr"],
    "framework": "auto",
    "platforms": ["web"]
  }
}
```

**Phase 1: DETECT**

```
i18n Detection Report
=====================
Config:             Found (i18n.enabled: true, strictness: standard)
Platform(s):        web
Framework:          i18next (detected from package.json: "i18next", "react-i18next")
Translation files:  public/locales/{en,es,fr}/common.json (3 locales, 1 namespace)
Source locale:      en
Target locales:     es, fr
Industry profile:   none configured
```

**Phase 2: SCAN**

Source file with violations:

```tsx
// src/components/CheckoutSummary.tsx
export function CheckoutSummary({ items, total }) {
  return (
    <div>
      <h2>Order Summary</h2>
      <p>
        You have {items.length} {items.length === 1 ? 'item' : 'items'} in your cart.
      </p>
      <span title="Total price">Total: ${total.toFixed(2)}</span>
    </div>
  );
}
```

Findings:

```
I18N-001 [error] Hardcoded string in JSX text content
  File:       src/components/CheckoutSummary.tsx
  Line:       5
  Element:    <h2>Order Summary</h2>
  Category:   strings
  Fix:        Wrap in translation: <h2>{t('checkout.orderSummary')}</h2>

I18N-002 [error] Hardcoded string in i18n-sensitive prop
  File:       src/components/CheckoutSummary.tsx
  Line:       9
  Element:    title="Total price"
  Category:   strings
  Fix:        Wrap in translation: title={t('checkout.totalPriceTitle')}

I18N-303 [warn] Conditional text assembly (hardcoded plural logic)
  File:       src/components/CheckoutSummary.tsx
  Line:       7
  Element:    items.length === 1 ? "item" : "items"
  Category:   concatenation
  Fix:        Use i18next plural: t('checkout.itemCount', { count: items.length })

I18N-103 [warn] Hardcoded currency symbol
  File:       src/components/CheckoutSummary.tsx
  Line:       10
  Element:    $${total.toFixed(2)}
  Category:   formatting
  Fix:        Use Intl.NumberFormat: new Intl.NumberFormat(locale, { style: 'currency', currency }).format(total)

I18N-102 [warn] Number.toFixed() without locale-aware formatting
  File:       src/components/CheckoutSummary.tsx
  Line:       10
  Element:    total.toFixed(2)
  Category:   formatting
  Fix:        Use Intl.NumberFormat for locale-aware decimal formatting
```

Translation file issue:

```
I18N-401 [error] Missing translation key
  File:       public/locales/es/common.json
  Key:        checkout.confirmButton
  Source:     "Confirm Order" (en)
  Category:   translations
  Fix:        Add key to es/common.json with Spanish translation

I18N-402 [warn] Untranslated value (identical to source)
  File:       public/locales/fr/common.json
  Key:        auth.welcomeMessage
  Source:     "Welcome back" (en)
  Value:      "Welcome back" (fr -- same as source, likely untranslated)
  Category:   translations
  Fix:        Translate value to French or mark as intentionally identical
```

**Phase 3: REPORT**

```
i18n Report
===========
Scanned:     23 source files, 6 translation files
Findings:    7 total (3 error, 3 warn, 1 info)
Strictness:  standard
Framework:   i18next
Platforms:   web
Locales:     en (source), es, fr (targets)

Category Breakdown
------------------
Strings:        2 findings (2 error, 0 warn)
Translations:   2 findings (1 error, 1 warn)
Formatting:     2 findings (0 error, 2 warn)
Concatenation:  1 finding  (0 error, 1 warn)

Translation Coverage
--------------------
Locale   Keys    Translated   Coverage   Missing Plurals
en       42      42           100%       0
es       42      41           97.6%      0
fr       42      42           100%       0
(note: fr has 1 untranslated value not counted as missing)
```

**Phase 4: FIX**

```
Fix Category: String Wrapping (2 fixes)
-----------------------------------------
Wrap 2 hardcoded strings in t() calls in CheckoutSummary.tsx.
Generated keys: checkout.orderSummary, checkout.totalPriceTitle

Apply these fixes? [y/n]
```

After applying fixes:

```diff
- <h2>Order Summary</h2>
+ <h2>{t('checkout.orderSummary')}</h2>

- <span title="Total price">
+ <span title={t('checkout.totalPriceTitle')}>
```

Keys extracted for source locale file:

```json
{
  "checkout.orderSummary": "Order Summary",
  "checkout.totalPriceTitle": "Total price"
}
```

Remaining violations (require human judgment): 5

- I18N-303: Plural logic -- requires choosing i18next plural key structure
- I18N-103: Currency symbol -- requires knowing the correct currency code per locale
- I18N-102: Number formatting -- requires choosing Intl.NumberFormat options
- I18N-401: Missing key in es -- requires Spanish translation
- I18N-402: Untranslated value in fr -- requires French translation

## Gates

These are hard stops. Violating any gate means the process has broken down.

- **No scan results without completing the detect phase first.** Framework and platform detection must run before scanning begins.
- **No fix applied without showing the before/after diff.** Every fix must be presented to the user with the exact code change before being written to disk.
- **No severity downgrade below what `i18n.strictness` specifies.** If the project is in `strict` mode, a hardcoded string is an error. The scanner does not get to decide it is a warning.
- **No translation content generated by the fix phase.** The fix phase wraps strings and adds attributes. It does not write translations. Translation content is the domain of humans or TMS tools.
- **No false-positive suppression without explicit user confirmation.** If a string is intentionally not translated (e.g., brand name), the user must mark it with a suppression comment (`// i18n-ignore`) before it is excluded from future scans.

## Escalation

- **When a project has more than 100 hardcoded strings:** suggest running harness-i18n-workflow for bulk extraction and scaffolding rather than fixing one by one.
- **When no i18n framework is detected:** recommend one based on the project platform (i18next for React/Node, vue-i18n for Vue, flutter intl for Flutter, etc.). Reference the framework profiles in the knowledge base.
- **When translation coverage is below 50%:** suggest a phased approach -- prioritize user-facing flows (checkout, onboarding, error messages) before attempting full coverage.
- **When target locales include RTL languages (ar, he) and the project has no RTL support:** flag this as a high-priority architectural concern. RTL support often requires layout changes beyond simple attribute additions.
- **When the project uses a framework not in the knowledge base:** fall back to generic detection rules. Log: "Framework {name} not in knowledge base -- using generic string detection. Consider contributing a framework profile."
