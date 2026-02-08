---
name: spec-delegated
description: "Use after /dream-team:plan to write a delegated execution spec (orchestrator + sub-agents). No arguments needed — picks up conversation context from the brainstorming session."
hooks:
  Stop:
    - hooks:
        - type: command
          command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/validate_spec_exists.js --directory specs --extension .md"
        - type: command
          command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/validate_spec_sections.js --directory specs"
---

# Write Delegated Spec

Convert the brainstorming conversation into a formal spec file for delegated execution — single session with an orchestrator dispatching specialized sub-agents via the Task tool.

**Prerequisites:** This skill assumes `/dream-team:plan` has already been run in this session. If the conversation has no brainstorming context (no discussed requirements, no confirmed approach, no validated task breakdown), stop and tell the user: "No brainstorming context found. Run `/dream-team:plan <prompt>` first to explore requirements and design."

## Filename Format

**All spec files MUST be named with a date prefix:** `specs/YYYY-MM-DD-<descriptive-kebab-case>.md`

Use today's date. Example: `specs/2026-02-07-user-auth-api.md`

## What To Do

1. Read the spec template at `${CLAUDE_PLUGIN_ROOT}/templates/spec-template.md`.
2. Read the available agent definitions at `${CLAUDE_PLUGIN_ROOT}/agents/*.md` to understand each agent's capabilities.
3. Summarize the agreed plan from the conversation — confirm with the user before writing.
4. Write the spec, filling in all sections from the brainstorming context.
5. Set frontmatter `mode: delegated`.
6. Set frontmatter `playwright: true` if the brainstorming decided to use Playwright MCP, otherwise `playwright: false`.
7. Assign each task to a specific agent by name and type.
8. Mark tasks as `background: true` when they can safely run in parallel (no file conflicts, no dependencies).
9. Include Team Members and Review Policy sections.
10. Include a reviewer agent for post-task code review.
11. Include a validator agent for final verification.
12. Save to `specs/YYYY-MM-DD-<descriptive-kebab-case>.md` using today's date.

## Task Rules

- Every task must have `Assigned To` (agent display name) and `Agent Type` (builder, researcher, etc.)
- Mark `Background: true` for tasks that can run in parallel with other background tasks
- Mark `Background: false` for tasks that must complete before dependent tasks start
- Set `Depends On` accurately — parallel tasks should not depend on each other
- Every builder task must include a **Tests** field listing the test file paths and test cases it must produce. Use "N/A" only for tasks with zero testable code (research, docs, config-only).
- Research tasks go first, then architecture, then building, then testing, then validation
- **After every builder task that writes code, add a review task** assigned to the reviewer agent. The review task depends on the builder task it reviews.
- The second-to-last task MUST be a final code review (reviewer) that depends on all builder tasks
- The final task should always be assigned to the validator agent, depending on the final review

## Review Policy Defaults

Use these defaults unless the brainstorming conversation specified otherwise:
- **Review After**: each task
- **Fix Loop Trigger**: Critical and Important
- **Max Retries**: 3
- **Skip Review For**: research-only and validation tasks

## Team Members Format

List only the agents actually assigned to tasks:

```
- <Display Name>
  - **Role**: <specific focus in this plan>
  - **Agent Type**: <builder | researcher | reviewer | validator | architect | tester>
```

## Git

After saving the spec file, commit it:
```
git add specs/<spec-file>.md
git commit -m "spec: <short description of what the spec covers>"
```

## Report

After saving and committing the spec, output:

```
Spec written (delegated mode)

File: specs/YYYY-MM-DD-<name>.md
Tasks: <number of tasks>
Complexity: <simple | medium | complex>
Team: <list of agent names and roles>

Execute with: /dream-team:build specs/YYYY-MM-DD-<name>.md
```
