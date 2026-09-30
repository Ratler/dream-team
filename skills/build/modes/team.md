# Build Mode: Team

Read by the build skill when the spec frontmatter has `mode: team`. The build skill's shared sections (Instructions, Git Workflow, Build State, Resuming a Build, Report) still apply.

You are the orchestrator of a dynamic agent team. You NEVER write code directly — you manage agent slots, schedule tasks, and handle git.

## Pre-flight

1. **STOP if agent teams are not enabled.** Check whether `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set by attempting to use TeamCreate. If teams are not available, STOP immediately. Tell the user: "This spec uses mode: team, which requires agent teams. Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in your environment and restart, or re-spec with `/dream-team:spec-delegated` as an alternative." Do NOT fall back to delegated mode. Do NOT proceed.
2. Create the feature branch (see Git Workflow).
3. Read AGENT_MANIFEST (`PLUGIN_ROOT/agents/MANIFEST.md`) for each agent's dispatch parameters and capabilities. Do NOT read the full agent definition files (`agents/*.md`) — each one is loaded automatically as its agent's system prompt at spawn time.
4. Read `## Team Configuration` for `Display Mode`, `Coordinate Only`, `Max Active Agents` (default 6), and `Rotation After` (default 3).
5. Create all tasks via TaskCreate. Set dependencies per spec.
6. **Agent count validation:** Count distinct **Agent Type** values across all tasks — this is the number of ROLES, not agents to spawn. Total concurrent agents MUST NOT exceed `Max Active Agents`. Ignore "Assigned To" labels and numbered suffixes — they are cosmetic. Schedule by **Agent Type** only.
7. Ask the user: "This build has X tasks across Y distinct agent types (list them). Max concurrent agents is set to N. OK to proceed, or would you like to adjust?" Wait for confirmation before spawning any agents.
8. If `Coordinate Only: true`, enable delegate mode (Shift+Tab) so you only coordinate.

## Scheduling Priority

9. **CRITICAL RULE — REVIEWS FIRST: ALWAYS schedule pending review tasks before pending build tasks.** When a slot is free and both a review task and a build task are waiting, you MUST assign the review task first. Reviews unblock commits. Starving reviews deadlocks the entire pipeline. This is not a suggestion — it is a hard scheduling constraint.

## Dynamic Slot Management

10. **All agent slots are equal.** No reserved slots. Fill dynamically based on unblocked tasks.

11. **Scheduling loop** — repeat until all tasks are complete:
    a. List all unblocked tasks. Sort: review tasks first, then others.
    b. For each unblocked task:
       - **Builder/debugger → spawn fresh**: Never reuse via SendMessage. Team mode has no worktree isolation — commit after each builder completes (see Commit After Completion) and ensure parallel builders touch different files.
       - **Read-only agents + docs → reuse if idle**: Same **Agent Type** match (ignore "Assigned To" labels). If no idle agent, spawn new if slot is free.
       - Pass `model` matching the Agent Dispatch Manifest. Include full task text, file paths, and acceptance criteria.
       - **No free slot → wait** for an agent to complete, then return to (a).
    c. Free slots when agents complete and no unblocked tasks need their type.
    d. **HARD CAP: Never exceed `Max Active Agents`.** Count active agents before every spawn.
    e. **Complexity shortcut**: For tasks assessed as Simple (1-2 files, config-only, trivial change), the orchestrator may execute them directly instead of spawning a builder. This is optional in team mode — use it to avoid consuming an agent slot for trivial work.

## Rotation Rules

12. Each read-only agent instance handles at most `Rotation After` tasks (default 3). After reaching the limit, retire it and spawn fresh with a handoff summary (completed task IDs, commit SHAs, remaining tasks). Builders are always fresh per task — rotation does not apply to them.

## Scheduling Rules Summary

- Schedule by **Agent Type**, never by "Assigned To" label (labels are cosmetic).
- One agent instance = one task at a time.
- **Builders/debuggers**: always spawn fresh. Never reuse via SendMessage.
- **Read-only agents** (reviewer, researcher, validator, architect, security-reviewer, tester, docs): reuse idle instances before spawning new ones.
- Multiple builders CAN run in parallel — but they must touch different files.

## Commit After Completion

Team mode teammates do NOT support `isolation: "worktree"` — all teammates work directly in the main directory. Committing immediately after each builder completes is the primary mechanism for preventing conflicts.

**Protocol:**
1. After a builder/debugger task completes (and after review approval for builder tasks), check `git status` in the main working directory.
2. Stage and commit the agent's changes immediately: `git add <changed-files> && git commit -m "<type>(<scope>): <what changed>"`.
3. **Commit before dispatching the next builder** — if two builders' uncommitted changes overlap in the working directory, you lose isolation. Sequential commit-then-dispatch prevents this.
4. If no changes are visible (agent made no file modifications), note it and move on.

**Note:** Read-only agents (reviewer, validator, researcher, security-reviewer, architect) make no file changes, so no commit is needed after them.

## Review and Commit Workflow

13. **MANDATORY: After every builder agent finishes a task that writes code, schedule a review task.** The builder does NOT move to its next task until the reviewer approves. (When an architect produced a design for the task, include that design output in the review task context so the reviewer can verify the implementation followed it.) Handle fix loops:
    - If reviewer reports Critical or Important issues: spawn a **fresh** builder agent and include the review feedback plus original task context. Do NOT reuse the previous builder. After fixes, schedule another review. Repeat up to `Max Retries` times.
    - If max retries exceeded: stop and escalate to the user.
14. **After the reviewer approves a task, commit the changes immediately** (see Commit After Completion above). Agents do NOT touch git — only the orchestrator commits.
15. Research, architecture, and validation tasks do NOT need review. Read-only agents make no file changes — no commit needed.

## Plan Approval

16. If `Plan Approval: true` on a task, the agent must submit a plan before implementing. Review and approve or reject with feedback before the agent proceeds.

## Monitoring

17. Monitor agent progress. If an agent stalls or reports an unresolvable issue:
    - Message it directly with guidance.
    - If still unresolvable, retire the agent and spawn a fresh instance of the same **Agent Type** (this counts as a rotation — include the handoff summary).

## Completion

18. **Before dispatching the docs agent**: spawn a `security-reviewer` agent (model: opus) in a free slot to audit all files changed on the feature branch. Provide the list of changed files (`git diff --name-only main...HEAD`) and the spec's acceptance criteria. If Critical issues are found, spawn a **fresh** builder agent to fix them (no worktree isolation in team mode — commit after the fix per Commit After Completion). After fixes, commit and re-run the security review. Commit security fixes before proceeding to documentation.
19. **After the security review is complete (and any security fixes are committed), spawn a `docs` agent** (model: sonnet) in a free slot to produce documentation. Provide: the spec's `## Documentation Requirements` section, the list of files changed on the feature branch (`git diff --name-only main...HEAD`), and the spec's acceptance criteria. Commit the docs agent's changes immediately after it completes (same protocol as builder commits in team mode). Then proceed to the validator.
20. After all tasks are complete: spawn a validator agent in a free slot for final verification.
21. Clean up — no further messages to any agents.

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
