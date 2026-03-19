---
mode: sequential
complexity: medium
type: feature
playwright: false
frontend-design: false
spec-version: 1
branch: feat/documentation-agent
created: 2026-03-19T12:00:00Z
---

# Plan: Documentation Agent and Markdown Formatting

## Task Description
Add a dedicated documentation agent that runs after security review and before validation in all three execution modes. Update existing agents to delegate documentation responsibilities to the new agent. Extend the TaskCompleted hook to run `markdown-table-formatter` on changed `.md` files.

## Objective
Ensure every build produces complete, consistent documentation — README updates, changelog entries, API docs, and inline comments — by introducing a purpose-built docs agent and automating markdown table formatting.

## Problem Statement
Documentation is currently the builder's responsibility, but builders focus on making code work and passing tests. Documentation is frequently skipped, minimal, or stale. The validator can only check if documentation exists, not whether it's good or complete. There is no enforcement mechanism between building and validation.

## Solution Approach
1. Create a new `docs` agent (Sonnet, read-write, `memory: project`) that owns all documentation output except inline code comments.
2. Insert a docs agent step in the build flow for all three modes: after security review, before validator.
3. Strip documentation responsibilities from builder and reviewer agents — builders only add inline code comments for genuinely complex logic.
4. Update the spec template to clarify that `## Documentation Requirements` feeds the docs agent.
5. Extend the TaskCompleted hook to detect `.md` files changed during a task and run `markdown-table-formatter` if installed.

## Relevant Files
- `agents/builder.md` — remove doc-writing responsibilities
- `agents/reviewer.md` — remove documentation gap checks from severity definitions
- `agents/docs.md` — new file, documentation agent definition
- `skills/build/SKILL.md` — insert docs agent step in all three modes
- `templates/spec-template.md` — update Documentation Requirements section
- `hooks/validate_task_completed.js` — add markdown-table-formatter step
- `tests/test_task_completed_formatter.js` — new test for formatter integration

### New Files
- `agents/docs.md` — documentation agent definition
- `tests/test_task_completed_formatter.js` — test for markdown-table-formatter hook integration

## Implementation Phases

### Phase 1: Foundation
Create the docs agent and update existing agents to delegate documentation responsibilities.

### Phase 2: Core Implementation
Wire the docs agent into the build flow across all three execution modes. Extend the TaskCompleted hook with markdown formatting.

### Phase 3: Integration & Polish
Update the spec template, write tests, and validate end-to-end.

## Step by Step Tasks

### 1. Create Documentation Agent
- **Task ID**: create-docs-agent
- **Depends On**: none
- **Description**:
  - Create `agents/docs.md` with the following frontmatter:
    ```yaml
    name: docs
    description: >
      Use this agent after all code is written to produce and update project documentation.
      Reviews changes against the spec's Documentation Requirements section and writes
      README updates, changelog entries, API docs, and inline comments for complex logic.
      Read-write — modifies documentation files only.
    model: sonnet
    color: green
    memory: project
    ```
  - The agent persona: a technical writer with deep engineering context. Reads code fluently, writes docs for humans. Values clarity, accuracy, and brevity. Does not pad documentation with filler.
  - Include a Memory section (same pattern as builder/reviewer): consult memory for project doc conventions, tone, changelog format, README structure. Update memory after completing a task with new conventions discovered.
  - Rules:
    - Assigned ONE task. Complete it fully before reporting.
    - Read task details via `TaskGet` if a task ID is provided.
    - Read all changed files on the feature branch (`git diff --name-only main...HEAD`) to understand what was built.
    - Read the spec's `## Documentation Requirements` section to understand what documentation is expected.
    - Do NOT modify source code files. Only create or modify documentation files (`.md`, `.txt`, `.rst`) and add/update inline code comments in source files where the logic is genuinely complex and non-obvious.
    - Do NOT spawn other agents.
  - Workflow:
    1. Read the spec and the Documentation Requirements section.
    2. List all changed files on the feature branch.
    3. Read every changed file to understand what was built.
    4. For each documentation requirement, produce the required output:
       - **README updates**: If new features, APIs, commands, or configuration were added, update the project README to reflect them. Match the existing README's style, structure, and tone.
       - **Changelog / release notes**: Add entries describing what changed and why. Follow the project's existing changelog format if one exists; otherwise use Keep a Changelog format.
       - **API docs**: If new public APIs, endpoints, or interfaces were added, document them with usage examples.
       - **Inline comments**: Add comments in source files ONLY where the logic is genuinely complex and non-obvious. Do not add obvious comments like `// increment counter` above `counter++`.
    5. Commit all documentation changes: `git add <files> && git commit -m "docs(<scope>): <what changed>"`.
    6. Report completion via TaskUpdate.
  - Report format:
    ```
    [agent-type: docs]
    ## Documentation Complete

    **Task**: [name]
    **Status**: Completed

    **Documentation produced**:
    - [file] — [what was written/updated]

    **Documentation Requirements coverage**:
    - [requirement 1] — DONE / SKIPPED (reason)
    - [requirement 2] — DONE / SKIPPED (reason)

    **Files changed**:
    - [path] — [what changed]
    ```
- **Files**:
  - creates: `agents/docs.md`
- **Tests**: N/A (agent definition file, no testable code)

### 2. Update Builder Agent
- **Task ID**: update-builder-agent
- **Depends On**: create-docs-agent
- **Description**:
  - Modify `agents/builder.md` to remove documentation responsibilities.
  - In the persona paragraph (line 14), remove any implication that builders write documentation. The builder's focus is code, tests, and commits.
  - In the Rules section, add a rule: "Do NOT write or update documentation files (README, changelog, API docs). A dedicated docs agent handles documentation after your work is reviewed. The only documentation you produce is inline code comments where the logic is genuinely complex and non-obvious."
  - In the Workflow section, step 9 (Commit), keep as-is — builders still commit code.
  - Do NOT change the report format, TDD loop, or any other section.
- **Files**:
  - modifies: `agents/builder.md`
- **Tests**: N/A (agent definition file, no testable code)

### 3. Update Reviewer Agent
- **Task ID**: update-reviewer-agent
- **Depends On**: update-builder-agent
- **Description**:
  - Modify `agents/reviewer.md` to remove documentation completeness from review scope.
  - In the Severity Definitions section, under **Minor** (line 36), remove "documentation gaps" from the list. Replace with: "dead code, optimization opportunities" (removing the documentation item entirely).
  - In the Workflow section, do NOT add any documentation-related checks. The reviewer focuses on code quality, spec compliance, tests, and regressions.
  - Do NOT change the persona, report format, or any other section.
- **Files**:
  - modifies: `agents/reviewer.md`
- **Tests**: N/A (agent definition file, no testable code)

### 4. Update Build Skill — All Three Modes
- **Task ID**: update-build-skill
- **Depends On**: update-reviewer-agent
- **Description**:
  - Modify `skills/build/SKILL.md` to insert a docs agent step in all three execution modes.
  - **Sequential mode** (around line 133, after the security review step 5 and before the code review step 6):
    - Add a new step: "**After the security review and before the code review task**: run the documentation step. Read the `docs` agent definition from AVAILABLE_AGENTS. Read the spec's `## Documentation Requirements` section. List all files changed on the feature branch (`git diff --name-only main...HEAD`). Read every changed file. Produce all required documentation: README updates, changelog entries, API docs, and inline comments for complex logic. Commit documentation changes with `git add <files> && git commit -m \"docs(<scope>): <description>\"`."
    - Renumber subsequent steps as needed.
  - **Delegated mode** (around line 167, after the security reviewer step 7 and before the validator step 8):
    - Add a new step: "**After the security review is complete (and any security fixes are committed), dispatch a `docs` agent** (model: sonnet) to produce documentation. Provide: the spec's `## Documentation Requirements` section, the list of files changed on the feature branch (`git diff --name-only main...HEAD`), and the spec's acceptance criteria. The docs agent commits its own changes. After the docs agent completes, proceed to the validator."
    - Renumber subsequent steps.
  - **Team mode** (around line 348, in the Completion section, after step 18 security review and before step 19 validator):
    - Add a new step: "**After the security review is complete (and any security fixes are committed), spawn a `docs` agent** (model: sonnet) in a free slot to produce documentation. Provide: the spec's `## Documentation Requirements` section, the list of files changed on the feature branch (`git diff --name-only main...HEAD`), and the spec's acceptance criteria. Commit the docs agent's changes immediately after it completes (same protocol as builder commits in team mode). Then proceed to the validator."
    - Renumber subsequent steps.
  - **Agent Dispatch Template** (around line 183): Add `docs` to the list of agent types that use the `[agent-type: docs]` tag prefix.
  - **Shared: After All Tasks Complete** (line 358): Update the documentation check step to say: "Check `## Documentation Requirements` — verify the docs agent produced all required documentation."
  - Do NOT change Playwright instructions, Frontend Design instructions, Git Workflow, Worktree Merge, or any other sections.
- **Files**:
  - modifies: `skills/build/SKILL.md`
- **Tests**: N/A (skill definition file, no testable code)

### 5. Update Spec Template
- **Task ID**: update-spec-template
- **Depends On**: update-build-skill
- **Description**:
  - Modify `templates/spec-template.md` line 143-144 to update the Documentation Requirements section.
  - Change the content guidance from:
    ```
    ## Documentation Requirements
    <list documentation that must be written as part of implementation — inline comments, READMEs, API docs, changelogs, etc. Builders are responsible for writing these alongside their code. Validator checks they exist.>
    ```
    to:
    ```
    ## Documentation Requirements
    <list documentation that must be produced — README updates, changelog entries, API docs, inline code comments for complex logic, etc. A dedicated docs agent runs after all code is written and reviewed to produce this documentation. The validator checks it exists. Be specific about what needs documenting — the docs agent uses this section as its task list.>
    ```
- **Files**:
  - modifies: `templates/spec-template.md`
- **Tests**: N/A (template file, no testable code)

### 6. Extend TaskCompleted Hook with Markdown Formatter
- **Task ID**: extend-task-completed-hook
- **Depends On**: update-spec-template
- **Description**:
  - Modify `hooks/validate_task_completed.js` to run `markdown-table-formatter` on `.md` files changed during a task.
  - Add a new function `formatMarkdownTables(input)` after the `updateBuildState` function:
    1. Extract the list of changed `.md` files from the task description. Parse the `filesChanged` or `Files changed` section from `input.task_description`. Filter to only files ending in `.md`.
    2. If no `.md` files found, return early (noop).
    3. Check if `markdown-table-formatter` is installed by running `which markdown-table-formatter` using `child_process.execSync`. Wrap in try/catch — if the command fails (exit non-zero), the binary is not installed. Log to stderr: `[dream-team] markdown-table-formatter not installed, skipping table formatting`. Return early.
    4. If installed, for each `.md` file, run `markdown-table-formatter <file>` using `child_process.execSync`. Wrap each call in try/catch — if formatting fails for a file, log the error to stderr but continue with the remaining files.
    5. After formatting, if any files were successfully formatted, run `git add <formatted-files> && git commit -m "style: format markdown tables"` using `child_process.execSync`. Wrap in try/catch — if the commit fails (e.g., no changes after formatting), log to stderr but don't fail.
  - Call `formatMarkdownTables(input)` in the `main()` function after `updateBuildState(input, agentType)` and before `process.exit(0)`.
  - Import `child_process` at the top: `const { execSync } = require('child_process');`
  - The hook must still always exit 0 — formatting failures are non-fatal.
- **Files**:
  - modifies: `hooks/validate_task_completed.js`
- **Tests**: See next task.

### 7. Test Markdown Formatter Integration
- **Task ID**: test-formatter-hook
- **Depends On**: extend-task-completed-hook
- **Description**:
  - Create `tests/test_task_completed_formatter.js` to test the markdown-table-formatter integration.
  - Use the same test pattern as existing hook tests: plain Node.js, `execSync` to invoke the hook, assert on output/behavior.
  - Test cases:
    1. **No `.md` files in task description**: Hook completes successfully, no formatting attempted. Verify exit code 0.
    2. **`.md` files present but `markdown-table-formatter` not installed**: Hook completes successfully, logs skip message to stderr. Verify exit code 0 and stderr contains "not installed".
    3. **`.md` files present and formatter installed (mock)**: This test should verify the code path that attempts to run the formatter. Since the formatter may not be installed in the test environment, verify the hook handles the missing binary gracefully (exit code 0, skip message logged).
  - Each test pipes a JSON input object to the hook via stdin, containing `task_description` with file lists that include `.md` files.
  - Use `try/catch` with `err.stdout` and `err.stderr` parsing for tests that expect specific behavior.
- **Files**:
  - creates: `tests/test_task_completed_formatter.js`
- **Tests**: Self-testing (this IS the test file). Run with `node tests/test_task_completed_formatter.js`.

### 8. Code Review
- **Task ID**: review-all
- **Depends On**: test-formatter-hook
- **Description**: Review all code changes for correctness, style, edge cases, and security. Report issues by severity (Critical, Important, Minor).

  Review your own work: re-read every file you changed, check for bugs, missing edge cases, security issues, and style problems. Fix any issues found before proceeding to validation.

### 9. Final Validation
- **Task ID**: validate-all
- **Depends On**: review-all
- **Description**: Run all validation commands, verify every acceptance criterion is met.

## Documentation Requirements
- Update `CLAUDE.md` to mention the new `docs` agent in the Architecture section (agent list, model assignment, and build flow description).
- No README or changelog needed — this is an internal plugin enhancement.

> **Note:** Since this spec adds the docs agent itself, this documentation requirement must be handled manually during the build (the docs agent doesn't exist yet when the build starts). The builder should update CLAUDE.md as part of task 1 or as a separate inline step.

## Acceptance Criteria
- `agents/docs.md` exists with correct frontmatter (model: sonnet, color: green, memory: project)
- `agents/builder.md` no longer mentions writing README, changelog, or API docs — only inline code comments for complex logic
- `agents/reviewer.md` severity definitions do not include "documentation gaps"
- `skills/build/SKILL.md` includes a docs agent step in all three modes (sequential, delegated, team), positioned after security review and before validator
- `templates/spec-template.md` Documentation Requirements section references the docs agent, not builders
- `hooks/validate_task_completed.js` attempts to run `markdown-table-formatter` on `.md` files from task descriptions, noops gracefully when not installed
- `node tests/test_task_completed_formatter.js` passes
- `make test` passes (all existing tests still pass)

## Validation Commands
- `node tests/test_task_completed_formatter.js`
- `make test`

## Cleanup
N/A

## Notes
- The docs agent uses Sonnet (not Opus) to balance quality and cost. Documentation writing is important but not architecturally complex.
- The docs agent does NOT use worktree isolation — it writes documentation files directly. This is safe because it runs after all code changes are committed.
- The markdown-table-formatter hook is best-effort — it never blocks task completion. If the binary is not installed, it silently skips.
- Since this spec creates the docs agent itself, the CLAUDE.md update must be handled by the builder during the build, not by the docs agent (chicken-and-egg).
