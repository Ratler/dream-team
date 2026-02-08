---
name: debug
description: "Use when encountering a bug, test failure, unexpected behavior, or when the user asks for help debugging. Hypothesis-driven — reproduce, investigate, fix, verify. Standalone — works outside the plan/spec/build workflow."
argument-hint: "<describe what's broken>"
---

# Debugging Through Investigation

Help the user debug an issue through systematic investigation and hypothesis-driven problem solving. This is a conversation, not a fix-it script.

Start by understanding the issue, then reproduce it, form theories, investigate with evidence, and only fix once you understand the root cause.

## The Process

**Understanding the issue:**
- Explore the codebase first — read relevant files to build context before asking questions
- Ask questions one at a time to understand the problem
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message
- Focus on understanding: expected behavior, actual behavior, reproduction steps, when it started, what changed recently

**Reproducing the issue:**
- Attempt to reproduce the issue before investigating code
- If this is a frontend/browser issue and you see `playwright_*` tools available, use them:
  - `playwright_navigate` to load the page
  - `playwright_screenshot` to capture visual evidence
  - `playwright_click` / `playwright_fill` to interact with elements
  - `playwright_evaluate` to check console errors and state
- If this is a backend/CLI issue, run the reproduction steps with Bash
- If this is a test failure, run the specific failing test
- If you cannot reproduce, investigate why — environment, timing, specific data, concurrency
- Document the reproduction case clearly — you need it later to verify the fix

**Forming hypotheses:**
- Based on symptoms and code context, propose 2-3 theories about the root cause
- For each theory: description, likelihood (high/medium/low), how to test it
- Present theories to the user — they may have context that rules some out
- Wait for user input before proceeding

**Investigating:**
- Work through hypotheses starting with the most likely
- Read relevant code paths — use Glob and Grep to find files, Read to inspect
- Check logs, trace execution, inspect state
- Use Playwright for frontend state inspection if available
- Present findings as you go — if Theory A doesn't pan out, explain why and move to Theory B
- Once you identify the root cause with evidence, present it clearly and wait for confirmation:

```
Root cause identified:
- File: [path:line]
- Problem: [what's wrong]
- Why: [explanation]
- Evidence: [what you observed]
```

**Fixing:**
- Propose the fix before implementing — the user may want a different approach
- Apply the minimal change that addresses the root cause
- Do not refactor unrelated code
- Add a test case for the bug if it wasn't covered by tests
- Add defensive checks or better error messages if appropriate

**Verifying:**
- Re-run the reproduction case — confirm the issue is fixed
- Run relevant tests — ensure nothing else broke
- Check related functionality for similar issues
- If Playwright is available, take a screenshot showing the fix works

## Report

After fixing, provide a clear summary:

```
Debug session complete.

Issue: [brief description]
Root Cause: [what was wrong]
Fix: [what changed]

Files modified:
- [path] — [summary of changes]

Verification:
- [x] Issue no longer reproduces
- [x] Tests pass
- [x] Related functionality checked
```

## Key Principles

- **One question at a time** — do not overwhelm
- **Reproduce first** — never skip this step
- **Hypothesis-driven** — do not make random changes
- **Evidence-based** — confirm theories with data, not guesses
- **Minimal fixes** — address the root cause, not symptoms
- **Verify thoroughly** — test the fix and related functionality
- **Interactive** — involve the user at key decision points
- **Use Playwright when available** — for frontend debugging, check your tool list for `playwright_*` tools

## When to Stop and Escalate

Stop and ask the user for help if:
- You cannot reproduce the issue after multiple attempts
- The root cause requires domain knowledge you do not have
- The fix would require architectural changes beyond a targeted patch
- Multiple theories seem equally plausible and you need more context
