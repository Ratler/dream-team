# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Dream Team is a Claude Code **marketplace plugin** that provides structured planning and execution for development projects. It follows the brainstorm → spec → build workflow across three execution tiers: sequential, delegated (sub-agents), and team (parallel Claude instances).

Installed as: `dream-team@dream-team-marketplace` (local marketplace via `.claude-plugin/marketplace.json`).

## Commands

```bash
# Run all tests
make test

# Run a single test
node tests/test_session_start.js

# Install as plugin (local marketplace)
claude plugin marketplace add Ratler/dream-team-marketplace
claude plugin install dream-team@dream-team-marketplace
```

Tests are plain Node.js scripts (no test framework) that use `execSync` to invoke hooks and assert on JSON output. Hook tests that expect `exit(1)` need try/catch with `err.stdout` parsing.

## Architecture

This is a Claude Code plugin, not a Node.js application. There is no `package.json` or build step. All files live at repo root (required by marketplace layout).

### Plugin Structure

- **`commands/*.md`** — Slash-command autocomplete entries. Thin wrappers that read and delegate to the matching skill via `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md`. Do NOT set `disable-model-invocation: true` on commands that delegate to skills (breaks the Skill tool chain).
- **`skills/*/SKILL.md`** — Actual skill logic. YAML frontmatter defines name, description, argument hints, and Stop hooks. The `allowed-tools` frontmatter field controls tool access (`disallowed-tools` is not a valid field).
- **`agents/*.md`** — Agent definitions with model, color, and behavioral instructions. Models: builder=opus, researcher=sonnet, architect=opus, reviewer=sonnet, tester=sonnet, validator=haiku, debugger=opus. Builder and debugger agents use `isolation: "worktree"` for git worktree isolation in delegated/team modes. Builder, reviewer, and architect agents use `memory: project` for persistent cross-session knowledge. All agents include `[agent-type: X]` in their report format and write reports to the task description via `TaskUpdate(description: ...)`.
- **`hooks/*.js`** — JavaScript hooks (Node.js, no external deps). `hooks.json` registers SessionStart, PreToolUse, and TaskCompleted hooks. Stop hooks are declared in skill frontmatter under the `hooks:` key.
- **`templates/spec-template.md`** — Shared spec template with conditional sections per execution mode and YAML frontmatter.
- **`specs/`** — Generated spec files (date-prefixed: `YYYY-MM-DD-<name>.md`).
- **`.claude-plugin/plugin.json`** — Plugin manifest. Omit empty string fields (e.g., `homepage: ""` fails URL validation).
- **`.claude-plugin/marketplace.json`** — Local marketplace definition.

### Hook Protocol

Hooks are plain Node.js scripts that read stdin and write JSON to stdout:
- **SessionStart** (`session_start.js`): Async hook. Outputs `{hookSpecificOutput: {hookEventName, additionalContext}}`. Injects usage guide into session context.
- **Stop hooks** (`validate_spec_exists.js`, `validate_build_complete.js`, `validate_spec_sections.js`): Exit 0 + `{"result":"continue"}` to allow, exit 1 + `{"result":"block","reason":"..."}` to block. Stop hooks in skill frontmatter appear to be working as of Claude Code 2.1.49 (previously broken upstream — claude-code#19225). All Stop hooks log `last_assistant_message` to stderr when available (visible in `claude --debug`).
- **TaskCompleted** (`validate_task_completed.js`): Logging only — always exits 0. Logs all task completions as JSON lines to `~/.claude/dream-team/logs/<sanitized-cwd>.jsonl`. Uses `DREAM_TEAM_LOG_DIR` env var for test override.

### Skill Pipeline

1. `/dream-team:plan` — Interactive brainstorming, produces no files
2. `/dream-team:spec-{sequential,delegated,team}` — Writes spec to `specs/` from conversation context
3. `/dream-team:build <spec-path>` — Reads spec frontmatter `mode` field, executes matching strategy
4. `/dream-team:debug` — Standalone, not part of the pipeline

### Execution Modes

- **Sequential**: Single session, tasks run one at a time, no sub-agents
- **Delegated**: Orchestrator dispatches to typed sub-agents (Task tool with `subagent_type` and `model`). Builder/debugger agents are always spawned fresh with `isolation: "worktree"` (never reused — worktrees only apply at spawn time). Worktree auto-cleanup deposits changes in main directory; orchestrator commits immediately after each builder completes.
- **Team**: Parallel Claude instances via shared task list. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` env var. Teammates do NOT support `isolation: "worktree"` — all work in the main directory. Commit immediately after each builder completes; design specs with non-overlapping file boundaries for parallel builders.

## Known Constraints

- Stop hooks in SKILL.md frontmatter appear to be working as of Claude Code 2.1.49 (previously broken — claude-code#19225). SessionStart hook in `hooks.json` works fine.
- Background subagents cannot use Bash (auto-denied by permission handlers) — use foreground agents for git/node commands.
- Team mode teammates do not support `isolation: "worktree"` — only delegated mode subagents (Agent/Task tool) get worktree isolation. In team mode, commit-after-completion and file-boundary separation are the isolation mechanisms.
- Plugin manifest: omit empty string fields; they fail URL validation.
- Instructions written as passive/conditional sidebars get ignored by Claude — make them structural numbered steps in the process flow.
