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
4. **After completing all builder tasks and before the final code review task**: run a security review. Read the `security-reviewer` agent definition from AVAILABLE_AGENTS to load the security checklist. List all files changed on the feature branch (`git diff --name-only main...HEAD`). Read every changed file and work through the 6-category security checklist systematically. Report findings using Critical/Important/Minor severity. Fix any Critical or Important issues before proceeding to the code review task.
5. **When you reach a code review task**: re-read every file you changed since the last commit, check for bugs, missing edge cases, security issues, and style problems. Fix anything you find. Then commit all changes from the reviewed task(s) and mark the review task as completed.
6. If a task fails: stop, report what succeeded and what failed, ask the user how to proceed.
7. After all tasks: run validation commands, check acceptance criteria.

## Mode: Delegated

You are the orchestrator. You NEVER write code directly — you dispatch agents.

1. Create the feature branch (see Git Workflow).
2. Read agent definitions from AVAILABLE_AGENTS to understand each agent's capabilities.
3. Create all tasks via TaskCreate. Set dependencies per spec.
4. Read the `## Review Policy` section to understand review rules.
5. For each unblocked task:
   - If `Background: true` and no dependency conflicts, dispatch with `run_in_background: true`.
   - Dispatch the assigned agent via `Task(subagent_type: "<agent-type>", model: "<model>", ...)`.
   - **IMPORTANT: Always pass the `model` parameter** matching the agent definition. Read each agent's `model` field from their definition file. Do NOT rely on the default — if omitted, subagents inherit the parent model. The correct models are: builder=opus, researcher=sonnet, reviewer=sonnet, tester=sonnet, validator=haiku, architect=opus, debugger=opus, security-reviewer=opus.
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
7. **After all builder tasks are complete and reviewed, dispatch a `security-reviewer` agent** (model: opus) to audit all files changed on the feature branch. Provide the list of changed files (`git diff --name-only main...HEAD`) and the spec's acceptance criteria.
   - If the security reviewer reports Critical issues: resume the relevant builder agent to fix them, then re-dispatch the security reviewer. Repeat up to `Max Retries` times.
   - Important issues: send to the builder for fixing but do not require a security re-review.
   - Commit security fixes before proceeding to validation.
8. After all tasks: dispatch a `validator` agent for final verification.

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

You are the orchestrator of a dynamic agent team. You NEVER write code directly — you manage agent slots, schedule tasks, and handle git.

### Pre-flight

1. **STOP if agent teams are not enabled.** Check whether `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set by attempting to use TeamCreate. If teams are not available, STOP immediately. Tell the user: "This spec uses mode: team, which requires agent teams. Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in your environment and restart, or re-spec with `/dream-team:spec-delegated` as an alternative." Do NOT fall back to delegated mode. Do NOT proceed.
2. Create the feature branch (see Git Workflow).
3. Read agent definitions from AVAILABLE_AGENTS.
4. Read `## Team Configuration` for `Display Mode`, `Coordinate Only`, `Max Active Agents` (default 6), and `Rotation After` (default 3).
5. Create all tasks via TaskCreate. Set dependencies per spec.
6. **IMPORTANT — Agent count validation:** Count the number of distinct **Agent Type** values across all tasks (e.g., builder, reviewer, researcher, tester, validator). This is the number of ROLES, NOT the number of agents to spawn. The total concurrent agents at any time MUST NOT exceed `Max Active Agents`. If the spec contains "Assigned To" labels with numbered suffixes (e.g., "Builder 1", "Builder 2", "Reviewer 3") — **IGNORE THE NUMBERS.** These are cosmetic grouping hints, NOT separate agents. You schedule by **Agent Type**, not by "Assigned To" label. See the scheduling loop below.
7. Ask the user: "This build has X tasks across Y distinct agent types (list them). Max concurrent agents is set to N. OK to proceed, or would you like to adjust?" Wait for confirmation before spawning any agents.
8. If `Coordinate Only: true`, enable delegate mode (Shift+Tab) so you only coordinate.

### Scheduling Priority

9. **CRITICAL RULE — REVIEWS FIRST: ALWAYS schedule pending review tasks before pending build tasks.** When a slot is free and both a review task and a build task are waiting, you MUST assign the review task first. Reviews unblock commits. Starving reviews deadlocks the entire pipeline. This is not a suggestion — it is a hard scheduling constraint.

### Dynamic Slot Management

> **IMPORTANT — HOW AGENT MATCHING WORKS:** The scheduling loop matches tasks to agents by **Agent Type** (builder, reviewer, researcher, tester, validator, architect, debugger, security-reviewer). It does NOT match by "Assigned To" label. The "Assigned To" field in specs is a COSMETIC HINT for human readers — it has NO effect on scheduling. If a spec says "Assigned To: Security Builder 1" with Agent Type: builder, and another task says "Assigned To: Builder 5" with Agent Type: builder, those are BOTH just `builder` tasks and can be handled by THE SAME agent instance. NEVER create a separate agent instance for each unique "Assigned To" label.

10. **All agent slots are equal.** There are no reserved slots. You fill slots dynamically based on what unblocked tasks need doing right now.

11. **Scheduling loop** — repeat until all tasks are complete:
    a. List all unblocked tasks (no pending dependencies).
    b. Sort them: review tasks first, then all other tasks.
    c. For each unblocked task, check if an idle agent (finished its previous task) with the same **Agent Type** exists and is under the rotation limit:
       - **YES → reuse**: Send the task to that idle agent via `SendMessage`. Include full task text, file paths, and acceptance criteria. It does NOT matter if the idle agent's previous task had a different "Assigned To" label — what matters is the **Agent Type** matches.
       - **NO idle agent of that Agent Type → spawn**: If a slot is free (active agents < `Max Active Agents`), spawn a new agent for this task. When spawning, specify the model matching the agent type: builder=opus, researcher=sonnet, reviewer=sonnet, tester=sonnet, validator=haiku, architect=opus, debugger=opus, security-reviewer=opus. Include full task text, file paths, and acceptance criteria in the spawn prompt. **NOTE**: If the agent teams feature does not support per-agent model selection, all agents will use the session's default model.
       - **NO free slot → wait**: Monitor active agents. When one completes and frees a slot, return to step (a).
    d. When an agent completes a task and no more unblocked tasks need its **Agent Type**, the slot is freed. If more tasks of that type are pending but blocked, the slot is also freed (an agent will be respawned when those tasks unblock).
    e. **HARD CAP: NEVER exceed `Max Active Agents` concurrent agents.** If you find yourself about to spawn an agent that would exceed the cap, STOP and wait for a slot to free up first. Count your active agents before every spawn. If active agents >= `Max Active Agents`, you MUST wait.

### Rotation Rules

12. **Each agent instance handles at most `Rotation After` tasks** (default 3). Track the task count per agent instance.
    - After an agent completes its Nth task (where N = `Rotation After`), **retire it** — do not send it further messages.
    - If that **Agent Type** has remaining tasks, spawn a fresh instance with a handoff summary:
      ```
      You are taking over as a [Agent Type] agent.
      Previous instance completed tasks: [task-id-1, task-id-2, task-id-3]
      Commits: [sha1 "message1", sha2 "message2", sha3 "message3"]
      Your remaining tasks: [task-id-4, task-id-5]
      ```
    - The rotation count resets for each new instance.

### Anti-patterns and Correct Patterns

**WRONG — spawning a new agent for each unique "Assigned To" label:**
The spec has tasks assigned to "Security Builder 1", "Security Builder 2", "Builder 3", "Reviewer 1", "Reviewer 2", etc. You spawn a SEPARATE agent for each label — 14 unique labels = 14 agents. This is WRONG. "Assigned To" labels are cosmetic. All of those builders are Agent Type: builder. All of those reviewers are Agent Type: reviewer. You should have at most a few builder instances and a few reviewer instances, NOT one per label.

**WRONG — spawning a new instance when an idle one of the same type exists:**
A builder agent finishes task 1 and goes idle. Task 2 (Agent Type: builder) becomes unblocked. You spawn a SECOND builder instance instead of sending task 2 to the idle one. Now you have two builder agents for no reason.

**RIGHT — match by Agent Type, reuse idle instances, parallelize when needed:**
- A builder agent finishes task 1. Task 2 (Agent Type: builder) is unblocked. Send task 2 to the SAME builder agent via `SendMessage` — it is idle and under the rotation limit. It does NOT matter that task 1 was "Assigned To: Security Builder 1" and task 2 is "Assigned To: Builder 4" — they are both Agent Type: builder.
- A reviewer agent finishes reviewing task 3. Task 5 (Agent Type: reviewer) is unblocked. Send task 5 to the SAME reviewer agent. It does NOT matter that the labels are "Reviewer 1" and "Reviewer 3".
- But: if tasks 2, 3, and 4 are ALL unblocked simultaneously, all Agent Type: builder, and 3 slots are free, spawn 3 builder instances in parallel — one per task. This is correct because each instance handles one concurrent task.
- After any instance hits the rotation limit (3 tasks), retire it and spawn fresh if more tasks remain.

**Key rule:** One agent instance = one task at a time. Schedule by **Agent Type**, NEVER by "Assigned To" label. Reuse idle instances of the same type before spawning new ones. But DO spawn multiple instances of the same type when multiple tasks can run in parallel.

### Review and Commit Workflow

13. **MANDATORY: After every builder agent finishes a task that writes code, schedule a review task.** The builder does NOT move to its next task until the reviewer approves. Handle fix loops via messaging:
    - If reviewer reports Critical or Important issues: send feedback to the builder agent via `SendMessage` (or resume it). After fixes, schedule another review. Repeat up to `Max Retries` times.
    - If max retries exceeded: stop and escalate to the user.
14. **After the reviewer approves a task, commit the changes yourself** (see Git Workflow). Agents do NOT touch git — only the orchestrator commits.
15. Research, architecture, and validation tasks do NOT need review — commit them directly after completion.

### Plan Approval

16. If `Plan Approval: true` on a task, the agent must submit a plan before implementing. Review and approve or reject with feedback before the agent proceeds.

### Monitoring

17. Monitor agent progress. If an agent stalls or reports an unresolvable issue:
    - Message it directly with guidance.
    - If still unresolvable, retire the agent and spawn a fresh instance of the same **Agent Type** (this counts as a rotation — include the handoff summary).

### Completion

18. **Before dispatching the validator**: spawn a `security-reviewer` agent (model: opus) in a free slot to audit all files changed on the feature branch. Provide the list of changed files (`git diff --name-only main...HEAD`) and the spec's acceptance criteria. If Critical issues are found, send them to the relevant builder agent for fixing. After fixes, re-run the security review. Commit security fixes before proceeding to validation.
19. After all tasks are complete: spawn a validator agent in a free slot for final verification.
20. Clean up — no further messages to any agents.

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
