# Spec Writing Guide

Shared guidelines for all spec-writing skills (sequential, delegated, team).

## Filename Format

**All spec files MUST be named with a date prefix:** `specs/YYYY-MM-DD-<descriptive-kebab-case>.md`

Use today's date. Example: `specs/2026-02-07-user-auth-api.md`

## Eliminating Ambiguity

Specs are executed by agents that have no access to the brainstorming conversation. Every detail left unspecified becomes a coin flip — different agents will make different choices. The goal is **deterministic builds**: two agents reading the same spec should produce near-identical output.

When writing task descriptions, prefer concrete values over descriptive language:

- **CSS**: Specify exact hex colors, font stacks, spacing values, border-radius. Write `background: #1a1a2e` not "dark background". Write `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` not "system sans-serif stack".
- **Strings**: Write exact user-facing text in quotes. Write `"Unable to load weather data"` not "an error message". Write `"${score} points by ${author} | ${comments} comments"` not "display the score, author, and comments".
- **DOM structure**: Specify element types (`<div>`, `<p>`, `<span>`), class names, and nesting. Write `createElement("div")` not "create an element".
- **API details**: Specify exact URLs, query parameters, response field paths, units, and data transformations (rounding, formatting). Write `windspeed_10m` with `mph` or `km/h` explicitly — don't leave the unit unspecified.
- **Implementation patterns**: When a specific approach matters for consistency, spell it out. For example, specify whether a Promise should reject-and-catch or resolve-with-fallback. Specify timeout values. Specify whether to use `classList.remove()` or `className =`.
- **Quote style**: If the project has a convention, state it (e.g., "use double quotes throughout JS").

If you catch yourself writing a vague adjective ("red-tinted", "subtle", "clean"), replace it with the exact value. Vague descriptions are the #1 source of build divergence.

## Git

After saving the spec file, commit it:
```
git add specs/<spec-file>.md
git commit -m "spec: <short description of what the spec covers>"
```
