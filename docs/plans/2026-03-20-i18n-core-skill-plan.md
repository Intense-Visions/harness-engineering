# Plan: harness-i18n Core Skill (Phase 2)

**Date:** 2026-03-20
**Spec:** docs/changes/i18n-localization-skills/proposal.md
**Estimated tasks:** 7
**Estimated time:** 25 minutes

## Goal

Create the `harness-i18n` core skill (skill.yaml + SKILL.md) for both claude-code and gemini-cli platforms, and add the i18n config schema to `harness.config.json` types, enabling AI agents to detect i18n violations across web, mobile, and backend codebases.

## Observable Truths (Acceptance Criteria)

1. The file `agents/skills/claude-code/harness-i18n/skill.yaml` exists with `cognitive_mode: meticulous-verifier`, `type: rigid`, triggers `[manual, on_pr, on_commit, on_review]`, phases `[detect, scan, report, fix]`, `depends_on: []`, and `platforms: [claude-code, gemini-cli]`.
2. The file `agents/skills/claude-code/harness-i18n/SKILL.md` exists with sections: When to Use, Process (4 phases), Harness Integration, Success Criteria, Examples, Gates, Escalation.
3. The file `agents/skills/gemini-cli/harness-i18n/skill.yaml` is byte-identical to the claude-code copy.
4. The file `agents/skills/gemini-cli/harness-i18n/SKILL.md` is byte-identical to the claude-code copy.
5. When `npx vitest run packages/cli/tests/config/i18n-schema.test.ts` runs, all tests pass -- covering valid full config, minimal config, defaults, invalid values, and integration with `HarnessConfigSchema`.
6. The `I18nConfigSchema` is exported from `packages/cli/src/config/schema.ts` and wired into `HarnessConfigSchema` as `i18n: I18nConfigSchema.optional()`.
7. `harness validate` passes after all changes.
8. When the SKILL.md detect phase instructions are followed, the agent reads `harness.config.json` for i18n settings and auto-detects the project framework using `agents/skills/shared/i18n-knowledge/frameworks/` profiles.
9. When the SKILL.md scan phase instructions are followed, the agent checks for hardcoded strings, locale-sensitive formatting, missing `lang`/`dir` attributes, concatenated strings, missing translation keys, and untranslated values -- with platform-specific rules for web (.tsx/.jsx/.vue/.svelte/.html), mobile (.swift/.kt/.dart), and backend (.ts/.js/.py/.go/.java).
10. When the SKILL.md report phase instructions are followed, findings are grouped by category (strings, formatting, plurals, layout, encoding) and severity, matching the `harness-accessibility` report structure.
11. When the SKILL.md fix phase instructions are followed, only mechanical fixes are applied (wrapping strings in `t()`, adding `lang` attributes, adding `dir="auto"`), with interactive confirmation per fix category.

## File Map

- CREATE `agents/skills/claude-code/harness-i18n/skill.yaml`
- CREATE `agents/skills/claude-code/harness-i18n/SKILL.md`
- CREATE `agents/skills/gemini-cli/harness-i18n/skill.yaml` (copy)
- CREATE `agents/skills/gemini-cli/harness-i18n/SKILL.md` (copy)
- MODIFY `packages/cli/src/config/schema.ts` (add I18nConfigSchema, wire into HarnessConfigSchema)
- CREATE `packages/cli/tests/config/i18n-schema.test.ts`

## Tasks

### Task 1: Add I18nConfigSchema to config schema

**Depends on:** none
**Files:** `packages/cli/src/config/schema.ts`, `packages/cli/tests/config/i18n-schema.test.ts`

1. Create test file `packages/cli/tests/config/i18n-schema.test.ts`:

   ```typescript
   // packages/cli/tests/config/i18n-schema.test.ts
   import { describe, it, expect } from 'vitest';
   import {
     I18nConfigSchema,
     I18nCoverageConfigSchema,
     I18nMcpConfigSchema,
     HarnessConfigSchema,
   } from '../../src/config/schema';

   describe('I18nCoverageConfigSchema', () => {
     it('accepts valid coverage config', () => {
       const result = I18nCoverageConfigSchema.safeParse({
         minimumPercent: 95,
         requirePlurals: true,
         detectUntranslated: true,
       });
       expect(result.success).toBe(true);
     });

     it('accepts empty object with defaults', () => {
       const result = I18nCoverageConfigSchema.parse({});
       expect(result.minimumPercent).toBe(100);
       expect(result.requirePlurals).toBe(true);
       expect(result.detectUntranslated).toBe(true);
     });

     it('rejects minimumPercent below 0', () => {
       const result = I18nCoverageConfigSchema.safeParse({ minimumPercent: -1 });
       expect(result.success).toBe(false);
     });

     it('rejects minimumPercent above 100', () => {
       const result = I18nCoverageConfigSchema.safeParse({ minimumPercent: 101 });
       expect(result.success).toBe(false);
     });
   });

   describe('I18nMcpConfigSchema', () => {
     it('accepts valid MCP config', () => {
       const result = I18nMcpConfigSchema.safeParse({
         server: 'tolgee',
         projectId: 'my-project',
       });
       expect(result.success).toBe(true);
     });

     it('requires server field', () => {
       const result = I18nMcpConfigSchema.safeParse({ projectId: 'my-project' });
       expect(result.success).toBe(false);
     });
   });

   describe('I18nConfigSchema', () => {
     it('accepts a valid full i18n config', () => {
       const result = I18nConfigSchema.safeParse({
         enabled: true,
         strictness: 'standard',
         sourceLocale: 'en',
         targetLocales: ['es', 'fr', 'de', 'ja', 'ar'],
         framework: 'auto',
         format: 'json',
         messageFormat: 'icu',
         keyConvention: 'dot-notation',
         translationPaths: {
           web: 'src/locales/{locale}.json',
           backend: 'locales/{locale}.json',
         },
         platforms: ['web', 'backend'],
         industry: 'fintech',
         coverage: {
           minimumPercent: 95,
           requirePlurals: true,
           detectUntranslated: true,
         },
         pseudoLocale: 'en-XA',
         mcp: {
           server: 'tolgee',
           projectId: 'my-project',
         },
       });
       expect(result.success).toBe(true);
     });

     it('accepts minimal i18n config (all fields optional except enabled)', () => {
       const result = I18nConfigSchema.safeParse({ enabled: true });
       expect(result.success).toBe(true);
     });

     it('defaults enabled to false', () => {
       const result = I18nConfigSchema.parse({});
       expect(result.enabled).toBe(false);
     });

     it('defaults strictness to standard', () => {
       const result = I18nConfigSchema.parse({});
       expect(result.strictness).toBe('standard');
     });

     it('defaults sourceLocale to en', () => {
       const result = I18nConfigSchema.parse({});
       expect(result.sourceLocale).toBe('en');
     });

     it('defaults framework to auto', () => {
       const result = I18nConfigSchema.parse({});
       expect(result.framework).toBe('auto');
     });

     it('defaults targetLocales to empty array', () => {
       const result = I18nConfigSchema.parse({});
       expect(result.targetLocales).toEqual([]);
     });

     it('defaults platforms to empty array', () => {
       const result = I18nConfigSchema.parse({});
       expect(result.platforms).toEqual([]);
     });

     it('accepts strictness: strict', () => {
       const result = I18nConfigSchema.safeParse({ strictness: 'strict' });
       expect(result.success).toBe(true);
     });

     it('accepts strictness: permissive', () => {
       const result = I18nConfigSchema.safeParse({ strictness: 'permissive' });
       expect(result.success).toBe(true);
     });

     it('rejects invalid strictness value', () => {
       const result = I18nConfigSchema.safeParse({ strictness: 'banana' });
       expect(result.success).toBe(false);
     });

     it('rejects invalid framework value', () => {
       const result = I18nConfigSchema.safeParse({ framework: 'nonexistent' });
       expect(result.success).toBe(false);
     });

     it('accepts all valid framework values', () => {
       for (const fw of [
         'auto',
         'i18next',
         'react-intl',
         'vue-i18n',
         'flutter-intl',
         'apple',
         'android',
         'custom',
       ]) {
         const result = I18nConfigSchema.safeParse({ framework: fw });
         expect(result.success).toBe(true);
       }
     });

     it('rejects invalid platform value', () => {
       const result = I18nConfigSchema.safeParse({ platforms: ['desktop'] });
       expect(result.success).toBe(false);
     });

     it('accepts all valid platform values', () => {
       const result = I18nConfigSchema.safeParse({ platforms: ['web', 'mobile', 'backend'] });
       expect(result.success).toBe(true);
     });

     it('rejects invalid messageFormat value', () => {
       const result = I18nConfigSchema.safeParse({ messageFormat: 'xml' });
       expect(result.success).toBe(false);
     });

     it('rejects invalid keyConvention value', () => {
       const result = I18nConfigSchema.safeParse({ keyConvention: 'SCREAMING_CASE' });
       expect(result.success).toBe(false);
     });

     it('translationPaths must be a record of strings', () => {
       const result = I18nConfigSchema.safeParse({ translationPaths: { web: 123 } });
       expect(result.success).toBe(false);
     });
   });

   describe('HarnessConfigSchema with i18n block', () => {
     const baseConfig = {
       version: 1 as const,
       name: 'test',
     };

     it('accepts config with i18n block', () => {
       const result = HarnessConfigSchema.safeParse({
         ...baseConfig,
         i18n: {
           enabled: true,
           strictness: 'strict',
           sourceLocale: 'en',
           targetLocales: ['es', 'fr'],
           platforms: ['web'],
         },
       });
       expect(result.success).toBe(true);
     });

     it('accepts config without i18n block', () => {
       const result = HarnessConfigSchema.safeParse(baseConfig);
       expect(result.success).toBe(true);
     });

     it('rejects config with invalid i18n block', () => {
       const result = HarnessConfigSchema.safeParse({
         ...baseConfig,
         i18n: { strictness: 'invalid' },
       });
       expect(result.success).toBe(false);
     });
   });
   ```

2. Run test: `npx vitest run packages/cli/tests/config/i18n-schema.test.ts`
3. Observe failure: `I18nConfigSchema` is not exported from schema.ts
4. Add to `packages/cli/src/config/schema.ts` -- insert before `HarnessConfigSchema`:

   ```typescript
   export const I18nCoverageConfigSchema = z.object({
     minimumPercent: z.number().min(0).max(100).default(100),
     requirePlurals: z.boolean().default(true),
     detectUntranslated: z.boolean().default(true),
   });

   export const I18nMcpConfigSchema = z.object({
     server: z.string(),
     projectId: z.string().optional(),
   });

   export const I18nConfigSchema = z.object({
     enabled: z.boolean().default(false),
     strictness: z.enum(['strict', 'standard', 'permissive']).default('standard'),
     sourceLocale: z.string().default('en'),
     targetLocales: z.array(z.string()).default([]),
     framework: z
       .enum([
         'auto',
         'i18next',
         'react-intl',
         'vue-i18n',
         'flutter-intl',
         'apple',
         'android',
         'custom',
       ])
       .default('auto'),
     format: z.string().default('json'),
     messageFormat: z.enum(['icu', 'i18next', 'custom']).default('icu'),
     keyConvention: z
       .enum(['dot-notation', 'snake_case', 'camelCase', 'custom'])
       .default('dot-notation'),
     translationPaths: z.record(z.string(), z.string()).optional(),
     platforms: z.array(z.enum(['web', 'mobile', 'backend'])).default([]),
     industry: z.string().optional(),
     coverage: I18nCoverageConfigSchema.optional(),
     pseudoLocale: z.string().optional(),
     mcp: I18nMcpConfigSchema.optional(),
   });
   ```

5. Wire into `HarnessConfigSchema` -- add `i18n: I18nConfigSchema.optional(),` after the `design` field.
6. Add type export at bottom of file: `export type I18nConfig = z.infer<typeof I18nConfigSchema>;`
7. Run test: `npx vitest run packages/cli/tests/config/i18n-schema.test.ts`
8. Observe: all tests pass
9. Run: `harness validate`
10. Commit: `feat(config): add I18nConfigSchema to harness.config.json types`

---

### Task 2: Create skill.yaml for harness-i18n

**Depends on:** none (can run parallel with Task 1)
**Files:** `agents/skills/claude-code/harness-i18n/skill.yaml`

1. Create directory: `mkdir -p agents/skills/claude-code/harness-i18n`
2. Create `agents/skills/claude-code/harness-i18n/skill.yaml`:

   ```yaml
   name: harness-i18n
   version: '1.0.0'
   description: Internationalization scanning — detect hardcoded strings, missing translations, locale-sensitive formatting, RTL issues, and generate actionable reports across web, mobile, and backend
   cognitive_mode: meticulous-verifier
   triggers:
     - manual
     - on_pr
     - on_commit
     - on_review
   platforms:
     - claude-code
     - gemini-cli
   tools:
     - Bash
     - Read
     - Write
     - Edit
     - Glob
     - Grep
   cli:
     command: harness skill run harness-i18n
     args:
       - name: path
         description: Project root path
         required: false
       - name: scope
         description: Scope of scan (full, component, file)
         required: false
       - name: platform
         description: Target platform override (web, mobile, backend)
         required: false
   mcp:
     tool: run_skill
     input:
       skill: harness-i18n
       path: string
   type: rigid
   phases:
     - name: detect
       description: Identify project platform(s), i18n framework in use, existing translation files, and locale config
       required: true
     - name: scan
       description: Scan source files for i18n violations — hardcoded strings, locale-sensitive formatting, missing translations, RTL issues
       required: true
     - name: report
       description: Group findings by severity and category, generate structured i18n report
       required: true
     - name: fix
       description: Apply automated fixes for mechanical i18n issues (string wrapping, lang/dir attributes)
       required: false
   state:
     persistent: false
     files: []
   depends_on: []
   ```

3. Run: `harness validate`
4. Commit: `feat(i18n): add harness-i18n skill.yaml`

---

### Task 3: Create SKILL.md for harness-i18n (Phase 1: DETECT)

**Depends on:** Task 2 (skill.yaml must exist for validation)
**Files:** `agents/skills/claude-code/harness-i18n/SKILL.md`

This task creates the full SKILL.md file. The content is large but it is a single file write with no logic -- just structured markdown instructions.

1. Create `agents/skills/claude-code/harness-i18n/SKILL.md` with the complete content specified below.

The SKILL.md must contain the following sections in order. The exact content for each section is specified:

**Header:**

```
# Harness i18n

> Internationalization compliance verification. Detect hardcoded strings, missing translations, locale-sensitive formatting, RTL issues, and concatenation anti-patterns across web, mobile, and backend codebases.
```

**When to Use section** -- list of when/not-when bullets following the accessibility skill pattern. Include:

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

**Process section** with 4 phases:

**Phase 1: DETECT -- Identify i18n Context**

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

**Phase 2: SCAN -- Detect i18n Violations**

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

**Phase 3: REPORT -- Generate i18n Report**

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

**Phase 4: FIX -- Apply Automated Remediation (Optional)**

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

**Harness Integration section:**

- `harness validate` -- i18n findings surface when `i18n.enabled` is true and `i18n.strictness` is `strict` or `standard`. Running validate after a scan reflects the current i18n state.
- `harness-integrity` -- The i18n scan is chained into integrity checks when `i18n.enabled: true`. Findings are included in the unified integrity report.
- `harness-release-readiness` -- Translation coverage is checked against `i18n.coverage.minimumPercent`. Per-locale coverage is reported.
- `harness-accessibility` -- When both i18n and accessibility skills are enabled, `lang`/`dir` attribute checks are handled by the i18n skill. The accessibility skill defers I18N-201/202/203 to avoid duplicate findings.
- `harness-i18n-workflow` -- After scanning, coverage gaps and extracted keys can be passed to the workflow skill for scaffolding and translation file updates.
- Knowledge base at `agents/skills/shared/i18n-knowledge/` -- Framework profiles, locale profiles, industry profiles, and anti-pattern catalogs are consumed during detect and scan phases.

**Success Criteria section** -- matching the spec's success criteria 1-6.

**Examples section** -- one complete worked example showing all 4 phases on a React + i18next project with hardcoded strings, missing translations, and a concatenation anti-pattern.

**Gates section:**

- No scan results without completing the detect phase first. Framework and platform detection must run before scanning begins.
- No fix applied without showing the before/after diff. Every fix must be presented to the user with the exact code change before being written to disk.
- No severity downgrade below what `i18n.strictness` specifies. If the project is in `strict` mode, a hardcoded string is an error. The scanner does not get to decide it is a warning.
- No translation content generated by the fix phase. The fix phase wraps strings and adds attributes. It does not write translations. Translation content is the domain of humans or TMS tools.
- No false-positive suppression without explicit user confirmation. If a string is intentionally not translated (e.g., brand name), the user must mark it with a suppression comment (`// i18n-ignore`) before it is excluded from future scans.

**Escalation section:**

- When a project has more than 100 hardcoded strings: suggest running harness-i18n-workflow for bulk extraction and scaffolding rather than fixing one by one.
- When no i18n framework is detected: recommend one based on the project platform (i18next for React/Node, vue-i18n for Vue, flutter intl for Flutter, etc.). Reference the framework profiles in the knowledge base.
- When translation coverage is below 50%: suggest a phased approach -- prioritize user-facing flows (checkout, onboarding, error messages) before attempting full coverage.
- When target locales include RTL languages (ar, he) and the project has no RTL support: flag this as a high-priority architectural concern. RTL support often requires layout changes beyond simple attribute additions.
- When the project uses a framework not in the knowledge base: fall back to generic detection rules. Log: "Framework {name} not in knowledge base -- using generic string detection. Consider contributing a framework profile."

2. Run: `harness validate`
3. Commit: `feat(i18n): add harness-i18n SKILL.md with detect, scan, report, fix phases`

---

### Task 4: Copy skill files to gemini-cli platform

**Depends on:** Task 2, Task 3
**Files:** `agents/skills/gemini-cli/harness-i18n/skill.yaml`, `agents/skills/gemini-cli/harness-i18n/SKILL.md`

1. Create directory: `mkdir -p agents/skills/gemini-cli/harness-i18n`
2. Copy skill.yaml: `cp agents/skills/claude-code/harness-i18n/skill.yaml agents/skills/gemini-cli/harness-i18n/skill.yaml`
3. Copy SKILL.md: `cp agents/skills/claude-code/harness-i18n/SKILL.md agents/skills/gemini-cli/harness-i18n/SKILL.md`
4. Verify byte-identical: `diff agents/skills/claude-code/harness-i18n/skill.yaml agents/skills/gemini-cli/harness-i18n/skill.yaml` (no output = identical)
5. Verify byte-identical: `diff agents/skills/claude-code/harness-i18n/SKILL.md agents/skills/gemini-cli/harness-i18n/SKILL.md` (no output = identical)
6. Run: `harness validate`
7. Commit: `feat(i18n): add gemini-cli platform copy of harness-i18n skill`

---

### Task 5: Run full test suite and verify platform parity

[checkpoint:human-verify] -- verify skill content before running full suite

**Depends on:** Task 1, Task 2, Task 3, Task 4
**Files:** none (verification only)

1. Run full test suite: `npx vitest run`
2. Verify: all existing tests pass + new i18n schema tests pass
3. Verify: the ~14 automatic skill tests for harness-i18n pass (schema validation, structure, platform parity, references)
4. Run: `harness validate`
5. Run: `harness check-deps`
6. If any test fails, fix the issue in the relevant file and re-run
7. No commit (verification task)

---

### Task 6: Stage and commit all changes together

**Depends on:** Task 5
**Files:** all files from Tasks 1-4

Note: Prettier reformats SKILL.md during pre-commit hooks. Stage both platform copies together to preserve parity.

1. Stage all files:
   ```
   git add agents/skills/claude-code/harness-i18n/skill.yaml
   git add agents/skills/claude-code/harness-i18n/SKILL.md
   git add agents/skills/gemini-cli/harness-i18n/skill.yaml
   git add agents/skills/gemini-cli/harness-i18n/SKILL.md
   git add packages/cli/src/config/schema.ts
   git add packages/cli/tests/config/i18n-schema.test.ts
   ```
2. Commit: `feat(i18n): add harness-i18n core skill and config schema`
3. If pre-commit hook reformats SKILL.md, re-copy gemini-cli version from claude-code to maintain parity, re-stage both, and commit again
4. Run: `harness validate`
5. Verify: `git diff agents/skills/claude-code/harness-i18n/SKILL.md agents/skills/gemini-cli/harness-i18n/SKILL.md` produces no output

---

### Task 7: Final verification

**Depends on:** Task 6
**Files:** none (verification only)

1. Run: `harness validate` -- must pass
2. Run: `harness check-deps` -- must pass
3. Run: `npx vitest run` -- all tests must pass
4. Verify observable truths:
   - `agents/skills/claude-code/harness-i18n/skill.yaml` exists with correct fields
   - `agents/skills/claude-code/harness-i18n/SKILL.md` exists with all required sections
   - `agents/skills/gemini-cli/harness-i18n/skill.yaml` is identical to claude-code copy
   - `agents/skills/gemini-cli/harness-i18n/SKILL.md` is identical to claude-code copy
   - `I18nConfigSchema` is exported and wired into `HarnessConfigSchema`
   - `npx vitest run packages/cli/tests/config/i18n-schema.test.ts` passes
5. No commit (verification task)
