# Attack Tree Construction and Analysis

> Model multi-step adversary strategies as goal-oriented tree decompositions -- revealing which attack paths are cheapest and which defenses yield the highest leverage

## When to Use

- Analyzing a specific high-value asset (payment system, admin panel, key store) for all possible attack paths
- Supplementing STRIDE breadth analysis with depth analysis on the most critical threats
- Communicating attack scenarios to non-technical stakeholders using visual decompositions
- Prioritizing security investment by comparing the cost of attack paths vs cost of defenses
- Evaluating whether defense-in-depth is effective by checking if all paths require defeating multiple controls
- Performing red team planning or tabletop exercises

## Threat Context

Attack trees were formalized by Bruce Schneier in 1999, building on fault tree analysis from reliability engineering. They model an attacker's goal as the root node and decompose it into sub-goals connected by AND (all required) and OR (any sufficient) relationships. STRIDE identifies individual threats; attack trees reveal how threats chain together into multi-step attack campaigns.

The 2020 SolarWinds attack exemplified a multi-step chain: compromise build system (supply chain), inject backdoor into update (tampering), establish C2 via DNS (exfiltration), move laterally to email systems (privilege escalation). No single-threat analysis captures this sequence -- attack trees do. The 2013 Target breach followed a similar multi-step pattern: compromise HVAC vendor credentials, pivot through flat internal network, install RAM-scraping malware on POS terminals, exfiltrate 40 million credit card numbers via a staging server. Each step in isolation appears manageable; the full path reveals systemic architectural weakness.

## Instructions

1. **Define the root goal from the attacker's perspective.** Use concrete adversary objectives: "Exfiltrate customer PII from the database," "Execute arbitrary code on the production server," "Impersonate an administrator." Vague goals like "compromise the system" produce vague trees. The root goal should name a specific asset and a specific adversary outcome. Build separate trees for separate assets.

2. **Decompose into sub-goals using AND/OR nodes.** OR nodes mean the attacker needs any one child to succeed. AND nodes mean the attacker needs all children to succeed. Example: "Gain database access" OR [SQL injection in search endpoint, stolen DBA credentials, compromised backup file]. "Steal DBA credentials" AND [obtain password hash, crack hash offline]. Continue decomposing until each leaf node represents an atomic action the attacker performs -- something that cannot be meaningfully subdivided further.

3. **Annotate leaf nodes with attributes.** At minimum: cost to attacker (low/medium/high), technical skill required (novice/intermediate/expert), detectability (stealthy/noisy), and whether the attack requires insider access. Additional attributes to consider: time to execute, tools required, whether the attack is repeatable or one-shot, and whether the attack leaves forensic evidence.

4. **Compute path costs bottom-up.** For OR nodes, the cheapest child determines the path cost (the attacker takes the easiest route). For AND nodes, the most expensive child determines the path cost (the bottleneck). The cheapest root-to-leaf path is the attacker's preferred strategy. Document the top three cheapest paths -- these are the priority for defensive investment.

5. **Identify cut points.** A cut point is a node where a single defense eliminates an entire subtree. Investing in a defense at a cut point has higher leverage than defending individual leaf nodes. Example: enforcing parameterized queries eliminates the entire "SQL injection" subtree regardless of how many injection entry points exist. Map each cut point to a specific control and estimate the cost of implementing that control versus the aggregate cost of defending all leaf nodes individually.

6. **Validate completeness.** For every OR node, ask: "Are there other ways to achieve this sub-goal I have not listed?" For every AND node, ask: "Does the attacker truly need all of these, or can they skip one?" Incomplete trees give false confidence. Involve team members with different perspectives -- developers, operations, and security -- to challenge assumptions.

7. **Iterate and refine.** Attack trees are living documents. When new features are added, extend the tree. When vulnerabilities are discovered, add the attack path. When defenses are deployed, mark the corresponding nodes as mitigated and re-compute path costs. Schedule quarterly reviews for critical-asset trees.

## Details

### AND/OR Tree Formalism

Attack trees use two node types to model adversary decision-making. OR nodes represent alternatives -- the attacker can succeed by completing any one child. AND nodes represent prerequisites -- the attacker must complete all children.

The textual notation uses indentation with explicit markers:

```
ROOT: Exfiltrate customer PII [OR]
  1. SQL injection via web app [OR]
    1a. Inject via search endpoint (cost: low, skill: intermediate, detection: noisy)
    1b. Inject via export endpoint (cost: low, skill: intermediate, detection: stealthy)
  2. Compromise database credentials [AND]
    2a. Obtain credential [OR]
      2a-i. Extract from config file (cost: low, skill: novice, detection: stealthy)
      2a-ii. Extract from environment variable (cost: low, skill: novice, detection: stealthy)
      2a-iii. Social engineer a DBA (cost: medium, skill: intermediate, detection: noisy)
    2b. Gain network access to database port (cost: medium, skill: intermediate, detection: noisy)
  3. Access unencrypted backup [OR]
    3a. Download from S3 bucket (cost: low, skill: novice, detection: stealthy)
    3b. Access backup server via SSH (cost: medium, skill: intermediate, detection: noisy)
```

For visual diagrams, represent OR nodes as children branching independently from the parent, and AND nodes as children connected by an arc across the branches to indicate all are required. Tools like ADTool render these automatically from structured input.

### Worked Example -- "Exfiltrate Customer Database"

Consider a web application with a PostgreSQL database, an S3 backup bucket, and a team of 5 developers.

**Root:** Exfiltrate customer PII. Three top-level OR branches: (1) SQL injection via web app, (2) Compromise database credentials, (3) Access unencrypted backup.

Branch (2) is AND: the attacker needs both a credential (2a) and network access (2b). Sub-branch (2a) is OR with three alternatives: extract from config file, extract from environment variable, or social engineer a DBA.

**Cost analysis:** Branch (3a) -- download from S3 -- is the cheapest path if the bucket is publicly readable (cost: low, skill: novice, no detection). Branch (1a) is next cheapest. Branch (2) is the most expensive because AND requires both sub-goals to succeed.

**Cut points:** Encrypting backups at rest eliminates branch (3) entirely. Parameterized queries eliminate branch (1) entirely. Network segmentation (database not reachable from the internet) raises the cost of branch (2b) from medium to high. The highest-leverage investment is encrypting backups and enforcing parameterized queries -- two controls eliminate two of three top-level branches.

**Defense ROI:** If encrypting backups costs $500/year and eliminates a low-cost attack path, and parameterized query enforcement costs $2,000 in developer time and eliminates another low-cost path, the total defensive investment of $2,500 forces all attackers through the most expensive remaining path (credential theft + network access, requiring intermediate skill and producing detectable signals).

### Attack Trees vs Kill Chains

Kill chains (Lockheed Martin Cyber Kill Chain, MITRE ATT&CK) model sequential phases of an intrusion campaign: reconnaissance, weaponization, delivery, exploitation, installation, command and control, and actions on objectives. Attack trees model all possible paths to a specific goal without assuming a linear progression.

Kill chains answer "what does an intrusion campaign look like?" -- useful for designing detection at each phase. Attack trees answer "how many ways can an attacker reach this specific asset?" -- useful for prioritizing preventive controls. The two frameworks are complementary: use kill chains to design detection and response, and attack trees to design prevention around high-value assets.

MITRE ATT&CK extends the kill chain concept with a matrix of techniques per tactic. ATT&CK techniques can inform attack tree leaf nodes -- they provide a catalog of known adversary methods that can be attached as concrete attack actions in the tree. For example, ATT&CK technique T1078 (Valid Accounts) maps directly to the "stolen credentials" branches in an attack tree.

### Quantitative vs Qualitative Annotation

Qualitative annotation (low/medium/high) is sufficient for most threat modeling workshops and produces actionable prioritization. Quantitative annotation (dollar cost, probability of success, time to execute) is useful in two scenarios:

1. **Justifying security budget to executives.** "The cheapest attack path costs $5,000 to execute; deploying this WAF raises the cost to $50,000" is a compelling business argument that qualitative labels cannot make. Executives understand ROI; they do not understand "medium severity."

2. **Comparing closely ranked paths.** When two paths are both "medium" cost qualitatively, quantitative estimates break the tie and reveal which defensive investment has higher ROI.

For quantitative estimates, use order-of-magnitude ranges (e.g., $1K-$10K) rather than precise dollar amounts. Precision implies false confidence. Ranges communicate uncertainty honestly while still enabling meaningful comparison.

### Attack-Defense Trees

An extension of basic attack trees adds defense nodes that counter specific attack nodes. Each attack node can have one or more defense children, and each defense has its own cost and effectiveness. This enables direct cost-benefit comparison: the investment to defend versus the cost for an attacker to exploit.

In an attack-defense tree, a defended attack node is considered mitigated only if the defense cost has been invested. Undefended nodes remain active attack paths. This formalism helps answer: "What is the minimum defensive investment to eliminate all attack paths below a cost threshold?" -- a portfolio optimization problem that standard attack trees do not address.

Defense nodes can also be AND or OR: an AND defense requires multiple controls to be in place simultaneously (defense in depth), while an OR defense is satisfied by any single control (redundant defenses). This models real-world scenarios like "the attacker must defeat both the WAF AND the parameterized query enforcement to achieve SQL injection."

### Common Root Goals by System Type

Different system types have characteristic root goals that serve as starting points:

- **E-commerce:** Exfiltrate payment card data, place fraudulent orders, manipulate pricing, access other customers' order history
- **SaaS platform:** Escalate to admin privileges, access other tenants' data, exfiltrate the user database, compromise the CI/CD pipeline
- **API service:** Forge authentication tokens, bypass rate limiting, access undocumented admin endpoints, exfiltrate API keys of other customers
- **Financial system:** Initiate unauthorized transfers, manipulate account balances, access transaction history of other users, bypass approval workflows
- **Healthcare system:** Access patient records without authorization, modify prescription data, exfiltrate bulk PHI for identity theft

Build one tree per root goal for the system's highest-value assets. Most applications have 3-5 critical assets that warrant dedicated attack trees.

### Tool Support

- **ADTool** (academic, free): Attack-defense tree editor with graphical rendering and quantitative analysis. Supports both attack trees and attack-defense trees (where defense nodes can counter attack nodes). Good for workshops and academic analysis.

- **SecurITree** (commercial, Amenaza Technologies): Enterprise tool with library of pre-built attack patterns, simulation engine, and compliance mapping. Best for organizations that need repeatable, standardized analysis across multiple products.

- **Plain-text Markdown**: For most teams, an indented Markdown document in the repository is sufficient and has the advantage of being version-controlled, reviewable in PRs, and searchable. Use the textual notation shown above. Low ceremony, high utility.

- **Mermaid diagrams**: Can render tree structures in documentation platforms that support Mermaid (GitHub, GitLab, Notion). Useful for embedding trees in architectural decision records or wiki pages.

### Review Cadence and Integration

Attack trees deliver maximum value when integrated into the development lifecycle:

- **Initial construction:** Build trees for the top 3-5 high-value assets during the design phase or during a dedicated threat modeling sprint. Allocate 2-4 hours per tree for initial construction with a cross-functional team.

- **Feature-driven updates:** When a PR introduces a new API endpoint, data store, integration, or trust boundary crossing, check whether the change introduces new leaf nodes in existing trees. Add the PR as a comment or linked artifact in the tree document.

- **Quarterly review:** Review the top-priority trees quarterly. Are the cost annotations still accurate? Have new attack techniques emerged? Have deployed defenses actually raised the cost of their targeted paths?

- **Incident-driven updates:** After a security incident (even a near miss), trace the attack path through the relevant tree. Was the path already documented? If not, add it. Was the cost underestimated? Update the annotation. This closes the feedback loop between operational reality and the threat model.

## Anti-Patterns

1. **Trees without cost annotations.** An attack tree that shows possible paths but does not annotate cost, skill, or detectability is a brainstorming artifact, not an analysis tool. Without annotations, all paths look equally likely, and the team cannot prioritize defenses. Every leaf node must have at least cost and skill annotations. Without them, the tree cannot answer the fundamental question: "Where should we invest our security budget?"

2. **Only modeling external attackers.** Attack trees often omit insider threats: a disgruntled employee with production access, a contractor with VPN credentials, a compromised CI/CD service account. Include at least one branch per tree that starts with "attacker has internal access." Insider paths are frequently the cheapest and stealthiest -- the Verizon DBIR consistently reports that insider-initiated breaches have higher per-incident cost than external attacks.

3. **Treating the tree as static.** An attack tree from 6 months ago does not reflect the three new API endpoints, the new third-party integration, or the infrastructure migration to a new cloud region. Review and extend trees when the system changes. Link tree reviews to architecture change PRs -- if the data flow diagram changes, the attack trees should be updated in the same review cycle.

4. **Confusing attack trees with fault trees.** Fault trees model accidental failures with known probability distributions and assume statistical independence between failure modes. Attack trees model intentional adversary behavior where the attacker is adaptive and strategic. Using fault tree assumptions (independent failures, known failure rates) for attack trees produces unreliable risk estimates because adversaries choose the weakest path, not a random one. An adaptive adversary who finds one path blocked will switch to the next cheapest path.

5. **Over-decomposition.** A tree with 200 leaf nodes is unworkable -- no team can prioritize or act on 200 items simultaneously. Focus on the top 3-5 high-value assets and build one tree per asset. Each tree should have 15-30 leaf nodes at maximum. If a subtree grows too complex, extract it into its own standalone tree and reference it from the parent tree with a link node. The goal is actionable analysis that drives real defensive investment, not exhaustive enumeration of every theoretically conceivable attack path.

6. **Mixing threat levels.** Combining strategic goals ("exfiltrate the database") with tactical actions ("run nmap scan") in the same tree creates confusion about what level of abstraction each node represents. Keep a consistent level of abstraction within each tree layer. Strategic trees decompose into high-level sub-goals; tactical trees decompose a specific sub-goal into concrete attacker actions with tool-level specificity. Link them hierarchically when needed -- the leaf node of a strategic tree becomes the root node of a tactical tree.

7. **No stakeholder involvement.** An attack tree built solely by the security team misses domain-specific attack vectors that developers and operations engineers understand. The developer who built the payment integration knows about edge cases in refund logic. The ops engineer knows which monitoring gaps exist. Cross-functional workshops produce better trees than isolated security exercises.
