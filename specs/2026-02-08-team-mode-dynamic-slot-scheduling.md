---
mode: sequential
complexity: medium
type: enhancement
playwright: false
created: 2026-02-08T20:30:00Z
---

# Plan: Team Mode Dynamic Slot Scheduling

## Task Description
Overhaul the team mode agent management in the build skill to use dynamic slot-based scheduling instead of a rigid 1:1 mapping of team members to agent instances. The current instructions cause Claude to spawn a new agent instance for every task instead of reusing persistent teammates, resulting in 3x the expected agent count.

## Objective
Team mode builds spawn at most N concurrent agents (configurable, default 6), dynamically fill slots based on unblocked tasks, rotate instances after a configurable task count to prevent context exhaustion, and prioritize reviews over builds to prevent pipeline deadlocks.

## Problem Statement
The build skill's team mode says "spawn one teammate per agent listed in Team Members" — but Claude interprets this as spawning a fresh agent for every task. A spec with 4 team members and 12 tasks resulted in 12 spawned agents. Additionally, the `## Team Members` section in specs is redundant with per-task `Assigned To` and `Agent Type` fields, creating confusion. Finally, long-lived agent instances risk context window exhaustion after many sequential tasks.

## Solution Approach
1. Replace the team mode section in the build skill with a dynamic slot scheduler: all slots are equal, filled based on unblocked task demand, with review tasks always prioritized over build tasks.
2. Add agent rotation — each instance handles at most N tasks (default 3) before being retired and replaced with a fresh instance carrying a handoff summary.
3. Remove `## Team Members` from team mode specs (keep for delegated mode). Tasks already carry `Assigned To` and `Agent Type` — the orchestrator derives the team dynamically.
4. Add `Max Active Agents` and `Rotation After` to `## Team Configuration` in the spec template.
5. Update the validation hook and tests to reflect the removed section requirement.

## Relevant Files
- `skills/build/SKILL.md` — contains Mode: Team section (lines 156-180) that needs full rewrite
- `skills/spec-team/SKILL.md` — spec-writing skill that currently requires Team Members section
- `templates/spec-template.md` — spec template with Team Members and Team Configuration sections
- `hooks/validate_spec_sections.js` — stop hook that validates required sections per mode (line 31-35: TEAM_SECTIONS includes Team Members)
- `tests/test_validate_spec_sections.js` — tests for the validation hook (lines 106-141: team mode tests reference Team Members)

## Implementation Phases

### Phase 1: Foundation
Update the spec template and spec-team skill to reflect the new team configuration model (remove Team Members, add new fields).

### Phase 2: Core Implementation
Rewrite the Mode: Team section in the build skill with the full dynamic slot scheduling logic, rotation rules, and review priority.

### Phase 3: Integration & Polish
Update the validation hook and tests to match the new required sections for team mode.

## Step by Step Tasks

### 1. Update Spec Template for Team Mode
- **Task ID**: update-spec-template
- **Depends On**: none
- **Description**:
  - In `templates/spec-template.md`, remove the `## Team Members` section for team mode. Keep it for delegated mode only (the `<if mode is delegated or team>` guard around Team Members becomes `<if mode is delegated>`).
  - Update the `## Team Configuration` section (currently only has Display Mode and Delegate Mode) to add:
    - `- **Max Active Agents**: <max concurrent agents, default 6>`
    - `- **Rotation After**: <tasks per agent instance before rotation, default 3>`
  - In the task template section, keep `Assigned To` and `Agent Type` fields for team mode — these are still needed for the orchestrator to know what kind of agent to spawn.
- **Tests**: N/A — template is a markdown reference file with no executable code.

### 2. Update Spec-Team Skill
- **Task ID**: update-spec-team-skill
- **Depends On**: update-spec-template
- **Description**:
  - In `skills/spec-team/SKILL.md`, under "What To Do":
    - Remove step 10's mention of "Include Team Members" — change to "Include Team Configuration and Review Policy sections."
  - Under "Task Rules":
    - Remove "Each teammate should own distinct files to avoid conflicts" (no fixed teammates).
    - Remove "Size tasks so each teammate has 5-6 tasks for sustained productivity" (slot scheduler handles this).
    - Keep the rule about `Assigned To` and `Agent Type` on every task.
  - Under "Team Configuration Guidance", add:
    - `- **Max Active Agents**: Default 6. This caps concurrent agent instances. The orchestrator asks the user to confirm before starting.`
    - `- **Rotation After**: Default 3. Each agent instance handles at most this many tasks before being retired and replaced.`
  - Update the Report template: remove "Team: <list of agent names and roles>" line since there's no fixed team roster.
- **Tests**: N/A — skill file is markdown instructions with no executable code.

### 3. Rewrite Mode: Team in Build Skill
- **Task ID**: rewrite-team-mode
- **Depends On**: update-spec-template
- **Description**:
  - In `skills/build/SKILL.md`, replace the entire "## Mode: Team" section (lines 156-180) with the dynamic slot scheduling model. The new section must include these subsections and rules, in this order:

  **Pre-flight:**
  - Read agent definitions from AVAILABLE_AGENTS.
  - Read `## Team Configuration` for `Max Active Agents` (default 6) and `Rotation After` (default 3).
  - Ask the user: "This build has X tasks. Max concurrent agents is set to N. OK to proceed, or adjust?"
  - Check that `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is enabled.

  **Scheduling Priority (CRITICAL — must be a numbered hard rule, not a sidebar):**
  - "ALWAYS schedule pending review tasks before pending build tasks. A free slot with both a review and a build task waiting MUST take the review. Reviews unblock commits; starving reviews deadlocks the pipeline."

  **Dynamic Slot Management:**
  - All slots are equal. No reserved slots. The orchestrator fills them based on unblocked task demand.
  - When a slot is free and tasks are waiting: pick the highest-priority unblocked task (reviews first), then spawn or reuse an agent for it.
  - Group tasks by `Assigned To` label. Tasks with the same label go to the same agent instance (until rotation).
  - When a task completes and the agent has another task with the same `Assigned To` label queued and is under the rotation limit: send the next task via SendMessage.
  - When a task completes and there are no more tasks for that `Assigned To` label: free the slot.
  - Never exceed `Max Active Agents` concurrent agents.

  **Rotation Rules:**
  - Each agent instance handles at most `Rotation After` tasks (default 3).
  - After reaching the limit, retire the instance. Spawn a fresh instance of the same role with a handoff summary: "You are taking over the [Assigned To] role. Previous instance completed tasks [list] with commits [SHAs]. Your remaining tasks are [list]."
  - The retired instance is not sent further messages.
  - Rotation count resets for each new instance.

  **Anti-pattern / Correct Pattern (include as a concrete example):**
  - WRONG: Spawning "backend-builder-task1", "backend-builder-task2", "backend-builder-task3" as separate agents.
  - RIGHT: Spawn "Backend Builder" once. Send it task 1 via spawn prompt. When done, SendMessage with task 2. After task 3 (rotation limit), retire and spawn a fresh "Backend Builder" with handoff. Send it task 4.

  **Remaining orchestrator duties (keep from current version):**
  - Create feature branch (Git Workflow).
  - Create all tasks via TaskCreate with dependencies.
  - Initialize build state file.
  - If `Plan Approval: true` on a task, the teammate must submit a plan before implementing.
  - After reviewer approves a task, the orchestrator commits (teammates do NOT touch git).
  - After all tasks: spawn a validator agent in a free slot for final verification.
  - Clean up when done.

- **Tests**: N/A — skill file is markdown instructions with no executable code.

### 4. Update Validation Hook
- **Task ID**: update-validation-hook
- **Depends On**: update-spec-template
- **Description**:
  - In `hooks/validate_spec_sections.js`, modify the `TEAM_SECTIONS` array (line 31-35):
    - Remove `'## Team Members'` from `TEAM_SECTIONS`.
    - Keep `'## Team Configuration'` and `'## Review Policy'`.
    - Result: `const TEAM_SECTIONS = ['## Team Configuration', '## Review Policy'];`
  - Keep `DELEGATED_SECTIONS` unchanged — delegated mode still requires Team Members.
- **Tests**: `tests/test_validate_spec_sections.js` — covered in next task.

### 5. Update Validation Hook Tests
- **Task ID**: update-validation-tests
- **Depends On**: update-validation-hook
- **Description**:
  - In `tests/test_validate_spec_sections.js`:
  - **Update** the test "blocks team spec missing Team Configuration" (line 106-122): remove `'## Team Members', 'Members',` from the spec content — the test should still block because Team Configuration is missing, but Team Members should no longer be in the valid team spec.
  - **Update** the test "continues for valid team spec with all sections" (line 125-141): remove `'## Team Members', 'Members',` from the spec content. The valid team spec should pass without Team Members.
  - **Add a new test**: "continues for team spec without Team Members" — a team spec with Team Configuration and Review Policy but no Team Members should pass validation.
  - **Keep** the existing test "blocks delegated spec missing Team Members" unchanged — delegated mode still requires it.
  - Run tests: `node tests/test_validate_spec_sections.js` — all must pass.
- **Tests**: Self-referential — this task IS the test update. Run `node tests/test_validate_spec_sections.js` to verify.

### 6. Code Review
- **Task ID**: review-all
- **Depends On**: rewrite-team-mode, update-spec-team-skill, update-validation-tests
- **Description**: Review all code changes for correctness, style, edge cases, and security. Report issues by severity (Critical, Important, Minor).
  Review your own work: re-read every file you changed, check for bugs, missing edge cases, security issues, and style problems. Fix any issues found before proceeding to validation.
  Specifically verify:
  - The build skill's team mode instructions are unambiguous — could Claude misinterpret "dynamic slot" as something else?
  - The scheduling priority rule is structural (a numbered step), not a passive sidebar.
  - The rotation handoff summary template is complete enough for the new instance to continue without context loss.
  - The spec template's conditional guards (`<if mode is delegated>` vs `<if mode is delegated or team>`) are correct.
  - The validation hook correctly distinguishes team vs delegated required sections.
  - All test assertions match the updated hook behavior.

### 7. Final Validation
- **Task ID**: validate-all
- **Depends On**: review-all
- **Description**: Run all validation commands, verify every acceptance criterion is met.

## Documentation Requirements
- Inline comments in `validate_spec_sections.js` explaining why Team Members is required for delegated but not team mode.
- No new documentation files needed — all changes are to existing files.

## Acceptance Criteria
- The Mode: Team section in `skills/build/SKILL.md` contains explicit dynamic slot scheduling rules with a configurable max agent cap (default 6).
- The scheduling priority rule ("reviews before builds") is a hard numbered step in the orchestrator flow, not a sidebar or note.
- Agent rotation is documented with a concrete anti-pattern and correct pattern example.
- The `Rotation After` field (default 3) is present in both the spec template's Team Configuration and the spec-team skill's guidance.
- `## Team Members` is NOT required for team mode specs (removed from template and validation hook).
- `## Team Members` IS still required for delegated mode specs (unchanged).
- The `Max Active Agents` field (default 6) is present in the spec template's Team Configuration section.
- All existing tests pass: `node tests/test_validate_spec_sections.js`
- New test confirms team specs pass validation without Team Members.
- No other test files are broken by the changes: `for f in tests/test_*.js; do node "$f"; done`

## Validation Commands
- `node tests/test_validate_spec_sections.js`
- `for f in tests/test_*.js; do node "$f"; done`

## Notes
- Delegated mode is intentionally untouched — its Team Members section serves a different purpose (explicit agent dispatch list).
- The `Max Active Agents` confirmation prompt is part of the build skill instructions, not enforced by code. Claude asks the user before starting.
- Agent teams require `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` — this existing requirement is unchanged.
- The build state file schema is unaffected by these changes — it tracks tasks, not agent instances.
