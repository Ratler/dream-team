---
name: spec-team
description: "Use after /dream-team:plan to write a team execution spec (parallel Claude instances). No arguments needed — picks up conversation context from the brainstorming session."
hooks:
  Stop:
    - hooks:
        - type: command
          command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/validate_spec_exists.js --directory specs --extension .md"
        - type: command
          command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/validate_spec_sections.js --directory specs"
---

# Write Team Spec

Convert the brainstorming conversation into a formal spec file for team execution — separate Claude Code instances that work in parallel and communicate via shared task list and mailbox.

**Prerequisites:** This skill assumes `/dream-team:plan` has already been run in this session. If the conversation has no brainstorming context (no discussed requirements, no confirmed approach, no validated task breakdown), stop and tell the user: "No brainstorming context found. Run `/dream-team:plan <prompt>` first to explore requirements and design."

**Requires:** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` enabled in settings.

## Filename Format

**All spec files MUST be named with a date prefix:** `specs/YYYY-MM-DD-<descriptive-kebab-case>.md`

Use today's date. Example: `specs/2026-02-07-user-auth-api.md`

## What To Do

1. Read the spec template at `${CLAUDE_PLUGIN_ROOT}/templates/spec-template.md`.
2. Read the available agent definitions at `${CLAUDE_PLUGIN_ROOT}/agents/*.md`.
3. Summarize the agreed plan from the conversation — confirm with the user before writing.
4. Write the spec, filling in all sections from the brainstorming context.
5. Set frontmatter `mode: team`.
6. Set frontmatter `playwright: true` if the brainstorming decided to use Playwright MCP, otherwise `playwright: false`.
7. Design for MAXIMUM INDEPENDENCE between teammates — avoid assigning same-file edits to different agents.
8. Set `plan_approval: true` for high-risk or architectural tasks.
9. Size tasks at 5-6 per agent role for optimal productivity.
10. Include Team Configuration and Review Policy sections.
11. Save to `specs/YYYY-MM-DD-<descriptive-kebab-case>.md` using today's date.

## Task Rules

- Every task must have `Assigned To`, `Agent Type`, `Parallel`, and `Plan Approval`
- Set `Parallel: true` for tasks that can run alongside others (no shared file edits)
- Set `Plan Approval: true` for high-risk tasks (architectural decisions, schema changes, security-critical code)
- Set `Depends On` conservatively — only add real dependencies, let parallelism happen naturally
- Every builder task must include a **Tests** field listing the test file paths and test cases it must produce. Use "N/A" only for tasks with zero testable code (research, docs, config-only).
- Avoid assigning same-file edits to tasks that can run in parallel
- Research and architecture tasks should complete before build tasks depend on them
- **After every builder task that writes code, add a review task** assigned to the reviewer agent. The review task depends on the builder task it reviews.
- **Add tester tasks when appropriate** — do NOT add them by default for every builder task (builders already do TDD). Add a tester task when: (a) multiple builder tasks produce components that must integrate — the tester writes integration tests after both complete; (b) the project handles user input, auth, or has security-sensitive APIs — the tester writes adversarial/boundary tests; (c) acceptance criteria span the full stack — the tester writes E2E tests after all builders finish. Tester tasks depend on the builder task(s) they test and can run in parallel with review tasks.
- The second-to-last task MUST be a final code review (reviewer) that depends on all builder tasks
- The final task should always be assigned to the validator agent, depending on the final review

## Team Configuration Guidance

- **Display Mode**: Use `split-pane` if the user has tmux/iTerm2, otherwise `in-process`
- **Delegate Mode**: Set `true` (recommended) so the lead only coordinates and never implements directly
- **Max Active Agents**: Default 6. This caps concurrent agent instances. The orchestrator asks the user to confirm before starting. Can be increased for large projects with many independent workstreams.
- **Rotation After**: Default 3. Each agent instance handles at most this many tasks before being retired and replaced with a fresh instance. Prevents context window exhaustion.

## Review Policy Defaults

Use these defaults unless the brainstorming conversation specified otherwise:
- **Review After**: each task
- **Fix Loop Trigger**: Critical and Important
- **Max Retries**: 3
- **Skip Review For**: research-only tasks

## Git

After saving the spec file, commit it:
```
git add specs/<spec-file>.md
git commit -m "spec: <short description of what the spec covers>"
```

## Report

After saving and committing the spec, output:

```
Spec written (team mode)

File: specs/YYYY-MM-DD-<name>.md
Tasks: <number of tasks>
Complexity: <simple | medium | complex>
Config: display=<mode>, delegate=<true|false>, max_agents=<N>, rotation=<N>

NOTE: Agent teams require CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in settings.

Execute with: /dream-team:build specs/YYYY-MM-DD-<name>.md
```
