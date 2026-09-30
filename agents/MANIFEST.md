# Agent Dispatch Manifest

Compact dispatch reference for orchestrators (build skill) and spec writers. This table is the single source of truth for agent dispatch parameters.

Do NOT read the full agent definition files (`agents/*.md`) into an orchestrator or spec-writing session — each file is loaded automatically as its agent's system prompt when the agent is spawned. Reading them elsewhere only burns context.

| Agent | Model | Isolation | Writes | Reuse | Use for |
|---|---|---|---|---|---|
| builder | opus | worktree (delegated only) | code + tests | never — always spawn fresh | implementing features with TDD, following the spec exactly |
| debugger | opus | worktree (delegated only) | code + tests | never — always spawn fresh | systematic bug reproduction, root-cause fixes |
| researcher | sonnet | none | read-only | yes | codebase exploration, context gathering |
| architect | opus | none | read-only | yes | design decisions, structural recommendations |
| reviewer | opus | none | read-only | yes | code review with severity categories + structural-quality pass |
| security-reviewer | opus | none | read-only | yes | 7-category security audit after all builders complete |
| tester | sonnet | none | test files only | yes | integration/adversarial/E2E tests beyond builder TDD |
| validator | haiku | none | read-only | yes | final mechanical pass/fail verification |
| docs | sonnet | none | documentation files only | yes | README/changelog/API docs after the security review |
| scout | sonnet | none | read-only | yes | fast pre-build reconnaissance for complex tasks |
| merger | opus | none | git merges only | yes | worktree branch integration with tiered conflict resolution (delegated only) |

Notes:

- Always pass `model` matching this table when dispatching.
- Builder/debugger in **delegated mode**: always pass `isolation: "worktree"` and always spawn fresh — worktrees only apply at spawn time and are cleaned up after completion.
- **Team mode** does not support worktree isolation. Builders/debuggers still always spawn fresh; commit-after-completion and non-overlapping file boundaries are the isolation mechanisms.
- Read-only agents make no file changes — no merge or commit is needed after them.
