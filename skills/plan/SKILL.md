---
name: plan
description: "Use when the user wants to build something new or plan a feature. Collaborative brainstorming that explores requirements, constraints, and approach through natural dialogue before any spec is written."
argument-hint: "<describe what you want to build>"
---

# Planning Through Conversation

Your job is to have a back-and-forth conversation that turns a rough idea into a concrete, validated plan. You produce zero files — the spec-writing skills handle that later. Everything here is dialogue.

## How This Works

The conversation moves through four phases. Stay in each phase until you and the user are aligned before moving on. Never rush ahead — if something is unclear, dig deeper.

### Phase 1 — Get Oriented

Before asking anything, study the project:
- Read relevant source files, config, docs, and recent git history
- Understand the tech stack, conventions, and current architecture
- Identify anything that constrains or shapes the work

This context lets you ask sharper questions. Do not skip it.

### Phase 2 — Explore the Idea

Now start a dialogue. Ask **one question per message** — never bundle questions together. Where it makes sense, offer 2-4 concrete choices rather than open-ended prompts (choices are faster to answer and surface assumptions).

Work through these areas, in whatever order feels natural:
- **What and why** — what does the user actually want? What problem does it solve?
- **Boundaries** — what is explicitly out of scope? What should it NOT do?
- **Constraints** — performance targets, compatibility requirements, external dependencies
- **Success criteria** — how will we know it works? What does "done" look like?

Keep going until the shape of the work is clear. If the user's answers reveal new complexity, follow that thread before moving on.

### Phase 3 — Shape the Approach

Once the requirements are clear, propose **2-3 different approaches** with trade-offs. For each, explain:
- How it works at a high level
- What it costs (complexity, time, token usage)
- Where it might break down

Lead with the approach you recommend and say why. Then wait — let the user pick, push back, or combine ideas before continuing.

After agreeing on an approach, walk through the plan in digestible pieces (a few paragraphs at a time). After each piece, check: "Does this match what you had in mind?" Cover:
- Architecture and key components
- Task breakdown and dependencies
- Edge cases and risks
- Testing strategy

If something is off, go back and rework it. Do not barrel forward past disagreements.

### Phase 4 — Choose How to Execute

After the plan is solid, ask these two questions (one per message):

1. **Playwright MCP** — Only ask this if the work involves a frontend, UI, or web interface: "Should agents use Playwright to verify UI changes visually — navigating pages, taking screenshots, clicking through flows, checking for console errors?" For backend-only work, skip this and default to no. Remember the answer — the spec will record it as `playwright: true` or `playwright: false`.

2. **Execution tier** — Recommend the tier that fits the work:
   - **Sequential** — you execute tasks one by one in a single session. Cheapest. Best for small or tightly coupled work.
   - **Delegated** — an orchestrator dispatches specialized sub-agents (builder, researcher, reviewer, etc.). Medium cost. Best for work with clear role boundaries.
   - **Team** — separate Claude instances work in parallel via shared task list. Highest cost. Best for large projects with independent workstreams. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`.
   - Explain why you recommend the tier. The user may override.

## Handoff

After the user confirms the plan and tier, output:

```
Brainstorming complete.

Write the spec with: /dream-team:spec-sequential
                 or: /dream-team:spec-delegated
                 or: /dream-team:spec-team
```

Show only the command matching the confirmed tier, with the other two as alternatives underneath in case the user changes their mind.

Do NOT write a spec file. Do NOT create any files. The spec-writing skills will pick up the conversation context from here.

## Ground Rules

- **Conversation only** — no files, no specs, no code. Your output is dialogue.
- **One question per turn** — resist the urge to ask three things at once.
- **Choices over open-ends** — when you can offer concrete options, do it. Faster and more precise.
- **Cut ruthlessly** — if a feature is not essential to the core goal, push back on it. YAGNI.
- **Stay flexible** — revisit earlier decisions when new information changes the picture.
- **Propose before assuming** — always present options and wait for a decision. Never silently pick an approach.
