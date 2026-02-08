# Dream Team

A Claude Code plugin for planning and executing development projects across three execution tiers.

## At a Glance

| Area                | Dream Team                                                |
|---------------------|-----------------------------------------------------------|
| **Philosophy**      | Turn Claude into a project lead                           |
| **Skills**          | 6 pipeline-connected skills (plan, spec x3, build, debug) |
| **Agents**          | 7 named roles with per-agent model and tool policies      |
| **Execution modes** | Sequential, Delegated, Team                               |
| **Planning**        | Formal specs with YAML frontmatter                        |
| **Task tracking**   | TaskCreate/TaskUpdate with dependency graph               |
| **Git workflow**    | Built into execution (branch, commit, review gates)       |
| **Code review**     | Configurable review policy with retry loops               |
| **Team support**    | Parallel Claude instances via experimental agent teams    |
| **Playwright**      | First-class integration (opt-in per spec)                 |
| **Validation**      | Hook-enforced (preflight checks, can't skip)              |

## Overview

Dream Team provides structured planning skills that generate spec files, and a universal build skill that reads the
spec and executes it using the appropriate strategy. It ships with seven specialized agents for common development roles.

## Execution Tiers

- **Sequential** -- Single session, no sub-agents, tasks run one at a time. Cheapest option, best for small or tightly
  coupled work.
- **Delegated** -- Single session with an orchestrator dispatching specialized sub-agents (builder, researcher, 
  reviewer, etc.). Medium cost, best for work with clear role boundaries.
- **Team** -- Separate Claude instances working in parallel via a shared task list. Highest cost, best for large
  projects with independent streams. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`.

## Prerequisites

For all features to work — especially the **Team** execution tier — you need to enable experimental agent teams in Claude Code:

```
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

See the [Agent Teams documentation](https://code.claude.com/docs/en/agent-teams) for details.

A terminal multiplexer like **tmux** or **iTerm2** is recommended, as agent teams spawn multiple Claude instances that benefit
from separate panes/windows for monitoring.

### Optional: Playwright MCP

If your specs set `playwright: true`, builder and tester agents will use Playwright to verify UI changes visually
(navigate pages, take screenshots, interact with elements, check for console errors). Install the 
[Playwright MCP server](https://github.com/anthropics/mcp-playwright) to enable this:

```
claude mcp add playwright npx @playwright/mcp@latest
```

Without it, agents will skip visual verification and note it in their reports.

## Installation

Register the repository as a local marketplace, then install:

```
claude plugin marketplace add Ratler/dream-team-marketplace
claude plugin install dream-team@dream-team-marketplace
```

## How It Works

Dream Team separates the workflow into three distinct phases: brainstorm, spec, build. Each phase has its own command
and produces a clear handoff to the next.

### 1. Plan (brainstorm)

`/dream-team:plan` starts an interactive conversation. It explores the codebase, asks clarifying questions one at
a time, proposes 2-3 approaches with trade-offs, and walks through the task breakdown section by section. No files are
created; the output is a shared understanding between you and Claude. At the end, it recommends which execution tier
fits best.

### 2. Spec (write)

Once brainstorming is complete, run the spec command for your chosen tier:

- `/dream-team:spec-sequential`
- `/dream-team:spec-delegated`
- `/dream-team:spec-team`

The spec skill picks up the conversation context, reads the shared template (`templates/spec-template.md`), and writes
a structured spec file to `specs/`. The spec includes YAML frontmatter declaring the execution mode, along with sections
for tasks, acceptance criteria, and depending on the mode, agent assignments or team configuration. Tasks use
dependencies so blocked work waits for its prerequisites automatically.

### 3. Build (execute)

`/dream-team:build specs/<filename>.md` reads the spec's frontmatter and runs the matching execution strategy:

- **Sequential** -- Iterates through tasks in dependency order within a single session. No sub-agents are spawned. The
  main session handles everything directly, making it the simplest and cheapest path.
- **Delegated** -- An orchestrator in the main session dispatches tasks to specialized sub-agents (builder, researcher,
  reviewer, etc.) using the Task tool. The orchestrator tracks progress and routes results between agents. Sub-agents
  run within the same session but get fresh context for each task.
- **Team** -- Launches separate Claude instances as a full agent team. Each instance picks up tasks from a shared task
  list and communicates through it. This enables true parallelism across independent workstreams but requires the
  `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable.

### Debug (standalone)

`/dream-team:debug` is a standalone debugging skill that works independently of the plan/spec/build workflow. It
reproduces the issue, investigates root cause, applies a targeted fix, and verifies the resolution.

### Hooks

Four JavaScript hooks run at key points in the workflow:

- **SessionStart** -- Injects plugin context (available agents, spec template location, slash commands) into every new
  session so Claude knows Dream Team is available.
- **Spec exists** (Stop hook) -- After a spec skill finishes, validates that a spec file was actually written to
  `specs/`. _Currently dormant — see [Known Issues](#known-issues)._
- **Spec sections** (Stop hook) -- Validates that the spec contains all required sections for its declared execution
  mode. _Currently dormant — see [Known Issues](#known-issues)._
- **Build complete** (Stop hook) -- After a build skill finishes, checks that all tasks reached the `completed` state.
  _Currently dormant — see [Known Issues](#known-issues)._

## Known Issues

- **Stop hooks in skill frontmatter do not fire** ([anthropics/claude-code#19225](https://github.com/anthropics/claude-code/issues/19225)).
  The three validation hooks (spec exists, spec sections, build complete) are wired correctly in skill frontmatter but
  Claude Code never invokes them. The SessionStart hook in `hooks.json` works fine. The Stop hooks will activate once
  the upstream bug is fixed, no changes needed on our side.

## Usage

1. Brainstorm your idea:

   ```
   /dream-team:plan Build a REST API for user management
   ```

2. Write the spec (after brainstorming completes):

   ```
   /dream-team:spec-sequential
   ```

3. Execute:

   ```
   /dream-team:build specs/2026-02-08-user-management.md
   ```

## Agents

| Agent      | Model  | Role                                                      |
|------------|--------|-----------------------------------------------------------|
| builder    | opus   | Writes code, runs tests, commits                          |
| researcher | sonnet | Explores codebases and gathers context (read-only)        |
| architect  | opus   | Designs systems and makes technical decisions (read-only) |
| reviewer   | sonnet | Reviews code for correctness and quality (read-only)      |
| tester     | sonnet | Writes and runs tests                                     |
| validator  | haiku  | Fast validation checks (read-only)                        |
| debugger   | opus   | Systematic debugging: reproduce, investigate, fix         |


## Tests

```
make test
```

or 

```
node tests/test_session_start.js
node tests/test_validate_spec_exists.js
node tests/test_validate_spec_sections.js
node tests/test_validate_build_complete.js
```

## License

MIT
