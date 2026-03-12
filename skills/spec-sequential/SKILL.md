---
name: spec-sequential
description: "Use after /dream-team:plan to write a sequential execution spec. No arguments needed — picks up conversation context from the brainstorming session."
hooks:
  Stop:
    - hooks:
        - type: command
          command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/validate_spec_exists.js --directory specs --extension .md"
        - type: command
          command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/validate_spec_sections.js --directory specs"
---

# Write Sequential Spec

Convert the brainstorming conversation into a formal spec file for sequential execution — single session, no sub-agents, tasks run one at a time.

**Prerequisites:** This skill assumes `/dream-team:plan` has already been run in this session. If the conversation has no brainstorming context (no discussed requirements, no confirmed approach, no validated task breakdown), stop and tell the user: "No brainstorming context found. Run `/dream-team:plan <prompt>` first to explore requirements and design."

## Filename Format

**All spec files MUST be named with a date prefix:** `specs/YYYY-MM-DD-<descriptive-kebab-case>.md`

Use today's date. Example: `specs/2026-02-07-user-auth-api.md`

## What To Do

1. Read the spec template at `${CLAUDE_PLUGIN_ROOT}/templates/spec-template.md`.
2. Summarize the agreed plan from the conversation — confirm with the user before writing.
3. Write the spec, filling in all base sections from the brainstorming context.
4. Set frontmatter `mode: sequential` and `spec-version: 1`.
5. Set frontmatter `playwright: true` if the brainstorming decided to use Playwright MCP, otherwise `playwright: false`.
6. Set frontmatter `frontend-design: true` if the brainstorming discussed frontend/UI work and design direction, otherwise `frontend-design: false`.
7. If `frontend-design: true`, fill in the `## Design Direction` section with the aesthetic style, stack, component libraries, and design notes from the brainstorming conversation. Auto-suggest component libraries based on the chosen stack if not explicitly discussed.
8. Tasks must be strictly linear — each depends on the previous one.
9. Do NOT include Team Members, Team Configuration, Review Policy, or agent assignment fields.
10. Fill in the `## Cleanup` section with any teardown commands needed (stop servers, remove temp files). Use "N/A" if nothing to clean up.
11. Save to `specs/YYYY-MM-DD-<descriptive-kebab-case>.md` using today's date.

## Task Rules

- Every task depends on the previous task (task 2 depends on task 1, task 3 depends on task 2, etc.)
- No `Assigned To`, `Agent Type`, `Background`, or `Parallel` fields
- Each task has: Task ID, Depends On, Description with specific action items, **Files**, and **Tests**
- The **Tests** field lists test file paths and test cases the task must produce. Use "N/A" only for tasks with zero testable code (research, docs, config-only).
- Every builder task must include a `**Files**` field listing exactly which files it creates or modifies, prefixed with `creates:` or `modifies:`. Review and validation tasks may omit this field.
- Start with foundational work, end with a validation task
- Keep tasks small — each should take 2-10 minutes to implement
- Each builder task should produce 1-3 files and ~100-300 lines of code. If a task would be larger, split it into smaller tasks with clear file boundaries.
- **The second-to-last task MUST be a code review task** — re-read all changed files, check for bugs, missing edge cases, security issues, and style. Fix anything found before final validation.

## Git

After saving the spec file, commit it:
```
git add specs/<spec-file>.md
git commit -m "spec: <short description of what the spec covers>"
```

## Report

After saving and committing the spec, output:

```
Spec written (sequential mode)

File: specs/YYYY-MM-DD-<name>.md
Tasks: <number of tasks>
Complexity: <simple | medium | complex>

Execute with: /dream-team:build specs/YYYY-MM-DD-<name>.md
```
