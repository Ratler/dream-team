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

**If no arguments were provided, stop immediately and tell the user: "Usage: /dream-team:build <path-to-spec>". Do not proceed.**

Execute an implementation plan by reading a spec file and running the strategy matching its declared mode.

## Variables

SPEC_PATH: $ARGUMENTS
PLUGIN_ROOT: `${CLAUDE_PLUGIN_ROOT}`
AGENT_MANIFEST: `${CLAUDE_PLUGIN_ROOT}/agents/MANIFEST.md`
MODE_DIR: `${CLAUDE_PLUGIN_ROOT}/skills/build/modes`

## Cost Awareness

Agent spawning has real cost — each sub-agent consumes tokens for context loading, tool calls, and reporting. Before dispatching, ask: "Is this task complex enough to justify a separate agent?" A one-line config change does not need a builder agent, a review agent, and a validation agent. Use judgment:
- Trivial tasks: do them directly in the orchestrator
- Scout agents (sonnet) are short, low-cost runs — use them liberally for reconnaissance on unfamiliar code
- Do not skip reviews for non-trivial code changes, but do skip them for config, docs, and research tasks (per the Review Policy's Skip Review For setting)

## Instructions

- If no `SPEC_PATH` is provided, stop and ask the user to provide it.
- Read the spec file at SPEC_PATH.
- Parse the YAML frontmatter to extract `mode`, `complexity`, `type`, `playwright`, `frontend-design`, `spec-version`, and `branch`.
- If `spec-version` is missing from frontmatter, log a warning ("spec written before spec-version was introduced — consider updating") but proceed normally. This ensures backwards compatibility.
- If `branch` is present in frontmatter, this is a **resumed build** — see Resuming a Build below.
- **Based on `mode`, read the matching strategy file — `MODE_DIR/sequential.md`, `MODE_DIR/delegated.md`, or `MODE_DIR/team.md` — and follow it.** Do NOT read the other two mode files; they do not apply to this build. Mode files are read with the Read tool, so they refer to the plugin root as `PLUGIN_ROOT` (the resolved path above) and to `AGENT_MANIFEST` by name.
- The `playwright` and `frontend-design` frontmatter flags are handled inside the mode strategy file — follow its instructions for when to apply the Playwright and Frontend Design blocks. If a flag is `false` or missing, do NOT mention Playwright or frontend design to agents.
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
