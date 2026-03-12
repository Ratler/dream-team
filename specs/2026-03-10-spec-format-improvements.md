---
mode: sequential
complexity: medium
type: enhancement
playwright: false
frontend-design: false
created: 2026-03-10T12:00:00Z
---

# Plan: Spec Format Improvements

## Task Description

Harden the spec file format and validation to prevent common failure modes discovered during real-world builds: merge conflicts from parallel builders editing the same files, malformed specs with unresolved `<if>` tags, hung builds from circular dependencies, oversized tasks exhausting agent context, and no ability to resume interrupted builds.

## Objective

When complete, the spec template includes per-task file ownership, task sizing guidance, a spec-version field, and a cleanup section. The validation hook catches unresolved `<if>` tags, missing `Tests` fields, invalid dependency references, circular dependencies, and invalid `Skip Review For` references. The build skill supports resuming interrupted builds via a `branch` field written into frontmatter at build start.

## Problem Statement

The current spec format has structural gaps that cause preventable failures:
1. No per-task file mapping — parallel builders silently conflict on shared files
2. `<if>` conditional tags can survive into generated specs unresolved
3. No dependency graph validation — circular or dangling references hang builds
4. No task sizing guidance for delegated/team modes — oversized tasks exhaust context
5. Interrupted builds must restart from scratch — no resume mechanism
6. `Tests` field sometimes omitted entirely, `Skip Review For` uses prose instead of task IDs
7. No cleanup/teardown section for specs that start servers or install packages
8. No spec versioning — template changes silently break old specs

## Solution Approach

- Add `spec-version: 1` to frontmatter template; build skill warns on missing/old versions
- Add per-task `**Files**` field listing created/modified files; spec skills enforce it
- Add task sizing guidance to delegated and team spec skills
- Extend `validate_spec_sections.js` with structural checks: no raw `<if>` tags, all tasks have `Tests` field, dependency graph is valid (no cycles, no dangling refs), `Skip Review For` references valid task IDs
- Add `## Cleanup` section to spec template
- Build skill writes `branch: <name>` into spec frontmatter on first build, reads it on subsequent runs to resume
- Drop `Assigned To` from team mode template (redundant with `Agent Type`)

## Relevant Files

- `templates/spec-template.md` — spec template, needs new fields and sections
- `hooks/validate_spec_sections.js` — validation hook, needs structural checks
- `tests/test_validate_spec_sections.js` — tests for the validation hook
- `skills/spec-sequential/SKILL.md` — sequential spec skill, needs sizing + files guidance
- `skills/spec-delegated/SKILL.md` — delegated spec skill, needs sizing + files guidance
- `skills/spec-team/SKILL.md` — team spec skill, needs sizing + files + drop Assigned To
- `skills/build/SKILL.md` — build skill, needs resume logic and spec-version check

## Implementation Phases

### Phase 1: Foundation
Update the spec template with all new fields: spec-version, per-task Files field, Cleanup section, task sizing comments, drop Assigned To from team mode tasks.

### Phase 2: Core Implementation
Extend the validation hook with structural checks (if-tags, Tests field, dependency graph, Skip Review For). Add build resume logic. Update all three spec skills.

### Phase 3: Integration & Polish
Update tests, run full suite, self-review, validate.

## Step by Step Tasks

### 1. Update Spec Template

- **Task ID**: update-template
- **Depends On**: none
- **Description**:
  - Add `spec-version: 1` to the frontmatter block (after `frontend-design`)
  - Add a per-task `**Files**` field to the task format:
    ```
    - **Files**: <list of files this task creates or modifies — one per line, prefixed with "creates:" or "modifies:">
    ```
    Place it after `**Description**` and before `**Tests**`. Make it required for builder tasks, optional for research/review/validation tasks.
  - Add task sizing guidance as a comment in the task section:
    ```
    <each builder task should produce 1-3 files and ~100-300 lines of code. If a task is larger, split it.>
    ```
  - Add `## Cleanup` section after `## Validation Commands`:
    ```
    ## Cleanup
    <list commands to tear down resources created during the build — stop dev servers, remove temp files, undo global installs. Use "N/A" if nothing to clean up.>
    ```
  - In the team mode task format, remove the `Assigned To` field. Keep only `Agent Type`. Add a comment explaining that the orchestrator schedules by Agent Type, not by name.
  - Change `Skip Review For` in Review Policy to reference task IDs or agent types, not prose:
    ```
    - **Skip Review For**: <comma-separated task IDs or agent types that skip code review — e.g., "research-codebase, validate-all" or "researcher, validator". Use "none" to review everything.>
    ```
- **Tests**: N/A — template is a markdown file

### 2. Update Spec Skills with Sizing and Files Guidance

- **Task ID**: update-spec-skills
- **Depends On**: update-template
- **Description**:
  - **All three spec skills** (`spec-sequential`, `spec-delegated`, `spec-team`):
    - Add a task sizing rule: "Each builder task should produce 1-3 files and ~100-300 lines of code. If a task would be larger, split it into smaller tasks with clear file boundaries."
    - Add a files rule: "Every builder task must include a `**Files**` field listing exactly which files it creates or modifies, prefixed with `creates:` or `modifies:`. Review, research, and validation tasks may omit this field."
    - Update `Skip Review For` guidance to reference task IDs or agent types.
  - **spec-team only**:
    - Remove references to `Assigned To` field in task rules. State that team mode tasks use `Agent Type` only — the orchestrator handles scheduling.
    - Add a rule: "For parallel builder tasks (`Parallel: true`), verify that their `**Files**` fields do not overlap. If two builders would modify the same file, make one depend on the other."
  - **spec-delegated only**:
    - Add a rule: "For background builder tasks (`Background: true`), verify that their `**Files**` fields do not overlap. Tasks with overlapping files must not both be `Background: true`."
  - Add `spec-version: 1` to the list of frontmatter fields each skill sets.
  - Add `## Cleanup` section to the list of sections each skill fills in.
- **Tests**: N/A — skills are markdown files

### 3. Extend Validation Hook — Structural Checks

- **Task ID**: extend-validation
- **Depends On**: update-template
- **Description**:
  - Edit `hooks/validate_spec_sections.js` to add these checks after the existing section-presence validation:
  - **Unresolved `<if>` tags**: Scan the spec content for any lines matching `<if ` or `</if>`. If found, block with a message listing the line numbers and tag content.
  - **Missing `Tests` field**: Parse `## Step by Step Tasks` to extract individual tasks (split on `### \d+\.`). For each task, check that it contains `**Tests**:`. If missing, block with a message listing the task names missing the field.
  - **Dependency graph validation**:
    - Extract all `Task ID` values into a set.
    - For each task, parse `Depends On` into a list of referenced IDs.
    - Check for dangling references: any ID in `Depends On` that is not in the task ID set. Block if found.
    - Check for circular dependencies: build adjacency list from depends-on edges, run a topological sort (Kahn's algorithm or DFS with coloring). Block if a cycle is detected, listing the cycle path.
  - **`Skip Review For` validation** (delegated/team modes only): Parse `Skip Review For` value, split by comma, trim each entry. Check each entry is either a valid task ID or a recognized agent type (`builder`, `researcher`, `reviewer`, `validator`, `architect`, `tester`, `debugger`, `security-reviewer`). Block if any entry is neither.
  - **`spec-version` check**: Warn (but don't block) if `spec-version` is missing from frontmatter. This is a soft check — old specs should still work.
  - All new checks should be additive — existing section-presence checks remain unchanged. New checks run after the section check passes.
- **Tests**: `tests/test_validate_spec_sections.js` — see task 4

### 4. Write Tests for New Validation Checks

- **Task ID**: write-validation-tests
- **Depends On**: extend-validation
- **Description**:
  - Add tests to `tests/test_validate_spec_sections.js` for each new validation:
  - **`<if>` tag detection**:
    - Test: spec with `<if mode is delegated>` in body → blocks, mentions "unresolved"
    - Test: spec with `</if>` tag → blocks
    - Test: spec with no `<if>` tags → continues (already covered by existing tests, just verify)
  - **Missing `Tests` field**:
    - Test: spec with a task missing `**Tests**:` → blocks, lists task name
    - Test: spec with all tasks having `**Tests**:` → continues
  - **Dependency graph — dangling reference**:
    - Test: spec with `Depends On: nonexistent-task` → blocks, mentions "nonexistent-task"
  - **Dependency graph — circular dependency**:
    - Test: spec with task A depends on B, task B depends on A → blocks, mentions cycle
  - **Dependency graph — valid DAG**:
    - Test: spec with proper linear dependencies → continues
  - **`Skip Review For` validation**:
    - Test: delegated spec with `Skip Review For: review tasks, validate-all` where "review tasks" is not a valid ID or agent type → blocks
    - Test: delegated spec with `Skip Review For: research-codebase, validate-all` where both are valid task IDs → continues
    - Test: delegated spec with `Skip Review For: researcher, validator` (agent types) → continues
  - **`spec-version` warning**:
    - Test: spec without `spec-version` → continues (soft warning, no block)
  - Follow existing test patterns: `cleanup()`, `writeSpec()`, `runHook()`, `test()`, `assert()`.
- **Tests**: Self-testing — the tests ARE the deliverable

### 5. Add Build Resume Logic

- **Task ID**: build-resume
- **Depends On**: update-template
- **Description**:
  - Edit `skills/build/SKILL.md`:
  - In the `## Git Workflow` → `### Branch` section, update the logic:
    1. Before creating a branch, check if the spec frontmatter contains a `branch` field. If yes, check out that branch (it's a resumed build).
    2. After creating a new branch, write the branch name back into the spec file's frontmatter as `branch: feat/<spec-name>`. This marks the spec as "build started."
    3. When resuming: use TaskList to find existing tasks. Skip tasks already marked `completed`. Resume from the first `in_progress` or `not_started` task.
  - Add a `### Resuming a Build` subsection under `## Instructions`:
    ```
    ### Resuming a Build
    If the spec's frontmatter contains a `branch` field, this is a resumed build:
    1. Check out the existing branch.
    2. List all tasks. Skip any already marked `completed`.
    3. For `in_progress` tasks: read the task description for partial progress notes, then continue from where the previous build left off.
    4. For `not_started` tasks: proceed normally.
    ```
  - Add `spec-version` awareness: after parsing frontmatter, if `spec-version` is missing, log a warning but proceed. This ensures backwards compatibility with pre-v1 specs.
- **Tests**: N/A — build skill is a markdown instruction file

### 6. Code Review

- **Task ID**: review-all
- **Depends On**: update-template, update-spec-skills, extend-validation, write-validation-tests, build-resume
- **Description**: Review all code changes for correctness, style, edge cases, and security. Report issues by severity (Critical, Important, Minor).
  Review your own work: re-read every file you changed, check for bugs, missing edge cases, security issues, and style problems. Fix any issues found before proceeding to validation.

### 7. Final Validation

- **Task ID**: validate-all
- **Depends On**: review-all
- **Description**: Run all validation commands, verify every acceptance criterion is met

## Documentation Requirements

- Spec template changes are self-documenting (the template IS the spec format documentation)
- CLAUDE.md does not need updates — the template and skill files are the source of truth for spec format

## Acceptance Criteria

- `spec-version: 1` appears in the spec template frontmatter
- Per-task `**Files**` field exists in the template task format
- Task sizing guidance appears in all three spec skills
- `## Cleanup` section exists in the spec template
- Team mode task format has no `Assigned To` field (only `Agent Type`)
- `Skip Review For` format requires task IDs or agent types, not prose
- Validation hook blocks specs with unresolved `<if>` tags
- Validation hook blocks specs with tasks missing `**Tests**` field
- Validation hook blocks specs with dangling dependency references
- Validation hook blocks specs with circular dependencies
- Validation hook allows specs with valid dependency DAGs
- Validation hook validates `Skip Review For` entries
- Validation hook warns (but doesn't block) on missing `spec-version`
- Build skill reads `branch` from frontmatter to resume interrupted builds
- Build skill writes `branch` into frontmatter when starting a new build
- All existing tests pass (`make test`)
- All new validation tests pass

## Validation Commands

```bash
make test
```

## Cleanup

N/A — no servers or resources to tear down

## Notes

- The `spec-version` check is deliberately soft (warn, not block) to maintain backwards compatibility with existing specs
- Per-task `**Files**` field is the highest-impact change — it enables conflict detection at spec-writing time instead of discovering conflicts at build time
- The dependency graph validation uses simple cycle detection, not full scheduling simulation
- The `branch` field in frontmatter is write-once — the build skill writes it on first run, then reads it on subsequent runs
