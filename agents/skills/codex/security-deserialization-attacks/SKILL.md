# Deserialization Attacks

> Deserialization reconstructs objects from byte streams -- and in most languages, that
> reconstruction executes code, meaning an attacker who controls the serialized input controls
> what code runs on your server

## When to Use

- Reviewing code that deserializes data from untrusted sources (user input, network, files)
- Evaluating the security of data interchange formats in an application architecture
- Assessing whether Java `ObjectInputStream`, Python `pickle`, PHP `unserialize()`, Ruby
  `Marshal.load()`, or YAML `load()` are used with external data
- Designing APIs or message formats and choosing between serialization approaches
- Investigating suspicious RCE (remote code execution) vectors in a web application
- Auditing session management that stores serialized objects in cookies or URL parameters

## Threat Context

Insecure deserialization consistently ranks among the most severe vulnerability classes
because it directly enables remote code execution -- the attacker does not need to find a
separate code injection point; the deserialization mechanism itself executes arbitrary code:

- **Equifax breach (2017, CVE-2017-5638)**: An Apache Struts vulnerability allowed remote
  code execution through a crafted `Content-Type` header that triggered OGNL expression
  evaluation during deserialization. The attacker gained shell access to servers containing
  145.5 million Americans' personal data. The vulnerability had a patch available two months
  before the breach; Equifax failed to apply it.
- **Apache Commons Collections (2015)**: Security researchers published a gadget chain in
  Apache Commons Collections that achieved arbitrary command execution through Java
  deserialization. Because Commons Collections was on the classpath of virtually every Java
  enterprise application (including WebLogic, JBoss, Jenkins, and WebSphere), this single
  disclosure made thousands of production systems immediately exploitable.
- **Jenkins (CVE-2016-0792)**: A deserialization vulnerability in Jenkins allowed
  unauthenticated remote code execution. The exploit used a Groovy-based gadget chain to
  execute operating system commands. Jenkins instances exposed to the internet were
  compromised en masse for cryptocurrency mining and as pivot points into internal networks.
- **PHP object injection**: PHP's `unserialize()` reconstructs objects and invokes magic
  methods (`__wakeup()`, `__destruct()`, `__toString()`). Attackers chain these magic methods
  across classes in the application and its dependencies to achieve file writes, SQL
  injection, or remote code execution. WordPress plugins have been repeatedly vulnerable to
  this pattern.

## Instructions

1. **Understand why deserialization is inherently dangerous.** Native serialization formats
   (Java `Serializable`, Python `pickle`, PHP `serialize`, Ruby `Marshal`, .NET
   `BinaryFormatter`) are not data formats -- they are code formats. Deserializing an object
   means: allocating memory for the object, setting its fields to attacker-controlled values,
   and executing lifecycle methods (constructors, finalizers, magic methods). The attacker does
   not need to inject new code -- they manipulate existing classes in the application's
   classpath to form a chain of method calls that achieves their objective. This is the gadget
   chain concept.

2. **Never deserialize untrusted input with native serialization.** This is the primary rule
   and it has no exceptions:
   - **Java**: Do not use `ObjectInputStream.readObject()` on data from users, APIs, message
     queues, cookies, or any source the attacker can influence. Replace with JSON (Jackson,
     Gson) or Protocol Buffers. If `ObjectInputStream` cannot be removed, use
     `ObjectInputFilter` (Java 9+) to allowlist specific classes before deserialization begins.
   - **Python**: Do not use `pickle.loads()` on untrusted data. The pickle protocol executes
     arbitrary Python bytecode during deserialization -- there is no safe way to use pickle
     with untrusted input. Use JSON (`json.loads()`), MessagePack, or Protocol Buffers.
   - **PHP**: Do not use `unserialize()` on user-controlled input. Use `json_decode()`. If
     `unserialize()` is required, PHP 7+ supports an `allowed_classes` option that restricts
     which classes can be instantiated -- use it with an explicit allowlist, never `true`.
   - **Ruby**: Do not use `Marshal.load()` on untrusted data. Use JSON (`JSON.parse()`) or
     MessagePack.
   - **YAML**: In Python, use `yaml.safe_load()`, never `yaml.load()`. In Ruby, use
     `YAML.safe_load()`, never `YAML.load()` (Ruby 3.1+ changed the default, but explicit
     `safe_load` is still preferred for clarity). The unsafe YAML loaders instantiate
     arbitrary classes from YAML tags (`!!python/object/apply:os.system`).
   - **.NET**: Do not use `BinaryFormatter`, `SoapFormatter`, `NetDataContractSerializer`, or
     `ObjectStateFormatter`. Microsoft has deprecated `BinaryFormatter` as of .NET 8 due to
     its inherent insecurity. Use `System.Text.Json` or Protocol Buffers.

3. **Use data-only interchange formats.** JSON, Protocol Buffers, MessagePack, FlatBuffers,
   and similar formats serialize data (strings, numbers, arrays, maps) without encoding type
   information or executable behavior. Deserializing JSON cannot instantiate objects or
   execute methods -- it produces primitive data structures that the application then validates
   and maps to domain objects explicitly. This separation between data parsing and object
   construction is the fundamental defense against deserialization attacks.

4. **When native serialization cannot be removed, apply defense in depth:**
   - **Allowlist classes before deserialization.** Java's `ObjectInputFilter` (JEP 290) lets
     you specify exactly which classes may be deserialized. Reject everything not on the list.
     This must happen before `readObject()` is called -- once deserialization begins, gadget
     chain code has already executed.
   - **Verify integrity before deserialization.** Sign serialized payloads with HMAC. Before
     deserializing, verify the signature. If the attacker cannot forge the signature, they
     cannot inject a malicious payload. This requires the signing key to remain secret.
   - **Isolate deserialization in a sandbox.** Run deserialization in a restricted process
     with minimal permissions, seccomp filters, or a container with no network access. If the
     gadget chain achieves code execution, the sandbox limits the damage.
   - **Monitor and alert on deserialization failures.** Deserialization exceptions (unexpected
     class, invalid stream) often indicate an exploitation attempt. Log these failures with
     full context and alert on anomalous patterns.

5. **Audit the codebase for deserialization points.** Search for all uses of native
   deserialization APIs and categorize each by trust level of the input:
   - `ObjectInputStream` (Java), `pickle.loads` / `pickle.load` (Python), `unserialize`
     (PHP), `Marshal.load` (Ruby), `yaml.load` (Python/Ruby), `BinaryFormatter.Deserialize`
     (.NET), `readObject` (Java), `XMLDecoder` (Java)
   - For each occurrence: is the input from a trusted source (internal-only, signed)? If not,
     replace with a safe alternative or add allowlisting and integrity verification.

## Details

- **How gadget chains work -- the Java example in detail**: The attacker's goal is to execute
  `Runtime.getRuntime().exec("malicious command")`. But `Runtime` is not `Serializable`, so
  it cannot appear directly in the stream. Instead, the attacker finds a chain of serializable
  classes where: Class A's `readObject()` calls a method on a field. That field is set to an
  instance of Class B, whose method calls another method on another field. This chain
  continues until a class in the chain invokes `Runtime.exec()` or equivalent through
  reflection, `ProcessBuilder`, or `ScriptEngine`. The Apache Commons Collections gadget
  chain uses `InvokerTransformer` (which calls any method via reflection) wired through
  `ChainedTransformer` and triggered by `LazyMap` during `readObject()`. The attacker crafts
  a serialized object graph that arranges these classes in the right configuration. Tools like
  ysoserial automate gadget chain construction for known library combinations.

- **Python pickle as a universal code execution primitive**: The pickle protocol includes an
  opcode (`REDUCE`) that calls any callable with any arguments. A malicious pickle payload
  can contain `os.system("rm -rf /")` or equivalent. Unlike Java gadget chains, which require
  finding suitable classes on the classpath, pickle exploitation is trivial because the
  protocol itself supports arbitrary function calls. There is no safe subset of pickle.
  `pickle.loads(untrusted_data)` is equivalent to `eval(untrusted_data)`.

- **Deserialization in session management and view state**: Some web frameworks store session
  state by serializing objects, encoding them (often Base64), and placing them in cookies or
  hidden form fields. If the serialized data is not signed or encrypted, the attacker
  modifies the cookie to inject a malicious serialized object. ASP.NET ViewState, Java JSF
  ViewState, and PHP session serialization have all been exploited this way. The mitigation
  is to sign and encrypt serialized session data (ASP.NET's `machineKey` or a modern
  equivalent) and to verify the signature before deserialization.

- **YAML deserialization as a code execution vector**: YAML supports language-specific type
  tags that instruct the parser to instantiate objects. In Python,
  `!!python/object/apply:os.system ["id"]` executes the `id` command. In Ruby,
  `!!ruby/object:Gem::Installer` has been used to achieve code execution. The `safe_load`
  variants restrict the parser to basic data types (strings, numbers, lists, maps) and reject
  type tags. Any YAML parser configured to support arbitrary type tags is a deserialization
  vulnerability.

## Anti-Patterns

1. **Deserializing user input with native serialization formats.** Accepting serialized Java
   objects in an HTTP request body, a message queue, or a cookie. The application may validate
   the deserialized object after construction, but by then the gadget chain has already
   executed. Deserialization attacks happen during deserialization, not after. Use JSON or
   Protocol Buffers for all external data interchange.

2. **Allowlisting after deserialization.** Checking the class of the deserialized object after
   `readObject()` returns. This is too late. The gadget chain executes inside `readObject()`
   before control returns to the caller. Allowlisting must happen before deserialization, using
   `ObjectInputFilter` in Java or equivalent mechanisms that reject disallowed classes before
   their `readObject()` methods execute.

3. **Using `yaml.load()` instead of `yaml.safe_load()`.** In Python's PyYAML library,
   `yaml.load()` without a `Loader` argument (or with `Loader=yaml.FullLoader` prior to
   PyYAML 6.0) can instantiate arbitrary Python objects from YAML tags. A YAML configuration
   file that an attacker can modify becomes a remote code execution vector.
   `yaml.safe_load()` restricts parsing to basic data types and is safe for untrusted input.

4. **Trusting serialized objects in cookies or URL parameters.** Storing a serialized user
   object in a cookie without signing it, then deserializing it on each request. The attacker
   modifies the cookie to contain a gadget chain payload. Even Base64 encoding provides no
   protection -- it is encoding, not encryption or signing. If serialized data must travel
   through the client, sign it with HMAC and verify the signature before deserialization.

5. **Filtering known gadget chains instead of fixing the root cause.** Maintaining a blocklist
   of known dangerous classes (e.g., blocking `InvokerTransformer` in Java deserialization
   filters). New gadget chains are discovered regularly as new libraries are added to the
   classpath. A blocklist is always incomplete. Use an allowlist of the specific classes the
   application legitimately deserializes, or replace native serialization entirely.

6. **Assuming JSON is always safe.** While JSON itself is a data-only format, JSON parsing
   libraries that support polymorphic type handling can reintroduce deserialization
   vulnerabilities. Jackson's `@JsonTypeInfo` with `JsonTypeInfo.Id.CLASS` allows the JSON
   payload to specify which Java class to instantiate, enabling gadget chain attacks through
   JSON. Use `JsonTypeInfo.Id.NAME` with an explicit type allowlist, or avoid polymorphic
   deserialization entirely.
