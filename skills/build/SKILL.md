---
name: build
description: "Use when the user wants to execute an implementation plan. Reads a spec file, detects the execution mode (sequential, delegated, or team) from frontmatter, and runs the appropriate strategy. Pass the spec file path as an argument."
argument-hint: "<path-to-spec>"
hooks:
  Stop:
    - hooks:
        - type: command
          command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/validate_build_complete.js"
        - type: command
          command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/cleanup_worktrees.js"
---

# Build

Execute an implementation plan by reading a spec file and running the strategy matching its declared mode.

## Variables

SPEC_PATH: $ARGUMENTS
AVAILABLE_AGENTS: `${CLAUDE_PLUGIN_ROOT}/agents/*.md`

## Cost Awareness

Agent spawning has real cost — each sub-agent consumes tokens for context loading, tool calls, and reporting. Before dispatching, ask: "Is this task complex enough to justify a separate agent?" A one-line config change does not need a builder agent, a review agent, and a validation agent. Use judgment:
- Trivial tasks: do them directly in the orchestrator
- Scout agents (haiku) are cheap — use them liberally for reconnaissance on unfamiliar code
- Do not skip reviews for non-trivial code changes, but do skip them for config, docs, and research tasks (per the Review Policy's Skip Review For setting)

## Instructions

- If no `SPEC_PATH` is provided, stop and ask the user to provide it.
- Read the spec file at SPEC_PATH.
- Parse the YAML frontmatter to extract `mode`, `complexity`, `type`, `playwright`, `frontend-design`, `spec-version`, and `branch`.
- If `spec-version` is missing from frontmatter, log a warning ("spec written before spec-version was introduced — consider updating") but proceed normally. This ensures backwards compatibility.
- If `branch` is present in frontmatter, this is a **resumed build** — see Resuming a Build below.
- Based on `mode`, follow the corresponding execution strategy below.
- If `playwright: true`, append the Playwright instructions (see below) to every builder and tester agent dispatch prompt. If `playwright: false` or missing, do NOT mention Playwright to agents.
- If `frontend-design: true`, read `${CLAUDE_PLUGIN_ROOT}/templates/frontend-design-guidelines.md` and the spec's `## Design Direction` section. Append the Frontend Design Instructions (see below) to every builder agent dispatch prompt. If `frontend-design: false` or missing, do NOT mention frontend design to agents.
- **Create a feature branch** before starting any work (see Git Workflow below). After creating the branch, write `branch: feat/<spec-name>` into the spec file's frontmatter to mark the build as started.
- Use TaskCreate to register every task from the spec's `## Step by Step Tasks` section.
- Use TaskUpdate with `addBlockedBy` to set dependencies per each task's `Depends On` field.
- Execute tasks according to the mode.
- After all tasks complete: run `## Validation Commands` and verify `## Acceptance Criteria`.
- Present a final report.

### Resuming a Build

If the spec's frontmatter contains a `branch` field, this is a resumed build:
1. Check out the existing branch (do not create a new one).
2. Derive the state directory path from the spec filename (strip date prefix and `.md` extension, e.g., `specs/2026-03-14-my-feature.md` → `specs/.build-state/my-feature`).
3. Read all task state files from the state directory (each `<task-id>.json` file).
4. Use TaskCreate to re-create tasks, setting their status from the state files:
   - `"completed"` tasks: create with status completed. Set the task description to the saved `description` field from the state file (this preserves agent reports and context).
   - `"in_progress"` tasks: create with status in_progress. Set the description to the saved description (if any) plus a note: `"RESUMED: This task was interrupted in a previous session. Check git log and changed files to determine what was completed before continuing."`
   - `"pending"` tasks: create normally.
5. Set dependencies via TaskUpdate `addBlockedBy` per each task's `dependsOn` field from the state files.
6. Skip dispatching/executing completed tasks.
7. For in_progress tasks: assess what was done (check git log, read files on disk) and continue from there rather than restarting from scratch.
8. For pending tasks: proceed normally according to the mode.

If the state directory does not exist but `branch` does, fall back to git-history-based resume: check out the branch, inspect commits with `git log`, and infer progress from what files exist and what tests pass.

### Build State

Build state is persisted to disk so builds can resume from a fresh session. State directory: `specs/.build-state/<spec-name>/` (derived by stripping the date prefix and `.md` extension from the spec filename).

#### On Build Start (new build, not resume)

After creating the feature branch and before creating tasks:
1. Derive the state directory path from the spec filename.
2. Create the directory and write `_meta.json` with: `specFile` (spec path), `branch` (feature branch name), `mode` (from frontmatter), `startedAt` (current ISO timestamp), `lastUpdated` (same as startedAt), `compactions` (0).
3. For each task in the spec's `## Step by Step Tasks` section, write a `<task-id>.json` file with: `name` (task name), `status` `"pending"`, `agentType` (from spec Agent Type field, or `"sequential"` for sequential mode), `startedAt` null, `completedAt` null, `lastUpdated` (current ISO timestamp), `description` null, `commitSha` null, `filesChanged` [], `dependsOn` (array of task IDs from the Depends On field).

#### On Task Completion

The TaskCompleted hook automatically updates the task state file to `"completed"` with the agent's description, timestamp, and commit info. You do NOT need to manually update state files for task status transitions — the hook handles it.

After committing code, update the completed task's state file: set `commitSha` to the commit SHA and `filesChanged` to the list of files in that commit.

## Git Workflow

**Delegated mode**: Builder and debugger agents running in worktrees MUST commit their own changes inside the worktree before marking the task complete. The orchestrator then merges the worktree branch back into the feature branch. Read-only agents do not commit.

**Team mode**: Agents do NOT touch git. All git operations are handled by the orchestrator (teammates have no worktree isolation).

### Branch

Before executing any tasks:
1. Check if the spec frontmatter contains a `branch` field. If yes, check out that branch — this is a resumed build (see Resuming a Build above).
2. If no `branch` field, create a new feature branch:
   ```
   git checkout -b feat/<spec-name-without-date>
   ```
   Derive the branch name from the spec filename. For example, `specs/2026-02-07-user-auth-api.md` becomes `feat/user-auth-api`.
3. After creating a new branch, write `branch: feat/<spec-name>` into the spec file's YAML frontmatter (before the closing `---`). This marks the spec as "build started" so it can be resumed if interrupted.
4. If the branch already exists but there's no `branch` field in frontmatter, check it out and add the field.

### Commits

Commit after each task passes review — never before review approval. This ensures only reviewed code enters the history.

- **Sequential mode**: commit after you finish each task's self-review step.
- **Delegated mode**: commit after the reviewer agent approves the builder's work.
- **Team mode**: commit after the reviewer teammate approves.

Use this commit message format:
```
git add <files changed by the task>
git commit -m "<type>(<scope>): <what changed>"
```

Where `<type>` is one of: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Keep the first line under 72 characters. Do NOT include internal task IDs in commit messages.

### After Validation

After all acceptance criteria pass, do NOT merge or push. Report the branch name and let the user decide what to do next.

## Mode: Sequential

You execute tasks directly — no sub-agents.

**Follow the spec literally.** When the spec provides exact values (hex colors, string templates, element types, class names, timeout values, API parameters, units), use those exact values. Do not substitute your own preferences — the spec author chose specific values to ensure reproducible builds. If the spec says `#e57373`, use `#e57373` — not a "similar" red. If the spec says `createElement("div")`, use a div — not a p or span. If the spec says `timeout: 10000`, use 10000 — not 5000. Treat the spec as a blueprint, not a suggestion.

1. Create the feature branch (see Git Workflow).
2. Create all tasks via TaskCreate. Set dependencies so each task blocks on the previous.
3. If `frontend-design: true`, read `${CLAUDE_PLUGIN_ROOT}/templates/frontend-design-guidelines.md`. When executing tasks that involve frontend/UI code, apply these guidelines along with the spec's `## Design Direction` section.
4. For each task in order:
   - Mark it `in_progress` via TaskUpdate.
   - Execute the task yourself — read files, write code, run commands.
   - When the spec gives exact values, use them verbatim. When the spec is silent on a detail, make a reasonable choice but keep it minimal.
   - If `playwright: true` and the task involves UI changes, verify visually using Playwright MCP tools (navigate, screenshot, interact, check console). If Playwright tools are not available, skip and note it.
   - Mark it `completed` via TaskUpdate.
5. **After completing all builder tasks and before the final code review task**: run a security review. Read the `security-reviewer` agent definition from AVAILABLE_AGENTS to load the security checklist. List all files changed on the feature branch (`git diff --name-only main...HEAD`). Read every changed file and work through the 7-category security checklist systematically. Report findings using Critical/Important/Minor severity. Fix any Critical or Important issues before proceeding to the code review task.
6. **After the security review and before the code review task**: run the documentation step. Read the `docs` agent definition from AVAILABLE_AGENTS. Read the spec's `## Documentation Requirements` section. List all files changed on the feature branch (`git diff --name-only main...HEAD`). Read every changed file. Produce all required documentation: README updates, changelog entries, API docs, and inline comments for complex logic. Commit documentation changes with `git add <files> && git commit -m "docs(<scope>): <description>"`.
7. **When you reach a code review task**: re-read every file you changed since the last commit, check for bugs, missing edge cases, security issues, and style problems. Fix anything you find. Then commit all changes from the reviewed task(s) and mark the review task as completed.
8. If a task fails: stop, report what succeeded and what failed, ask the user how to proceed.
9. After all tasks: run validation commands, check acceptance criteria.

## Mode: Delegated

You are the orchestrator. You NEVER write code directly — you dispatch agents. When dispatching builder agents, emphasize that they must follow the spec literally — exact values specified in the task description (hex colors, string formats, element types, timeouts, units) must be used verbatim, not creatively interpreted.

1. Create the feature branch (see Git Workflow).
2. Read agent definitions from AVAILABLE_AGENTS to understand each agent's capabilities.
3. Create all tasks via TaskCreate. Set dependencies per spec.
4. Read the `## Review Policy` section to understand review rules.
5. **Assess task complexity before dispatching.** For each task, evaluate its complexity before choosing the dispatch strategy:
   - **Simple** (1-2 files, well-understood area, config or minor tweak): Execute the task directly in the orchestrator session. Do not spawn a sub-agent. This saves the cost of agent creation for trivial work.
   - **Moderate** (2-5 files, straightforward implementation): Dispatch a single builder agent as normal.
   - **Complex** (5+ files, unfamiliar area, multiple subsystems, or the task description flags uncertainty): Dispatch a `scout` agent (model: haiku) first to reconnoiter the target area. Use the scout's findings to enrich the builder's dispatch prompt with specific file paths, conventions, and gotchas. Then dispatch the builder.
   When in doubt, lean toward dispatching rather than doing it yourself — the cost of a wrong direct implementation exceeds the cost of a sub-agent.
6. For each unblocked task:
   - If `Background: true` and no dependency conflicts, dispatch with `run_in_background: true`.
   - Dispatch the assigned agent via `Task(subagent_type: "<agent-type>", model: "<model>", ...)`.
   - **Agent dispatch rules:**
     - Always pass `model` matching the agent definition: builder=opus, researcher=sonnet, reviewer=sonnet, tester=sonnet, validator=haiku, architect=opus, debugger=opus, security-reviewer=opus, docs=sonnet, scout=haiku, merger=sonnet.
     - For builder/debugger: always pass `isolation: "worktree"` and always spawn fresh (never reuse — worktrees are cleaned up after completion).
     - For read-only agents (reviewer, researcher, validator, architect, security-reviewer, tester, docs): no isolation needed, CAN be reused.
     - For scout: model haiku. No isolation. Read-only. Can be reused.
     - For merger: model sonnet. No isolation. Dispatched for branch integration after builder review approval (replaces the inline merge protocol).
   - Provide the FULL task description, relevant file paths, and acceptance criteria in the prompt. Do not tell the agent to read the spec — give it everything.
7. **MANDATORY: After every builder task that writes code, dispatch a reviewer agent.** Do NOT skip this step. Do NOT mark the builder task as completed until the reviewer has approved it.
   - Dispatch a `reviewer` agent (model: sonnet) with the task spec, files changed, and a summary of what the builder did, and, if an architect produced a design for this task, the architect's design output so the reviewer can verify the implementation followed it.
   - If reviewer reports Critical or Important issues:
     - Spawn a **fresh** builder agent (with `isolation: "worktree"`) and include the review feedback plus original task context in the prompt. Do NOT resume the previous builder — its worktree is gone.
     - After fixes, dispatch reviewer again.
     - Repeat up to `Max Retries` times.
     - If max retries exceeded: stop and escalate to the user.
   - If reviewer approves (or only Minor issues): **merge the worktree branch** (see Worktree Merge below), then mark task `completed`.
   - Research, architecture, and validation tasks do NOT need review. No merge needed (read-only agents).
8. **After all builder tasks are complete and reviewed, dispatch a `security-reviewer` agent** (model: opus) to audit all files changed on the feature branch. Provide the list of changed files (`git diff --name-only main...HEAD`) and the spec's acceptance criteria.
   - If the security reviewer reports Critical issues: resume the relevant builder agent to fix them, then re-dispatch the security reviewer. Repeat up to `Max Retries` times.
   - Important issues: send to the builder for fixing but do not require a security re-review.
   - Commit security fixes before proceeding to documentation.
9. **After the security review is complete (and any security fixes are committed), dispatch a `docs` agent** (model: sonnet) to produce documentation. Provide: the spec's `## Documentation Requirements` section, the list of files changed on the feature branch (`git diff --name-only main...HEAD`), and the spec's acceptance criteria. The docs agent commits its own changes. After the docs agent completes, proceed to the validator.
10. After all tasks: dispatch a `validator` agent for final verification.

### Worktree Merge (Delegated Mode)

Builder and debugger agents run with `isolation: "worktree"`, each on its own branch. The agent commits its work inside the worktree before marking the task complete. After review approval, the orchestrator merges the worktree branch back into the feature branch.

**Protocol:**
1. After a builder/debugger task completes and the reviewer approves, identify the worktree branch from the task output or `git worktree list` / `git branch`.
2. Ensure you are on the feature branch: `git checkout feat/<spec-name>`.
3. For clean merges (no expected conflicts): merge directly with `git merge <worktree-branch> --no-ff -m "merge: <worktree-branch>"`.
4. If merge conflicts occur OR if multiple builders worked on related areas: dispatch a `merger` agent (model: sonnet) with the source branch, target branch, and context about what the builder changed. The merger handles tiered conflict resolution. If the merger agent cannot resolve conflicts, escalate to the user.
5. **Merge before dispatching the next builder** — sequential merge-then-dispatch prevents compounding conflicts.

**Note:** Read-only agents (reviewer, validator, researcher, security-reviewer, architect) make no file changes — no merge needed.

### Agent Dispatch Template

When creating tasks via TaskCreate, always **prefix the task description** with `[agent-type: <agent-type>]` on its own line. For example, a builder task description starts with `[agent-type: builder]`. This tag is used by the TaskCompleted hook for audit logging.

When dispatching an agent, provide this context:

```
You are a <agent-type> agent.

**Your Task**: <task name>
**Task ID**: <id>

**IMPORTANT — Literal spec adherence**: When the task description provides exact values (hex colors, string templates, element types, class names, timeout values, API parameters, units), use those exact values. Do not substitute your own preferences. Treat the spec as a blueprint, not a suggestion.

**Description**:
<full task description from the spec, including all bullet points>

**Files to work with**:
<relevant files from the spec>

**File Scope** (builder tasks only):
<list of files this task may create or modify, from the spec's Files field>
These are the ONLY files you may create or modify. Read any file for context, but limit writes to this list.

**Acceptance Criteria for this task**:
<criteria specific to this task>

**Tests required**:
<tests from the spec's Tests field for this task>

**TDD is mandatory.** For every piece of functionality you implement:
1. Write a failing test first
2. Write the minimal code to make it pass
3. Refactor if needed, keeping tests green
Do NOT write implementation code without a corresponding test. If the task has no testable code, explain why in your report.

**Before marking done, commit your changes** with `git add <files> && git commit -m "<type>(<scope>): <what changed>"`. Use conventional commit format (feat, fix, refactor, test, docs, chore). Do NOT include task IDs. This is required so the orchestrator can merge your worktree branch back into the feature branch.

**Then write your completion report into the task description** using TaskUpdate. Include `[agent-type: <agent-type>]` as the first line of your report, followed by your structured report. Then mark the task completed. You can do both in a single TaskUpdate call:
TaskUpdate(taskId: "<id>", status: "completed", description: "[agent-type: <agent-type>]\n## Task Complete\n...")
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

### Frontend Design Instructions (only if `frontend-design: true`)

Append this block to every **builder** agent dispatch prompt when the spec has `frontend-design: true`. Do NOT include it for reviewer, validator, researcher, or architect agents. Do NOT include it if `frontend-design: false` or missing.

Before dispatching, read `${CLAUDE_PLUGIN_ROOT}/templates/frontend-design-guidelines.md` and include its full content in the builder prompt. Also include the spec's `## Design Direction` section (aesthetic style, stack, component libraries, design notes).

```
**Frontend Design**: This project has specific design direction. Follow these guidelines for all UI code.

## Design Direction (from spec)
<paste the spec's Design Direction section here — aesthetic style, stack, component libraries, design notes>

## Frontend Design Guidelines
<paste the full content of templates/frontend-design-guidelines.md here>

Apply these guidelines to all UI code you write. The Design Direction section takes precedence for project-specific choices (aesthetic style, stack, component libraries). The guidelines provide implementation details (animation timings, interaction patterns, accessibility requirements, anti-generic rules).
```

## Mode: Team

You are the orchestrator of a dynamic agent team. You NEVER write code directly — you manage agent slots, schedule tasks, and handle git.

### Pre-flight

1. **STOP if agent teams are not enabled.** Check whether `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set by attempting to use TeamCreate. If teams are not available, STOP immediately. Tell the user: "This spec uses mode: team, which requires agent teams. Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in your environment and restart, or re-spec with `/dream-team:spec-delegated` as an alternative." Do NOT fall back to delegated mode. Do NOT proceed.
2. Create the feature branch (see Git Workflow).
3. Read agent definitions from AVAILABLE_AGENTS.
4. Read `## Team Configuration` for `Display Mode`, `Coordinate Only`, `Max Active Agents` (default 6), and `Rotation After` (default 3).
5. Create all tasks via TaskCreate. Set dependencies per spec.
6. **Agent count validation:** Count distinct **Agent Type** values across all tasks — this is the number of ROLES, not agents to spawn. Total concurrent agents MUST NOT exceed `Max Active Agents`. Ignore "Assigned To" labels and numbered suffixes — they are cosmetic. Schedule by **Agent Type** only.
7. Ask the user: "This build has X tasks across Y distinct agent types (list them). Max concurrent agents is set to N. OK to proceed, or would you like to adjust?" Wait for confirmation before spawning any agents.
8. If `Coordinate Only: true`, enable delegate mode (Shift+Tab) so you only coordinate.

### Scheduling Priority

9. **CRITICAL RULE — REVIEWS FIRST: ALWAYS schedule pending review tasks before pending build tasks.** When a slot is free and both a review task and a build task are waiting, you MUST assign the review task first. Reviews unblock commits. Starving reviews deadlocks the entire pipeline. This is not a suggestion — it is a hard scheduling constraint.

### Dynamic Slot Management

10. **All agent slots are equal.** No reserved slots. Fill dynamically based on unblocked tasks.

11. **Scheduling loop** — repeat until all tasks are complete:
    a. List all unblocked tasks. Sort: review tasks first, then others.
    b. For each unblocked task:
       - **Builder/debugger → spawn fresh**: Never reuse via SendMessage. Team mode has no worktree isolation — commit after each builder completes (see Commit After Completion) and ensure parallel builders touch different files.
       - **Read-only agents + docs → reuse if idle**: Same **Agent Type** match (ignore "Assigned To" labels). If no idle agent, spawn new if slot is free.
       - Pass `model` matching agent type (builder=opus, researcher=sonnet, reviewer=sonnet, tester=sonnet, validator=haiku, architect=opus, debugger=opus, security-reviewer=opus, docs=sonnet, scout=haiku). Include full task text, file paths, and acceptance criteria.
       - **No free slot → wait** for an agent to complete, then return to (a).
    c. Free slots when agents complete and no unblocked tasks need their type.
    d. **HARD CAP: Never exceed `Max Active Agents`.** Count active agents before every spawn.
    e. **Complexity shortcut**: For tasks assessed as Simple (1-2 files, config-only, trivial change), the orchestrator may execute them directly instead of spawning a builder. This is optional in team mode — use it to avoid consuming an agent slot for trivial work.

### Rotation Rules

12. Each read-only agent instance handles at most `Rotation After` tasks (default 3). After reaching the limit, retire it and spawn fresh with a handoff summary (completed task IDs, commit SHAs, remaining tasks). Builders are always fresh per task — rotation does not apply to them.

### Scheduling Rules Summary

- Schedule by **Agent Type**, never by "Assigned To" label (labels are cosmetic).
- One agent instance = one task at a time.
- **Builders/debuggers**: always spawn fresh. Never reuse via SendMessage.
- **Read-only agents** (reviewer, researcher, validator, architect, security-reviewer, tester, docs): reuse idle instances before spawning new ones.
- Multiple builders CAN run in parallel — but they must touch different files.

### Commit After Completion

Team mode teammates do NOT support `isolation: "worktree"` — all teammates work directly in the main directory. Committing immediately after each builder completes is the primary mechanism for preventing conflicts.

**Protocol:**
1. After a builder/debugger task completes (and after review approval for builder tasks), check `git status` in the main working directory.
2. Stage and commit the agent's changes immediately: `git add <changed-files> && git commit -m "<type>(<scope>): <what changed>"`.
3. **Commit before dispatching the next builder** — if two builders' uncommitted changes overlap in the working directory, you lose isolation. Sequential commit-then-dispatch prevents this.
4. If no changes are visible (agent made no file modifications), note it and move on.

**Note:** Read-only agents (reviewer, validator, researcher, security-reviewer, architect) make no file changes, so no commit is needed after them.

### Review and Commit Workflow

13. **MANDATORY: After every builder agent finishes a task that writes code, schedule a review task.** The builder does NOT move to its next task until the reviewer approves. (When an architect produced a design for the task, include that design output in the review task context so the reviewer can verify the implementation followed it.) Handle fix loops:
    - If reviewer reports Critical or Important issues: spawn a **fresh** builder agent and include the review feedback plus original task context. Do NOT reuse the previous builder. After fixes, schedule another review. Repeat up to `Max Retries` times.
    - If max retries exceeded: stop and escalate to the user.
14. **After the reviewer approves a task, commit the changes immediately** (see Commit After Completion above). Agents do NOT touch git — only the orchestrator commits.
15. Research, architecture, and validation tasks do NOT need review. Read-only agents make no file changes — no commit needed.

### Plan Approval

16. If `Plan Approval: true` on a task, the agent must submit a plan before implementing. Review and approve or reject with feedback before the agent proceeds.

### Monitoring

17. Monitor agent progress. If an agent stalls or reports an unresolvable issue:
    - Message it directly with guidance.
    - If still unresolvable, retire the agent and spawn a fresh instance of the same **Agent Type** (this counts as a rotation — include the handoff summary).

### Completion

18. **Before dispatching the docs agent**: spawn a `security-reviewer` agent (model: opus) in a free slot to audit all files changed on the feature branch. Provide the list of changed files (`git diff --name-only main...HEAD`) and the spec's acceptance criteria. If Critical issues are found, spawn a **fresh** builder agent (with `isolation: "worktree"`) to fix them. After fixes, commit and re-run the security review. Commit security fixes before proceeding to documentation.
19. **After the security review is complete (and any security fixes are committed), spawn a `docs` agent** (model: sonnet) in a free slot to produce documentation. Provide: the spec's `## Documentation Requirements` section, the list of files changed on the feature branch (`git diff --name-only main...HEAD`), and the spec's acceptance criteria. Commit the docs agent's changes immediately after it completes (same protocol as builder commits in team mode). Then proceed to the validator.
20. After all tasks are complete: spawn a validator agent in a free slot for final verification.
21. Clean up — no further messages to any agents.

## Shared: After All Tasks Complete

Regardless of mode, after all tasks are done:

1. Run every command listed in `## Validation Commands`. Record output.
2. Check every item in `## Acceptance Criteria`. Mark pass/fail.
3. Check `## Documentation Requirements` — verify the docs agent produced all required documentation.
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
