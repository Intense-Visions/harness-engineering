# Harness i18n Workflow

> Translation lifecycle management. Configure i18n settings, scaffold translation files, extract translatable strings, track coverage, generate pseudo-localization, and retrofit existing projects with internationalization support.

## When to Use

- Setting up i18n infrastructure for a new project (during `on_project_init`)
- Retrofitting an existing project with i18n support (extracting hardcoded strings, scaffolding translation files)
- Extracting new translatable strings after feature development
- Tracking translation coverage before a release
- Generating pseudo-localization for layout and truncation testing
- When `on_project_init` triggers fire and the user has indicated multi-language support
- NOT for scanning existing code for i18n violations (use harness-i18n)
- NOT for injecting i18n considerations into brainstorming or planning (use harness-i18n-process)
- NOT for performing actual translations (use TMS tools or MCP integrations like Tolgee, Lokalise, Lingo.dev)

## Process

### Phase 1: CONFIGURE -- Set Up i18n Configuration

1. **Check for existing configuration.** Read `harness.config.json` and look for an `i18n` block.
   - If `i18n` block exists: load it and report current settings. Ask the user if they want to modify any settings.
   - If no `i18n` block: proceed with guided setup.

2. **Auto-detect project context.** Before asking questions, gather context:
   - Read `package.json`, `Podfile`, `build.gradle`, `pubspec.yaml` to detect platform(s) (web, mobile, backend).
   - Check for existing i18n framework dependencies (i18next, react-intl, vue-i18n, flutter intl, etc.) using framework detection profiles from `agents/skills/shared/i18n-knowledge/frameworks/`.
   - Check for existing translation files in common locations (`locales/`, `src/locales/`, `public/locales/`, `assets/translations/`, `res/values*/`).

3. **Present opinionated defaults.** Show the user the recommended configuration based on detection results:

   ```
   i18n Configuration (recommended defaults)
   ==========================================
   Source locale:     en
   Target locales:    [ask user]
   Framework:         [auto-detected or recommend based on platform]
   Message format:    ICU MessageFormat (industry standard, widest tooling support)
   File format:       JSON (universal, every TMS imports/exports it)
   Key convention:    dot-notation namespaced by feature (e.g., checkout.summary.totalLabel)
   Directory:         locales/{locale}/{namespace}.json
   Strictness:        standard
   Pseudo-locale:     en-XA (auto-generated for testing)
   ```

4. **Gather required user input.** The following must be answered by the user:
   - Target locales (BCP 47 codes): which languages will the project support?
   - Industry (optional): fintech, healthcare, ecommerce, legal, gaming -- loads industry-specific rules.
   - Platform(s) confirmation: confirm the auto-detected platforms or override.

5. **Write configuration.** Update `harness.config.json` with the i18n block:

   ```jsonc
   {
     "i18n": {
       "enabled": true,
       "strictness": "standard",
       "sourceLocale": "en",
       "targetLocales": ["es", "fr", "de"], // user-specified
       "framework": "auto", // or detected framework
       "format": "json",
       "messageFormat": "icu",
       "keyConvention": "dot-notation",
       "translationPaths": {
         "web": "locales/{locale}/{namespace}.json",
       },
       "platforms": ["web"], // detected or confirmed
       "coverage": {
         "minimumPercent": 95,
         "requirePlurals": true,
         "detectUntranslated": true,
       },
       "pseudoLocale": "en-XA",
     },
   }
   ```

   If `harness.config.json` does not exist, create it with `{ "version": 1, "i18n": { ... } }`.
   If it already exists, merge the `i18n` block into the existing config using the Edit tool.

6. **Report configuration summary.** Display the final configuration and confirm with the user before proceeding to scaffold.

### Phase 2: SCAFFOLD -- Create Translation File Structure

1. **Determine scaffold mode.** Check if the project already has source code with user-facing strings:
   - **Greenfield mode:** No existing source code or translation files. Create the structure from scratch.
   - **Retrofit mode:** Existing source code found. Audit first, then scaffold.

2. **Greenfield scaffolding.** Create the translation directory structure based on config:
   - Create directory for each locale: `locales/en/`, `locales/es/`, `locales/fr/`, etc.
   - Create initial namespace file for each locale (e.g., `locales/en/common.json`, `locales/es/common.json`).
   - Source locale file gets a starter template:

     ```json
     {
       "app": {
         "name": "",
         "description": ""
       },
       "common": {
         "loading": "Loading...",
         "error": "Something went wrong",
         "retry": "Try again",
         "cancel": "Cancel",
         "confirm": "Confirm",
         "save": "Save",
         "delete": "Delete",
         "edit": "Edit",
         "back": "Back",
         "next": "Next"
       }
     }
     ```

   - Target locale files get the same keys with empty string values (to be translated).
   - Create pseudo-locale directory (`locales/en-XA/`) -- will be populated in Track phase.

3. **Retrofit scaffolding.** Run the retrofit workflow:

   a. **Invoke harness-i18n detect + scan phases** to assess current state. This produces:
   - Detected platform(s) and framework
   - List of hardcoded user-facing strings with file paths and line numbers
   - Existing translation files and their coverage

   b. **Report audit results:**

   ```
   Retrofit Audit Results
   ======================
   Hardcoded strings found:      47
   Existing translation keys:     0
   Existing locales configured:   0
   Estimated extraction effort:   Medium (47 strings across 12 files)
   ```

   c. **Generate initial key catalog.** For each detected hardcoded string:
   - Generate a dot-notation key based on file path and context (e.g., `components.header.welcomeTitle`)
   - Use the original string as the source locale value
   - Flag strings that need human review for key naming (ambiguous context, duplicate meanings)

   d. **Scaffold translation files** with the generated key catalog for the source locale.

   e. **Create empty target locale files** with the same key structure and empty values.

   f. **Present the key catalog to the user for review.** This is a checkpoint -- the user should review and approve key names before they become permanent.

[checkpoint:human-verify] -- User must review generated key catalog before proceeding.

4. **Framework-specific setup.** Based on the detected or configured framework:
   - **i18next:** Create `i18next.config.ts` (or `.js`) with namespace configuration, backend plugin setup, and language detection.
   - **react-intl:** Verify `IntlProvider` is set up in the app root. If not, provide instructions for adding it.
   - **vue-i18n:** Create `i18n.ts` plugin configuration. Verify it is installed in the Vue app.
   - **flutter intl:** Create `l10n.yaml` configuration. Set up `intl` package in `pubspec.yaml`.
   - **No framework detected:** Recommend a framework based on platform:
     - React/Next.js: recommend i18next + react-i18next
     - Vue/Nuxt: recommend vue-i18n
     - Flutter: recommend flutter intl + intl package
     - Backend Node: recommend i18next
     - Generic: recommend i18next (widest ecosystem support)

5. **Report scaffold results.** Display what was created:

   ```
   Scaffold Results
   ================
   Directories created:  4 (locales/en, locales/es, locales/fr, locales/en-XA)
   Files created:        4 (common.json per locale + pseudo-locale placeholder)
   Keys scaffolded:      10 (common starter keys)
   Framework config:     i18next.config.ts created
   Next step:            Run extract phase to populate translation files from source code
   ```

### Phase 3: EXTRACT -- Extract Translatable Strings

1. **Read configuration.** Load `harness.config.json` i18n block for:
   - Source locale and target locales
   - Key naming convention (`dot-notation`, `snake_case`, `camelCase`)
   - Translation file paths and format
   - Framework in use

2. **Scan source code for extractable strings.** Use `harness-i18n` scan results or run a fresh scan. For each detected hardcoded user-facing string, collect:
   - File path and line number
   - The string content
   - Surrounding context (component name, function name, prop name)
   - Whether it contains interpolation placeholders

3. **Generate translation keys.** For each extractable string, generate a key following the configured convention:
   - **dot-notation** (default): `{feature}.{component}.{description}`
     - Example: `checkout.summary.totalLabel` for "Total" in `CheckoutSummary.tsx`
     - Example: `auth.login.submitButton` for "Sign in" in `LoginForm.tsx`
   - **snake_case**: `{feature}_{component}_{description}`
   - **camelCase**: `{feature}{Component}{Description}`
   - Derive feature from directory path, component from file name, description from string content.
   - For strings with interpolation, convert to ICU MessageFormat:
     - `` `Hello ${name}` `` becomes `"greeting.hello": "Hello {name}"`
     - Plurals: `items.length === 1 ? "item" : "items"` becomes `"cart.itemCount": "{count, plural, one {# item} other {# items}}"`

4. **Preserve existing translations.** Before writing to translation files:
   - Read existing translation files for all locales.
   - Never overwrite a key that already has a translated (non-empty, non-source-identical) value in a target locale.
   - For keys that exist in source but have been modified, flag as "stale" rather than overwriting.

5. **Flag strings needing human review.** Mark strings that the agent cannot confidently extract:
   - Strings with ambiguous context (same text, different meaning in different components)
   - Strings that might be intentional non-translatable content (brand names, technical terms)
   - Strings with complex interpolation that may not map cleanly to ICU MessageFormat
   - Present these with `[REVIEW]` markers in the output.

6. **Write extraction results.** Update translation files:
   - Add new keys to source locale file with the original string as the value.
   - Add new keys to target locale files with empty string values.
   - Maintain alphabetical ordering within each namespace.
   - Use the Edit tool for surgical updates -- do not rewrite entire files.

7. **Report extraction results:**

   ```
   Extraction Results
   ==================
   Strings scanned:       47
   Keys generated:        42
   Keys already existed:  5 (preserved)
   Flagged for review:    8 [REVIEW]
   Files updated:         12 (4 source files wrapped, 8 translation files updated)

   Review Required
   ---------------
   [REVIEW] src/components/Header.tsx:5 -- "Welcome" -- ambiguous context (greeting vs. page title)
   [REVIEW] src/utils/format.ts:12 -- "USD" -- may be intentional (currency code, not translatable)
   ```

### Phase 4: TRACK -- Coverage Dashboard and Pseudo-Localization

1. **Calculate per-locale coverage.** For each target locale:
   - Count total keys in source locale.
   - Count translated keys in target locale (non-empty, non-source-identical values).
   - Calculate percentage: `(translated / total) * 100`.
   - Check for missing plural forms per CLDR rules (load from `agents/skills/shared/i18n-knowledge/locales/{locale}.yaml`).
   - Detect stale translations using `git diff` on the source locale file. Run `git log --diff-filter=M -p -- {sourceLocalePath}` to identify keys whose source values changed since the last commit that touched the target locale file. A translation is stale when the source value changed but the target was not updated in a subsequent commit. If git history is unavailable, fall back to heuristic detection: flag target values that are identical to the current source value (likely untranslated) or that contain substrings of the old source (partial staleness).

2. **Generate coverage dashboard:**

   ```
   Translation Coverage Dashboard
   ==============================
   Source locale: en (142 keys)

   Locale   Translated   Coverage   Untranslated   Stale   Missing Plurals
   es       128          90.1%      14             3       2
   fr       135          95.1%      7              1       0
   de       120          84.5%      22             5       4
   ja       115          81.0%      27             2       1
   ar       110          77.5%      32             4       6

   Coverage threshold: 95% (from config)
   Passing locales: fr
   Failing locales: es, de, ja, ar
   ```

3. **Report untranslated keys.** For each locale below the coverage threshold, list the missing keys:

   ```
   Untranslated Keys: es (14 missing)
   -----------------------------------
   checkout.payment.cardLabel
   checkout.payment.expiryLabel
   checkout.payment.cvvLabel
   settings.notifications.emailToggle
   ...
   ```

4. **Report stale translations.** List keys where the source changed but the target was not updated:

   ```
   Stale Translations: es (3 stale)
   ---------------------------------
   Key:           auth.login.heading
   Source (old):   "Sign In"
   Source (new):   "Log In"
   Target (es):    "Iniciar Sesion" (based on old source)
   Action:         Review and update Spanish translation
   ```

5. **Generate pseudo-localization.** Create a pseudo-locale file (default: `en-XA`) that transforms source strings to test for:
   - **Text expansion:** Pad strings to simulate ~35% expansion (typical for English-to-German):
     - Strings < 10 chars: +50% expansion
     - Strings 10-50 chars: +35% expansion
     - Strings > 50 chars: +25% expansion
   - **Accent characters:** Replace ASCII characters with accented Unicode equivalents to test font rendering and encoding:
     - a → à, e → ë, i → ì, o → ö, u → ù, c → ç, n → ñ, s → š, z → ž
     - Uppercase: A → À, E → Ë, I → Ì, O → Ö, U → Ù, C → Ç, N → Ñ, S → Š, Z → Ž
   - **Bracket wrapping:** Wrap each string in `[` and `]` to detect truncation and overflow.
   - **Preserve placeholders:** ICU MessageFormat placeholders (`{name}`, `{count, plural, ...}`) must NOT be modified.
   - **Preserve HTML/JSX tags:** Tags like `<strong>`, `<br/>`, `<Link>` must NOT be modified.

   Example transformations (showing both expansion and accent replacement):

   ```
   "Save"           -> "[Šàvëë]"
   "Hello {name}"   -> "[Hëëllöö {name}]"
   "Cancel"         -> "[Çààñçëël]"
   "{count, plural, one {# item} other {# items}}" -> "[{count, plural, one {# ìtëëm} other {# ìtëëmš}}]"
   ```

   Write the pseudo-locale file to the configured pseudo-locale path (e.g., `locales/en-XA/common.json`).

6. **Recommend MCP servers.** Based on the project's workflow needs, recommend MCP server integrations from `agents/skills/shared/i18n-knowledge/mcp-interop/`:

   ```
   MCP Server Recommendations
   ==========================
   Based on your project configuration:

   Tolgee MCP (recommended)
     - Best for: TMS integration, in-context translation, developer workflow
     - Why: You have 5 target locales and are using i18next -- Tolgee has native i18next support
     - Setup: Install @tolgee/mcp, configure with your project API key

   Lingo.dev MCP (optional)
     - Best for: Brand voice consistency, glossary enforcement, multi-engine MT
     - Why: Useful if you want automated translation with quality controls

   i18next MCP (optional)
     - Best for: Project analysis, coverage tracking, key management
     - Why: Direct i18next integration for project-level insights
   ```

   Load recommendation logic from the MCP interop profiles. Recommend based on:
   - Framework match (e.g., Tolgee for i18next, Lokalise for broad TMS needs)
   - Target locale count (more locales = stronger TMS recommendation)
   - Industry (e.g., Lingo.dev for brand-sensitive industries)
   - Existing MCP config (if `i18n.mcp` is already configured, validate the choice)

7. **If graph is available** (`.harness/graph/` exists): provide per-component/route coverage. Map translation keys to the components that use them and report coverage by feature area:

   ```
   Component Coverage (graph-enhanced)
   ====================================
   Component          Keys   es     fr     de
   CheckoutFlow       24     92%    100%   83%
   AuthPages          18     89%    94%    78%
   Settings           31     87%    97%    81%
   Dashboard          15     93%    93%    93%
   ```

8. **If graph is unavailable**: report per-file key-level coverage as shown in step 2.

9. **Suggest next actions** based on coverage results:
   - If any locale is below threshold: "Run translations for {N} missing keys in {locale}. Consider using Tolgee MCP for batch translation."
   - If stale translations exist: "Review {N} stale translations in {locale}. Source text changed since last translation."
   - If missing plurals: "Add missing plural forms for {locale}. Required CLDR categories: {categories}."
   - If pseudo-locale generated: "Use the en-XA pseudo-locale to test layout and truncation. Check components with long strings for overflow."

## Harness Integration

- **`harness validate`** -- Run after configuration changes and file scaffolding to verify project health.
- **`harness-i18n`** -- The workflow skill depends on the core i18n skill for framework detection and string scanning. The detect + scan phases of `harness-i18n` are invoked during retrofit scaffolding and extraction.
- **`harness-initialize-project`** -- During project init, if the user indicates multi-language support, the configure + scaffold phases are invoked automatically.
- **`harness-release-readiness`** -- Coverage data from the track phase feeds into release readiness checks. Per-locale coverage is compared against `i18n.coverage.minimumPercent`.
- **Knowledge base** at `agents/skills/shared/i18n-knowledge/` -- Framework profiles guide scaffolding and extraction. Locale profiles provide CLDR plural rules for coverage tracking. MCP interop profiles drive server recommendations.

## Success Criteria

- Configuration phase produces a valid `i18n` block in `harness.config.json` with opinionated defaults
- Scaffold phase creates the correct directory structure and locale files for all configured target locales
- Retrofit mode correctly audits existing code and generates an initial key catalog with human-review flags
- Extract phase generates keys following the configured naming convention and preserves existing translations
- Coverage tracking reports accurate per-locale percentages with untranslated, stale, and missing plural breakdowns
- Pseudo-localization applies text expansion, accent characters, and bracket wrapping while preserving placeholders and tags
- MCP server recommendations are relevant to the project's framework and workflow needs
- `harness validate` passes after all changes

## Examples

### Example: Greenfield React + i18next Project

**Context:** New React web app. User wants to support English, Spanish, French.

**Phase 1: CONFIGURE**

User runs `harness skill run harness-i18n-workflow`.

```
i18n Configuration (recommended defaults)
==========================================
Source locale:     en
Target locales:    [input required]
Framework:         i18next (detected from package.json)
Message format:    ICU MessageFormat
File format:       JSON
Key convention:    dot-notation
Directory:         locales/{locale}/{namespace}.json
Strictness:        standard
Pseudo-locale:     en-XA

What target locales will this project support? (BCP 47 codes, comma-separated)
> es, fr

Any industry-specific requirements? (fintech, healthcare, ecommerce, legal, gaming, or none)
> none
```

Configuration written to `harness.config.json`.

**Phase 2: SCAFFOLD**

```
Scaffold Results
================
Directories created:  3 (locales/en, locales/es, locales/fr) + locales/en-XA
Files created:        4 (common.json per locale + pseudo-locale placeholder)
Keys scaffolded:      10 (common starter keys)
Framework config:     Verified -- i18next already configured in src/i18n.ts
Next step:            Develop features, then run extract phase to populate translation files
```

**Phase 3: EXTRACT** (after development)

```
Extraction Results
==================
Strings scanned:       23
Keys generated:        20
Keys already existed:  3 (common.loading, common.error, common.retry)
Flagged for review:    2 [REVIEW]
Files updated:         6 (3 translation files + 3 source files with t() wrapping instructions)
```

**Phase 4: TRACK**

```
Translation Coverage Dashboard
==============================
Source locale: en (23 keys)

Locale   Translated   Coverage   Untranslated   Stale   Missing Plurals
es       0            0.0%       23             0       0
fr       0            0.0%       23             0       0

Coverage threshold: 95% (from config)
Passing locales: none
Failing locales: es, fr

Pseudo-locale generated: locales/en-XA/common.json (23 keys transformed)

MCP Server Recommendations
==========================
Tolgee MCP (recommended) -- native i18next support, in-context translation
```

### Example: Retrofitting an Existing Express API

**Context:** Existing Express.js backend with hardcoded error messages. User wants to add i18n.

**Phase 1: CONFIGURE**

Auto-detection finds: platform = backend, framework = none, no translation files.

```
i18n Configuration
==================
Source locale:     en
Target locales:    > es, de, ja
Framework:         none detected -- recommending i18next for Node.js backend
Message format:    ICU MessageFormat
File format:       JSON
Key convention:    dot-notation
Directory:         locales/{locale}/{namespace}.json
Platforms:         backend
```

**Phase 2: SCAFFOLD (retrofit mode)**

```
Retrofit Audit Results
======================
Hardcoded strings found:      31
Existing translation keys:     0
Existing locales configured:   0
Estimated extraction effort:   Medium (31 strings across 8 files)

Generated Key Catalog (review required)
========================================
errors.auth.invalidCredentials    -> "Invalid email or password"
errors.auth.tokenExpired          -> "Session expired, please log in again"
errors.validation.requiredField   -> "This field is required"
errors.notFound.resource          -> "Resource not found"
emails.welcome.subject            -> "Welcome to {appName}"
emails.welcome.greeting           -> "Hello {name}, welcome aboard!"
...

[checkpoint] Please review the generated key names above.
Approve to continue scaffolding, or provide corrections.
```

## Rationalizations to Reject

| Rationalization                                                                                                                                  | Reality                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The user already told me they want Spanish and French — I can skip the configuration phase and go straight to scaffolding."                     | The configuration phase writes the `i18n` block to `harness.config.json`. Without it, subsequent runs of harness-i18n have no enabled flag, no strictness level, and no locale list to work against. Verbal confirmation does not substitute for written config.       |
| "In retrofit mode, the key naming is straightforward — I'll apply the generated key catalog directly without showing it to the user for review." | The retrofit key catalog checkpoint is a hard gate. Key names become permanent identifiers that translation teams, TMS tools, and source code will reference for years. The user must review and approve them before any files are written.                            |
| "The pseudo-locale transformation for this string with `{name}` is obvious — I'll just wrap the entire string including the placeholder."        | ICU MessageFormat placeholders must be preserved exactly. Transforming `{name}` to `{ñàmë}` breaks the interpolation at runtime. The pseudo-locale algorithm must detect and skip all placeholder syntax before applying accent and expansion transforms.              |
| "These target locale files already exist from a previous run — I'll overwrite them with the new extraction output to keep things clean."         | Existing target locale translations must never be overwritten. A key with a translated (non-empty, non-source-identical) value in a target locale represents real translation work. Overwriting it destroys that work silently. Always preserve existing translations. |
| "We found 120 strings in retrofit mode — I'll just run the full extraction without the audit phase since we clearly need everything extracted."  | The retrofit audit results are what tell the user how much effort the extraction requires and let them prioritize high-traffic flows. Skipping the audit and going straight to extraction removes the user's ability to scope the work before it happens.              |

## Gates

These are hard stops. Violating any gate means the process has broken down.

- **No scaffolding without completed configuration.** The configure phase must produce a valid i18n config before scaffold runs. Running scaffold on a project with no i18n config is not allowed.
- **No extraction without existing translation files.** The extract phase requires scaffold to have run first. There must be at least a source locale translation file to write keys into.
- **No overwriting existing translations.** When extracting or scaffolding, never overwrite a key that already has a translated (non-empty, non-source-identical) value in a target locale file.
- **No pseudo-localization that modifies placeholders.** ICU MessageFormat placeholders (`{name}`, `{count, plural, ...}`) and HTML/JSX tags must be preserved exactly in pseudo-locale output.
- **No retrofit key catalog applied without human review.** In retrofit mode, the generated key catalog must be presented to the user and approved before writing to translation files. This is a hard checkpoint.

## Escalation

- **When more than 100 strings are detected in retrofit mode:** Suggest a phased approach -- prioritize high-traffic user flows first (checkout, onboarding, error messages), then expand coverage incrementally.
- **When the project uses a framework not in the knowledge base:** Fall back to generic extraction patterns. Log: "Framework {name} not in knowledge base -- using generic extraction. Consider contributing a framework profile."
- **When translation files already exist in an unexpected format (PO, XLIFF, ARB):** Report the format mismatch. Ask the user: convert to JSON, or adapt the workflow to the existing format. Do not silently convert.
- **When key naming conflicts arise (two strings producing the same key):** Append a disambiguating suffix (e.g., `.heading` vs `.label` vs `.button`) and flag for human review.
- **When coverage is below 50% and the team has no TMS:** Strongly recommend setting up a TMS integration via MCP. Manual translation of hundreds of keys is not sustainable.
