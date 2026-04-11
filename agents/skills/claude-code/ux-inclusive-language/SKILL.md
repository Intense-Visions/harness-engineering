# Inclusive Language in UI

> Inclusive language in UI — gender-neutral, ability-neutral, culture-aware writing, avoiding idioms that exclude

## When to Use

- Writing any user-facing text in a product used by a diverse audience
- Reviewing existing UI text for gendered language, ableist metaphors, or cultural assumptions
- Designing forms that collect personal information -- names, gender, titles, addresses
- Writing error messages, help text, and onboarding copy that must work for all users
- Creating onboarding flows that welcome users from different backgrounds and abilities
- Building products that will be used in multiple countries, cultures, or language contexts
- Updating legacy codebases and UI text that use outdated terminology (master/slave, whitelist/blacklist)
- Writing accessibility-related UI text -- screen reader labels, skip navigation, alt text
- NOT for: quoted content where the original language must be preserved
- NOT for: legal text with specific legally defined terms that cannot be paraphrased

## Instructions

1. **Use "they/them" as the default singular pronoun in UI text.** When referring to a user whose gender is unknown or unspecified, use singular "they." "When a user logs in, they see their dashboard" -- not "he sees his dashboard" or "he or she sees his or her dashboard." GitHub, Slack, Stripe, and Google all adopted singular "they" in their style guides. The construction is grammatically established (used in English since the 14th century), shorter than "he or she," and inclusive of non-binary users. For direct address, prefer "you" -- "Your dashboard" is always better than "The user's dashboard."

2. **Avoid ability-based metaphors in UI actions.** Standard UI verbs assume visual and physical ability: "see," "look at," "click," "drag," "watch." Replace them with ability-neutral alternatives that describe the cognitive action, not the physical one. "Check your settings" not "See your settings." "Select an option" not "Click an option." "Review the document" not "Look at the document." "Move the item" not "Drag the item." These alternatives work for screen reader users, keyboard-only users, and users with motor disabilities. They also happen to be more precise -- "review" implies cognitive evaluation, while "look at" only implies visual contact.

   | Ability-specific (avoid) | Ability-neutral (prefer) |
   | ------------------------ | ------------------------ |
   | See the results          | View the results         |
   | Look at the preview      | Review the preview       |
   | Click the button         | Select the button        |
   | Watch the video          | Play the video           |
   | Hear the alert           | Receive the alert        |
   | Walk through the steps   | Follow the steps         |
   | Hands-on tutorial        | Interactive tutorial     |

3. **Replace gendered defaults with neutral alternatives.** Language that assumes a default gender excludes people and reinforces stereotypes. Maintain a substitution list and apply it consistently:

   | Gendered (avoid)    | Neutral (prefer)         |
   | ------------------- | ------------------------ |
   | mankind             | humanity, people         |
   | man-hours           | person-hours, work hours |
   | manpower            | workforce, staffing      |
   | manned              | staffed, operated        |
   | guys (as address)   | everyone, team, folks    |
   | salesman            | salesperson, sales rep   |
   | chairman            | chairperson, chair       |
   | master/slave        | primary/replica          |
   | blacklist/whitelist | blocklist/allowlist      |
   | grandfathered       | legacy, exempt           |

   GitHub renamed its default branch from "master" to "main" in 2020. The change was technically trivial (a configuration default) but symbolically significant -- it demonstrated that inclusive language in technical systems is achievable without disruption.

4. **Avoid idioms that assume cultural context.** English-language idioms often assume familiarity with American culture, sports, or history. "Hit a home run" means nothing to a user in Germany. "Level the playing field" assumes knowledge of sports metaphors. "Grandfather clause" has roots in post-Civil War voter suppression. Replace idioms with direct language:

   | Idiom (culturally bound) | Direct alternative             |
   | ------------------------ | ------------------------------ |
   | Hit a home run           | Succeeded, achieved the goal   |
   | Move the needle          | Made measurable progress       |
   | Low-hanging fruit        | Easy wins, quick tasks         |
   | Drinking from a firehose | Overwhelming amount of info    |
   | Boil the ocean           | Take on too much at once       |
   | Circle back              | Return to this topic           |
   | Open the kimono          | Share information              |
   | Sanity check             | Quick review, confidence check |

   Direct language is not only more inclusive -- it is more precise. "Quick review" is clearer than "sanity check" for any audience.

5. **Use person-first or identity-first language based on community preference.** Different disability communities have different preferences. The Deaf community generally prefers identity-first ("deaf person"), while many other disability communities prefer person-first ("person with a disability"). When in doubt, use person-first language. In UI text, the best approach is often to focus on the situation, not the person: "If you use a screen reader" rather than "If you are a visually impaired person." This focuses on the tool and the experience, not the medical condition.

6. **Design inclusive forms.** Forms are where inclusive language is most critical because they ask users to categorize themselves. Principles for inclusive forms:
   - **Gender fields:** Provide "Prefer not to say" or "Prefer to self-describe" options. Never require binary gender selection. Only ask for gender when it is necessary for the product's function.
   - **Name fields:** Use "Full name" or separate "Given name" and "Family name" instead of "First name" and "Last name" -- many cultures do not follow the Western first/last name convention. Support Unicode characters, hyphens, apostrophes, and spaces.
   - **Title fields:** If a title is needed, make it optional and include gender-neutral options ("Mx."). Better yet, do not ask for titles at all -- most products do not need them.
   - **Address fields:** Do not assume a country format. "State/Province/Region" accommodates more countries than "State." "Postal code" is more universal than "ZIP code."

7. **Avoid violent metaphors in technical contexts.** Technical jargon often borrows from violent language: "kill the process," "terminate the connection," "abort the operation," "nuke the cache." In user-facing text, replace these with neutral alternatives: "end" or "stop" for "kill," "close" for "terminate," "cancel" for "abort," "clear" for "nuke." The violent metaphors are unnecessary -- the neutral alternatives are equally clear and do not carry the aggressive connotation. Apple's Human Interface Guidelines explicitly prohibit violent language in user-facing text.

## Details

### Inclusive Language Audit Checklist

When reviewing existing UI text for inclusivity, check each item:

- Are all pronouns gender-neutral (they/them) when the user's gender is unknown?
- Do any UI actions assume physical ability (click, see, hear)?
- Are there any gendered job titles or role names?
- Do any idioms assume cultural context that non-Western users would not share?
- Are form fields designed for global name formats, not just Western conventions?
- Does the text avoid violent metaphors (kill, terminate, abort, nuke)?
- Are disability references focused on the situation, not the person?
- Is the text free of age-related assumptions ("even your grandmother could use it")?

### Pronouns in UI Text

The hierarchy of pronoun preference for UI text:

1. **"You/your" (best).** Direct address eliminates the pronoun problem entirely. "Your dashboard" works for every user regardless of gender.
2. **"They/their" (good).** When referring to a third party: "Ask your admin. They can grant you access."
3. **Rephrase to avoid pronouns (good).** "The project owner can grant access" instead of "He or she can grant access."
4. **"He or she" (avoid).** Wordy, binary, and excludes non-binary users. Never use in UI text.
5. **Generic "he" (never).** Outdated and exclusionary. Never use in UI text.

### Accessibility Language Patterns

When writing UI text related to accessibility features:

- **Screen reader labels:** Describe the function, not the disability. "Screen reader label" not "Blind user label." "Alternative text" not "Text for visually impaired users."
- **Skip navigation:** "Skip to main content" is the standard phrasing. Do not elaborate with "for users who cannot see the navigation."
- **Reduced motion:** "Reduce motion" not "For people with vestibular disorders." The setting name describes the action, not the medical condition.
- **Keyboard navigation:** "Keyboard shortcuts" not "Alternative navigation for users who cannot use a mouse." Focus on the feature, not the reason someone might use it.

The principle: accessibility features should be labeled by what they do, not by who needs them. This is both more inclusive and more useful -- sighted users also use keyboard shortcuts, and users without vestibular disorders may prefer reduced motion.

### Anti-Patterns

1. **The Gendered Default.** Using "he" or "his" as the default pronoun for unknown users. "When the admin reviews the request, he can approve or deny it." This pattern was once standard in English but is now recognized as exclusionary. It signals to non-male users that they are not the expected audience. The fix is simple and mechanical: replace "he" with "they" or restructure to use "you." "When you review the request, you can approve or deny it."

2. **The Ableist Metaphor.** Using disability as a negative metaphor. "The interface is crippled without JavaScript." "That feature is lame." "Are you blind? The button is right there." These metaphors equate disability with failure, inadequacy, or incompetence. They are harmful to disabled users and imprecise for all users. The fix: describe the actual problem. "The interface has limited functionality without JavaScript." "That feature is ineffective." "The button is in the top-right corner."

3. **The Cultural Assumption.** UI text that assumes all users share the same cultural references, holidays, seasonal context, or social norms. A "Happy Thanksgiving!" banner shown to users in Japan. A "Summer sale!" notification sent to users in the Southern Hemisphere where it is winter. Instructions that say "Call us during business hours" without specifying the timezone. Date formats that use MM/DD/YYYY (American) without considering that most of the world uses DD/MM/YYYY. The fix: design for the global user. Use ISO date formats or let users set their locale. Reference holidays only when the product is locale-specific. Always specify timezones.

4. **The Tokenistic Inclusion.** Adding a single diverse emoji or stock photo to a product that otherwise uses exclusionary language throughout. Surface-level representation without substantive language changes is performative and can feel worse than no attempt at all -- it signals awareness without action. The fix: inclusive language is a systematic practice, not a decoration. Start with the language and terminology. Audit the entire product, not just the homepage.

### Real-World Examples

**Microsoft's Inclusive Writing Guide.** Microsoft published a comprehensive bias-free writing guide that their content teams use across all products. Key decisions: "they" as default singular pronoun, "select" instead of "click" (because touch and voice users do not click), "allowlist/blocklist" instead of "whitelist/blacklist," and person-first language for disability references. The guide includes specific examples for over 50 common patterns and is publicly available for other teams to reference. Microsoft's approach treats inclusive language as a content standard, not a suggestion -- it is enforced in code review the same way coding standards are.

**GitHub's "main" Branch Rename.** In 2020, GitHub changed the default branch name from "master" to "main." The technical change was minimal -- one configuration default. The cultural impact was significant: it demonstrated that inclusive language changes in technical systems are feasible, low-cost, and symbolic of broader commitments. GitHub published a migration guide, provided tooling to update existing repositories, and set a timeline for the transition. The rename is now an industry-standard default adopted by GitLab, Bitbucket, and most open-source projects.

**Slack's Inclusive Emoji and Language Patterns.** Slack supports diverse skin tone emoji, pronoun display in profiles, and uses inclusive language throughout its UI. Notification settings say "when someone mentions you" (gender-neutral). The team directory shows pronouns when users choose to display them, without making pronouns mandatory. Empty states say "No messages from anyone yet" rather than assuming a gendered pronoun for the hypothetical message sender. Slack's approach demonstrates that inclusive language can be systematic without being intrusive -- the changes are subtle, consistent, and respect user choice.

**Apple's Human Interface Guidelines on Inclusion.** Apple's HIG dedicates a section to inclusive language with specific guidance: use "select" instead of "click" to accommodate touch, voice, and switch control users. Use "turn on" and "turn off" instead of "enable" and "disable" (which carry ability connotations). Refer to people, not users -- "people who use your app" rather than "your users." Apple's guidelines treat inclusive language as a design requirement, not optional polish, and enforce it across all first-party apps as part of their App Review process.

## Source

- Microsoft Writing Style Guide -- Bias-free communication, https://learn.microsoft.com/en-us/style-guide/bias-free-communication
- W3C WCAG -- Cognitive accessibility guidelines, language clarity requirements
- Google Developer Documentation Style Guide -- Inclusive language section, https://developers.google.com/style/inclusive-documentation
- 18F Content Guide -- Inclusive language, https://content-guide.18f.gov/inclusive-language/
- Apple Human Interface Guidelines -- Inclusion section, ability-neutral language guidance
- Conscious Style Guide -- https://consciousstyleguide.com, comprehensive resource for bias-free writing

## Process

1. Read the instructions and examples in this document.
2. Audit existing UI text using the inclusive language checklist in this document.
3. Apply the substitution tables for gendered terms, ableist metaphors, and cultural idioms.
4. Review all forms for inclusive field design (names, gender, titles, addresses).
5. Verify your implementation against the anti-patterns listed above.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- All UI text uses "they/them" or "you/your" -- no gendered pronouns for unknown users.
- No ableist metaphors appear in user-facing text -- all actions use ability-neutral verbs.
- All gendered defaults are replaced with neutral alternatives.
- Forms use inclusive field labels and do not require binary gender selection.
- No cultural idioms appear in UI text -- all language is direct and globally accessible.
- Violent technical metaphors are replaced with neutral alternatives in user-facing text.
