# Release Notes

## 0.3.0

### Builder: Mandatory Playwright Verification

Playwright verification is now step 8 in the builder agent's workflow, with a dedicated section in the report format
(pages visited, screenshots, console errors, visual checks). When a task mentions Playwright or visual verification,
the builder must complete it before reporting.

Before this change, Playwright instructions only existed in the build skill as a text block the orchestrator would paste
into dispatch prompts. In practice builders would skip it or claim they ran it when they hadn't. The reviewer would catch
it, push it back, and the builder would do it on retry, wasting a full review cycle. Baking the requirement into the
agent definition itself fixes this.

### Tester Agent: Adversarial/Integration Testing

Rewrote the tester agent to stop overlapping with builder TDD. Builders already write unit tests as part of their
workflow. The tester now focuses on what builders can't do:

- Integration tests across components from different builders
- Adversarial edge cases (malformed input, boundary values, race conditions, oversized payloads)
- Security/trust boundary testing (injection, auth bypasses, API surface validation)
- E2E suites that exercise the full stack

The workflow starts from the spec, not the code. The tester reads existing builder tests first to find gaps, then
writes targeted tests for uncovered areas. Failing tests are flagged as potential bugs.

### Spec-Writing: Tester Assignment Guidance

The delegated and team spec skills now have rules for when to assign tester tasks. They're not added by default since
builders handle unit tests. Tester tasks get added when:

- Multiple builders produce components that need integration testing
- The project has user input, auth, or security-sensitive APIs
- Acceptance criteria span the full stack

The spec template has matching guidance so spec authors see the rules while writing.

---

## 0.2.0

### Team Mode: Dynamic Slot Scheduling

Replaced the rigid team member roster with dynamic slot-based scheduling. The orchestrator now fills up to N concurrent
agent slots (default 6) based on unblocked task demand, rotates instances after 3 tasks to prevent context exhaustion,
and always prioritizes reviews over builds to prevent pipeline deadlocks.

The `## Team Members` section is no longer required in team mode specs (still used in delegated mode).

---

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
