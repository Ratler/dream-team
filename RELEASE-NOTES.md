# Release Notes

## 0.8.0

### Persistent Build State

Builds can now resume from a fresh session. The TaskCompleted hook auto-persists each completed task's
state to `specs/.build-state/<spec-name>/<task-id>.json`, and the build skill writes `in_progress` before
dispatching each task. One file per task makes concurrent agent writes race-free. A `_meta.json` per
build records branch, mode, and timing.

A new PostCompact hook (`hooks/postcompact_checkpoint.js`) increments a `compactions` counter on the
active build's `_meta.json`, surfacing context-pressure as a signal for long-running or stalled builds.

### Documentation Agent

New `docs` agent (Sonnet, read-write, `memory: project`) runs after the security reviewer and before
the validator in all three execution modes. The agent reads the spec's `## Documentation Requirements`
section, the diff of changed files, and produces README updates, changelog entries, and inline comments
for non-obvious logic only.

Documentation responsibilities were stripped from the builder and reviewer agents to remove ambiguity
about who owns docs. Builder may still add inline comments when logic is genuinely complex; everything
else is the docs agent's job.

The TaskCompleted hook now runs `markdown-table-formatter` on any `.md` files referenced in the task
description (no-op if the formatter is not installed) so generated docs match the project's table style.

### Opinionated Plan Skill

`/dream-team:plan` Phase 2 now assesses complexity from Phase 1 codebase findings and calibrates how
deep its questioning goes. Instead of neutral open-ended prompts, questions present a **recommended
answer** grounded in evidence from the codebase ("looking at how X is structured, I'd recommend Y —
agreed?"). Decision trees are walked systematically rather than ad hoc, and the one-question-per-turn
rule is relaxed for tightly coupled follow-ups so simple decisions don't stretch across many turns.

### Build and Spec Skill Cleanup

`skills/build/SKILL.md` was trimmed (389 → 362 lines): the ignored "Before Each Task" section was
removed, "After Commits" was merged into "On Task Completion", and the delegated/team mode IMPORTANT
blocks were consolidated. Two latent bugs were fixed in the same pass: a stale worktree reference in
the team review loop and a spurious `-S` flag in the team-mode commit command.

The three spec skills had ~29 lines of duplicated guidance each ("Eliminating Ambiguity", filename
format, git sections) extracted into `templates/spec-writing-guide.md`. Net savings across the four
files: 82 lines. After-trim testing showed `commitSha` adherence improving from 40% to 100% across
5 runs — the smaller surface area made the remaining instructions stick.

### Scout and Merger Agents

Two new agents support the delegated execution mode:

- **scout** (Haiku, read-only) — fast pre-build reconnaissance. The orchestrator dispatches scout
  before any builder on complex tasks to map file structure, conventions, test patterns, and gotchas.
  Builders receive scout's report in their dispatch prompt instead of rediscovering the codebase
  themselves.
- **merger** (Sonnet) — branch integration with tiered conflict resolution. After a builder commits
  inside its worktree and review approves, merger integrates the worktree branch back into the
  feature branch. Tier 1: clean merge. Tier 2: auto-resolve obvious conflicts. Tier 3: AI-resolve
  semantic conflicts; escalate when intents are incompatible.

The build skill gained complexity assessment (drives whether scout runs), per-task file scope
declarations, merger dispatch on review approval, and explicit cost-awareness guidance for when to
choose delegated over team mode.

All nine agents (builder, debugger, researcher, architect, reviewer, security-reviewer, tester,
validator, docs) gained three new structural sections — **Propulsion** (act on first tool call, no
preamble), **Failure Modes** (named anti-patterns with corrections, e.g. `SHOTGUN_FIX`,
`HAND_WAVY_DESIGN`, `IVORY_TOWER`), and **Completion Protocol** (explicit ordered steps before
calling `TaskUpdate`).

### Recursive Sub-Agent Spawn Protection

Worker agents inherit the Task/Agent tools when spawned, which let them recursively call
`Agent(isolation: "worktree")` from inside their own worktree — producing
`.claude/worktrees/agent-X/.claude/worktrees/agent-Y/...` paths that recurse without bound. Each
level paid for a fresh git clone, a new SessionStart, and full context reload.

Three layers of defense:

1. **Frontmatter** (`disallowedTools: Task, Agent`) on every non-orchestrator agent — builder,
   debugger, researcher, architect, reviewer, security-reviewer, tester, validator, docs, scout,
   merger. Hard-blocks the listed tools at the agent runtime level.
2. **PreToolUse hook** (`hooks/block_nested_agent.js`) — fires on every Agent/Task call. If the
   caller's `cwd` is inside `.claude/worktrees/agent-<hex>/`, the hook blocks the call regardless
   of agent definition. Defense-in-depth in case a future agent definition omits the frontmatter
   field.
3. **Prose rule** in builder, debugger, and merger — explains *why* nested worktrees recurse and
   what the agent should do instead (report a blocker via `TaskUpdate`).

### Worktree Auto-Cleanup

A new Stop hook (`hooks/cleanup_worktrees.js`) runs after `/dream-team:build` finishes and removes
idle agent worktrees. Without this, worktrees accumulated every build (one per builder/debugger) and
were never reclaimed — observed locally at 3.5 GB across four projects.

Cleanup rules: prune stale registry entries, remove orphan directories, remove registered worktrees
that are clean and unlocked (plus delete the matching `worktree-agent-<id>` branch). Locked worktrees
and worktrees with uncommitted changes are skipped — those signal "do not touch" and require human
review. Cleanup failures never block the build from completing.

### Project Memory Expansion

`memory: project` was extended to researcher, security-reviewer, debugger, and tester. Builder,
reviewer, architect, and docs already had it. This lets researcher remember codebase patterns and
prior investigations across runs, security-reviewer remember the project threat model and prior
findings, tester remember edge cases that have bitten before, and debugger remember infra quirks
and reproduction tricks.

Validator is intentionally excluded — its job is mechanical pass/fail with no cross-session knowledge
worth preserving.

---

## 0.7.1

### Ambiguity Elimination

Addresses build divergence discovered through a 5-build consistency test. Builds from the same spec were producing functionally identical but structurally different output (~67% line-level divergence) due to underspecified details in the spec.

**Spec-writing skills gain ambiguity elimination guidance** — all three spec skills (sequential, delegated, team) now include an "Eliminating Ambiguity" section that instructs spec authors to use exact values instead of descriptive language:
- Exact hex colors instead of "red-tinted" or "dark background"
- Exact string templates instead of "display the score and author"
- Exact element types, class names, and DOM patterns
- Exact API units, timeout values, and implementation patterns
- Explicit quote style conventions

**Build skill enforces literal spec adherence** — sequential mode now instructs the builder to treat the spec as a blueprint, using exact values verbatim. Delegated mode's agent dispatch template includes a "Literal spec adherence" block that every dispatched agent sees.

**Measured impact**: after rewriting a test spec with exact values, 5 parallel builds produced byte-identical output (after whitespace normalization). Previous divergence on colors, units, element types, string formats, and implementation patterns was completely eliminated.

---

## 0.7.0

### Spec Format Hardening

Structural improvements to the spec file format and validation, addressing failure modes discovered in real-world builds.

**Validation hook gains structural checks** — the spec sections hook now catches five categories of spec defects before
the build starts, rather than failing at runtime:
- Unresolved `<if>` / `</if>` template tags that survived into the generated spec
- Tasks missing the required `**Tests**` field
- Dangling dependency references (task depends on a non-existent task ID)
- Circular dependencies that would hang the build
- Invalid `Skip Review For` entries (must be valid task IDs or agent types, not prose like "review tasks")

The `spec-version` field is checked with a soft warning (no block) for backwards compatibility with older specs.

**Per-task file ownership** — the spec template now includes a `**Files**` field on every builder task listing exactly
which files it creates or modifies (`creates:` / `modifies:` prefixes). The delegated and team spec skills enforce
non-overlap: parallel/background builder tasks with overlapping files must be made sequential. This prevents merge
conflicts that previously only surfaced at build time.

**Task sizing guidance** — all three spec skills now include sizing rules: each builder task should produce 1-3 files
and ~100-300 lines of code. Oversized tasks that exhaust agent context windows should be split.

**Build resume support** — the build skill now writes a `branch` field into the spec's frontmatter when it creates the
feature branch. On subsequent runs, it detects the field, checks out the existing branch, and resumes from the first
incomplete task instead of starting over.

**Other changes:**
- `spec-version: 1` added to frontmatter template for future compatibility
- `## Cleanup` section added to the spec template for teardown commands
- Team mode task format drops the redundant `Assigned To` field (only `Agent Type` remains)
- `Skip Review For` now requires comma-separated task IDs or agent types instead of freeform prose
- 12 new validation tests (98 total across 8 test files)

---

## 0.6.1

### Worktree and Git Workflow Fixes

Fixed three issues discovered during real-world team and delegated mode builds:

- **Team mode has no worktree isolation** — teammates spawned via TeammateTool silently ignore `isolation: "worktree"`.
  Updated team mode to rely on commit-after-completion and file-boundary separation instead of worktrees.
- **Delegated mode builders must commit inside worktrees** — the orchestrator cannot reach into a worktree to commit.
  Builders and debuggers now commit their own changes (conventional commit format) before marking tasks complete. The
  orchestrator merges the worktree branch back after review approval.
- **Task IDs removed from commit messages** — internal task IDs should not appear in git history. All commit formats
  now use conventional commits (`feat(scope): description`) with no task ID references.
- **Removed hardcoded project name** from the dispatch template — agents no longer claim to be working on
  "the Dream Team project."

---

## 0.6.0

### Frontend Design Integration

The planning skill now asks about aesthetic direction for frontend/UI work — presenting 10 named styles (Minimal,
Editorial, Brutalist, Retro-Futuristic, etc.) and following up on color palette, dark/light mode, and typography
preferences. All three spec-writing skills record the choices in a `## Design Direction` section and set
`frontend-design: true` in frontmatter.

When the build skill detects `frontend-design: true`, it reads `templates/frontend-design-guidelines.md` and injects
the full guidelines into every builder agent prompt. The guidelines cover anti-generic rules (avoiding the "AI look"),
typography principles, color and theme, animation timing, interaction patterns, accessibility requirements, component
library recommendations (React, Vue, generic), and layout principles.

### Native agent_type in TaskCompleted Hook

The TaskCompleted hook now reads the native `agent_type` field from hook events (available since Claude Code 2.1.69),
falling back to `[agent-type: X]` tag parsing in task descriptions for older versions.

### Worktree Dispatch Fixes

Builder and debugger agents are now always spawned fresh — never reused via SendMessage — because worktree isolation
only applies at spawn time. The merge protocol was replaced with commit-after-completion since worktree auto-cleanup
deposits changes directly into the main working directory. Both delegated and team mode dispatch instructions were
updated.

---

## 0.5.0

### TaskCompleted Hook

New hook that fires when any agent marks a task as completed. All completions are logged as JSON lines to
`~/.claude/dream-team/logs/<project>.jsonl` for per-project audit trails. The hook is logging-only (always exits 0)
since the platform fires TaskCompleted on events beyond task completion (e.g., ExitPlanMode), making validation
unreliable.

Agents now embed an `[agent-type: X]` tag in their task descriptions so the hook can identify them without relying on
hook input fields that don't carry agent metadata. The build skill dispatch template and all eight agent definitions
were updated to write completion reports into the task description via `TaskUpdate`.

### Security Reviewer: HTTP Security & Dependency Audit

Added a 7th checklist category covering infrastructure-level security concerns that the original 6 code-focused
categories missed: Content-Security-Policy, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, cookie
Secure/HttpOnly/SameSite flags, server version fingerprinting, and dependency CVE scanning (`npm audit`, `pip audit`,
`cargo audit`). Missing headers, insecure cookies, exposed versions, and high-severity CVEs are now classified as
Important rather than Minor hardening suggestions.

### Agent Worktree Isolation and Memory

Builder and debugger agents now declare `isolation: "worktree"` in their frontmatter, giving each agent an independent
git worktree so concurrent builders cannot conflict. Builder, reviewer, and architect agents use `memory: project` for
persistent cross-session knowledge. Stop hooks now log `last_assistant_message` to stderr when available for debug
visibility.

---

## 0.4.1

### Team Mode: Fix Agent Over-Spawning

Fixed a bug where the orchestrator spawned a separate agent for each unique "Assigned To" label in specs. A spec with
labels like "Builder 1", "Builder 2", "Reviewer 1", "Reviewer 3" would create 14 agents instead of respecting the
configured max of 6. Root cause: the scheduling loop matched by "Assigned To" label, and the spec generator created
unique numbered labels per task -- so no agent reuse ever happened.

Three changes:

- The scheduling loop now matches idle agents by **Agent Type** (builder, reviewer, etc.), not by "Assigned To" label.
  An idle builder agent picks up any unblocked builder task regardless of what the label says.
- The spec-team skill now bans numbered labels. "Assigned To" must use the plain Agent Type name (e.g., `builder`, not
  "Security Builder 2"). The orchestrator handles parallelism by spawning multiple instances of the same type.
- Pre-flight validation counts distinct Agent Types and warns if the spec has numbered labels that could cause
  over-spawning.

---

## 0.4.0

### Proactive Security Reviewer Agent

New `security-reviewer` agent (opus, read-only) that runs automatically on every build. Works through a structured
6-category checklist: input validation, injection vectors, authentication & authorization, secrets & credentials,
data exposure, and dangerous code patterns. Reports findings as Critical/Important/Minor with file:line references
and concrete fix suggestions.

Previously, security coverage was reactive -- the reviewer would catch vulnerabilities incidentally, and the tester
only ran security tests when the spec author thought to include them. Now every build gets a dedicated security pass
regardless of what the spec says. The orchestrator auto-injects the step in all three execution modes.

Critical findings trigger the same fix loop as code review Critical issues -- the builder fixes, the security
reviewer re-checks, up to the configured retry limit.

### Team Mode: Prevent Silent Fallback to Delegated

Fixed a bug where team-mode specs could silently execute in delegated mode. Three contributing factors:

- The `Delegate Mode` field name in Team Configuration was ambiguous -- renamed to `Coordinate Only` to eliminate
  confusion with the delegated execution mode.
- The `preflight_team_check.js` hook existed but was never registered in `hooks.json`. It now fires as a PreToolUse
  hook on every Skill tool call, blocking team-mode builds when the agent teams env var is not set.
- The env-var check in the build skill was a passive note that Claude would skip. It is now structural step 1 of the
  team pre-flight: "STOP if agent teams are not enabled. Do NOT fall back to delegated mode."

### Session Startup Message

The SessionStart hook now displays a visible startup message with the plugin version (e.g., "Dream Team v0.4.0
loaded -- use /dream-team:plan to start"). The hook runs synchronously so the message appears before the session
begins.

---

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
