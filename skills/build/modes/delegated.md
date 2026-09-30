# Build Mode: Delegated

Read by the build skill when the spec frontmatter has `mode: delegated`. The build skill's shared sections (Instructions, Git Workflow, Build State, Resuming a Build, Report) still apply.

You are the orchestrator. You NEVER write code directly — you dispatch agents. When dispatching builder agents, emphasize that they must follow the spec literally — exact values specified in the task description (hex colors, string formats, element types, timeouts, units) must be used verbatim, not creatively interpreted.

1. Create the feature branch (see Git Workflow).
2. Read AGENT_MANIFEST (`PLUGIN_ROOT/agents/MANIFEST.md`) for each agent's dispatch parameters and capabilities. Do NOT read the full agent definition files (`agents/*.md`) — each one is loaded automatically as its agent's system prompt at spawn time; reading them here only burns orchestrator context.
3. Create all tasks via TaskCreate. Set dependencies per spec.
4. Read the `## Review Policy` section to understand review rules.
5. **Assess task complexity before dispatching.** For each task, evaluate its complexity before choosing the dispatch strategy:
   - **Simple** (1-2 files, well-understood area, config or minor tweak): Execute the task directly in the orchestrator session. Do not spawn a sub-agent. This saves the cost of agent creation for trivial work.
   - **Moderate** (2-5 files, straightforward implementation): Dispatch a single builder agent as normal.
   - **Complex** (5+ files, unfamiliar area, multiple subsystems, or the task description flags uncertainty): Dispatch a `scout` agent (model: sonnet) first to reconnoiter the target area. Use the scout's findings to enrich the builder's dispatch prompt with specific file paths, conventions, and gotchas. Then dispatch the builder.
   When in doubt, lean toward dispatching rather than doing it yourself — the cost of a wrong direct implementation exceeds the cost of a sub-agent.
6. For each unblocked task:
   - If `Background: true` and no dependency conflicts, dispatch with `run_in_background: true`.
   - Dispatch the assigned agent via `Task(subagent_type: "<agent-type>", model: "<model>", ...)`.
   - **Agent dispatch rules:**
     - Always pass `model` matching the Agent Dispatch Manifest.
     - For builder/debugger: always pass `isolation: "worktree"` and always spawn fresh (never reuse — worktrees are cleaned up after completion).
     - For read-only agents (reviewer, researcher, validator, architect, security-reviewer, tester, docs, scout): no isolation needed, CAN be reused.
     - For merger: no isolation. Dispatched for branch integration after builder review approval (replaces the inline merge protocol).
   - Provide the FULL task description, relevant file paths, and acceptance criteria in the prompt. Do not tell the agent to read the spec — give it everything.
7. **MANDATORY: After every builder task that writes code, dispatch a reviewer agent.** Do NOT skip this step. Do NOT mark the builder task as completed until the reviewer has approved it.
   - Dispatch a `reviewer` agent (model: opus) with the task spec, files changed, and a summary of what the builder did, and, if an architect produced a design for this task, the architect's design output so the reviewer can verify the implementation followed it.
   - If reviewer reports Critical or Important issues:
     - Spawn a **fresh** builder agent (with `isolation: "worktree"`) and include the review feedback plus original task context in the prompt. Do NOT resume the previous builder — its worktree is gone.
     - After fixes, dispatch reviewer again.
     - Repeat up to `Max Retries` times.
     - If max retries exceeded: stop and escalate to the user.
   - If reviewer approves (or only Minor issues): **merge the worktree branch** (see Worktree Merge below), then mark task `completed`.
   - Research, architecture, and validation tasks do NOT need review. No merge needed (read-only agents).
8. **After all builder tasks are complete and reviewed, dispatch a `security-reviewer` agent** (model: opus) to audit all files changed on the feature branch. Provide the list of changed files (`git diff --name-only main...HEAD`) and the spec's acceptance criteria.
   - If the security reviewer reports Critical issues: spawn a **fresh** builder agent (with `isolation: "worktree"`) with the findings plus the original task context — do NOT resume the previous builder, its worktree is gone. Merge its worktree branch (see Worktree Merge), then re-dispatch the security reviewer. Repeat up to `Max Retries` times.
   - Important issues: spawn a fresh builder the same way to fix them, but do not require a security re-review.
   - Commit security fixes before proceeding to documentation.
9. **After the security review is complete (and any security fixes are committed), dispatch a `docs` agent** (model: sonnet) to produce documentation. Provide: the spec's `## Documentation Requirements` section, the list of files changed on the feature branch (`git diff --name-only main...HEAD`), and the spec's acceptance criteria. The docs agent commits its own changes. After the docs agent completes, proceed to the validator.
10. After all tasks: dispatch a `validator` agent for final verification.

## Worktree Merge (Delegated Mode)

Builder and debugger agents run with `isolation: "worktree"`, each on its own branch. The agent commits its work inside the worktree before marking the task complete. After review approval, the orchestrator merges the worktree branch back into the feature branch.

**Protocol:**
1. After a builder/debugger task completes and the reviewer approves, identify the worktree branch from the task output or `git worktree list` / `git branch`.
2. Ensure you are on the feature branch: `git checkout feat/<spec-name>`.
3. For clean merges (no expected conflicts): merge directly with `git merge <worktree-branch> --no-ff -m "merge: <worktree-branch>"`.
4. If merge conflicts occur OR if multiple builders worked on related areas: dispatch a `merger` agent (model: opus) with the source branch, target branch, and context about what the builder changed. The merger handles tiered conflict resolution. If the merger agent cannot resolve conflicts, escalate to the user.
5. **Merge before dispatching the next builder** — sequential merge-then-dispatch prevents compounding conflicts.

**Note:** Read-only agents (reviewer, validator, researcher, security-reviewer, architect) make no file changes — no merge needed.

## Agent Dispatch Template

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

Follow your agent definition's Workflow and Completion Protocol exactly — the TDD loop, committing your changes before marking done (write agents), and writing your `[agent-type: <agent-type>]` completion report via TaskUpdate are all defined there.
```

Do NOT re-state the TDD loop, commit protocol, or report format in the dispatch prompt — the agent's own definition already contains them, and repeating them wastes tokens on every dispatch.

## Playwright Instructions (only if `playwright: true`)

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

## Frontend Design Instructions (only if `frontend-design: true`)

Append this block to every **builder** agent dispatch prompt when the spec has `frontend-design: true`. Do NOT include it for reviewer, validator, researcher, or architect agents. Do NOT include it if `frontend-design: false` or missing.

Paste the spec's `## Design Direction` section into the block. Do NOT read or paste `templates/frontend-design-guidelines.md` yourself — the builder reads it directly, which keeps the full guidelines out of the orchestrator context. When composing the block, replace `PLUGIN_ROOT` with the resolved absolute plugin root path from the build skill's Variables — agents do not know it.

```
**Frontend Design**: This project has specific design direction. Follow it for all UI code.

## Design Direction (from spec)
<paste the spec's Design Direction section here — aesthetic style, stack, component libraries, design notes>

Before writing any UI code, Read `PLUGIN_ROOT/templates/frontend-design-guidelines.md` and apply it. The Design Direction section above takes precedence for project-specific choices (aesthetic style, stack, component libraries). The guidelines provide implementation details (animation timings, interaction patterns, accessibility requirements, anti-generic rules).
```
