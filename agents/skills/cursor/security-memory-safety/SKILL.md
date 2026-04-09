# Memory Safety

> Memory corruption vulnerabilities account for 70% of critical CVEs in C/C++ codebases --
> choose memory-safe languages by default, and when you cannot, understand the vulnerability
> classes and mitigations

## When to Use

- Choosing a language for a new system or component, especially systems-level code
- Reviewing C, C++, or other memory-unsafe code for security vulnerabilities
- Understanding why Rust, Go, Java, C#, Python, and JavaScript are considered "memory-safe"
  and what guarantees that label provides
- Evaluating third-party native dependencies (C/C++ libraries) for memory safety risk
- Designing a security architecture that interacts with native code via FFI, JNI, or WASM
- Assessing whether compiler flags and runtime mitigations are properly configured

## Threat Context

Memory safety vulnerabilities are the most dangerous class of software bugs because they
enable arbitrary code execution -- the attacker does not merely read data or cause a crash,
they execute code of their choosing on the target system:

- **Microsoft's data (2006-2018)**: 70% of all CVEs assigned to Microsoft products were
  caused by memory safety issues. This finding was consistent across Windows, Office,
  Internet Explorer, and Edge.
- **Google Chrome (2015-2020)**: 70% of high-severity Chrome security bugs were memory
  safety vulnerabilities, primarily use-after-free and buffer overflow in the C++ codebase.
- **Heartbleed (2014, CVE-2014-0160)**: A buffer over-read in OpenSSL's heartbeat extension
  allowed attackers to read up to 64KB of server memory per request. Exposed private keys,
  session tokens, user passwords, and encrypted content from 17% of the internet's HTTPS
  servers. The bug existed for 2 years before discovery.
- **Android (2019-2023)**: Memory safety bugs accounted for 76% of Android vulnerabilities
  in 2019. After Google began writing new code in Rust and Kotlin, memory safety CVEs
  dropped to 24% by 2023 -- without fixing existing C/C++ code, simply because fewer new
  memory bugs were introduced.
- **US Government recommendation**: In 2023-2024, CISA, NSA, and the White House Office of
  the National Cyber Director formally recommended that organizations transition to
  memory-safe languages for new development and critical rewrites.

The 70% statistic means that choosing a memory-safe language eliminates the majority of the
vulnerabilities that enable remote code execution, privilege escalation, and information
disclosure. Logic bugs, authentication bugs, and authorization bugs constitute the remaining
30% -- they remain regardless of language choice.

## Instructions

1. **Choose memory-safe languages for all new projects.** The default choice for any new
   system, service, or component should be a memory-safe language unless there is a specific,
   documented technical reason requiring otherwise:
   - **Rust**: Compile-time ownership and borrowing guarantees eliminate use-after-free,
     double-free, and data races without a garbage collector. Zero-cost abstractions mean no
     runtime overhead. Suitable for systems programming, embedded, and performance-critical
     applications.
   - **Go**: Garbage-collected, bounds-checked arrays and slices, no pointer arithmetic.
     Suitable for network services, infrastructure tooling, and concurrent systems.
   - **Java/Kotlin**: JVM garbage collection eliminates manual memory management. No pointer
     arithmetic. Suitable for enterprise applications, Android (Kotlin), and large-scale
     backend services.
   - **C# / .NET**: Managed memory with garbage collection. Suitable for enterprise
     applications, game development (Unity), and Windows ecosystem.
   - **Python, JavaScript/TypeScript, Ruby**: Interpreted/JIT languages with automatic
     memory management. Suitable for web applications, scripting, data processing, and rapid
     development.
   - **Swift**: Reference counting with compile-time safety checks. Suitable for Apple
     platform development and increasingly for server-side applications.

2. **Understand the memory safety vulnerability taxonomy.** Each vulnerability class has a
   distinct mechanism, exploitation technique, and set of mitigations:
   - **Buffer overflow (stack)**: Writing beyond the allocated boundary of a stack-allocated
     buffer overwrites adjacent stack data, including the return address. The attacker
     replaces the return address with a chosen value, redirecting execution when the function
     returns. Stack canaries detect overflow. ASLR randomizes addresses. DEP/NX marks the
     stack non-executable. Return-Oriented Programming (ROP) chains existing code gadgets to
     bypass DEP.
   - **Buffer overflow (heap)**: Writing beyond a heap-allocated buffer corrupts adjacent
     heap metadata or objects. Exploitation overwrites function pointers, vtable entries, or
     heap allocator metadata to redirect execution.
   - **Use-after-free**: Accessing memory after it has been freed. If the freed memory is
     reallocated to a new object, the dangling pointer reads or writes the new object's
     data, enabling type confusion. The attacker controls the new object's contents, gaining
     arbitrary read/write capability.
   - **Double-free**: Freeing the same memory twice corrupts the heap allocator's free list.
     An attacker can manipulate the corrupted free list to control subsequent allocations,
     eventually overlapping an allocation with a target object.
   - **Integer overflow/underflow**: Arithmetic that wraps around the integer boundary.
     `size = count * element_size` overflows if both values are large, producing a small
     allocation. The subsequent write overflows the undersized buffer. Use checked arithmetic
     (`checked_mul` in Rust, `Math.addExact` in Java) or validate input ranges before
     arithmetic.
   - **Format string vulnerability**: Passing user-controlled input as a format string to
     `printf` or equivalent functions. The attacker uses format specifiers (`%x` to read
     stack memory, `%n` to write to memory) to achieve arbitrary read/write.
   - **Null pointer dereference**: Accessing memory through a null pointer. In userspace on
     modern OSes, this causes a segfault (DoS). In kernel code or when the zero page is
     mappable (older Linux kernels), it can be exploitable for privilege escalation.

3. **When using C/C++, apply layered defense-in-depth mitigations.** No single mitigation is
   sufficient; all should be enabled simultaneously:
   - **Compiler hardening flags**: `-fstack-protector-strong` (stack canaries for functions
     with buffers), `-D_FORTIFY_SOURCE=2` (bounds-checked versions of libc functions like
     memcpy, sprintf), `-fPIE -pie` (position-independent executable, required for full
     ASLR), `-Wformat -Wformat-security` (format string warnings)
   - **OS-level mitigations**: ASLR (Address Space Layout Randomization -- randomizes base
     addresses of stack, heap, libraries, and executable), DEP/NX (Data Execution Prevention
     / No-Execute -- marks data memory as non-executable), Control Flow Integrity (CFI --
     restricts indirect call/jump targets to valid function entries)
   - **Static analysis**: Run Coverity, clang-tidy (with security-focused checks), cppcheck,
     or PVS-Studio in CI. Static analysis finds bugs without executing the code but produces
     false positives and misses runtime-dependent issues.
   - **Dynamic analysis in CI**: AddressSanitizer (ASan) detects buffer overflows,
     use-after-free, and double-free at runtime with 2x slowdown. MemorySanitizer (MSan)
     detects reads of uninitialized memory. UndefinedBehaviorSanitizer (UBSan) detects
     integer overflow, null pointer dereference, and other undefined behavior. Run the test
     suite with all three sanitizers enabled.
   - **Fuzzing**: AFL++, libFuzzer, or Honggfuzz for automated input generation. Fuzzing
     discovers memory bugs by executing the program with millions of mutated inputs and
     detecting crashes via sanitizers. Integrate fuzzing into CI as a continuous process,
     not a one-time activity.

4. **Isolate native/FFI boundaries as trust boundaries.** When a memory-safe application
   calls into C/C++ libraries via FFI (Foreign Function Interface), JNI (Java Native
   Interface), or WASM, treat the native boundary as a security boundary. Validate all
   inputs passed to native functions -- a buffer overflow in the native library can corrupt
   the memory-safe application's heap. Limit the native component's access to system
   resources. Use sandboxing (seccomp-bpf on Linux, WASM linear memory isolation,
   pledge/unveil on OpenBSD) to contain exploitation of the native component.

5. **Evaluate native dependencies in your supply chain.** For every C/C++ dependency: Is
   there a memory-safe alternative? (rustls instead of OpenSSL, ring instead of libcrypto,
   image-rs instead of libpng.) Is the dependency actively maintained? What is its CVE
   history -- how many memory safety CVEs in the last 3 years, and how quickly were they
   patched? Does the project use sanitizers and fuzzing in CI? Dependencies with poor memory
   safety hygiene are ticking time bombs in your supply chain.

## Details

- **How a stack buffer overflow enables code execution -- the full chain**: A function
  allocates a 64-byte buffer on the stack. The return address is stored at a known offset
  above the buffer. The attacker provides 80 bytes of input: 64 bytes to fill the buffer,
  some padding to reach the return address, and a new address value. When the function
  returns, `ret` pops the attacker-controlled address into the instruction pointer. Classic
  exploitation jumps to injected shellcode on the stack (blocked by DEP/NX) or to a known
  library function like `system()` (blocked by ASLR). Modern exploitation uses
  Return-Oriented Programming (ROP): the attacker chains short instruction sequences
  ("gadgets") already present in executable memory, each ending in `ret`, to build arbitrary
  computation. Stack canaries add a random value between the buffer and the return address;
  overflow that corrupts the return address also corrupts the canary, which is detected
  before `ret` executes. All mitigations (canary + ASLR + DEP + CFI) should be enabled
  simultaneously because each has known bypass techniques.

- **Rust's ownership model -- how it prevents memory bugs at compile time**: Every value in
  Rust has exactly one owner. When ownership is transferred (moved), the original binding is
  invalidated -- using it is a compile error. References (borrows) follow strict rules: any
  number of immutable references (`&T`) or exactly one mutable reference (`&mut T`), never
  both simultaneously. The borrow checker enforces these rules at compile time.
  Use-after-free is impossible because the compiler tracks lifetimes and rejects code where
  a reference outlives the data it points to. Double-free is impossible because a value is
  dropped exactly once when its owner goes out of scope. Data races are impossible because
  the aliasing rules prevent shared mutable state across threads. The `unsafe` block opts
  out of borrow checker enforcement for specific operations (raw pointer dereferencing, FFI
  calls, inline assembly). Every `unsafe` block in a codebase should be audited for
  correctness because the compiler cannot verify its safety invariants.

- **WebAssembly (WASM) as a sandboxing mechanism for native code**: Compile C/C++ code to
  WebAssembly and execute it in a sandboxed runtime (Wasmtime, Wasmer, WasmEdge). WASM
  provides strong isolation: linear memory is a contiguous byte array that the module can
  access, but the module cannot access host memory outside this array. A buffer overflow in
  the WASM module is confined to the module's linear memory -- it cannot corrupt the host
  process. System calls are mediated through an explicit import/export interface (WASI for
  filesystem, network, environment). The module can only access capabilities explicitly
  granted by the host. This makes WASM an effective containment strategy for running
  untrusted or memory-unsafe code within a memory-safe host application.

- **The 70% statistic in full context**: Microsoft and Google's data shows that 70% of
  critical and high-severity CVEs are memory safety bugs. This does not mean 70% of all bugs
  are memory-related -- it means 70% of the bugs that achieve the worst security outcomes
  (remote code execution, privilege escalation, arbitrary information disclosure) are memory
  corruption. Logic bugs, authentication bypasses, authorization flaws, injection
  vulnerabilities, and business logic errors constitute the remaining 30%. Switching to a
  memory-safe language eliminates the 70% but does not address the 30%. A comprehensive
  security posture requires both memory safety and secure application design.

## Anti-Patterns

1. **"Our C/C++ code is carefully written, so memory safety is not a concern."** Every large
   C/C++ codebase contains undiscovered memory safety bugs. The question is not whether bugs
   exist but whether they are found by the developer (via tooling and auditing) or by the
   attacker (via fuzzing and reverse engineering). Google, Microsoft, and Apple --
   organizations with world-class C/C++ expertise -- still find hundreds of memory safety
   bugs per year. Use tooling (sanitizers, fuzzing, static analysis) and prefer memory-safe
   languages for new code.

2. **Disabling compiler security flags for performance.** Stack canaries
   (`-fstack-protector-strong`) add a single comparison per function return. ASLR adds no
   runtime overhead. `_FORTIFY_SOURCE=2` replaces libc calls with bounds-checked versions
   that have negligible overhead for non-trivial programs. Disabling these mitigations to
   save microseconds creates exploitable vulnerabilities. Profile the actual performance
   impact before considering removal -- in virtually all applications, it is unmeasurable.

3. **Trusting data across FFI/native boundaries without validation.** Passing
   user-controlled strings, buffer lengths, or indices directly into native functions without
   bounds checking. The memory-safe language provides safety within its own runtime, but
   `unsafe` FFI calls bypass all guarantees. Treat every FFI call as crossing a trust
   boundary: validate buffer sizes, check null pointers, clamp indices to valid ranges, and
   handle native-side errors without crashing the host process.

4. **Ignoring integer overflow in allocation size calculations.**
   `size_t allocation_size = user_count * sizeof(struct Entry)` overflows silently in C if
   `user_count` is attacker-controlled and large enough. The resulting small allocation is
   followed by a write that overflows the buffer. Use checked arithmetic (Rust:
   `checked_mul`, Java: `Math.multiplyExact`, C: compiler builtins like
   `__builtin_mul_overflow`) or validate that input values are within expected ranges before
   performing arithmetic used in allocations.

5. **"We use a memory-safe language, so memory safety is not our problem."** Memory-safe
   languages frequently call into memory-unsafe native code. Python's most popular libraries
   (NumPy, Pillow, cryptography) are backed by C extensions. Node.js has native addons and
   ships with C++ bindings (libuv, V8). Java applications use JNI for performance-critical
   code and database drivers. Go uses cgo for C library integration. Every native boundary
   is a potential source of memory corruption. Audit native dependencies, prefer
   pure-language alternatives where they exist, and sandbox native components where they
   do not.

6. **Running sanitizers only in development, not in CI.** AddressSanitizer,
   MemorySanitizer, and UBSan find bugs that no amount of code review catches. Running them
   locally but not in CI means the test suite executes without sanitizer coverage on every PR
   merge. Configure CI to run the full test suite with sanitizers enabled on every commit.
   The 2x runtime overhead of ASan is acceptable for CI pipelines.

7. **Treating fuzzing as a one-time activity.** Running a fuzzer for a few hours, finding
   some bugs, fixing them, and never fuzzing again. Memory safety bugs are introduced
   continuously as code changes. Integrate continuous fuzzing (OSS-Fuzz, ClusterFuzz, or a
   self-hosted fuzzing cluster) into the development lifecycle. Fuzzing corpora grow over
   time, covering more code paths and finding deeper bugs.
