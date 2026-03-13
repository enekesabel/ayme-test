# AGENTS.md

## Documentation Guidelines

These conventions apply to all documentation in this repository — READMEs, API references, and examples.

### Examples

- **Ground every function call.** Every function called in an example must come from a real library/framework referenced in context, be defined or imported in the example itself, or be clearly marked as a placeholder with `// your driver API` or similar.
- **Keep examples clean and approachable.** Avoid non-null assertions (`!`). Prefer safe casts or narrowing.
- **Show richer examples that demonstrate multiple features at once.** E.g. multi-state `toHaveState`, encapsulated repeated interactions — all in one example rather than separate trivial ones.
- **Annotate what's happening.** Use inline comments to explain what effects ensure, what states represent, or why a pattern matters.
- **Introduce effects as an advanced pattern.** Keep first examples focused on the core value: semantic state queries + typed POMs. Show `.effect()` in Deep Dive or advanced sections.

### Framing & Tone

- **Keep problem/solution lists snappy.** Short declarative bullets, no inline explanations or code examples mixed into the list.
- **Frame the assertion problem as abstraction level.** The issue is that verifying one semantic fact requires multiple implementation-level DOM checks. Frame `toHaveState` as asserting at the right level.
- **Contrast implementation details vs user-perceived state.** "Before" tests assert *how the DOM represents state*. "After" tests assert *what the user sees*.

### API Reference Style

- **Lead with an example, follow with a compact reference table.** Drop formal type signatures and internal type names (e.g. `StateFunction<R>`, `ActionWithEffects`). Users see the API shape through examples.
- **Match table entries to section order** and link to detailed subsections where applicable.
- **Include parameters in function/method headings.** Use `.waitFor(expected, options?)` — empty parens suggest the function takes no arguments.
- **Document errors and types: example first, then reference table.** Show an example error message or usage, then list properties in a table. Give nested types (e.g. `StateExpectationMismatch`) their own explicit heading.

### Heading System

Consistent heading levels and formatting across all READMEs:

| Level | Use for | Format |
|---|---|---|
| `#` | Package title | Inline code: `# @qaide/test` |
| `##` | Page sections / top-level API concepts | Plain text: `## State`, `## Core Concepts`, `## Why` |
| `###` | Methods, concept groups, error types | Methods: backtick + dot + params (`` ### `.waitFor(expected, options?)` ``). Concepts: plain text (`### Filtering`). Types/errors: backtick code (`` ### `StateExpectationTimeoutError` ``) |
| `####` | Sub-items under `###` | Same rules as `###`, one level deeper |

**Formatting rules:**
- **Use backtick code** for API names (functions, types, methods, error classes) in headings.
- **Use plain text** for conceptual sections (guides, groupings, explanations) in headings.
- **Add em-dash descriptions** when the name alone isn't clear (e.g. `### Locators — the bridge to the DOM`). Omit when self-explanatory.
- **Escape generic type parameters** in headings: `## Collection\<T\>`
- **Reflect nesting in heading levels.** An error type under `.effect()` is `####` because `.effect()` is `###`.

### Code Conventions in Docs

- **Route all locators through `this.Locators({...})` in Playwright POM examples.** Locators are the single connection point to DOM implementation details, and they belong in one place.
- **Declare locator-like references as class properties in framework-agnostic POM examples.** Even without `this.Locators()`, DOM queries should be declared once and referenced by name — not scattered inline through states and actions.
- **Use plain nouns for simple property states** (`text`, `isCompleted`, `itemCount`). Reserve `get*` prefix for states that take arguments (parameterized queries).
