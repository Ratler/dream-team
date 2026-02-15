---
mode: <sequential | delegated | team>
complexity: <simple | medium | complex>
type: <feature | fix | refactor | chore | enhancement>
playwright: <true | false>
created: <YYYY-MM-DDTHH:MM:SS ISO date>
---

# Plan: <task name>

## Task Description
<describe the task in detail based on the user's prompt>

## Objective
<clearly state what will be accomplished when this plan is complete>

<if type is feature or complexity is medium/complex>
## Problem Statement
<clearly define the specific problem or opportunity this task addresses>

## Solution Approach
<describe the proposed solution approach and how it addresses the objective>
</if>

## Relevant Files
<list files relevant to the task with bullet points explaining why>

<if new files are needed>
### New Files
<list new files to be created with descriptions>
</if>

<if complexity is medium/complex>
## Implementation Phases

### Phase 1: Foundation
<describe any foundational work needed>

### Phase 2: Core Implementation
<describe the main implementation work>

### Phase 3: Integration & Polish
<describe integration, testing, and final touches>
</if>

<if mode is delegated>
## Team Members
<list agents used in this plan with the following format for each>

- <Agent Display Name>
  - **Role**: <the specific focus and responsibility of this agent in this plan>
  - **Agent Type**: <builder | researcher | reviewer | validator | architect | tester>
</if>

<if mode is team>
## Team Configuration
- **Display Mode**: <in-process | split-pane>
- **Coordinate Only**: <true if lead should only coordinate and never implement directly, false otherwise>
- **Max Active Agents**: <max concurrent agents, default 6>
- **Rotation After**: <tasks per agent instance before rotation, default 3>
</if>

<if mode is delegated or team>
## Review Policy
- **Review After**: <each task | each phase | final only>
- **Fix Loop Trigger**: <severity levels that trigger builder re-work, default: Critical and Important>
- **Max Retries**: <max fix attempts before escalating to user, default: 3>
- **Skip Review For**: <comma-separated task IDs that skip review, or "none">
</if>

## Step by Step Tasks

<list step by step tasks as numbered h3 headers>

### 1. <Task Name>
- **Task ID**: <unique-kebab-case-id>
- **Depends On**: <comma-separated task IDs, or "none">
- **Description**: <what to do, with specific actions as bullet points>
- **Tests**: <what tests must be written for this task — specify test file paths, test cases, and expected behaviors. Use "N/A" only for tasks that produce zero testable code (research, docs, config-only).>
<if mode is delegated or team>
- **Assigned To**: <agent display name — for delegated mode, must match a Team Members entry; for team mode, a descriptive label used by the orchestrator to group tasks>
- **Agent Type**: <builder | researcher | reviewer | validator | architect | tester>
</if>
<if mode is delegated>
- **Background**: <true if safe to run in parallel with other background tasks, false if must be sequential>
</if>
<if mode is team>
- **Parallel**: <true if can run alongside other tasks, false if must be sequential>
- **Plan Approval**: <true if teammate must submit plan for lead approval before implementing, false otherwise>
</if>

<continue with additional numbered tasks — after every builder task that writes code, add a review task>

<if mode is delegated or team>
<guidance for tester tasks — include a tester task when ANY of these apply:
- Multiple builder tasks produce components that must integrate (add integration tests after both builders complete)
- The project handles user input, authentication, or has a security-sensitive API surface (add adversarial/security tests)
- The spec has acceptance criteria that span the full stack end-to-end (add E2E tests after all build tasks)
- Do NOT add tester tasks just to duplicate the builder's TDD unit tests — the builder already writes those>
</if>

> **Note:** A security review is automatically run by the build skill after all builder tasks complete. You do not need to add a security review task to your spec — the orchestrator injects it.

### N-1. Code Review
- **Task ID**: review-all
- **Depends On**: <all builder task IDs>
- **Description**: Review all code changes for correctness, style, edge cases, and security. Report issues by severity (Critical, Important, Minor).
<if mode is sequential>
Review your own work: re-read every file you changed, check for bugs, missing edge cases, security issues, and style problems. Fix any issues found before proceeding to validation.
</if>
<if mode is delegated or team>
- **Assigned To**: <reviewer agent name>
- **Agent Type**: reviewer
</if>

### N. Final Validation
- **Task ID**: validate-all
- **Depends On**: review-all
- **Description**: Run all validation commands, verify every acceptance criterion is met
<if mode is delegated or team>
- **Assigned To**: <validator agent name>
- **Agent Type**: validator
</if>

## Documentation Requirements
<list documentation that must be written as part of implementation — inline comments, READMEs, API docs, changelogs, etc. Builders are responsible for writing these alongside their code. Validator checks they exist.>

## Acceptance Criteria
<list specific, measurable criteria that must ALL be met for the plan to be considered complete>

## Validation Commands
<list specific commands to run to validate the work is complete — tests, linters, type checks, curl commands, etc.>

## Notes
<optional additional context, considerations, dependencies, or risks>
