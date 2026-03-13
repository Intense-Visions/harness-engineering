# harness-refactoring

Safe refactoring with validation checkpoints.

## The Refactoring Process

1. Establish baseline (tests + validation pass)
2. Identify scope
3. Make incremental changes
4. Validate after changes
5. Run full test suite
6. Commit

## Usage

Invoke this skill when restructuring code without changing behavior.

## Key Principles

- **Tests first:** Never refactor without tests
- **Small steps:** One change at a time
- **Validate often:** Check after each step
- **No behavior change:** Refactoring is structure-only
