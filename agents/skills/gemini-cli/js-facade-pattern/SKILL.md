# JS Facade Pattern

> Provide a simplified interface to a complex subsystem

## When to Use

- A subsystem has many classes or functions that clients frequently use together
- You want to hide complexity behind a single, easy-to-use API
- Reducing the number of imports and calls a consumer needs to make

## Instructions

1. Identify a group of related subsystem calls that clients frequently combine.
2. Create a facade module that exposes high-level functions composing those subsystem calls.
3. The facade delegates to subsystem objects — it does not replace them.
4. Keep the subsystem accessible for advanced callers who need fine-grained control.

```javascript
// Facade for a complex video conversion subsystem
class VideoConverter {
  convert(filename, format) {
    const file = new VideoFile(filename);
    const codec = CodecFactory.extract(file);
    const compressor = new BitrateCompressor();
    const mixer = new AudioMixer();

    const result = codec.transcode(file, format);
    compressor.compress(result);
    mixer.normalize(result);
    return result;
  }
}

// Client uses one call instead of four subsystem interactions
const converter = new VideoConverter();
converter.convert('video.ogg', 'mp4');
```

## Details

The Facade pattern is a structural pattern that provides a unified interface to a set of interfaces in a subsystem. In JavaScript, this is often a module that re-exports a curated subset of a library's API or orchestrates multiple service calls behind a single function.

**Trade-offs:**

- The facade can become a "god module" if it grows too large — keep it focused
- Hiding subsystem details may prevent advanced users from accessing features they need
- Changes to the underlying subsystem may require facade updates

**When NOT to use:**

- When the subsystem is already simple — adding a facade just adds indirection
- When callers need full control over individual subsystem components
- When the facade would just proxy every subsystem method — that is a wrapper, not a simplification

## Source

https://patterns.dev/javascript/facade-pattern

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
