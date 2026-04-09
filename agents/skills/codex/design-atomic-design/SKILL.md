# Atomic Design

> Composition methodology for building design systems using five distinct levels of abstraction: atoms, molecules, organisms, templates, and pages.

## When to Use

- Starting a new design system from scratch and need a structural taxonomy for components
- Refactoring an existing component library that has inconsistent granularity
- Deciding whether a UI element should be a standalone component or part of a larger one
- Onboarding developers or designers who need a shared vocabulary for component hierarchy
- Evaluating whether your system is over-atomized (too many tiny pieces) or under-decomposed (too many monoliths)

## Instructions

Apply Brad Frost's atomic design methodology as a mental model for component decomposition, not as a rigid folder structure. The five levels describe a spectrum of complexity and composition. Every component in your system should map to exactly one level, and that mapping should be defensible.

**The decision procedure for level assignment:**

1. Does this element wrap zero child components and render a single HTML concept? It is an **atom**.
2. Does this element compose 2-4 atoms into a single functional unit with one responsibility? It is a **molecule**.
3. Does this element compose molecules and/or atoms into a distinct section of interface with its own domain logic? It is an **organism**.
4. Does this element define the layout and content placement for a full view without real data? It is a **template**.
5. Does this element hydrate a template with real data, forming the final user-facing screen? It is a **page**.

If you cannot cleanly assign a component to one level, the component likely has mixed responsibilities and should be split.

## Details

### The Five Levels in Depth

**Atoms** are the foundational building blocks. They cannot be broken down further without ceasing to be functional. An atom is self-describing: it has a single visual and semantic purpose.

- A `Button` atom: renders `<button>` with `variant` (primary, secondary, ghost), `size` (sm, md, lg), `disabled`, and `loading` props. It contains no knowledge of where it appears.
- A `TextInput` atom: renders `<input>` with `label`, `placeholder`, `error`, `helperText`. It does not know it lives in a search bar or a login form.
- An `Avatar` atom: renders a circular image with `src`, `size` (24px, 32px, 40px, 48px), `fallback` (initials). It does not know it is part of a user card.

Stripe's design system treats `Badge`, `Button`, `Icon`, `Spinner`, and `Text` as atoms. Each has zero child component dependencies.

**Molecules** combine atoms into functional groups. The litmus test: does removing any atom from the molecule break its purpose?

- A `SearchInput` molecule: composes `TextInput` + `Icon` (search) + `Button` (clear). Remove the input and it is not a search bar. Remove the icon and it loses affordance.
- A `FormField` molecule: composes `Label` + `TextInput` + `HelperText` + `ErrorMessage`. The field is the unit of validation feedback.
- GitHub Primer's `TextInputWithTokens` is a molecule: `TextInput` + multiple `Token` atoms, composed to handle multi-value input.

**Organisms** are complex, self-contained interface sections. They often have internal state or connect to domain logic.

- A `NavigationHeader` organism: composes `Logo` (atom) + `NavLinks` (molecule) + `SearchInput` (molecule) + `UserMenu` (molecule). It manages responsive collapse behavior internally.
- Shopify Polaris's `ResourceList` is an organism: it composes `ResourceItem` molecules, handles selection state, sorting, filtering, and bulk actions.
- Salesforce Lightning's `DataTable` is an organism: it composes `Column`, `Row`, `Cell` atoms/molecules and manages sort, resize, and infinite scroll.

**Templates** define the structural layout of a complete view using placeholder content. They answer "where does each organism go?" without answering "what data fills it?"

- A `DashboardTemplate` places `NavigationHeader` at top, `Sidebar` at left (240px), `MainContent` in a 12-column grid, `Footer` at bottom. All content slots accept children.
- Material Design's responsive layout grid (12 columns, 8px baseline grid, breakpoints at 600/905/1240/1440px) is a template-level concern.

**Pages** are templates hydrated with real or representative data. They are the final artifact for testing, review, and QA.

- A `DashboardPage` fills `DashboardTemplate` with fetched analytics data, user profile, notification count. This is what Storybook shows under the "Pages" section.

### The Abstraction Decision Framework

The hardest design system decision is choosing the right level of abstraction. Use this framework:

**Reuse frequency test.** Count how many places a component appears in your application. If a molecule appears in only one organism, question whether it needs to be extracted. Premature extraction creates inventory bloat.

| Occurrences | Recommendation                                     |
| ----------- | -------------------------------------------------- |
| 1           | Keep inline unless it has independent test value   |
| 2-3         | Extract if the instances are identical in behavior |
| 4+          | Extract unconditionally                            |

**Independence test.** Can the component be understood without its parent context? A `PriceTag` molecule (icon + formatted currency + label) is independently meaningful. A `DashboardHeaderLeftSection` is not -- it is a layout fragment, not a reusable concept.

**Stability test.** How often does the component's interface change? Atoms should be extremely stable (change less than once per quarter). Organisms may change monthly. If an atom's props churn frequently, it is probably a molecule or organism in disguise.

### Mapping to File Structure

Atomic design is a mental model, not a mandatory folder layout. Two viable approaches:

**Flat by level** (recommended for systems under 100 components):

```
components/
  atoms/       Button, Icon, Text, Avatar, Badge
  molecules/   SearchInput, FormField, NavLink
  organisms/   Header, DataTable, Modal
  templates/   DashboardLayout, SettingsLayout
  pages/       DashboardPage, SettingsPage
```

**Grouped by domain** (recommended for systems over 100 components):

```
components/
  navigation/  NavLink (molecule), Header (organism), Sidebar (organism)
  forms/       TextInput (atom), FormField (molecule), LoginForm (organism)
  data/        Badge (atom), DataTable (organism), Chart (organism)
```

IBM Carbon uses domain grouping: `DataTable`, `DatePicker`, `Notification` each in their own directory, with sub-components (atoms/molecules) co-located.

### Anti-Patterns

**Over-atomization.** Extracting every `<span>`, `<div>`, or styled wrapper into a component. If your atoms directory has `Wrapper`, `Spacer`, `Divider`, `Container`, and `Box` that are each under 10 lines, you have decomposed past the point of utility. A `Spacer` component with a single `margin` prop is not an atom -- it is a CSS utility masquerading as a component. Tailwind's utility classes or a spacing token solve this better.

**Level-skipping composition.** An organism that directly uses raw HTML elements instead of atoms. If your `Header` organism renders `<button className="...">` instead of using `<Button>`, you have bypassed the system. Every visual element in an organism should trace back to a system atom. Stripe enforces this by making raw HTML elements a linting violation inside organism-level components.

**Template-organism conflation.** Building organisms that assume a specific layout position. A `Sidebar` organism that hardcodes `position: fixed; left: 0; width: 240px` is not reusable -- it has absorbed template-level layout concerns. The sidebar's position should be controlled by the template; the organism should only define its internal layout.

**Premature page extraction.** Creating page-level components before the template layer is stable. Pages are the most volatile level and should be built last. If you start with pages and extract downward, you get organisms shaped to one specific page rather than reusable across templates.

**Molecule bloat.** A molecule that composes 6+ atoms is likely an organism. If your `UserCard` has avatar, name, title, department, email, phone, and action buttons, it has grown past molecule complexity. The test: can you identify two sub-groups within it that are independently meaningful? If yes, those sub-groups are molecules and the whole thing is an organism.

### Cross-Level Dependency Rules

The atomic hierarchy implies strict dependency direction: higher levels depend on lower levels, never the reverse.

**Allowed dependencies:**

```
Pages -> Templates -> Organisms -> Molecules -> Atoms
```

**Forbidden dependencies:**

- An atom importing a molecule (e.g., `Button` importing `SearchInput`)
- A molecule importing an organism (e.g., `FormField` importing `Header`)
- A template importing a page (templates are data-agnostic)

**Same-level dependencies** are allowed but should be minimized. A molecule can use another molecule (a `DateRangePicker` molecule composes two `DatePicker` molecules), but excessive same-level coupling suggests a missing intermediate abstraction.

**Dependency audit procedure:** For each component, list its imports. If any import is from the same level or higher, flag it for review. GitHub Primer automates this with an ESLint rule that enforces import direction based on directory structure.

### Handling Edge Cases

**Components that span levels.** A `Popover` seems like an atom (it is a single visual element) but it composes internal atoms (arrow, backdrop, content container) and manages complex state (positioning, focus trap). It is a molecule. The test is not visual simplicity but compositional complexity.

**Utility components.** `Portal`, `VisuallyHidden`, `FocusTrap`, and `AnimatePresence` do not fit cleanly into atomic levels because they produce no visible output. Treat them as infrastructure -- they live outside the atomic hierarchy in a `utilities/` directory and can be imported by any level.

**Design tokens as sub-atomic.** Tokens (colors, spacing, typography values) exist below the atomic level. They are the properties that atoms consume, not components themselves. Brad Frost calls them "the protons and neutrons" that make up atoms.

### Real-World Examples

**Shopify Polaris** organizes components into four tiers (Actions, Layout, Navigation, Overlays) but the internal structure follows atomic principles. Their `Button` (atom) is composed into `ButtonGroup` (molecule), which appears inside `Card` headers (organism). The `Page` component is explicitly a template: it defines title area, primary/secondary actions, and a content slot. Their Storybook organizes stories by atomic level, making the hierarchy browsable.

**Atlassian Design System** serves multiple products (Jira, Confluence, Bitbucket) from a shared atomic foundation. Their `@atlaskit/button` atom has 12 appearances (default, primary, subtle, link, etc.) and is composed into toolbar molecules across all products. They found that organisms are the level where product-specific divergence starts -- so atoms and molecules are shared, but organisms may be product-scoped. Their package structure reflects this: `@atlaskit/button` (atom, 1.2M weekly downloads) vs `@atlaskit/jira-issue-view` (organism, Jira-only).

**Material Design 3** defines atoms as "building blocks" (FAB, IconButton, Chip), molecules as "communication" components (Snackbar, Dialog), and organisms as "containment" patterns (Card, NavigationDrawer). Their component spec sheets explicitly list which lower-level components each higher-level component uses, creating a traceable dependency graph. Every M3 component page includes a "Components used" section showing its atomic dependencies.

**Apple Human Interface Guidelines** do not use atomic terminology but follow the same decomposition. SF Symbols are atoms. A `Toggle` with label is a molecule. A `Settings` pane with grouped toggles, navigation, and search is an organism. Apple's platform-specific templates (NavigationSplitView on macOS, TabView on iOS) define the layout skeleton that organisms fill. Their SwiftUI component library enforces composition through view modifiers -- atoms accept modifiers but never compose other named components internally.

**GitHub Primer** maps their React component library to atomic levels in their architecture documentation. `Button`, `Label`, `Avatar`, and `CounterLabel` are atoms. `ButtonGroup`, `AvatarPair`, and `BranchName` are molecules. `ActionMenu`, `Dialog`, and `SelectPanel` are organisms. Their compound component pattern (e.g., `ActionMenu.Button` + `ActionMenu.Overlay`) demonstrates how organisms compose molecules through React context rather than prop drilling.

## Source

Brad Frost, _Atomic Design_ (2016). Chapter 2: "Atomic Design Methodology." The five levels were first proposed as a blog post in 2013 and refined through application across hundreds of design systems. Dan Mall's "Design System in 90 Days" extends the methodology with adoption-focused heuristics.

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
