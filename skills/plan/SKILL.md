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

Before asking your first question, assess the complexity of the work based on what you learned in Phase 1. This calibrates how deep you go:
- **Small/simple** (config change, minor tweak, isolated fix): Ask a few pointed questions hitting the key decisions. Get to Phase 3 quickly.
- **Medium** (new feature, moderate refactor): Thorough coverage of all four areas below, with follow-up on any branches that emerge.
- **Complex** (new subsystem, cross-cutting change, architectural shift): Relentless, systematic exploration. Walk every branch of the decision tree. Resolve dependency chains between decisions. Do not move on until every branch is addressed.

Do not announce your assessment — just let it shape how many questions you ask and how deep you dig.

**Be opinionated, not neutral.** For every question you ask:
1. First, investigate the codebase for evidence that answers it (read files, check patterns, look at existing conventions).
2. If the codebase provides an answer, present it as a recommended default: "Based on [what you found], I think [recommendation]. Does that match your intent, or is there a different angle?"
3. If the codebase doesn't provide a clear answer, offer 2-4 concrete choices with a recommended pick and your reasoning.
4. The user confirms, adjusts, or overrides. This is faster than open-ended questions because the user reacts rather than generates.

**Walk the decision tree.** When an answer creates downstream decisions, follow those branches immediately — don't leave them dangling to circle back to later. Resolve dependency chains sequentially: if choosing X implies questions A and B, ask A and B before moving to the next top-level area.

**One question per turn by default.** When questions are tightly coupled — one answer directly implies a follow-up — bundle them in the same message. Otherwise, stick to one question per turn.

Work through these areas, in whatever order feels natural:
- **What and why** — what does the user actually want? What problem does it solve?
- **Boundaries** — what is explicitly out of scope? What should it NOT do?
- **Constraints** — performance targets, compatibility requirements, external dependencies
- **Success criteria** — how will we know it works? What does "done" look like?

Keep going until every branch of the decision tree is resolved. If the user's answers reveal new complexity, follow that thread before moving on. If the user says "move on" or "that's enough," respect it and advance to Phase 3.

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

After the plan is solid, ask these questions (one per message):

1. **Design direction** — Only ask this if the work involves a frontend, UI, or web interface. For backend-only work, skip this and default to `frontend-design: false`.
   - Ask: "What aesthetic direction fits your project?" and present these options (use the Aesthetic Direction Reference in `${CLAUDE_PLUGIN_ROOT}/templates/frontend-design-guidelines.md` for full descriptions):
     - Minimal / Clean
     - Editorial / Magazine
     - Playful / Energetic
     - Brutalist / Raw
     - Luxury / Refined
     - Other (describe your own)
   - After the user picks, ask a brief follow-up: "Any specific preferences — color palette, dark/light mode, typography feel, visual references? Or should I surprise you?"
   - For greenfield frontend projects (no existing codebase), also ask about the framework and CSS approach (e.g., React + Tailwind, Vue 3 + CSS Modules, Next.js + Tailwind). For existing projects, note the detected stack from Phase 1.
   - Remember the design direction — the spec will record it in the `Design Direction` section and set `frontend-design: true`.

2. **Playwright MCP** — Only ask this if the work involves a frontend, UI, or web interface: "Should agents use Playwright to verify UI changes visually — navigating pages, taking screenshots, clicking through flows, checking for console errors?" For backend-only work, skip this and default to no. Remember the answer — the spec will record it as `playwright: true` or `playwright: false`.

3. **Execution tier** — Recommend the tier that fits the work:
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
- **One question per turn, unless tightly coupled** — default to one question per message. Exception: when one answer directly implies a follow-up, bundle them together.
- **Opinionated over neutral** — investigate the codebase before asking. Present a recommended answer as the default; let the user confirm or override. Only fall back to open-ended questions when the codebase gives no signal.
- **Cut ruthlessly** — if a feature is not essential to the core goal, push back on it. YAGNI.
- **Stay flexible** — revisit earlier decisions when new information changes the picture.
- **Propose before assuming** — always present options and wait for a decision. Never silently pick an approach.
