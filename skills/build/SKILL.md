---
name: build
description: "Use when the user wants to execute an implementation plan. Reads a spec file, detects the execution mode (sequential, delegated, or team) from frontmatter, and runs the appropriate strategy. Pass the spec file path as an argument."
argument-hint: "<path-to-spec>"
hooks:
  Stop:
    - hooks:
        - type: command
          command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/validate_build_complete.js"
---

# Build

Execute an implementation plan by reading a spec file and running the strategy matching its declared mode.

## Variables

SPEC_PATH: $ARGUMENTS
AVAILABLE_AGENTS: `${CLAUDE_PLUGIN_ROOT}/agents/*.md`

## Instructions

- If no `SPEC_PATH` is provided, stop and ask the user to provide it.
- Read the spec file at SPEC_PATH.
- Parse the YAML frontmatter to extract `mode`, `complexity`, `type`, and `playwright`.
- Based on `mode`, follow the corresponding execution strategy below.
- If `playwright: true`, append the Playwright instructions (see below) to every builder and tester agent dispatch prompt. If `playwright: false` or missing, do NOT mention Playwright to agents.
- **Create a feature branch** before starting any work (see Git Workflow below).
- Use TaskCreate to register every task from the spec's `## Step by Step Tasks` section.
- Use TaskUpdate with `addBlockedBy` to set dependencies per each task's `Depends On` field.
- Execute tasks according to the mode.
- After all tasks complete: run `## Validation Commands` and verify `## Acceptance Criteria`.
- Present a final report.

## Git Workflow

**Agents do NOT touch git.** All git operations are handled by the orchestrator (you).

### Branch

Before executing any tasks, create a feature branch:
```
git checkout -b feat/<spec-name-without-date>
```
Derive the branch name from the spec filename. For example, `specs/2026-02-07-user-auth-api.md` becomes `feat/user-auth-api`.

If the branch already exists (e.g. resuming a build), check it out instead of creating it.

### Commits

Commit after each task passes review — never before review approval. This ensures only reviewed code enters the history.

- **Sequential mode**: commit after you finish each task's self-review step.
- **Delegated mode**: commit after the reviewer agent approves the builder's work.
- **Team mode**: commit after the reviewer teammate approves.

Use this commit message format:
```
git add <files changed by the task>
git commit -m "<type>(<scope>): <what changed>

Task: <task-id>"
```

Where `<type>` is one of: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Keep the first line under 72 characters.

### After Validation

After all acceptance criteria pass, do NOT merge or push. Report the branch name and let the user decide what to do next.

## Mode: Sequential

You execute tasks directly — no sub-agents.

1. Create the feature branch (see Git Workflow).
2. Create all tasks via TaskCreate. Set dependencies so each task blocks on the previous.
3. For each task in order:
   - Mark it `in_progress` via TaskUpdate.
   - Execute the task yourself — read files, write code, run commands.
   - If `playwright: true` and the task involves UI changes, verify visually using Playwright MCP tools (navigate, screenshot, interact, check console). If Playwright tools are not available, skip and note it.
   - Mark it `completed` via TaskUpdate.
4. **When you reach a code review task**: re-read every file you changed since the last commit, check for bugs, missing edge cases, security issues, and style problems. Fix anything you find. Then commit all changes from the reviewed task(s) and mark the review task as completed.
5. If a task fails: stop, report what succeeded and what failed, ask the user how to proceed.
6. After all tasks: run validation commands, check acceptance criteria.

## Mode: Delegated

You are the orchestrator. You NEVER write code directly — you dispatch agents.

1. Create the feature branch (see Git Workflow).
2. Read agent definitions from AVAILABLE_AGENTS to understand each agent's capabilities.
3. Create all tasks via TaskCreate. Set dependencies per spec.
4. Read the `## Review Policy` section to understand review rules.
5. For each unblocked task:
   - If `Background: true` and no dependency conflicts, dispatch with `run_in_background: true`.
   - Dispatch the assigned agent via `Task(subagent_type: "<agent-type>", model: "<model>", ...)`.
   - **IMPORTANT: Always pass the `model` parameter** matching the agent definition. Read each agent's `model` field from their definition file. Do NOT rely on the default — if omitted, subagents inherit the parent model. The correct models are: builder=opus, researcher=sonnet, reviewer=sonnet, tester=sonnet, validator=haiku, architect=opus, debugger=opus.
   - Provide the FULL task description, relevant file paths, and acceptance criteria in the prompt. Do not tell the agent to read the spec — give it everything.
   - Track the returned `agentId` for resume capability.
6. **MANDATORY: After every builder task that writes code, dispatch a reviewer agent.** Do NOT skip this step. Do NOT mark the builder task as completed until the reviewer has approved it.
   - Dispatch a `reviewer` agent (model: sonnet) with the task spec, files changed, and a summary of what the builder did.
   - If reviewer reports Critical or Important issues:
     - Resume the original builder agent (same `agentId`) with the review feedback.
     - After fixes, dispatch reviewer again.
     - Repeat up to `Max Retries` times.
     - If max retries exceeded: stop and escalate to the user.
   - If reviewer approves (or only Minor issues): **commit the reviewed changes** (see Git Workflow), then mark task `completed`.
   - Research, architecture, and validation tasks do NOT need review — commit them directly after completion.
7. After all tasks: dispatch a `validator` agent for final verification.

### Agent Dispatch Template

When dispatching an agent, provide this context:

```
You are a <agent-type> agent working on the Dream Team project.

**Your Task**: <task name>
**Task ID**: <id>

**Description**:
<full task description from the spec, including all bullet points>

**Files to work with**:
<relevant files from the spec>

**Acceptance Criteria for this task**:
<criteria specific to this task>

**Tests required**:
<tests from the spec's Tests field for this task>

**TDD is mandatory.** For every piece of functionality you implement:
1. Write a failing test first
2. Write the minimal code to make it pass
3. Refactor if needed, keeping tests green
Do NOT write implementation code without a corresponding test. If the task has no testable code, explain why in your report.

When done, use TaskUpdate to mark task <id> as completed with a summary.
```

### Playwright Instructions (only if `playwright: true`)

Append this block to every **builder** and **tester** agent dispatch prompt when the spec has `playwright: true`. Do NOT include it for reviewer, validator, researcher, or architect agents. Do NOT include it if `playwright: false` or missing.

```
**Playwright MCP**: This project uses Playwright for frontend verification.
After making UI changes, verify them visually:
- Use playwright_navigate to load the relevant page
- Use playwright_screenshot to capture the current state
- Use playwright_click / playwright_fill to test interactions
- Use playwright_evaluate to check for console errors
If Playwright tools are not available in your tool list, skip this step and note it in your report.
```

## Mode: Team

You create a full agent team with separate Claude instances.

1. Create the feature branch (see Git Workflow).
2. Read agent definitions from AVAILABLE_AGENTS.
3. Read the `## Team Configuration` section for display mode and delegate mode settings.
4. Instruct Claude to create an agent team:
   - Name the team based on the spec topic.
   - Spawn one teammate per agent listed in `## Team Members`. When spawning, specify the model for each teammate matching their agent definition: builder=opus, researcher=sonnet, reviewer=sonnet, tester=sonnet, validator=haiku, architect=opus, debugger=opus.
   - Give each teammate their assigned tasks as the spawn prompt — include full task text, file paths, and acceptance criteria.
   - If `Delegate Mode: true`, enable delegate mode (Shift+Tab) so you only coordinate.
   - **NOTE**: If the agent teams feature does not support per-teammate model selection, all teammates will use the session's default model. This is a known limitation of the experimental feature.
5. Create all tasks via TaskCreate. Set dependencies per spec.
6. Teammates self-claim unblocked tasks from the shared task list.
7. If `Plan Approval: true` on a task, the teammate must submit a plan before implementing. Review and approve or reject with feedback.
8. Monitor progress. If a teammate stalls or reports issues:
   - Message them directly with guidance.
   - If unresolvable, spawn a replacement teammate.
9. **MANDATORY: When any builder teammate finishes a task that writes code, message the reviewer teammate to review the work.** Do NOT let the builder move to the next task until the reviewer approves. Handle fix loops via teammate messaging.
10. **After the reviewer approves a task, commit the changes yourself** (see Git Workflow). Teammates do NOT commit — only the lead handles git.
11. After all tasks: message the validator teammate to run final verification.
12. Clean up the team when done.

**IMPORTANT**: Agent teams require `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings. If this is not enabled, inform the user and suggest using `/dream-team:spec-delegated` as an alternative.

## Shared: After All Tasks Complete

Regardless of mode, after all tasks are done:

1. Run every command listed in `## Validation Commands`. Record output.
2. Check every item in `## Acceptance Criteria`. Mark pass/fail.
3. Check `## Documentation Requirements` — verify documentation was created.
4. Present the final report.

## Report

```
Build Complete

Spec: <spec file path>
Mode: <sequential | delegated | team>
Branch: feat/<spec-name>
Tasks: <completed>/<total>
Commits: <number of commits on branch>

Results:
- [x] <acceptance criterion 1> — PASS
- [x] <acceptance criterion 2> — PASS
- [ ] <acceptance criterion 3> — FAIL: <reason>

Validation:
- <command 1> — <result>
- <command 2> — <result>

Status: <ALL PASS | ISSUES FOUND>
```

If all criteria passed, suggest next steps: merge to main, create a PR, or keep the branch for further work.

If any acceptance criteria failed, list what needs to be fixed and ask the user how to proceed.
