# Release Notes

## 0.1.0 — Initial Release

First public release of Dream Team, a Claude Code plugin for structured planning and execution of development projects.

### Workflow

Dream Team separates work into three phases -- brainstorm, spec, build -- each with its own slash command and
a clear handoff to the next.

1. `/dream-team:plan` -- Interactive brainstorming session that explores the codebase, asks clarifying questions,
    and recommends an execution tier.
2. `/dream-team:spec-sequential`, `/dream-team:spec-delegated`, `/dream-team:spec-team` -- Writes a structured specfile
    from the brainstorming context.
3. `/dream-team:build <spec-file>` -- Reads the spec, detects the execution mode from frontmatter, and runs the matching
    strategy.

### Execution Tiers

- **Sequential** -- Single session, tasks run one at a time. Cheapest option for small or tightly coupled work.
- **Delegated** -- Orchestrator dispatches tasks to specialized sub-agents within the same session. Best for work with
  clear role boundaries.
- **Team** -- Separate Claude instances collaborate via a shared task list. True parallelism for large independent
  workstreams. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`.

### Agents

Seven specialized agents ship with the plugin:

| Agent      | Model  | Role                                               |
|------------|--------|----------------------------------------------------|
| builder    | sonnet | Writes code, implements features with TDD          |
| researcher | sonnet | Explores codebases and gathers context (read-only) |
| architect  | opus   | Design decisions and structural recommendations    |
| reviewer   | sonnet | Qualitative code review with severity categories   |
| tester     | sonnet | Writes and runs tests, TDD workflow                |
| validator  | haiku  | Final mechanical pass/fail verification            |
| debugger   | opus   | Systematic debugging: reproduce, investigate, fix  |

### Additional Commands

- `/dream-team:debug` -- Standalone debugging skill. Reproduces the issue, investigates root cause, applies a
  targeted fix, and verifies the resolution. Works independently of the plan/spec/build workflow.

### Hooks

- **SessionStart** -- Injects plugin context into every new session so Claude knows Dream Team is available and how to use it.
- **Spec validation** (Stop hooks) -- Validates that a spec file was written and contains all required sections for its execution mode.
- **Build validation** (Stop hook) -- Checks that all tasks reached completed status after a build finishes.

### Spec Template

A shared Markdown template (`templates/spec-template.md`) defines the structure for all spec files. It includes
conditional sections for each execution mode (team configuration, agent assignments, etc.) and uses YAML frontmatter
to declare the mode.

### Tests

17 tests covering all four hooks. Run with `make test`.

### Known Issues

- Stop hooks declared in skill frontmatter do not fire due to an upstream Claude Code bug ([#19225](https://github.com/anthropics/claude-code/issues/19225)). The hooks are wired correctly and will activate once the bug is fixed. The SessionStart hook in `hooks.json` works as expected.
