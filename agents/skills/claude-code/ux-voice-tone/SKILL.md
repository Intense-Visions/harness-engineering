# Voice and Tone

> Voice and tone in UI writing — defining voice (constant) vs tone (contextual), formality calibration, and emotional register

## When to Use

- Establishing or documenting a product's voice guidelines for the first time
- Calibrating tone for different UI contexts -- error states, success messages, onboarding, destructive actions
- Writing for emotionally charged moments -- failed payments, account deletion, data loss warnings
- Auditing existing UI text for voice consistency across features and teams
- Onboarding new writers or developers who will contribute UI text
- Building a voice and tone style guide for a design system
- Reviewing destructive action dialogs, payment flows, and security alerts for tonal appropriateness
- Transitioning a product from engineer-written UI text to a consistent voice system
- Defining upgrade and billing prompt language that respects user autonomy
- NOT for: marketing brand guidelines or editorial voice for blog content
- NOT for: visual brand identity (logos, color palette, typography)

## Instructions

1. **Voice is constant, tone varies by context.** Voice is your product's personality -- it stays the same whether the user is celebrating or panicking. Tone is the emotional register you apply to that personality depending on the situation. Slack's voice is always casual and friendly, but its tone shifts from playful ("You're all caught up!") to serious ("This will permanently delete #engineering and all its messages. This cannot be undone.") to supportive ("Having trouble? We can help."). The distinction matters because teams that conflate voice and tone either sound robotic in every context or sound flippant during serious moments.

2. **Define your voice with three to five adjectives and their opposites.** Mailchimp's voice guide is the industry standard: "Funny but not goofy. Confident but not cocky. Smart but not stodgy. Informal but not sloppy. Helpful but not overbearing." The opposites prevent misinterpretation. Without them, "funny" can drift into slapstick, "confident" into arrogance, "informal" into unprofessional. Stripe defines its voice as "clear, not clever" -- prioritizing comprehension over personality. Notion's voice is "simple, not simplistic" -- accessible without being patronizing. Write these down. Put them in a shared document. Reference them in code reviews.

3. **Calibrate formality to consequences.** The higher the stakes, the more formal the tone. A dashboard greeting can be casual: "Welcome back, Jordan." A payment failure must be direct and clear: "Your payment of $49.99 failed. Update your payment method to avoid service interruption." Stripe follows this gradient precisely: dashboard navigation is conversational, API documentation is technical but accessible, payment error messages are formal and specific, and fraud warnings are urgent and imperative. Map each UI context to a point on the formality spectrum before writing.

4. **Match the user's emotional state before redirecting it.** When a user encounters an error, they are frustrated. Starting with cheerfulness ("Oops! Something went wrong!") invalidates their frustration and erodes trust. Start by acknowledging reality: "We couldn't process your payment." Then provide the path forward: "Try a different card or contact your bank." Apple's error messages follow this pattern: state the problem factually, then offer one or two concrete actions. Never lead with false positivity when the user is experiencing a negative outcome.

5. **Use the tone spectrum: playful, neutral, serious, urgent.** Map every UI context to a point on this four-level spectrum. Success confirmations: playful to neutral ("Your project is live!"). Informational messages: neutral ("Your trial ends in 14 days."). Error recovery: serious ("We couldn't save your changes. Your draft is preserved locally."). Security warnings: urgent ("Unusual sign-in detected. Was this you?"). The spectrum prevents two common failures: treating everything as neutral (robotic), or treating everything as playful (tone-deaf). Linear maps its spectrum clearly: issue creation is neutral, critical bug labels are serious, and subscription changes are formal.

6. **Avoid false cheerfulness in negative moments.** "Oops!" before a payment failure. A winking emoji after a deletion warning. "Uh oh!" when the server is down. False cheerfulness signals that the product does not take the user's problem seriously. The rule: if the user cannot undo the situation immediately, do not use playful language. GitHub's repository deletion dialog is a model of appropriate gravity: no humor, no softening, just the facts and a confirmation that requires typing the repository name. Compare this with products that say "Whoopsie! Your account has been deactivated!" -- the mismatch between the severity and the tone destroys credibility.

7. **Test tone with the "read it out loud to a stranger" method.** Read the UI text aloud to someone unfamiliar with the product, in the voice you intend. If the text sounds condescending, robotic, or inappropriately casual, it will read that way too. This test catches tone mismatches that are invisible when reading silently. Particularly effective for error messages: read "We're sorry, but the thing you were trying to do didn't work out. Please try again later or contact our friendly support team!" aloud and hear how patronizing it sounds. Then read "Upload failed. File exceeds the 10 MB limit." and hear how much more respectful it is.

## Details

### Voice Documentation Template

A voice document should contain four sections that any team member can reference when writing UI text:

**Voice principles.** Three to five adjective pairs with examples. Each pair gets a "this, not that" column:

| Principle                | This (do)                                       | Not that (don't)                                    |
| ------------------------ | ----------------------------------------------- | --------------------------------------------------- |
| Friendly, not familiar   | "Welcome back, Jordan"                          | "Hey hey, look who's back!"                         |
| Confident, not arrogant  | "Your data is encrypted at rest and in transit" | "We have the most secure platform on the market"    |
| Direct, not blunt        | "Your card was declined"                        | "Payment failure: card_declined"                    |
| Helpful, not overbearing | "Need help? Visit our docs"                     | "Did you know you can also try these 5 features..." |
| Concise, not curt        | "Saved"                                         | "S."                                                |

**Tone mapping.** A matrix that maps UI contexts to tone levels:

| Context              | Tone Level     | Example                                                |
| -------------------- | -------------- | ------------------------------------------------------ |
| Onboarding           | Warm           | "Let's set up your workspace. It takes about 2 min"    |
| Success confirmation | Positive       | "Your project is live!"                                |
| Neutral information  | Matter-of-fact | "Your plan includes 5 team members"                    |
| Warning              | Serious        | "You've used 90% of your storage"                      |
| Error recovery       | Empathetic     | "We couldn't connect. Your work is saved locally"      |
| Destructive action   | Grave          | "This will permanently delete all project data"        |
| Security alert       | Urgent         | "New sign-in from unknown device. Secure your account" |

**Vocabulary list.** Preferred terms and banned terms. Stripe's vocabulary: "customer" not "user," "decline" not "reject," "update" not "change." This list prevents drift across teams and ensures consistency even when multiple writers contribute.

**Exception list.** Specific contexts where the standard voice shifts. Legal text, compliance warnings, and accessibility descriptions may require more formal language than the standard voice. Document these exceptions explicitly so writers do not force casual voice into contexts that require formality.

**Voice audit process.** Review all UI text quarterly by pulling a random sample of 50 strings from across the product. Score each string on voice consistency (1-5) and tonal appropriateness (1-5). Strings scoring below 3 on either dimension should be rewritten. Track the average score over time to measure voice maturation. Atlassian runs this process and publishes the results internally to maintain accountability across teams.

### Tone Calibration for Common UI Moments

Specific guidance for the most frequently encountered UI contexts where tone decisions have the highest impact:

**Onboarding and first-run.** The user is forming their first impression. Tone should be warm and encouraging without being presumptuous. Assume nothing about the user's expertise. Notion's onboarding says "Welcome to Notion. Let's set up your workspace" -- warm, simple, no jargon. Avoid over-excitement ("OMG you're going to LOVE this!") and avoid cold efficiency ("Step 1 of 5: Configure workspace settings").

**Empty states.** The user sees nothing and may feel lost. Tone should be reassuring and action-oriented. "No projects yet" is neutral and clear. "Create your first project to start collaborating" adds a gentle nudge without pressure. GitHub's empty repository state achieves this by providing copy-paste commands -- the tone says "we've made this easy for you" without stating it.

**Loading and waiting.** The user is idle and potentially anxious. Tone should be calm and informative. "Loading your dashboard..." is standard. Slack adds personality with loading messages like "Herding cats..." but keeps them short and rotates them to avoid repetition fatigue. If loading takes more than a few seconds, shift to informational: "Loading 2,847 messages..."

**Upgrade and billing prompts.** The user is being asked to spend money. Tone must be respectful and transparent, never pushy or manipulative. "Your team has grown past the free plan limit of 5 members. See plans." is factual. "Unlock UNLIMITED features NOW!" is aggressive and damages trust. Stripe's billing UI uses professional tone exclusively: clear pricing, no urgency tricks, no countdown timers.

**Account closure.** The user is leaving. Tone should be respectful and friction-free. Acknowledge the decision without guilt-tripping. "We're sorry to see you go" is acceptable. "Are you SURE? You'll lose EVERYTHING!" is manipulative. Provide a clear summary of what will happen and when, with a simple confirmation step.

### The Formality Ladder

Formality is not binary (casual vs. formal). It is a five-rung ladder:

1. **Playful.** Emojis, contractions, humor, first-name address. Appropriate for: welcome messages, achievement celebrations, empty states. Example: Slack's "You're all caught up" with a plant illustration.
2. **Conversational.** Contractions, second person, friendly but no humor. Appropriate for: dashboard text, navigation labels, feature descriptions. Example: Notion's "Share this page with your team."
3. **Professional.** Full sentences, no contractions in critical text, second person. Appropriate for: billing information, plan changes, data handling notices. Example: Stripe's "Your subscription will renew on April 15."
4. **Formal.** Complete sentences, no contractions, specific and unambiguous. Appropriate for: error messages, security alerts, compliance text. Example: GitHub's "Deleting a repository is permanent and cannot be undone."
5. **Urgent.** Short sentences, imperative mood, action-first. Appropriate for: security breaches, data loss warnings, system outages. Example: "Your account may be compromised. Change your password now."

Most products live primarily at levels 2-3 (conversational to professional). The extremes -- playful and urgent -- should account for less than 10% of total UI text. If more than half of your UI strings are at the playful level, your product will feel unserious. If more than half are at the formal level, it will feel bureaucratic. Audit the distribution periodically and rebalance toward the center.

### Anti-Patterns

1. **The Tone-Deaf Celebration.** Using playful or celebratory language during a negative user experience. "Whoops! Your payment didn't go through!" with a confetti animation. "Yikes, your account has been suspended!" The mismatch between the severity of the situation and the lighthearted tone makes the product seem unaware or uncaring. The fix: error states, failed actions, and account problems always use serious or empathetic tone. Save playful tone for genuinely positive moments.

2. **The Corporate Robot.** Every piece of UI text reads like a legal document or a press release. "The system has successfully processed your request and the resulting modifications have been applied to your account." This happens when legal or compliance teams review UI text without content design input, or when engineers write microcopy by describing what the code does. The fix: rewrite in second person, use contractions, and cut the word count by half. "Your changes are saved."

3. **The Inconsistent Personality.** The product sounds like a different person on every screen. Onboarding is bubbly and emoji-laden. Settings are clinical and passive. Error messages are curt and technical. This happens when multiple writers contribute without a shared voice document. The user experience feels fragmented, as if different departments built different parts of the product -- because they did. The fix: create a voice document (see template above) and require voice review in the same way you require code review.

4. **The Forced Humor.** Injecting jokes, puns, or pop culture references into UI text where they do not serve the user. A 404 page that says "These aren't the droids you're looking for" is memorable the first time and annoying every subsequent visit. Humor in UI text has a shelf life: it delights once and then becomes noise. The fix: humor is acceptable in low-frequency, low-stakes contexts (first-time empty states, 404 pages) but should never appear in high-frequency or high-stakes contexts (dashboards, payment flows, error messages).

5. **The Guilt Trip.** Using emotionally manipulative language when users decline upsells, unsubscribe, or close accounts. "No thanks, I don't want to grow my business" as an opt-out link. "Are you sure? You'll lose access to everything you've built." This pattern, called "confirmshaming," damages trust and brands the product as manipulative. The fix: present choices neutrally. "Keep current plan" and "Upgrade" are both respectful. "No thanks" is a complete, dignified opt-out. The user's decision to leave or decline deserves the same respect as their decision to join.

### Real-World Examples

**Mailchimp's Voice and Tone Guide.** Mailchimp published one of the first and most influential voice and tone guides in tech. Their key insight: voice is who you are, tone is how you adapt. The guide provides specific examples for every content type -- success messages, error messages, marketing emails, legal text -- showing how the same Mailchimp voice (informal, funny, empowering) adjusts tone for each context. A success message: "High fives! Your campaign is on its way." A failed send: "Your campaign wasn't sent. Here's what happened." The guide explicitly addresses the emotional state of the user in each context and prescribes the appropriate tone response. This document became the template for voice guides at Shopify, Atlassian, and dozens of other companies.

**Slack's Personality in Microcopy.** Slack maintains a consistent casual voice across thousands of UI strings while precisely modulating tone. Channel creation: "Give your channel a name" (conversational). File upload: "Drag files here" (minimal). Thread summary: "3 replies" (utilitarian). Account deletion: "This is permanent. Your messages, files, and integrations will be removed." (grave). The consistency of voice across these wildly different tonal requirements is what makes Slack feel like a coherent product rather than a collection of features. Slack achieves this by maintaining an internal content design team that reviews every UI string before release, using a shared voice checklist that maps each string to the tone spectrum.

**Stripe's Formality Gradient.** Stripe demonstrates how a single product can use the entire formality ladder appropriately. Dashboard welcome: "Welcome back" (conversational). API documentation: "Create a PaymentIntent with the amount and currency" (professional). Payment error: "Your card was declined. Try a different payment method or contact your bank." (formal, specific). Fraud alert: "Suspicious activity detected on your account. Review recent transactions immediately." (urgent). Each level of formality matches the consequence level of the interaction, and the transition between levels feels natural because the underlying voice -- clear, direct, respectful -- remains constant.

**GitHub's Gravity Spectrum.** GitHub provides an instructive case study in how tone scales with consequence. Creating a new file: "Create new file" (neutral, imperative). Branch protection rules: "Require pull request reviews before merging" (professional, descriptive). Repository visibility change: "Change repository visibility. You are about to make this repository public. This action is visible to the entire internet." (formal, explicit consequence). Repository deletion: "This action cannot be undone. This will permanently delete the repository, wiki, issues, comments, packages, secrets, workflow runs, and remove all collaborator associations." (grave, exhaustive enumeration of consequences). The escalation is seamless because GitHub's underlying voice -- precise, technically literate, respectful of the developer audience -- anchors every tonal shift.

**Linear's Professional Calm.** Linear maintains what might be described as "professional calm" -- a voice that is efficient without being cold, and friendly without being chatty. Issue creation: "Create issue" (minimal). Status updates: "Issue moved to In Progress" (factual). Sprint completion: "Sprint 23 completed. 12 of 15 issues done." (data-driven, no celebration or judgment). This voice works because Linear's audience (engineering teams) values signal-to-noise ratio. Every word in Linear's UI carries information; there is no filler, no personality for personality's sake. The lesson: voice does not require personality -- it requires consistency.

## Source

- Mailchimp Content Style Guide -- Voice and Tone, https://styleguide.mailchimp.com/voice-and-tone/
- NNGroup -- "Tone of Voice in UX" series (2016-2020), research on how tone affects perceived credibility and trustworthiness
- Kiefer Lee, K. and Yifrah, K. -- _Nicely Said: Writing for the Web with Style and Purpose_ (2014), the definitive guide to writing voice documentation
- Apple Human Interface Guidelines -- Writing section, emotional register guidance for system-level messages
- Google Material Design -- Writing guidelines, tone calibration per component type, https://m3.material.io/foundations/content/overview
- Podmajersky, T. -- _Strategic Writing for UX_ (2019), voice-first content strategy for product teams
- Shopify Polaris -- Voice and Tone guidelines, https://polaris.shopify.com/content/voice-and-tone

## Process

1. Read the instructions and examples in this document.
2. Create or reference your product's voice document with adjective pairs and tone mapping.
3. Apply the tone spectrum to each UI context, matching formality to consequence level.
4. Run the read-aloud test on all high-stakes UI text (errors, destructive actions, security).
5. Verify your implementation against the details and anti-patterns listed above.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- A voice document exists with three to five adjective pairs and their "this, not that" examples.
- Every UI context is mapped to a point on the tone spectrum (playful, neutral, serious, urgent).
- Error messages, destructive actions, and security alerts use serious or urgent tone -- never playful.
- The product reads as one consistent personality across all screens and features.
- No false cheerfulness appears in negative-outcome contexts.
- Upgrade prompts and account closure flows use respectful, non-manipulative language.
- The read-aloud test passes for all high-stakes UI text -- error messages, destructive actions, and security alerts sound appropriate when spoken to a stranger.
