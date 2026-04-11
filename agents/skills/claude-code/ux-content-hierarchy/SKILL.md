# Content Hierarchy in UI

> Content hierarchy in UI — heading structure, progressive disclosure in text, inverted pyramid for interface writing

## When to Use

- Structuring settings pages with dozens of options across multiple categories
- Organizing help documentation, FAQ sections, and knowledge bases within the app
- Designing multi-step forms and wizards with clear progress and section breaks
- Creating dashboard layouts where text labels, descriptions, and metadata coexist
- Writing feature announcements, changelogs, and release notes within the product
- Structuring onboarding flows that introduce features progressively
- Reviewing existing pages where users report difficulty finding information
- Designing error pages and system status pages with structured recovery paths
- Organizing notification centers and activity feeds with clear temporal and categorical grouping
- NOT for: visual hierarchy decisions like spacing, font size, and color -- that is design, not content
- NOT for: navigation architecture and sitemap structure -- that is information architecture

## Instructions

1. **Apply the inverted pyramid to every text block.** The inverted pyramid, borrowed from journalism, places the most important information first and the supporting details after. In UI, this means every paragraph, tooltip, and description should lead with the conclusion. Notion's billing page leads with "Your workspace is on the Free plan" -- the essential fact -- then follows with details about what that means (limits, upgrade options). If the user reads only the first sentence and stops, they should have the key information. Stripe's error messages follow this structure: "Your card was declined" (the conclusion) then "Try a different payment method or contact your bank" (the supporting action).

2. **Heading levels must match content hierarchy -- never skip levels.** Headings are the outline of the page. An H1 is the page title. H2s are major sections. H3s are subsections within H2s. Skipping from H1 to H3 creates a broken outline that confuses both screen readers and sighted users who scan headings. GitHub's repository settings page demonstrates correct heading hierarchy: "Settings" (H1), "General" (H2), "Repository name" (H3), "Default branch" (H3). Each level nests logically within the one above it. The heading structure should make sense if you read nothing but the headings -- it should be a complete table of contents.

3. **Use progressive disclosure for complexity.** Show the simple version first and let users expand for details. This reduces cognitive load for users who need the basics and provides depth for users who need the details. GitHub's pull request diff view collapses large file diffs with a summary: "+47 -12" tells the user the scope without forcing them to see every line. Clicking expands the full diff. Stripe's dashboard shows transaction summaries with expandable details. The principle: the default view shows what 80% of users need, and the expanded view shows what the remaining 20% need.

4. **Front-load the conclusion in every paragraph.** The first sentence of any paragraph should be independently useful. If a user reads only the first sentence and moves on, they should have the key takeaway. This is the inverted pyramid applied at the paragraph level. In a settings description, "Notifications are sent by email" should come before "You can configure notification frequency, choose specific events, and set quiet hours." The first sentence answers the immediate question. The second sentence provides options for users who want to customize.

5. **Group related items under clear category labels.** A flat list of 30 settings is overwhelming. Grouped into categories -- "Account," "Billing," "Notifications," "Security," "Integrations" -- the same 30 settings become navigable. Each category label should be a noun or noun phrase that names the domain, not a verb that names an action. GitHub's settings use noun categories: "General," "Access," "Code and automation," "Security." Slack's preferences group by domain: "Notifications," "Sidebar," "Themes," "Messages & media." The category labels serve as landmarks that allow users to skip entire sections.

6. **Use the three-level rule.** If content goes deeper than three levels of nesting, the structure needs to be redesigned. Three levels is the cognitive limit for most users: section, subsection, item. A settings page with "Account > Security > Two-factor authentication > Recovery codes > Download format" has five levels -- the user is lost. The fix: flatten the hierarchy by promoting deeply nested items to their own section, or use sequential navigation (step 1, step 2, step 3) instead of nested hierarchy. Apple's iOS Settings app follows the three-level rule: "Settings > Privacy & Security > Location Services" is three levels. Individual app permissions are presented as a flat list at the third level, not nested further.

7. **Differentiate primary, secondary, and tertiary content with distinct text patterns.** Every page has content at three importance levels. Primary content is what the user came for: the main heading, the key data, the primary action. Secondary content supports the primary: descriptions, helper text, metadata. Tertiary content is contextual: timestamps, version numbers, fine print. Distinguish these levels with consistent text patterns: bold for primary terms, regular weight for descriptions, muted color for metadata. Linear differentiates cleanly: issue title is bold and prominent, description is regular weight, and metadata (assignee, priority, labels) is smaller and muted.

8. **Write headings as standalone signposts.** Every heading should make sense without reading the content below it. "Overview" is too vague -- an overview of what? "Project settings" is clear. "Next steps" is vague -- steps for what? "Set up your first project" is actionable and specific. Headings are the most-read text on any page because users scan headings to decide where to focus. A heading that requires the user to read the following content to understand it has failed as a signpost. Stripe's documentation headings are models: "Create a payment intent," "Handle post-payment events," "Test your integration" -- each heading tells the user exactly what the section covers.

## Details

### Heading Hierarchy Patterns for Common Page Types

**Settings pages.** H1: Page title ("Settings"). H2: Category ("Notifications"). H3: Individual setting ("Email notifications"). Under each H3, the setting control with a one-sentence description. This pattern scales from 5 settings to 50 settings by adding H2 categories.

**Onboarding flows.** H1: Welcome message ("Welcome to Acme"). H2: Step label ("Step 1: Create your workspace"). Under each H2, a brief instruction and a primary action. Progress indicators supplement the heading hierarchy by showing position in the overall flow.

**Help and documentation pages.** H1: Topic title ("Getting started"). H2: Task ("Create your first project"). H3: Subtask or concept ("Choose a template"). The heading hierarchy should map to the user's mental model of the task, not to the product's internal structure.

**Dashboard layouts.** H1: Dashboard name (often implicit or in the page title). H2: Widget or section title ("Recent activity," "Usage this month"). Under each H2, the data visualization or list. Dashboard headings should name the data domain, not the visualization type -- "Revenue this month" not "Bar chart."

### Progressive Disclosure Decision Framework

Use progressive disclosure when any of these conditions are true:

- The content serves two audiences with different expertise levels (new users vs. power users)
- The full content is longer than three sentences or five items
- The content is needed by less than 50% of users viewing the page
- The content is contextual and only relevant after the user has taken a specific action

Do not use progressive disclosure when:

- The content is essential for all users (critical warnings, primary instructions)
- Hiding the content creates a false sense of simplicity that leads to errors
- The disclosure mechanism (expand/collapse) adds more interaction cost than reading the content

GitHub's repository creation form demonstrates correct progressive disclosure: basic fields (name, visibility) are always visible; advanced options (description, README, .gitignore, license) are collapsed under "Add a README file" and "Choose a license." The basic form serves 80% of use cases; the expanded form serves the remaining 20%.

### The Hierarchy Audit

To audit an existing page for content hierarchy issues, perform the following steps:

1. **Extract all headings.** List every heading on the page in order. Read them as a standalone outline. If the outline does not make sense, the hierarchy is broken.
2. **Check heading levels.** Verify that no level is skipped. An H3 must be preceded by an H2, not directly by an H1.
3. **Measure text block lengths.** Flag any paragraph longer than three sentences in UI context. Flag any list longer than seven items without subcategories.
4. **Identify buried leads.** For each text block, check whether the first sentence contains the most important information. If the conclusion is in the last sentence, the block needs to be restructured.
5. **Count nesting levels.** Trace the deepest path through the page's hierarchy. If any path exceeds three levels, the hierarchy needs to be flattened.
6. **Test progressive disclosure placement.** For each collapsed or hidden section, estimate the percentage of users who need that content. If more than 50% need it, it should be visible by default.

This audit can be performed on paper in 10-15 minutes and catches the most common hierarchy problems before users encounter them.

### Whitespace as Structure

Whitespace is not the absence of content -- it is structural content. A blank line between two paragraphs signals "new topic." A larger gap between sections signals "new category." Without whitespace, even well-structured content feels like a wall of text.

Principles for whitespace in content hierarchy:

- **Intra-group spacing** (between items in the same group): small, consistent gap. All settings within "Notifications" have the same vertical spacing between them.
- **Inter-group spacing** (between different groups): larger gap, often with a heading or divider. The gap between "Notifications" and "Security" is visibly larger than the gap between individual notification settings.
- **Section spacing** (between major sections): largest gap, always with a heading. The gap between "Account" and "Billing" is the largest on the page.

Stripe's settings page uses three distinct spacing levels that visually communicate the hierarchy without the user consciously noticing. The spacing does the grouping work that headings alone cannot.

### Content Grouping Strategies

**Alphabetical grouping.** Best for large reference lists where users know the name of what they are looking for. Settings A-Z, country lists, API endpoint directories.

**Task-based grouping.** Best for action-oriented pages where users are trying to accomplish something. "Create," "Manage," "Monitor" groups on an admin dashboard.

**Frequency-based grouping.** Best for settings and preferences. Most-changed settings at the top, rarely-changed settings further down. Google's Chrome settings put the most-accessed settings (search engine, appearance, privacy) at the top.

**Lifecycle grouping.** Best for onboarding and process flows. Items ordered by the sequence in which users encounter them. "Set up account," "Create first project," "Invite team members."

### Anti-Patterns

1. **The Flat Wall.** A page with no headings, no sections, and no visual grouping -- just a continuous stream of text or a flat list of items. A settings page with 40 toggles in a single scrollable list. A help page with 15 paragraphs and no headings. The user cannot scan, cannot skip, and cannot find what they need without reading everything. The fix: group items into categories of 3-7 items each, add a heading to each category, and add whitespace between categories. The grouping can be functional (by what the setting controls) or alphabetical -- either is better than no grouping.

2. **The Deep Nest.** Content nested four or more levels deep. A settings drawer that opens a panel that contains a section that has a subsection. The user loses context about where they are and how to get back. Breadcrumbs help but do not solve the root problem: the hierarchy is too deep. The fix: flatten the hierarchy by promoting deeply nested items to their own page or section. If "Account > Security > Two-factor authentication > Recovery codes" is too deep, give recovery codes their own top-level section under Security.

3. **The Buried Lead.** Placing the most important information at the bottom of a text block, after context and caveats. "We've been working hard to improve your experience, and after careful consideration and extensive testing, we're excited to announce that starting next month, prices will increase by 20%." The price increase -- the only information the user cares about -- is buried after 30 words of filler. The fix: lead with the conclusion. "Prices increase 20% starting May 1. Here's what changes for your plan."

4. **The Misleading Heading.** A heading that does not accurately describe its content. A section titled "Getting Started" that actually contains billing information. A heading "Overview" that is actually a detailed technical specification. Misleading headings are worse than no headings because they cause the user to skip content they need or read content they do not need. The fix: write headings after writing the content, not before. The heading should be a summary of what follows.

### Real-World Examples

**GitHub's Repository Settings Hierarchy.** GitHub's repository settings page is a masterclass in content hierarchy at scale. The page contains over 50 settings, organized into five H2 categories: "General," "Access," "Code and automation," "Security," and "Integrations." Within each category, individual settings have H3 headings with concise descriptions. Dangerous settings (delete repository, change visibility) are visually separated at the bottom of the "General" section with red borders. Progressive disclosure hides advanced options: branch protection rules expand to show pattern matching only when the user creates a rule. The hierarchy allows a user to find any specific setting within two or three scans of headings.

**Stripe's Dashboard Content Organization.** Stripe's dashboard organizes dense financial data using strict content hierarchy. The top level shows summary metrics: total volume, successful payments, dispute rate. Each metric links to a detail view with transaction-level data. The left navigation groups by domain: "Payments," "Customers," "Products," "Billing," "Connect." Within each section, the hierarchy follows the same pattern: summary at the top, filterable list in the middle, and individual item detail at the bottom. This consistent three-level pattern (summary, list, detail) means that once a user learns the hierarchy for Payments, they already know the hierarchy for Customers, Products, and every other section.

**Linear's Issue Detail Progressive Disclosure.** Linear's issue detail page demonstrates progressive disclosure applied to a single item. The primary content is the issue title and description, displayed prominently. Secondary content -- assignee, priority, labels, project -- is displayed as compact metadata chips on the right sidebar. Tertiary content -- activity log, sub-issues, relations -- is organized in tabs below the description. The user sees the essential information immediately (title, description, status), can scan the metadata without scrolling (sidebar), and can dive into history and context on demand (tabs). Nothing is hidden that should be visible, and nothing is visible that should be hidden.

## Source

- NNGroup -- "Information Scent: How Users Decide Where to Go Next" (2003), evidence for heading-based navigation
- Krug, S. -- _Don't Make Me Think_ (2014), chapter 7 on content hierarchy and scanning
- Inverted pyramid from journalism -- AP Stylebook, applied to interface writing
- Apple Human Interface Guidelines -- Layout and Organization, progressive disclosure patterns
- Google Material Design -- Content structure and hierarchy, https://m3.material.io/foundations/content/overview
- NNGroup -- "Progressive Disclosure" (2006), research on cognitive load reduction through staged complexity
- Weinschenk, S. -- _100 Things Every Designer Needs to Know About People_ (2011), grouping and chunking research

## Process

1. Read the instructions and examples in this document.
2. Outline the page structure using headings before writing any body content.
3. Apply the inverted pyramid to every text block -- most important information first.
4. Group related items into categories of 3-7 and apply progressive disclosure where appropriate.
5. Verify your implementation against the anti-patterns listed above.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- Every page has a clear heading hierarchy that makes sense when read as a standalone outline.
- No heading level is skipped (no H1 to H3 without an H2).
- The inverted pyramid is applied -- the first sentence of every text block is independently useful.
- Settings and options are grouped into categories of 3-7 items with clear category labels.
- Content nesting never exceeds three levels.
- Progressive disclosure is used for content needed by less than 50% of users.
- Whitespace communicates structure -- intra-group, inter-group, and section spacing are visually distinct.
